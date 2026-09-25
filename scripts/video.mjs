#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { availableParallelism, homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ManifestError, AUDIO_LEAD, loadManifest, pickScenes } from './lib/manifest.mjs';

const HELP = `Usage: node video.mjs <command> [options]

Commands:
  init <dir>                     Create a project: direction.md, video.json, base.css, ui.css, world.css,
                                 atmosphere.css, icons.js, motion.js, fonts/, scenes/01-hook.html.
  lib NAME ...                   Copy a browser library into ./lib/ and print how to load it.
                                 NAME: gsap (timelines, SVG morph, text and path plugins), three (WebGL 3D),
                                 lottie (After Effects animations as JSON).
  font "FAMILY" [--subset S,...]
                                 Fetch any Fontsource family (Google Fonts and more, all open licensed) into fonts/,
                                 variable when it exists, and write fonts/<family>.css. Default subset: latin.
  footage FILE [--name N] [--from S] [--to S] [--fps F] [--width W]
                                 Extract a video clip into assets/N/ as frames and print the <img data-frames> tag.
                                 Defaults: N from the file name, the whole clip, the manifest fps and width.
  check [--scene NAME]           Lint every scene. With --scene, also write that scene's still sheet.
                                 Exits 1 on any error.
  still [--scene NAME] [T ...]   Render frames at T seconds to out/stills/. With no T, write one contact sheet per scene.
  render [--scene NAME] [--draft] [--scale N] [--jobs N] [--force]
                                 Check (skipped when a clean check already covers these files), render to the
                                 manifest "output", then run audit and write out/sheet.png. Exits 1 on a failing cue.
                                 --draft   half size, JPEG capture, fast encode.
                                 --scale 2 renders at twice the manifest size (1920x1080 -> 4K).
                                 --jobs N  parallel browser pages. Default: half the CPU threads, at most 8.
                                 --force   render despite check errors.
  sheet                          Write out/sheet.png: 16 frames sampled across the rendered video.
  audit                          Check cue sync, sound intent, overlapping impacts and sound shape.
                                 Writes out/audit.png. Exits 1 on any failing cue.
  sounds                         Profile and check every effect. Exits 1 on an error.
  probe SELECTOR [T] [--scene S] Print the on-screen center and box of matching elements at T seconds (default 0).
                                 Aim cursor paths and 2D overlays at 3D props with it.
  beats [FILE] [--start S]       Analyze music: BPM, beats, bar starts, energy hits. Default FILE: manifest music.
                                 Writes out/beats.json. Times are video seconds (track time minus --start).

Options:
  --manifest PATH                Manifest path. Default: ./video.json
  --scene NAME                   One scene: 1-based index or file basename. Other scene files may be missing.
`;

function num(flag, v, min) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min) throw new ManifestError(`${flag} needs a number of at least ${min}, got "${v}".`);
  return n;
}

function parseArgs(argv) {
  const opts = { manifest: 'video.json', scene: null, draft: false, force: false, scale: 1, jobs: null, start: null, name: null, subset: null, from: null, to: null, fps: null, width: null, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--manifest') opts.manifest = argv[++i];
    else if (a === '--scene') opts.scene = argv[++i];
    else if (a === '--draft') opts.draft = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--scale') opts.scale = num(a, argv[++i], 0.25);
    else if (a === '--jobs') opts.jobs = Math.floor(num(a, argv[++i], 1));
    else if (a === '--start') opts.start = num(a, argv[++i], 0);
    else if (a === '--name') opts.name = argv[++i];
    else if (a === '--subset') opts.subset = argv[++i];
    else if (a === '--from') opts.from = num(a, argv[++i], 0);
    else if (a === '--to') opts.to = num(a, argv[++i], 0);
    else if (a === '--fps') opts.fps = num(a, argv[++i], 1);
    else if (a === '--width') opts.width = Math.floor(num(a, argv[++i], 16));
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (a.startsWith('--')) throw new ManifestError(`Unknown option ${a}.\n\n${HELP}`);
    else opts.rest.push(a);
  }
  return opts;
}

function report(findings) {
  const errors = findings.filter((f) => f.level === 'error');
  for (const f of findings) {
    const at = f.at == null ? '' : ` @${(f.at / 1000).toFixed(2)}s`;
    console.log(`${f.level.toUpperCase()} [${f.scene}${at}] ${f.what}\n  fix: ${f.fix}`);
  }
  console.log(`${errors.length} error(s), ${findings.length - errors.length} warning(s).`);
  return errors.length;
}

async function init(dir) {
  if (!dir) throw new ManifestError('init needs a target directory.');
  const target = resolve(dir);
  // Projects hold renders and scratch files. Inside the skill folder they would pollute its source and its git repo.
  const skillDir = fileURLToPath(new URL('..', import.meta.url)).replace(/\/scripts\/?$/, '');
  const rel = relative(skillDir, target);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw new ManifestError(`${target} is inside the skill folder ${skillDir}. Create the project in the user's working directory instead, for example ./video.`);
  }
  if (existsSync(target) && readdirSync(target).length) throw new ManifestError(`${target} is not empty. Pick a new directory.`);
  const tpl = fileURLToPath(new URL('../templates/', import.meta.url));
  mkdirSync(join(target, 'scenes'), { recursive: true });
  cpSync(join(tpl, 'base.css'), join(target, 'base.css'));
  cpSync(join(tpl, 'motion.js'), join(target, 'motion.js'));
  cpSync(join(tpl, 'world.css'), join(target, 'world.css'));
  cpSync(join(tpl, 'ui.css'), join(target, 'ui.css'));
  cpSync(join(tpl, 'atmosphere.css'), join(target, 'atmosphere.css'));
  cpSync(join(tpl, 'icons.js'), join(target, 'icons.js'));
  cpSync(join(tpl, 'icons.LICENSE.txt'), join(target, 'icons.LICENSE.txt'));
  cpSync(join(tpl, 'direction.md'), join(target, 'direction.md'));
  cpSync(join(tpl, 'fonts'), join(target, 'fonts'), { recursive: true });
  cpSync(join(tpl, 'scene.html'), join(target, 'scenes', '01-hook.html'));
  cpSync(join(tpl, 'video.json'), join(target, 'video.json'));
  console.log(`Created ${target}. Edit video.json and scenes/, then run check.`);
}

// Browser builds of the optional libraries, copied from the skill's own dependencies into the project.
const LIBS = {
  gsap: {
    copy: [['gsap/dist', 'gsap']],
    load: `<script src="../lib/gsap/gsap.min.js"></script>  plus any plugin, e.g. ../lib/gsap/MorphSVGPlugin.min.js
Build one paused timeline and hand it to the video clock:
  const tl = gsap.timeline({ paused: true }); tl.to('#blob', { morphSVG: '#star', duration: 1 }, 0.4);
  __video.use(tl);
License: GSAP standard no-charge license, https://gsap.com/standard-license`,
  },
  three: {
    copy: [['three/build/three.module.js', 'three/three.module.js'], ['three/build/three.core.js', 'three/three.core.js'], ['three/examples/jsm', 'three/addons'], ['three/LICENSE', 'three/LICENSE']],
    load: `<script type="importmap">{ "imports": { "three": "../lib/three/three.module.js", "three/addons/": "../lib/three/addons/" } }</script>
<script type="module"> import * as THREE from 'three'; … __video.on((ms) => { …; renderer.render(scene, camera); }); </script>
Create the renderer with preserveDrawingBuffer: true. Wrap async loading (models, textures) in __video.wait(…).
License: MIT`,
  },
  lottie: {
    copy: [['lottie-web/build/player/lottie_svg.min.js', 'lottie.min.js'], ['lottie-web/LICENSE.md', 'lottie.LICENSE.md']],
    load: `<script src="../lib/lottie.min.js"></script>
  const anim = lottie.loadAnimation({ container: el, renderer: 'svg', loop: false, autoplay: false, path: '../assets/anim.json' });
  __video.use(anim, 0.5);   // starts at 0.5 s
License: MIT`,
  },
};

function lib(names) {
  if (!names.length) throw new ManifestError(`lib needs a name: ${Object.keys(LIBS).join(', ')}.`);
  const mods = fileURLToPath(new URL('./node_modules/', import.meta.url));
  for (const name of names) {
    const spec = LIBS[name];
    if (!spec) throw new ManifestError(`lib: unknown library "${name}". Pick from: ${Object.keys(LIBS).join(', ')}.`);
    for (const [from, to] of spec.copy) {
      const src = join(mods, from);
      if (!existsSync(src)) throw new ManifestError(`lib: ${src} is missing. Run: cd ${dirname(mods)} && bun install`);
      mkdirSync(dirname(join('lib', to)), { recursive: true });
      cpSync(src, join('lib', to), { recursive: true });
    }
    console.log(`${name} -> lib/\n${spec.load}\n`);
  }
}

// Fetches a font from Fontsource into a shared cache, then copies the chosen subsets into the project. Fonts
// load from project files at render time, so the network is needed only here.
function font(opts) {
  const family = opts.rest.join(' ').trim();
  if (!family) throw new ManifestError('font needs a family name, e.g. font "Fraunces". Browse families at https://fontsource.org.');
  const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const subsets = (opts.subset ?? 'latin').split(',').map((s) => s.trim()).filter(Boolean);
  const cache = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'motion-video', 'fonts');
  mkdirSync(cache, { recursive: true });
  if (!existsSync(join(cache, 'package.json'))) writeFileSync(join(cache, 'package.json'), '{"name":"motion-video-fonts","private":true}\n');
  // Bun when it is installed, else npm.
  const pm = spawnSync('bun', ['--version'], { stdio: 'ignore' }).status === 0 ? ['bun', 'add'] : ['npm', 'install'];
  const add = (pkg) => existsSync(join(cache, 'node_modules', pkg)) || spawnSync(pm[0], [pm[1], pkg], { cwd: cache, stdio: 'ignore', shell: process.platform === 'win32' }).status === 0;
  const variable = add(`@fontsource-variable/${slug}`);
  const pkg = variable ? `@fontsource-variable/${slug}` : `@fontsource/${slug}`;
  if (!variable && !add(pkg)) throw new ManifestError(`font: no Fontsource family "${family}" (tried ${pkg}). Check the name at https://fontsource.org, or copy the brand's .woff2 files into fonts/ yourself.`);
  const dir = join(cache, 'node_modules', pkg);
  const meta = JSON.parse(readFileSync(join(dir, 'metadata.json'), 'utf8'));
  const missing = subsets.filter((s) => !meta.subsets.includes(s));
  if (missing.length) throw new ManifestError(`font: ${meta.family} has no subset ${missing.join(', ')}. It has: ${meta.subsets.join(', ')}.`);
  // Variable: every axis (full) when published, else the registered axes (standard: weight, width, slant,
  // optical size), else weight only. Static: every weight and style.
  const cut = variable ? ['full', 'standard', 'wght'].find((c) => existsSync(join(dir, `${c}.css`))) ?? 'index' : null;
  const sheets = variable ? [`${cut}.css`, `${cut}-italic.css`] : meta.weights.flatMap((w) => [`${w}.css`, `${w}-italic.css`]);
  const all = meta.variable ? Object.keys(meta.variable).filter((a) => a !== 'ital') : [];
  const axes = cut === 'full' ? all : cut === 'standard' ? all.filter((a) => ['wght', 'wdth', 'slnt', 'opsz'].includes(a)) : all.filter((a) => a === 'wght');
  const faces = [];
  const files = new Set();
  for (const sheet of sheets.filter((f) => existsSync(join(dir, f)))) {
    for (const block of readFileSync(join(dir, sheet), 'utf8').match(/@font-face\s*{[^}]*}/g) ?? []) {
      const file = block.match(/url\(\.\/files\/([^)]+\.woff2)\)/)?.[1];
      // The longest subset name wins, so "latin" never claims a "latin-ext" file.
      const own = meta.subsets.filter((s) => file?.startsWith(`${slug}-${s}-`)).sort((a, b) => b.length - a.length)[0];
      if (!file || !subsets.includes(own)) continue;
      files.add(file);
      faces.push(block.replace(/src:[^;]*;/, `src: url(./${file}) format('woff2');`).replace('font-display: swap', 'font-display: block'));
    }
  }
  if (!faces.length) throw new ManifestError(`font: found no woff2 faces for ${meta.family} in ${subsets.join(', ')}.`);
  mkdirSync('fonts', { recursive: true });
  for (const f of files) cpSync(join(dir, 'files', f), join('fonts', f));
  if (existsSync(join(dir, 'LICENSE'))) cpSync(join(dir, 'LICENSE'), join('fonts', `${slug}.LICENSE.txt`));
  writeFileSync(join('fonts', `${slug}.css`), `/* ${meta.family}: ${meta.license?.type ?? 'see license'}. ${meta.license?.attribution ?? ''} */\n${faces.join('\n')}\n`);
  const name = faces[0].match(/font-family:\s*'([^']+)'/)[1];
  console.log(`${meta.family} -> fonts/${slug}.css (${files.size} files, ${meta.license?.type ?? 'license in fonts/'})
Link it: <link rel="stylesheet" href="../fonts/${slug}.css">
Use it:  font-family: "${name}";  weights ${variable ? `${meta.weights[0]}-${meta.weights.at(-1)} (variable axes: ${axes.join(', ')})` : meta.weights.join(', ')}${meta.styles.includes('italic') ? ', italic' : ''}`);
}

function footage(opts) {
  const file = opts.rest[0];
  if (!file || !existsSync(file)) throw new ManifestError(`footage: "${file ?? ''}" is not a video file. Pass the clip's path.`);
  const m = existsSync(opts.manifest) ? loadManifest(opts.manifest) : null;
  const fps = opts.fps ?? m?.fps ?? 30;
  const width = opts.width ?? m?.width ?? 1920;
  const name = opts.name ?? file.split('/').pop().replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-');
  const out = join('assets', name);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  if (opts.from != null) args.push('-ss', String(opts.from));
  if (opts.to != null) args.push('-to', String(opts.to));
  args.push('-i', file, '-an', '-vf', `fps=${fps},scale='min(${width},iw)':-2:flags=lanczos`, '-q:v', '2', join(out, '%04d.jpg'));
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (r.status !== 0) throw new ManifestError(`footage: ffmpeg could not read ${file}.`);
  const count = readdirSync(out).filter((f) => f.endsWith('.jpg')).length;
  console.log(`${count} frames at ${fps} fps -> ${out}/\n<img data-frames="../${out}" data-count="${count}" data-fps="${fps}" data-at="0" alt="">`);
}

async function withBrowser(fn) {
  const { launch } = await import('./lib/browser.mjs');
  const browser = await launch();
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

// A fingerprint of everything a check reads: every project file outside out/ (path, size, mtime), the picked
// scenes, and the skill's own scripts. A clean check stores it, and render skips its check while it still matches.
function checkStamp(opts, scenes) {
  const h = createHash('sha1');
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['out', 'node_modules', '.git'].includes(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const st = statSync(p);
        h.update(`${p}\0${st.size}\0${st.mtimeMs}\n`);
      }
    }
  };
  walk(dirname(resolve(opts.manifest)));
  walk(fileURLToPath(new URL('./lib/', import.meta.url)));
  h.update(scenes.map((s) => s.name).join(','));
  return h.digest('hex');
}

// A fingerprint of everything that changes pixels. Sound markup (data-sfx* attributes) and sound fields in
// video.json are left out, so a sound-only edit reuses every captured frame and re-renders only the audio.
function visualStamp(opts) {
  const h = createHash('sha1');
  const root = dirname(resolve(opts.manifest));
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['out', 'node_modules', '.git'].includes(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.html?$/.test(e.name)) h.update(`${p}\0${readFileSync(p, 'utf8').replace(/\sdata-sfx[\w-]*(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/g, '')}\n`);
      else if (resolve(p) === resolve(opts.manifest)) {
        const v = JSON.parse(readFileSync(p, 'utf8'));
        delete v.sound; delete v.music; delete v.sfx;
        for (const sc of v.scenes ?? []) for (const k of ['energy', 'in', 'inVol', 'inDur', 'audio']) delete sc[k];
        h.update(`${p}\0${JSON.stringify(v)}\n`);
      } else {
        const st = statSync(p);
        h.update(`${p}\0${st.size}\0${st.mtimeMs}\n`);
      }
    }
  };
  walk(root);
  // The capture and encode code itself.
  for (const f of ['browser.mjs', 'encode.mjs']) {
    const st = statSync(fileURLToPath(new URL(`./lib/${f}`, import.meta.url)));
    h.update(`${f}\0${st.size}\0${st.mtimeMs}\n`);
  }
  return h.digest('hex');
}

async function check(m, scenes) {
  const { checkScene, headlineSlotFindings } = await import('./lib/check.mjs');
  return withBrowser(async (browser) => {
    // Scenes are checked in parallel pages. The one link between scenes, reading time that a match cut carries
    // across, is credited afterwards from each scene's carry map.
    const results = new Array(scenes.length);
    let next = 0;
    const jobs = Math.min(scenes.length, Math.max(1, Math.min(6, Math.floor(availableParallelism() / 2))));
    await Promise.all(Array.from({ length: jobs }, async () => {
      while (next < scenes.length) {
        const i = next++;
        results[i] = await checkScene(browser, m, scenes[i], null);
      }
    }));
    const all = [];
    results.forEach((f, i) => {
      const carry = i > 0 ? results[i - 1].carry : null;
      all.push(...f.filter((x) => !(x.read?.atStart && carry && x.read.visible + (carry.get(x.read.text) ?? 0) + x.read.step >= x.read.need)));
    });
    all.push(...headlineSlotFindings(results.map((f) => f.headline ?? null), m));
    return all;
  });
}

async function still(m, scenes, times) {
  const { openScene } = await import('./lib/browser.mjs');
  const { tileImages } = await import('./lib/encode.mjs');
  const dir = join(m.outDir, 'stills');
  mkdirSync(dir, { recursive: true });
  // Scenes render in parallel pages. Each scene's lines print together, in scene order.
  const lines = new Array(scenes.length);
  await withBrowser(async (browser) => {
    let next = 0;
    const jobs = Math.min(scenes.length, Math.max(1, Math.min(6, Math.floor(availableParallelism() / 2))));
    await Promise.all(Array.from({ length: jobs }, async () => {
      while (next < scenes.length) {
        const i = next++;
        const s = scenes[i];
        const out = [];
        const sc = await openScene(browser, m, s);
        try {
          for (const e of sc.errors) out.push(`ERROR [${s.name}] ${e}`);
          if (times.length) {
            for (const t of times) {
              await sc.seek(t * 1000);
              const file = join(dir, `${s.name}@${t.toFixed(2)}s.png`);
              writeFileSync(file, await sc.capture('png'));
              out.push(file);
            }
          } else {
            // Eight frames: the 0.2s mark, then even steps to the last frame.
            const last = (s.frames - 1) / m.fps;
            const ts = Array.from({ length: 8 }, (_, k) => Math.min(last, 0.2 + (k * (last - 0.2)) / 7));
            const pngs = [];
            for (const t of ts) {
              await sc.seek(t * 1000);
              pngs.push(await sc.capture('png'));
            }
            const file = join(dir, `${s.name}-sheet.png`);
            await tileImages(pngs, file);
            out.push(`${file}  (left to right, top to bottom: ${ts.map((t) => `${t.toFixed(2)}s`).join(', ')})`);
          }
        } finally {
          await sc.close();
        }
        lines[i] = out;
      }
    }));
  });
  for (const l of lines) for (const x of l ?? []) console.log(x);
}

async function render(m, scenes, { draft, scale: userScale, jobs: userJobs }, opts) {
  const { openScene, frameTimes } = await import('./lib/browser.mjs');
  const { frameEncoder, concatSegments, muxAudio, hasNvenc } = await import('./lib/encode.mjs');
  // Captured segments are cached by what they show. A render after a sound-only edit captures no frames.
  const cacheDir = join(m.outDir, '.cache');
  mkdirSync(cacheDir, { recursive: true });
  const visual = visualStamp(opts);
  const keyOf = (s, times) => createHash('sha1').update([visual, s.name, times[0], times.length, draft, userScale, hasNvenc()].join('|')).digest('hex');
  const used = new Set();
  let reused = 0;
  const work = join(m.outDir, '.work');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const format = draft ? 'jpeg' : 'png';
  const scale = draft ? 0.5 : userScale;
  const jobs = userJobs ?? Math.max(1, Math.min(8, Math.floor(availableParallelism() / 2)));
  // Split every scene into frame chunks, so one long scene still renders on every worker.
  const totalFrames = scenes.reduce((n, s) => n + s.frames, 0);
  const chunkSize = Math.max(m.fps * 2, Math.ceil(totalFrames / (jobs * 2)));
  const chunks = [];
  for (const s of scenes) {
    const times = frameTimes(s, m.fps);
    for (let a = 0; a < times.length; a += chunkSize) chunks.push({ s, times: times.slice(a, a + chunkSize) });
  }
  let rendered = 0;
  const { collectCues, measureImpacts, placeCues } = await import('./lib/sfx.mjs');
  const cues = new Map();
  const segments = await withBrowser(async (browser) => {
    const done = new Array(chunks.length);
    let next = 0;
    const worker = async () => {
      while (next < chunks.length) {
        const i = next++;
        const { s, times } = chunks[i];
        const out = join(work, `${String(i).padStart(4, '0')}.mp4`);
        const cached = join(cacheDir, `${keyOf(s, times)}.mp4`);
        used.add(cached);
        const hit = existsSync(cached);
        // A cached chunk with no sound cues to read never opens the page at all.
        if (hit && times[0] !== 0) {
          cpSync(cached, out);
          reused += times.length;
          rendered += times.length;
          done[i] = out;
          continue;
        }
        const sc = await openScene(browser, m, s, { scale });
        const enc = hit ? null : frameEncoder(m.fps, out, { format, draft });
        try {
          if (sc.errors.length) throw new Error(`Scene ${s.name} failed to load:\n  ${sc.errors.join('\n  ')}`);
          // Sound cues are read once per scene, before any seek changes the page.
          // Each cue also records its element's on-screen box at the event, so the audit measures motion there.
          if (times[0] === 0) {
            const list = await sc.page.evaluate(collectCues);
            await measureImpacts(sc.page, sc.seek, list, m.fps);
            cues.set(s.name, list);
          }
          if (hit) {
            cpSync(cached, out);
            reused += times.length;
            rendered += times.length;
            done[i] = out;
            continue;
          }
          for (const t of times) {
            await sc.seek(t);
            await enc.write(await sc.capture(format));
          }
          await enc.end();
          cpSync(out, cached);
          rendered += times.length;
          // Chunks render in parallel and finish in any order: this line reports the finished chunk and the running total.
          console.log(`finished chunk ${i + 1} of ${chunks.length} (${s.name}, ${times.length} frames). ${rendered}/${totalFrames} frames done.`);
        } catch (e) {
          await enc?.abort();
          throw e;
        } finally {
          await sc.close();
        }
        done[i] = out;
      }
    };
    await Promise.all(Array.from({ length: Math.min(jobs, chunks.length) }, worker));
    return done;
  });
  if (reused) console.log(`reused ${reused}/${totalFrames} frames from the cache: nothing visible changed in them.`);
  // Keep only the segments this render used, so the cache never grows past one video.
  for (const f of readdirSync(cacheDir)) if (!used.has(join(cacheDir, f))) rmSync(join(cacheDir, f), { force: true });
  const joined = join(work, 'joined.mp4');
  await concatSegments(segments, join(work, 'concat.txt'), joined);
  const total = scenes.reduce((sum, s) => sum + s.frames / m.fps, 0);
  const first = scenes[0].start;
  const voice = scenes.filter((s) => s.audio).map((s) => ({ file: s.audio, at: s.start - first + AUDIO_LEAD }));
  // Sound direction: the planned energy arc scales every effect, and each scene's transition sound joins the cues.
  const { SOUND_META, SPANNING } = await import('./lib/sfx.mjs');
  const { SPACES, energyAt, energyPoints, gainOf, impulseFile, toneOf, transitionCues } = await import('./lib/arc.mjs');
  const local = scenes.map((s) => ({ ...s, start: s.start - first }));
  const arc = energyPoints(local);
  // Repeats of one sound rotate through its variants in video order, so a third pop is not the first pop replayed.
  // A cue with data-sfx-variant or data-sfx-motif keeps its exact sound: recurrence on purpose.
  const perScene = local.map((s) => [...(cues.get(s.name) ?? []), ...transitionCues(s)].sort((a, b) => a.at - b.at));
  const seen = {};
  for (const list of perScene) {
    for (const c of list) {
      if (c.sound === 'type' || c.problem) continue;
      const k = seen[c.sound] ?? 0;
      seen[c.sound] = k + 1;
      if (c.variant == null) c.variant = c.motif ? 0 : k % 4;
    }
  }
  // A motif repeats as one sound: every occurrence takes the first one's pitch, whatever its element's size.
  const motifPitch = {};
  for (const c of perScene.flat()) {
    if (!c.motif || !c.params) continue;
    if (!(c.sound in motifPitch)) motifPitch[c.sound] = c.params.pitch;
    else if (motifPitch[c.sound] == null) delete c.params.pitch;
    else c.params.pitch = motifPitch[c.sound];
  }
  // A user sound (data-sfx-src) resolves from its scene's folder, as the scene's own asset URLs do.
  local.forEach((s, i) => {
    for (const c of perScene[i]) if (c.src) c.src = resolve(dirname(s.file), c.src);
  });
  const key = await soundKey(m);
  if (m.sfx) console.log(`sound palette ${m.sound.palette}, key ${key.name}${m.sound.key === 'auto' ? (m.music ? ' (from the music)' : ' (default, no music)') : ''}`);
  const placed = m.sfx ? local.flatMap((s, i) => placeCues(perScene[i], s.start, s.duration, { palette: m.sound.palette, key })) : [];
  const sfx = placed.map((c) => {
    const e = energyAt(arc, c.event);
    // A hit sits where its element is: up to 40% toward the side it lands on. Spanning sounds pan themselves.
    const pan = c.box && !SPANNING.has(c.sound) ? Number((Math.max(-1, Math.min(1, ((c.box.l + c.box.w / 2) / m.width) * 2 - 1)) * 0.4).toFixed(2)) : 0;
    return { ...c, energy: e, volume: c.volume * gainOf(e), tone: toneOf(e), pan, space: SOUND_META[c.sound]?.space ?? 0 };
  });
  const whole = scenes.length === m.scenes.length;
  const dir = m.sound;
  const direction = {
    room: sfx.some((c) => c.space > 0) ? { ir: impulseFile(dir.space), wet: SPACES[dir.space].wet } : null,
    fadeIn: whole ? dir.fadeIn : 0.05,
    fadeOut: whole ? dir.fadeOut : 0.05,
  };
  const output = whole ? m.output : join(m.outDir, `${scenes[0].name}.mp4`);
  mkdirSync(resolve(output, '..'), { recursive: true });
  // The bed, only on a full render with something in the foreground to sit under.
  const plan = local.map((s) => ({ scene: s.name, start: Number(s.start.toFixed(4)), end: Number((s.start + s.duration).toFixed(4)), energy: s.energy, curve: (s.curve ?? [[0, s.energy]]).map(([t, e]) => [Number((s.start + t).toFixed(4)), e]), in: s.in }));
  let bed = null;
  let bedLog = null;
  if (whole && dir.bed && (sfx.length || voice.length || m.music)) {
    const { fragmentFile, planBed } = await import('./lib/bed.mjs');
    const spans = scenes.filter((s) => s.audio).map((s) => ({ from: s.start - first + AUDIO_LEAD, to: s.start - first + AUDIO_LEAD + s.audioDuration }));
    const p = planBed({ cues: sfx, plan, arc, voice: spans, duration: total, fadeOut: dir.fadeOut }, dir.bed);
    const abOut = output.replace(/(\.[^./]+)?$/, '.no-bed$1');
    bed = {
      fragments: p.fragments.map((f) => ({ ...f, file: fragmentFile(f.source, f) })),
      abOut,
    };
    bedLog = { ...dir.bed, from: p.from, reveals: p.reveals, fragments: p.fragments, withoutBed: abOut };
    console.log(`bed: ${p.fragments.length} fragment(s) from the ${p.from} sound(s). Without the bed: ${abOut}`);
  }
  const level = await muxAudio(joined, output, { voice, sfx, music: whole ? m.music : null, direction, bed }, total);
  if (level) {
    console.log(`loudness ${level.loudness.toFixed(1)} LUFS, true peak ${level.truePeak.toFixed(1)} dBTP (target ${level.target} LUFS, ceiling ${level.ceiling} dBTP)`);
    if (level.held) console.log(`  held ${(level.target - level.loudness).toFixed(1)} LU under the target: reaching it would cut the loudest moment's lead over the rest by more than ${level.leadLoss} dB and flatten the payoff. This is expected for a sparse effects-only mix: the file ships quieter so the payoff keeps its contrast. Raise the quiet cues only if the soft passages sound too faint. Do not lower the payoff to close the gap.`);
  }
  if (sfx.length) {
    const keys = sfx.filter((c) => c.sound === 'type').length;
    console.log(`placed ${sfx.length - keys} sound effect(s)${keys ? ` and ${keys} typing key sound(s)` : ''}, space ${dir.space}`);
  }
  if (output === m.output) {
    const cueLog = sfx.map(({ sound, material, struck, src, intent, layer, motif, target, event, at, d, params, box, accents, file, sourceFile, volume, energy, tone, pan, space }) => ({ sound, material, struck, src, intent, layer, motif, target, event: Number(event.toFixed(4)), start: Number(at.toFixed(4)), d: Number(d.toFixed(4)), params, volume: Number(volume.toFixed(3)), energy: Number(energy.toFixed(3)), tone, pan, space, box, accents, file, sourceFile }));
    const cuts = local.slice(1).map((s) => Number(s.start.toFixed(4)));
    writeFileSync(join(m.outDir, 'cues.json'), JSON.stringify({ video: output, width: m.width, height: m.height, fps: m.fps, cuts, plan, sound: { ...dir, key: key.name }, bed: bedLog, music: !!m.music, cues: cueLog, voice: voice.map((v) => ({ file: v.file, start: v.at })) }, null, 1));
  }
  rmSync(work, { recursive: true, force: true });
  console.log(`wrote ${output} (${total.toFixed(2)}s, ${Math.round(m.width * scale)}x${Math.round(m.height * scale)} @ ${m.fps}fps)`);
}

// Splits an MJPEG byte stream into JPEG data URLs.
function jpegs(buf) {
  const out = [];
  let start = -1;
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] === 0xff && buf[i + 1] === 0xd8 && start < 0) start = i;
    else if (buf[i] === 0xff && buf[i + 1] === 0xd9 && start >= 0) {
      out.push(`data:image/jpeg;base64,${buf.subarray(start, i + 2).toString('base64')}`);
      start = -1;
    }
  }
  return out;
}

// Checks cue timing, material and sound shape in the rendered video, plus out/audit.png.
async function audit(m) {
  const cuesFile = join(m.outDir, 'cues.json');
  if (!existsSync(cuesFile)) throw new ManifestError(`${cuesFile} does not exist. Run render first: it records where each sound was placed.`);
  const log = JSON.parse(readFileSync(cuesFile, 'utf8'));
  if (!existsSync(log.video)) throw new ManifestError(`${log.video} does not exist. Run render first.`);
  if (!log.cues.length) {
    console.log('No sound effects were placed, so there is nothing to sync.');
    return 0;
  }
  const { auditVideo, timelineHtml } = await import('./lib/audit.mjs');
  const a = await auditVideo(log);
  const fmtS = (t) => `${t.toFixed(2)}s`;
  for (const r of a.results) {
    if (r.verdict === 'skip') continue;
    const mv = r.motion ? `motion ${fmtS(r.motion.start)}-${fmtS(r.motion.settle)} peak ${fmtS(r.motion.peakAt)}` : '';
    const d = r.deltaMs != null ? `  offset ${r.deltaMs >= 0 ? '+' : ''}${r.deltaMs}ms` : '';
    const match = r.similarity == null ? '' : `  source match ${r.similarity.toFixed(2)}`;
    console.log(`${r.verdict.toUpperCase().padEnd(4)} ${r.sound.padEnd(8)} intent ${r.intent ?? '?'} @${fmtS(r.event)}  ${r.target}  ${mv}${d}${match}${r.notes.length ? `\n     ${r.notes.join('; ')}` : ''}`);
  }
  for (const s of a.silent) console.log(`INFO big motion with no sound at ${fmtS(s.t)} (${s.strength.toFixed(1)}x the noise floor). Add a cue if the eye follows it.`);
  if (a.arc.scenes.length) {
    console.log('sound arc: scene  planned energy               loudest 400 ms  average');
    for (const s of a.arc.scenes) {
      const shape = s.curve?.length > 1 ? `  curve ${s.curve.map(([t, e]) => `${(t - s.start).toFixed(1)}s:${e}`).join(' ')}` : '';
      console.log(`  ${s.scene.padEnd(14)} ${s.energy.toFixed(2)}   ${'#'.repeat(Math.round(s.energy * 20)).padEnd(20)}  ${s.db.toFixed(1).padStart(6)} dB   ${s.floor.toFixed(1).padStart(6)} dB${shape}`);
    }
  }
  for (const f of a.arc.findings) console.log(`${f.level.toUpperCase().padEnd(4)} arc  ${f.msg}`);
  // Soundtrack review: prompts for a listening pass, not creative errors. Only the delivered true peak can fail.
  const { truePeak } = await import('./lib/encode.mjs');
  const effects = log.cues.filter((c) => c.sound !== 'type');
  const keys = log.cues.length - effects.length;
  const bySource = new Map();
  for (const c of effects) if (!c.motif) bySource.set(c.sourceFile, [...(bySource.get(c.sourceFile) ?? []), c]);
  const repeats = [...bySource.values()].filter((l) => l.length > 1);
  const families = Object.entries(effects.reduce((o, c) => ({ ...o, [c.sound]: (o[c.sound] ?? 0) + 1 }), {})).sort((x, y) => y[1] - x[1]);
  // Typing is audible, so its keys break a quiet span too.
  // Each sound covers its whole length, so a drag or a ticker that starts on a cut fills the span it plays over.
  // A container cue sounds once per accent, so every accent breaks a quiet span too.
  const spans = log.cues.flatMap((c) => [[c.start, c.start + (c.d ?? 0)], ...(c.accents ?? []).map((x) => [x.event, x.event])]).sort((x, y) => x[0] - y[0]);
  const gaps = [];
  let heard = 0;
  for (const [from, to] of [...spans, [a.duration, a.duration]]) {
    if (from - heard >= 3) gaps.push(`${heard.toFixed(1)}-${from.toFixed(1)}s`);
    heard = Math.max(heard, to);
  }
  const hasBus = log.voice?.length || log.music;
  const ceiling = hasBus ? -1.5 : -6;
  const tp = await truePeak(log.video);
  console.log('soundtrack review:');
  console.log(`  density     ${effects.length} effects in ${a.duration.toFixed(1)}s (${((effects.length / a.duration) * 10).toFixed(1)} per 10 s)${keys ? `, plus ${keys} typing key sounds, not synced one by one` : ''}`);
  console.log(`  families    ${families.map(([k, n]) => `${k} x${n}`).join(', ')}${families[0] && families[0][1] / effects.length > 0.4 && effects.length >= 5 ? `  <- "${families[0][0]}" carries ${Math.round((families[0][1] / effects.length) * 100)}% of the effects` : ''}`);
  console.log(`  repeats     ${repeats.length ? repeats.map((l) => `${l[0].sound} x${l.length} identical at ${l.map((c) => c.event.toFixed(2)).join(', ')}s`).join('; ') : 'none: every repeat varies'}`);
  const motifs = Object.entries(effects.filter((c) => c.motif).reduce((o, c) => ({ ...o, [c.sound]: (o[c.sound] ?? 0) + 1 }), {}));
  if (motifs.length) console.log(`  motif       ${motifs.map(([k, n]) => `${k} x${n}`).join(', ')}: one variant and pitch on purpose`);
  console.log(`  quiet spans ${gaps.length ? gaps.join(', ') : 'none over 3 s'}`);
  const tpFail = Number.isFinite(tp) && tp > ceiling + 0.05;
  console.log(`${tpFail ? 'FAIL' : '    '}  true peak   ${Number.isFinite(tp) ? `${tp.toFixed(1)} dBTP` : 'none'} in the delivered file (ceiling ${ceiling} dBTP)`);
  console.log('  Listen on a phone speaker and headphones when playback is available: the first hit, repeated groups, cuts, the payoff and the tail. Report when listening was unavailable.');
  const { spawnSync: run } = await import('node:child_process');
  const step = 0.5;
  const th = run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', log.video, '-vf', `fps=${1 / step},scale=240:-2`, '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '5', '-'], { maxBuffer: 1 << 28 });
  const png = join(m.outDir, 'audit.png');
  await withBrowser(async (browser) => {
    const page = await browser.newPage({ viewport: { width: 8 * 240 + 32, height: 400 } });
    await page.setContent(timelineHtml(a, jpegs(th.stdout), step), { waitUntil: 'load' });
    await page.screenshot({ path: png, fullPage: true });
  });
  const fails = a.results.filter((r) => r.verdict === 'fail').length;
  const arcFails = a.arc.findings.filter((f) => f.level === 'fail').length;
  const checked = a.results.filter((r) => r.verdict !== 'skip').length;
  console.log(`${png}\n${checked - fails}/${checked} cues in sync, ${fails} failing, ${arcFails} arc error(s), ${a.silent.length} big silent motion(s).`);
  return fails || arcFails || tpFail ? 1 : 0;
}

// The key tonal effects are tuned to: "sound.key", or with "auto" the key of the music, else C major.
async function soundKey(m) {
  const { DEFAULT_KEY, parseKey } = await import('./lib/sound-tuning.mjs');
  if (m.sound.key !== 'auto') return parseKey(m.sound.key);
  if (!m.music) return DEFAULT_KEY;
  const { detectKey } = await import('./lib/beats.mjs');
  return detectKey(m.music.file);
}

// Prints numeric sound profiles and checks every effect against its catalog metadata.
async function sounds() {
  const { MATERIAL_AWARE, MATERIALS, PITCH_RANGE, SOUNDS, SPANNING, recipe, soundFile } = await import('./lib/sfx.mjs');
  const { profileSound } = await import('./lib/audit.mjs');
  const { soundProfileErrors } = await import('./lib/sound-policy.mjs');
  let errors = 0;
  console.log('sound          length  peak    rms     centroid  noisiness  <150Hz  speaker(150Hz-5kHz)');
  for (const name of Object.keys(SOUNDS)) {
    // Size moves a sound's pitch across PITCH_RANGE, so a pitched sound must keep its shape at both ends too.
    const pitches = SOUNDS[name].fixedPitch || SPANNING.has(name) ? [1] : [1, ...PITCH_RANGE];
    for (const pitch of pitches) {
      const p = await profileSound(soundFile(name, { pitch }));
      const findings = soundProfileErrors(name, p);
      errors += findings.length;
      const flag = findings.length ? `  ERROR: ${findings.join(' ')}` : '';
      const label = pitch === 1 ? name : `  x${pitch}`;
      console.log(`${label.padEnd(14)} ${p.duration.toFixed(2)}s  ${p.peakDb.toFixed(1).padStart(5)}dB ${p.rmsDb.toFixed(1).padStart(5)}dB  ${Math.round(p.centroidHz).toString().padStart(5)}Hz   ${p.flatness.toFixed(2)}       ${(p.lowShare * 100).toFixed(0).padStart(3)}%    ${(p.speakerShare * 100).toFixed(0).padStart(3)}%${flag}`);
    }
    // A material-aware contact is also checked struck in every material.
    if (MATERIAL_AWARE.has(name)) {
      for (const material of Object.keys(MATERIALS)) {
        const p = await profileSound(soundFile(name, { material }));
        const findings = soundProfileErrors(name, p, recipe(name, {}, { material }).d, { struck: material });
        errors += findings.length;
        const flag = findings.length ? `  ERROR: ${findings.join(' ')}` : '';
        console.log(`${`  ${material}`.padEnd(14)} ${p.duration.toFixed(2)}s  ${p.peakDb.toFixed(1).padStart(5)}dB ${p.rmsDb.toFixed(1).padStart(5)}dB  ${Math.round(p.centroidHz).toString().padStart(5)}Hz   ${p.flatness.toFixed(2)}       ${(p.lowShare * 100).toFixed(0).padStart(3)}%    ${(p.speakerShare * 100).toFixed(0).padStart(3)}%${flag}`);
      }
    }
  }
  console.log('noisiness: spectral flatness in 150 Hz-5 kHz, 0 = pure tone, 1 = white noise.');
  return errors ? 1 : 0;
}

// Prints where elements sit on screen at a time, so cursor paths and 2D overlays can aim at 3D props.
async function probe(m, scenes, selector, t) {
  const { openScene } = await import('./lib/browser.mjs');
  if (!selector) throw new ManifestError('probe needs a CSS selector, e.g. probe ".laptop .screen" 1.5 --scene 2.');
  await withBrowser(async (browser) => {
    for (const s of scenes) {
      const sc = await openScene(browser, m, s);
      try {
        await sc.seek(t * 1000);
        const rows = await sc.page.evaluate((sel) => {
          return [...document.querySelectorAll(sel)].map((el) => {
            const r = el.getBoundingClientRect();
            const txt = el.textContent.trim().replace(/\s+/g, ' ').slice(0, 30);
            return `${el.localName}${el.id ? `#${el.id}` : el.classList.length ? `.${[...el.classList].join('.')}` : ''} center ${Math.round(r.left + r.width / 2)},${Math.round(r.top + r.height / 2)}  box ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}${txt ? `  "${txt}"` : ''}`;
          });
        }, selector);
        console.log(`[${s.name} @${t.toFixed(2)}s] ${rows.length ? '' : `no element matches ${selector}`}`);
        for (const r of rows) console.log(`  ${r}`);
      } finally {
        await sc.close();
      }
    }
  });
}

// Music may be analyzed before any manifest exists, so this reads the manifest only for defaults.
async function beats(opts) {
  const { analyzeBeats } = await import('./lib/beats.mjs');
  let file = opts.rest[0] ? resolve(opts.rest[0]) : null;
  let start = opts.start;
  let outDir = resolve('out');
  if (existsSync(opts.manifest)) {
    // Reads only the music fields: a manifest using "bars" cannot load before beats.json exists.
    const root = dirname(resolve(opts.manifest));
    const raw = JSON.parse(readFileSync(opts.manifest, 'utf8'));
    outDir = join(root, 'out');
    if (raw.music?.file) file ??= resolve(root, raw.music.file);
    start ??= raw.music?.start ?? 0;
  }
  if (!file) throw new ManifestError('beats needs an audio FILE, or a manifest with "music.file".');
  if (!existsSync(file)) throw new ManifestError(`${file} does not exist.`);
  const r = await analyzeBeats(file, { start: start ?? 0 });
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, 'beats.json');
  writeFileSync(out, JSON.stringify(r, null, 1));
  const bar = r.beat * 4;
  const aligned = Math.abs(r.alignedStart - r.start) < 0.01;
  console.log(`${out}
bpm ${r.bpm}  beat ${r.beat}s  bar ${bar.toFixed(3)}s  track ${r.trackDuration}s
key ${r.key.name} (confidence ${r.key.confidence}): tonal effects follow it while "sound.key" is "auto". A relative major and minor read alike; set "sound.key" to choose.
video times below are track time minus start ${r.start}s
downbeats: ${r.downbeats.slice(0, 24).join(' ')}${r.downbeats.length > 24 ? ' …' : ''}
hits (energy jumps): ${r.hits.join(' ') || 'none'}
bar energy: ${r.bars.slice(0, 24).map((b) => b.energy.toFixed(2)).join(' ')}
${aligned ? 'start sits on a downbeat: scenes sized in "bars" cut on downbeats.' : `start is off the bar grid. Set "music.start": ${r.alignedStart} (and re-run beats) so scenes sized in "bars" cut on downbeats.`}
set in base.css :root: --beat: ${r.beat}s;`);
}

async function sheet(m) {
  const { videoSheet } = await import('./lib/encode.mjs');
  if (!existsSync(m.output)) throw new ManifestError(`${m.output} does not exist. Run render first.`);
  const file = join(m.outDir, 'sheet.png');
  await videoSheet(m.output, file, m.totalDuration);
  console.log(`${file}  (16 frames, evenly spaced across ${m.totalDuration.toFixed(2)}s)`);
}

// Playwright under Bun 1.3 stalls at random awaits mid-render. Bun installs packages, Node runs this CLI.
function reexecUnderNode() {
  const r = spawnSync('node', [fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit' });
  if (r.error) {
    console.error(`error: this CLI needs Node.js (Playwright stalls under Bun): ${r.error.message}. Install Node 20+ and put it on PATH.`);
    return 2;
  }
  return r.status ?? 1;
}

async function main() {
  if (process.versions.bun) return reexecUnderNode();
  const [cmd, ...argv] = process.argv.slice(2);
  const opts = parseArgs(argv);
  if (!cmd || opts.help || ['help', '--help', '-h'].includes(cmd)) {
    console.log(HELP);
    return 0;
  }
  if (cmd === 'init') {
    await init(opts.rest[0]);
    return 0;
  }
  if (cmd === 'lib') {
    lib(opts.rest);
    return 0;
  }
  if (cmd === 'font') {
    font(opts);
    return 0;
  }
  if (cmd === 'footage') {
    footage(opts);
    return 0;
  }
  if (!['check', 'still', 'render', 'sheet', 'beats', 'probe', 'audit', 'sounds'].includes(cmd)) throw new ManifestError(`Unknown command "${cmd}".\n\n${HELP}`);
  if (cmd === 'beats') {
    await beats(opts);
    return 0;
  }
  if (cmd === 'sounds') {
    return sounds();
  }
  const m = loadManifest(opts.manifest);
  if (cmd === 'sheet') {
    await sheet(m);
    return 0;
  }
  if (cmd === 'audit') return audit(m);
  const scenes = pickScenes(m, opts.scene);
  const stampFile = join(m.outDir, '.checked');
  if (cmd === 'check') {
    const errors = report(await check(m, scenes));
    if (!errors) {
      mkdirSync(m.outDir, { recursive: true });
      writeFileSync(stampFile, checkStamp(opts, scenes));
    }
    // One scene at a time is the build loop: its still sheet comes with the check, so one call gives both.
    if (opts.scene) await still(m, scenes, []);
    return errors ? 1 : 0;
  }
  if (cmd === 'probe') {
    const t = Number(opts.rest[1] ?? 0);
    if (!Number.isFinite(t) || t < 0) throw new ManifestError(`probe: "${opts.rest[1]}" is not a time in seconds.`);
    await probe(m, scenes, opts.rest[0], t);
    return 0;
  }
  if (cmd === 'still') {
    const times = opts.rest.map(Number);
    const bad = opts.rest.find((t, i) => !Number.isFinite(times[i]) || times[i] < 0);
    if (bad !== undefined) throw new ManifestError(`still: "${bad}" is not a time in seconds.`);
    await still(m, scenes, times);
    return 0;
  }
  // A clean check of these exact files already ran: rendering does not repeat it.
  const unchanged = existsSync(stampFile) && readFileSync(stampFile, 'utf8') === checkStamp(opts, scenes);
  if (unchanged) console.log('check: clean, and no file changed since. Skipped.');
  const errors = unchanged ? 0 : report(await check(m, scenes));
  if (!unchanged && !errors) {
    mkdirSync(m.outDir, { recursive: true });
    writeFileSync(stampFile, checkStamp(opts, scenes));
  }
  if (errors && !opts.force) {
    console.log('Render stopped: fix the errors above, or pass --force.');
    return 1;
  }
  try {
    await render(m, scenes, opts, opts);
  } catch (e) {
    // Consumer GPUs cap concurrent NVENC sessions. One software retry beats a failed render.
    const { hasNvenc, disableNvenc } = await import('./lib/encode.mjs');
    if (!hasNvenc() || !/nvenc|OpenEncodeSession|CUDA/i.test(e.message)) throw e;
    console.error(`NVENC failed (${e.message.split('\n')[0]}). Retrying with libx264.`);
    disableNvenc();
    await render(m, scenes, opts, opts);
  }
  // A full render ends with its review: the sound audit and the contact sheet, so one command gives the verdict.
  if (opts.scene) return 0;
  const audited = m.sfx ? await audit(m) : 0;
  await sheet(m);
  return audited;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof ManifestError ? `error: ${e.message}` : e.stack || String(e));
    process.exit(e instanceof ManifestError ? 2 : 1);
  },
);
