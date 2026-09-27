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
  version                        Print the skill's version (CHANGELOG.md lists what each version adds).
  update [--check]               --check: ask the skill's git remote whether a newer version exists, and show what it
                                 adds. Without --check: pull it and reinstall the dependencies. Only this command uses
                                 the network for updates, and only when run.
  doctor [DIR]                   Sweep before directing: CPU, memory, GPU drawing and encoding, tools, speech runtime
                                 and models, the configured TTS, and the media and documents in DIR (default: here).
  init <dir>                     Create a project: direction.md, video.json, base.css, ui.css, world.css,
                                 atmosphere.css, icons.js, motion.js, fonts/, scenes/01-hook.html.
  lib NAME ...                   Copy a browser library into ./lib/ and print how to load it.
                                 NAME: gsap (timelines, SVG morph, text and path plugins), three (WebGL 3D),
                                 lottie (After Effects animations as JSON).
  font "FAMILY" [--subset S,...]
                                 Fetch any Fontsource family (Google Fonts and more, all open licensed) into fonts/,
                                 variable when it exists, and write fonts/<family>.css. Default subset: latin.
  map --out SVG [--fit A,B | --bbox LON1,LAT1,LON2,LAT2] [--highlight A,B] [--pin Label@LON,LAT]...
      [--route Label@LON,LAT>LON,LAT>...]... [--land FILE.geojson] [--layer FILE.geojson]...
      [--detail 10m|50m|110m] [--size WxH] [--countries]
                                 Draw a map from Natural Earth outlines: countries, highlights, pins, great-circle routes.
                                 --land replaces the outlines with precise polygons, --layer draws lines and areas.
                                 Default size: the manifest's. --countries lists every country name.
  speak TEXT|FILE [--engine kokoro|voxcpm] [--voice V] [--style S] [--reference WAV] [--speed S] [--pace P] [--seed N]
        [--reroll 3,7] [--cfg 1.6] [--steps 16] [--hifi] [--written FILE] [--review] [--raw] [--device cpu]
        [--language L]
        [--model HF_ID | --command "TEMPLATE" [--one-call]] [--out WAV]
                                 Narration from a script. Writes the WAV and its script next to it (default
                                 assets/voiceover.wav and .txt). Engine: --command runs any TTS with {text},
                                 {text_file}, {out}, {voice} and {reference}, once per phrase (--one-call: once for
                                 the whole script, pause marks dropped); --engine voxcpm runs VoxCPM2 (30 languages, voice
                                 design with --voice "(description)", cloning with --reference; NVIDIA GPU, 8 GB);
                                 --model runs a Hugging Face TTS model; --engine kokoro runs Kokoro (local, English).
                                 The default is the best engine here: VoxCPM2 with its GPU, else Kokoro.
                                 "tts" in ~/.config/motion-video/config.json sets defaults. Every take is heard
                                 back with Whisper (--language sets its language). VoxCPM2 designs the voice once
                                 (<out>.voice.wav) and speaks the whole script as one take in the --style delivery
                                 (a line with a delivery note is its own take). A failing take is regenerated under
                                 a new seed, then spoken again by beats, then by sentences. It exits 1 when a
                                 problem remains, 2 on a bad input.
  transcribe [FILE ...] [--model M] [--language L] [--script TXT]
                                 Word-level timestamps for narration, from a local Whisper model. With no FILE: the
                                 manifest's voiceover and every scene audio. Writes out/voice/<name>.words.json and
                                 prints each word at its video time. Installs the speech runtime once, on first use.
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
  --scene NAME                   One scene: its name, the number its file name starts with (2 for 02-engines), or its
                                 1-based place when names carry no number. Other scene files can be missing.
`;

function num(flag, v, min) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min) throw new ManifestError(`${flag} needs a number of at least ${min}, got "${v}".`);
  return n;
}

function parseArgs(argv) {
  const opts = { manifest: 'video.json', scene: null, draft: false, force: false, scale: 1, jobs: null, start: null, name: null, subset: null, model: null, language: null, script: null, voice: null, speed: null, seed: null, reroll: null, check: false, out: null, command: null, engine: null, reference: null, device: null, fit: null, bbox: null, highlight: null, pin: [], route: [], layer: [], land: null, detail: null, size: null, countries: false, from: null, to: null, fps: null, width: null, rest: [] };
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
    else if (a === '--model') opts.model = argv[++i];
    else if (a === '--language') opts.language = argv[++i];
    else if (a === '--script') opts.script = argv[++i];
    else if (a === '--voice') opts.voice = argv[++i];
    else if (a === '--style') opts.style = argv[++i];
    else if (a === '--cfg') opts.cfg = num(a, argv[++i], 0.5);
    else if (a === '--steps') opts.steps = Math.round(num(a, argv[++i], 1));
    else if (a === '--speed') opts.speed = num(a, argv[++i], 0.5);
    else if (a === '--pace') opts.pace = num(a, argv[++i], 2);
    else if (a === '--seed') opts.seed = num(a, argv[++i], 0);
    else if (a === '--reroll') opts.reroll = argv[++i].split(',').map((v) => Number(v.trim()));
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--command') opts.command = argv[++i];
    else if (a === '--one-call') opts.oneCall = true;
    else if (a === '--review') opts.review = true;
    else if (a === '--raw') opts.raw = true;
    else if (a === '--hifi') opts.hifi = true;
    else if (a === '--written') opts.written = argv[++i];
    else if (a === '--engine') opts.engine = argv[++i];
    else if (a === '--reference') opts.reference = argv[++i];
    else if (a === '--device') opts.device = argv[++i];
    else if (a === '--fit') opts.fit = argv[++i];
    else if (a === '--bbox') opts.bbox = argv[++i];
    else if (a === '--highlight') opts.highlight = argv[++i];
    else if (a === '--pin') opts.pin.push(argv[++i]);
    else if (a === '--route') opts.route.push(argv[++i]);
    else if (a === '--layer') opts.layer.push(argv[++i]);
    else if (a === '--land') opts.land = argv[++i];
    else if (a === '--detail') opts.detail = argv[++i];
    else if (a === '--size') opts.size = argv[++i];
    else if (a === '--countries') opts.countries = true;
    else if (a === '--from') opts.from = num(a, argv[++i], 0);
    else if (a === '--to') opts.to = num(a, argv[++i], 0);
    else if (a === '--fps') opts.fps = num(a, argv[++i], 1);
    else if (a === '--width') opts.width = Math.floor(num(a, argv[++i], 16));
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '--check') opts.check = true;
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
  // Projects hold renders and scratch files. Inside the skill folder they pollute its source and its git repo.
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

async function mapCmd(opts) {
  const { drawMap, parsePlace, countryNames } = await import('./lib/map.mjs');
  if (opts.countries) {
    console.log(countryNames(opts.detail ?? '50m').join('\n'));
    return;
  }
  if (!opts.out) throw new ManifestError('map needs --out, for example --out assets/map-route.svg.');
  // Only the size and fps are read here: a voiceover that does not fit the scenes yet does not matter.
  const m = existsSync(opts.manifest) ? loadManifest(opts.manifest, { voiceoverFits: false }) : null;
  const [width, height] = opts.size ? opts.size.split('x').map(Number) : [m?.width ?? 1920, m?.height ?? 1080];
  if (!width || !height) throw new ManifestError(`map --size "${opts.size}" must be WxH, for example 1080x1920.`);
  const list = (v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);
  let bbox = null;
  if (opts.bbox) {
    bbox = list(opts.bbox).map(Number);
    if (bbox.length !== 4 || bbox.some((v) => !Number.isFinite(v))) throw new ManifestError(`map --bbox "${opts.bbox}" must be four numbers: lon1,lat1,lon2,lat2.`);
  }
  try {
    const { svg, pins, countries } = drawMap({
      width, height, detail: opts.detail ?? '50m', fit: list(opts.fit), bbox, highlight: list(opts.highlight),
      pins: opts.pin.map(parsePlace), routes: opts.route.map((r) => r.split('>').map(parsePlace)), land: opts.land, layers: opts.layer,
    });
    mkdirSync(dirname(resolve(opts.out)), { recursive: true });
    writeFileSync(opts.out, svg);
    console.log(`${opts.out} (${width}x${height}, ${countries} countries in view, ${(svg.length / 1024).toFixed(0)} KB)`);
    console.log(`Inline it so its parts can move: <div class="map-wrap" data-inline="../${opts.out}"></div>`);
    for (const p of pins) console.log(`  #${p.id} at ${p.at[0]},${p.at[1]} px`);
    if (opts.route.length) console.log(`  routes: #route-1${opts.route.length > 1 ? ` … #route-${opts.route.length}` : ''} (animate with data-draw)`);
    for (const id of svg.match(/id="layer-[^"]+"/g) ?? []) console.log(`  #${id.slice(4, -1)}`);
  } catch (e) {
    throw new ManifestError(e.message);
  }
}

async function speakCmd(opts) {
  const { speak } = await import('./lib/speak.mjs');
  const arg = opts.rest.join(' ').trim();
  if (!arg) throw new ManifestError('speak needs the script: a text file, or the words in quotes.');
  const raw = existsSync(arg) ? readFileSync(arg, 'utf8').trim() : arg;
  // A script with times per line ("0-5s: …", "[00:05] …") places each line at its time. Its stamps are not spoken.
  const { parseTimedScript } = await import('./lib/subtitles.mjs');
  const cues = parseTimedScript(raw);
  const script = cues ? cues.map((c) => c.text).join('\n') : raw;
  // The script read as a voice will read it, before any audio. --review stops here.
  const { review, defaultEngine } = await import('./lib/speak.mjs');
  const { config: cfg } = await import('./lib/paths.mjs');
  // The engine speak will use: questions need their own delivery note only where notes are voiced (VoxCPM2).
  const tts = cfg().tts ?? {};
  const engineFor = opts.engine ?? (opts.command || opts.model ? null : tts.engine ?? (tts.command || tts.model ? null : defaultEngine({ voice: opts.voice ?? undefined, reference: opts.reference ?? undefined, language: opts.language ?? undefined })));
  const notes = review(script, { language: opts.language ?? undefined, notes: engineFor === 'voxcpm' });
  if (notes.length || opts.review) {
    console.log(notes.length ? `Script review, ${notes.length} note(s) (narration.md, Prepare the script for speech):` : 'Script review: nothing likely to be misread.');
    for (const r of notes) console.log(`  line ${r.line}  "${r.text}": ${r.note}`);
    console.log('');
  }
  if (opts.review) return 0;
  if (engineFor === 'voxcpm' && (opts.speed ?? tts.speed ?? 1) !== 1) console.error('speak --speed: VoxCPM2 is never time-stretched, so --speed and "tts.speed" are ignored for it. Set the pace in --style and every delivery note ("slow pace", "speaking slowly").');
  // --written: the same words with grammar's punctuation, for captions. Checked before any audio is made.
  let written = null;
  if (opts.written) {
    if (!existsSync(opts.written)) throw new ManifestError(`speak --written ${opts.written}: no such file. Pass the written script: the same words as the ear script, punctuated for reading.`);
    const { writtenScript } = await import('./lib/speak.mjs');
    const wraw = readFileSync(opts.written, 'utf8').trim();
    const wcues = parseTimedScript(wraw);
    try {
      written = writtenScript(script, wcues ? wcues.map((c) => c.text).join('\n') : wraw);
    } catch (e) {
      throw new ManifestError(e.message);
    }
  }
  const out = resolve(opts.out ?? 'assets/voiceover.wav');
  mkdirSync(dirname(out), { recursive: true });
  const { duration, engine, problems = [], phrases: made, checks = [], timing = [] } = await speak(script, out, {
    voice: opts.voice ?? undefined, speed: opts.speed ?? undefined, model: opts.model ?? undefined, command: opts.command ?? undefined,
    engine: opts.engine ?? undefined, reference: opts.reference ? resolve(opts.reference) : undefined, device: opts.device ?? undefined,
    seed: opts.seed ?? undefined, language: opts.language ?? undefined, cues: cues ?? undefined, reroll: opts.reroll ?? undefined,
    oneCall: opts.oneCall ?? undefined, style: opts.style ?? undefined, cfg: opts.cfg ?? undefined, steps: opts.steps ?? undefined, hifi: opts.hifi ?? undefined,
  });
  // Pace: a relaxed explainer sits near 4.1 syllables a second while speaking (3.5 to 4.7). Faster tires the
  // listener. --pace or "tts.pace" sets another target, with the range 0.6 either side of it.
  const { pace } = await import('./lib/speak.mjs');
  const { config } = await import('./lib/paths.mjs');
  const target = opts.pace ?? config().tts?.pace ?? 4.1;
  // The voice layer's own processing: loudness evened sentence by sentence, gentle compression, de-essing, then a -1 dB
  // peak. It never changes the pace. A user's own recording never passes through here. --raw leaves the generated
  // voice as it came.
  let phrases = made;
  if (!opts.raw) {
    const { polish } = await import('./lib/speak.mjs');
    const done = polish(out, phrases ?? []);
    if (phrases) phrases = done.phrases;
    const s = done.stats;
    console.log(`Voice polish: loudness evened in ${s.leveled} sentence(s)${s.leveled ? ` (up to ${s.maxGain.toFixed(1)} dB)` : ''}, compressed gently, harsh "s" turned down in ${(s.essShare * 100).toFixed(1)}% of the audio${s.essShare ? ` (up to ${(-s.essDeepest).toFixed(1)} dB)` : ''}, normalized to a -1 dB peak. --raw skips this.`);
  }
  // The verdict judges the value as printed, so a pace on the range's edge never reads as outside it.
  const rate = phrases ? Math.round(pace(phrases, out) * 10) / 10 : null;
  // The suggestion aims at the target and scales the speed this take was made with.
  const at = opts.speed ?? config().tts?.speed ?? 1;
  const aim = Math.round(Math.min(1.5, Math.max(0.6, (at * target) / rate)) * 100) / 100;
  const lo = +(target - 0.6).toFixed(1);
  const hi = +(target + 0.6).toFixed(1);
  // VoxCPM2 sets its pace in the take, from --style and delivery notes. A time stretch turns its faint crackle into static.
  const fix = (slower) => (/^VoxCPM2/.test(engine) ? `Ask for a ${slower ? 'slower' : 'quicker'} pace in --style and in every delivery note, which replaces --style for its line ("${slower ? 'slow pace' : 'slightly faster'}"), then speak again.` : `--speed ${aim} reaches ${target}.`);
  if (rate) console.log(`Pace: ${rate.toFixed(1)} syllables per second while speaking${rate > hi ? `: faster than the ${lo} to ${hi} range. ${fix(true)}` : rate < lo ? `: slower than the ${lo} to ${hi} range. ${fix(false)}` : `: in the ${lo} to ${hi} range around ${target}.`}`);
  if (cues) {
    console.log(`Timed script: ${cues.length} lines placed at their times.`);
    for (const t of timing) console.log(`  ${t}`);
  }
  // Captions and transcribe read the words as spoken: the pause marks stay only in the source script.
  // A source script at that same path keeps its marks and time stamps: the spoken words go beside it instead.
  const plain = out.replace(/\.[^./]+$/, '.txt');
  const txt = existsSync(arg) && resolve(arg) === plain ? plain.replace(/\.txt$/, '.spoken.txt') : plain;
  // With --written, captions show the written script's punctuation, not the ear script's pauses.
  const { spoken } = await import('./lib/speak.mjs');
  const shownText = written ? written.text : spoken(script);
  writeFileSync(txt, `${shownText}\n`);
  // Where each phrase sits in the audio: transcribe keeps every word inside its own phrase.
  const { phrasesFile } = await import('./lib/voice.mjs');
  if (phrases) writeFileSync(phrasesFile(out), JSON.stringify({ script: shownText, phrases: written ? written.spans(phrases) : phrases }, null, 1));
  else rmSync(phrasesFile(out), { force: true });
  const rel = (f) => relative(process.cwd(), f);
  console.log(`${rel(out)} (${duration.toFixed(2)}s, ${engine}) and its script ${rel(txt)}
Next, in video.json: "voiceover": { "file": "${rel(out)}", "script": "${rel(txt)}" } for narration across the whole video,
or "audio": "${rel(out)}" and "script": "${rel(txt)}" on the one scene it narrates. Then run transcribe.`);
  // Every phrase as it was heard back, so a wrong word shows even when the check passes it.
  console.log('\nHeard back, phrase by phrase:');
  const { HEATED } = await import('./lib/speak.mjs');
  checks.forEach((c, part) => console.log(`  ${c.ok ? (c.doubt?.length || c.heat > HEATED || c.pauses?.length || c.clicks?.length ? 'ok ?' : 'ok  ') : 'FAIL'} ${c.at.toFixed(2).padStart(6)}s  ${c.heard}${c.ok ? '' : `\n        ${c.why}`}${c.heat > HEATED ? `\n        ${c.hotText ? `"${c.hotText.slice(0, 60)}": ` : ''}its pitch peaks at ${c.heat}x the voice's usual pitch: it can sound shouted or excited. Listen, then calm its delivery note or --reroll ${part + 1}` : ''}${(c.pauses ?? []).map((p) => `\n        a ${p.gap}s pause between "${p.after}" and "${p.before}", where the script has no break: the voice misread the grammar. Add a comma where the break belongs, or reword`).join('')}${c.clicks?.length ? `\n        a click the repair could not smooth, ${c.clicks.map((v) => `${v}s`).join(', ')} into this part: listen to it, and --reroll ${part + 1} if it is heard` : ''}${c.doubt?.length ? `\n        both recognizers missed or misheard ${c.doubt.map((w) => `"${w}"`).join(', ')}: listen to it, and ${/^VoxCPM2/.test(engine) ? `--reroll ${part + 1}` : 'reword the phrase'} if it is said wrong` : ''}`));
  if (problems.length) {
    console.log(`\nThe speech check found ${problems.length} problem(s), heard back with Whisper:`);
    for (const p of problems) console.log(`  ${p}`);
    return 1;
  }
  console.log('Speech check: every phrase was heard back as written.');
  return 0;
}

async function transcribeCmd(m, opts) {
  const { transcribe, wordsFile, narrations, alignScript, alignPhrases, phrasesFile, fitFile, asrModel } = await import('./lib/voice.mjs');
  const list = opts.rest.length ? opts.rest.map((f) => ({ file: resolve(f), at: 0, where: 'file' })) : narrations(m);
  if (opts.script) {
    if (list.length !== 1) throw new ManifestError(`transcribe --script: ${list.length} narrations to read, and one script. Pass one FILE, or set "script" per narration in video.json.`);
    if (!existsSync(opts.script)) throw new ManifestError(`transcribe --script: ${opts.script} does not exist.`);
    list[0].script = resolve(opts.script);
  }
  if (!list.length) throw new ManifestError('transcribe: no narration to read. Set "voiceover" or a scene "audio" in video.json, or pass a file.');
  for (const n of list) {
    if (!existsSync(n.file)) throw new ManifestError(`transcribe: ${n.file} does not exist.`);
    const t = await transcribe(n.file, { model: opts.model ?? asrModel(opts.language), language: opts.language ?? undefined });
    // A known script replaces the recognized spelling: captions show the exact words, on the recognized timings.
    // The recognized words stay in "heard", for a round trip against the script.
    if (n.script) {
      t.heard = t.words;
      // Words align phrase by phrase when the phrase times are known: from subtitles (an .srt or .vtt script), or from
      // the spans speak recorded for this same script. Script words spread across a gap can land in a pause: each then
      // starts where its sound does. Pause marks in a plain script are not words.
      const { readScript } = await import('./lib/subtitles.mjs');
      const { spoken } = await import('./lib/speak.mjs');
      const src = readScript(n.script);
      const script = spoken(src.text);
      const pf = phrasesFile(n.file);
      const recorded = !src.phrases && existsSync(pf) ? JSON.parse(readFileSync(pf, 'utf8')) : null;
      const phrases = src.phrases ?? (recorded && recorded.script.replace(/\s+/g, ' ').trim() === script ? recorded.phrases : null);
      t.words = phrases ? fitFile(alignPhrases(t.words, phrases), n.file, phrases) : fitFile(alignScript(t.words, script), n.file);
      if (phrases) t.phrases = src.phrases ? n.script : pf;
      t.script = n.script;
    }
    const out = wordsFile(m, n.file);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(t, null, 1));
    const clock = n.where === 'file' ? 'file' : 'video';
    console.log(`${n.file} (${n.where}, ${t.duration.toFixed(2)}s, ${t.words.length} words${n.script ? `, words from ${n.script}` : ''}) -> ${out}`);
    console.log(`  ${clock} seconds, start-end, word:`);
    for (const w of t.words) console.log(`  ${(n.at + w.start).toFixed(2)}-${(n.at + w.end).toFixed(2)}  ${w.text}`);
  }
  // Every narration's words on one video timeline: the source for a data-captions track.
  if (!opts.rest.length) {
    const { spokenWords } = await import('./lib/voice.mjs');
    const out = join(m.outDir, 'voice', 'words.json');
    writeFileSync(out, JSON.stringify({ words: spokenWords(m).words.map((w) => ({ text: w.text, start: +w.start.toFixed(3), end: +w.end.toFixed(3) })) }, null, 1));
    console.log(`video timeline -> ${out}  (for <div data-captions="../out/voice/words.json">)`);
  }
}

function footage(opts) {
  const file = opts.rest[0];
  if (!file || !existsSync(file)) throw new ManifestError(`footage: "${file ?? ''}" is not a video file. Pass the clip's path.`);
  // Only the size and fps are read here: a voiceover that does not fit the scenes yet does not matter.
  const m = existsSync(opts.manifest) ? loadManifest(opts.manifest, { voiceoverFits: false }) : null;
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
  // The video-wide voiceover plays at its video time, shifted when a scene subset starts later.
  if (m.voiceover && m.voiceover.at + m.voiceover.duration > first) voice.push({ file: m.voiceover.file, at: m.voiceover.at - first });
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
  // The fade-in lifts the mix off silence. It ends before the first sound starts, so an opening hit or the first
  // syllable plays at full level instead of rising out of the fade.
  const firstSound = Math.min(Infinity, ...sfx.map((c) => c.at), ...voice.map((v) => Math.max(0, v.at)));
  const direction = {
    room: sfx.some((c) => c.space > 0) ? { ir: impulseFile(dir.space), wet: SPACES[dir.space].wet } : null,
    fadeIn: Math.min(whole ? dir.fadeIn : 0.05, Math.max(0.02, firstSound)),
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
  const fxStem = output === m.output && voice.length && sfx.length ? join(m.outDir, 'voice', 'effects.wav') : null;
  if (fxStem) mkdirSync(dirname(fxStem), { recursive: true });
  // A whole-video render also writes each layer alone (voice, music, effects), to check and listen to apart.
  const stems = output === m.output ? join(m.outDir, 'stems') : null;
  const level = await muxAudio(joined, output, { voice, sfx, music: whole ? m.music : null, direction, bed, fxStem, stems }, total);
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
    writeFileSync(join(m.outDir, 'cues.json'), JSON.stringify({ video: output, width: m.width, height: m.height, fps: m.fps, cuts, plan, sound: { ...dir, key: key.name }, bed: bedLog, music: !!m.music, cues: cueLog, voice: voice.map((v) => ({ file: v.file, start: v.at })), fxStem: level?.fxStem ?? null, gainDb: level?.gainDb ?? null }, null, 1));
  }
  rmSync(work, { recursive: true, force: true });
  console.log(`wrote ${output} (${total.toFixed(2)}s, ${Math.round(m.width * scale)}x${Math.round(m.height * scale)} @ ${m.fps}fps)`);
  // The whole video's frame 0 is its thumbnail on most platforms: written beside it, to review as a still.
  if (output === m.output) {
    const thumb = join(dirname(output), 'thumbnail.png');
    spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', output, '-frames:v', '1', thumb]);
    if (existsSync(thumb)) console.log(`wrote ${thumb} (frame 0, the thumbnail on most platforms)`);
  }
  // A full render also writes a compressed copy next to the master, small enough for chat apps and social uploads.
  if (!draft && output === m.output) {
    const { compressedCopy } = await import('./lib/encode.mjs');
    const small = output.replace(/(\.[^./]+)?$/, '-compressed.mp4');
    await compressedCopy(output, small);
    const mb = (f) => (statSync(f).size / 1e6).toFixed(1);
    console.log(`wrote ${small} (${mb(small)} MB, compressed; master ${mb(output)} MB)`);
  }
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
  // A motif repeats one sound on purpose. Only other identical repeats are listed.
  const motifs = Object.entries(effects.filter((c) => c.motif).reduce((o, c) => ({ ...o, [c.sound]: (o[c.sound] ?? 0) + 1 }), {}));
  console.log(`  repeats     ${repeats.length ? repeats.map((l) => `${l[0].sound} x${l.length} identical at ${l.map((c) => c.event.toFixed(2)).join(', ')}s`).join('; ') : `none unplanned${motifs.length ? '' : ': every repeat varies'}`}`);
  if (motifs.length) console.log(`  motif       ${motifs.map(([k, n]) => `${k} x${n}`).join(', ')}: the same variant and pitch on purpose`);
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
  const masked = a.results.filter((r) => r.verdict === 'warn').length;
  if (a.stem) console.log(`Effects judged on ${log.fxStem}: the narration is left out of their match and the energy arc.`);
  console.log(`${png}\n${checked - fails}/${checked} cues in sync, ${fails} failing${a.stem ? `, ${masked} masked by the narration` : ''}, ${arcFails} arc error(s), ${a.silent.length} big silent motion(s).`);
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

// Music can be analyzed before any manifest exists, so this reads the manifest only for defaults.
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
  if (cmd === 'version' || cmd === '--version') {
    const { version } = await import('./lib/update.mjs');
    console.log(`motion-video ${version()}`);
    return 0;
  }
  if (cmd === 'update') {
    const { check, update } = await import('./lib/update.mjs');
    const r = opts.check ? check() : update();
    if (!r.available) console.log(`motion-video ${r.current} is the latest version (${r.branch}).`);
    else if (!r.updated) console.log(`motion-video ${r.latest} is available (this is ${r.current}). Run "update" to install it.\n\n${r.notes || 'See CHANGELOG.md for what changed.'}`);
    else console.log(`Updated motion-video ${r.current} -> ${r.latest}.\n\n${r.notes || 'See CHANGELOG.md for what changed.'}`);
    return 0;
  }
  if (cmd === 'doctor') {
    const { doctor } = await import('./lib/doctor.mjs');
    console.log(await doctor(resolve(opts.rest[0] ?? '.')));
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
  if (cmd === 'map') {
    await mapCmd(opts);
    return 0;
  }
  if (cmd === 'speak') {
    return speakCmd(opts);
  }
  if (cmd === 'footage') {
    footage(opts);
    return 0;
  }
  if (!['check', 'still', 'render', 'sheet', 'beats', 'probe', 'audit', 'sounds', 'transcribe'].includes(cmd)) throw new ManifestError(`Unknown command "${cmd}".\n\n${HELP}`);
  if (cmd === 'beats') {
    await beats(opts);
    return 0;
  }
  if (cmd === 'sounds') {
    return sounds();
  }
  // transcribe reads any audio or video file without a project. Its words then go to ./out/voice.
  if (cmd === 'transcribe' && opts.rest.length && !existsSync(opts.manifest)) {
    await transcribeCmd({ outDir: resolve('out') }, opts);
    return 0;
  }
  // Only the commands that draw frames need the scenes to hold the whole voiceover.
  const m = loadManifest(opts.manifest, { voiceoverFits: ['check', 'still', 'render'].includes(cmd) });
  if (cmd === 'transcribe') {
    await transcribeCmd(m, opts);
    if (m.voiceoverOverrun > 0) console.log(`The voiceover runs ${m.voiceoverOverrun.toFixed(2)}s past the video's end. Size the scenes to its words above, so the video holds all of it.`);
    return 0;
  }
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
