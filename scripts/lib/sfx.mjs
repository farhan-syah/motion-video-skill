import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

import { APPEAR, MATERIAL_AWARE, PITCH_RANGE, SOUND_META, SOUNDS, SPAN, SPANNING } from './sound-catalog.mjs';
import { MATERIALS, modal, struckFloor } from './sound-synth.mjs';
import { DEFAULT_KEY, keyFactor, thirdRatio } from './sound-tuning.mjs';

export { MATERIAL_AWARE, MATERIALS, PITCH_RANGE, SOUND_META, SOUNDS, SPAN, SPANNING };

// Palettes a video can set in "sound.palette": the default synth set, or a material for every contact sound.
export const PALETTES = ['synth', ...Object.keys(MATERIALS)];

const SR = 48000;
const ENGINE = 'motion-video-sfx-13';

const q = (v, step) => Number((Math.round(v / step) * step).toFixed(6));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Turns a cue's measured motion into synthesis parameters, quantized so similar moves share one cached file.
//   size: largest on-screen dimension, scaled to a 1080p frame. speed: px/s at 1080p. moveDur: seconds of motion.
export function dynamics(name, m = {}, overrides = {}) {
  const s = SOUNDS[name];
  const p = {};
  if (!s) return p;
  if (SPANNING.has(name)) {
    const span = SPAN[name];
    const moveDur = overrides.dur ?? m.moveDur;
    if (moveDur != null) p.dur = q(clamp(moveDur, ...span.span), 0.02);
    if (m.speed != null && span.crest) p.bright = q(clamp(0.75 + m.speed / 3000, 0.75, 1.35), 0.05);
    // Pan only when the move is mostly sideways and long enough to see. A move toward the viewer stays centered.
    if (span.pans && m.dx != null) p.dir = Math.abs(m.dx) >= 40 && Math.abs(m.dx) >= 0.4 * (m.distance ?? 0) ? Math.sign(m.dx) : 0;
    if (span.crest && m.crest != null) p.crest = q(clamp(m.crest, 0.15, 0.7), 0.05);
  } else if (overrides.dur != null) {
    p.dur = q(clamp(overrides.dur, 0.1, 3), 0.02);
  }
  // A 260 px element sits at the recipe's own pitch. Pitch scales with the inverse fourth root of size.
  if (!s.fixedPitch && !SPANNING.has(name) && m.size) p.pitch = q(clamp((260 / Math.max(20, m.size)) ** 0.25, ...PITCH_RANGE), 0.05);
  // data-sfx-pitch sets the pitch outright, inside the same range.
  if (!s.fixedPitch && !SPANNING.has(name) && overrides.pitch != null) p.pitch = q(clamp(overrides.pitch, ...PITCH_RANGE), 0.05);
  if (m.hits?.length > 1) p.hits = m.hits.slice(0, 32).map((h) => q(h, 0.005));
  return p;
}

// Loudness follows how much a move carries: fast slides and long drops play louder than small nudges.
export function dynamicGain(name, m = {}) {
  if ((name === 'swoosh' || name === 'whoosh') && m.speed != null) return clamp(0.6 + m.speed / 2500, 0.6, 1.2);
  if ((name === 'slam' || name === 'thud') && m.distance != null) return clamp(0.75 + m.distance / 900, 0.75, 1.15);
  return 1;
}

// The recipe for one rendering: static fields, or make(params) for a spanning sound given a duration.
//   material: a MATERIALS name. A material-aware contact becomes that material struck; other sounds ignore it.
//   key: the video's key. Chord recipes write R3 for the third, filled here with a major or minor third.
export function recipe(name, params = {}, { material, key = DEFAULT_KEY } = {}) {
  const s = SOUNDS[name];
  if (!s) throw new Error(`Unknown data-sfx "${name}". Use one of: ${Object.keys(SOUNDS).join(', ')}.`);
  if (material != null && !MATERIALS[material]) throw new Error(`Unknown material "${material}". Use one of: ${Object.keys(MATERIALS).join(', ')}.`);
  const struck = material != null && MATERIAL_AWARE.has(name);
  // Spanning sounds define their waveform only through make(); its defaults cover a cue with no measured motion.
  const base = struck ? { ...s, ...modal(name, material) } : s.make ? { ...s, ...s.make(params) } : s;
  const expr = base.expr?.replace(/R3/g, thirdRatio(key).toFixed(6));
  return { d: base.d, expr, filter: base.filter, layers: struck ? undefined : base.layers, variantEq: struck ? undefined : s.variantEq, anchor: s.anchor ?? 'start', peak: base.peak ?? 0, release: base.release, fixedPitch: s.fixedPitch, bed: s.bed, tune: struck ? undefined : s.tune, base: s.base, material: struck ? material : undefined };
}

// Seconds from a clip's start to the point that lands on its cue.
export function soundLead(name, anchor, params = {}) {
  const r = SOUNDS[name] ? recipe(name, params) : null;
  const point = anchor ?? r?.anchor ?? 'start';
  return point === 'peak' ? (r?.peak ?? 0) : point === 'end' ? (r?.d ?? 0) : 0;
}

// Generated WAVs are a cache, not skill source: they live under the user's cache directory and rebuild on demand.
const dir = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'motion-video', 'sfx');

function ffmpeg(args, what) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed to ${what}: ${r.stderr?.trim() || r.error?.message || `exit ${r.status}`}`);
}

// Cache file named "<stem>-<hash8>.wav": readable, and the hash of the full recipe rebuilds it when the recipe changes.
// Writing a new version removes older versions of the same stem. A temp file plus rename keeps a reader from seeing half a WAV.
export function cached(stem, key, make) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${stem}-${createHash('sha256').update(key).digest('hex').slice(0, 8)}.wav`);
  if (existsSync(file)) return file;
  const tmp = `${file}.${randomUUID()}.tmp.wav`;
  try {
    make(tmp);
    renameSync(tmp, file);
  } finally {
    rmSync(tmp, { force: true });
  }
  const stale = new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-[0-9a-f]{8}\\.wav$`);
  for (const f of readdirSync(dir)) if (stale.test(f) && join(dir, f) !== file) rmSync(join(dir, f), { force: true });
  return file;
}

// Sources are set by loudness, not by peak: a peak says little about how loud a sound feels, and matching every peak
// made a tick hit as hard as a boom. Each sound's loudest 50 ms sits at LOUD_REF plus its natural level
// (SOUND_META.level), and no source peaks above PEAK_MAX, so sharp clicks never sit near full scale.
const LOUD_REF = -20;
const PEAK_MAX = -6;

// Loudest 50 ms RMS and the sample peak of interleaved float audio, in dBFS.
function levels(x) {
  const w = Math.round(0.05 * SR) * 2;
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  let loud = 0;
  for (let i = 0; i < x.length; i += w / 4) {
    let e = 0;
    const end = Math.min(x.length, i + w);
    for (let k = i; k < end; k++) e += x[k] * x[k];
    loud = Math.max(loud, Math.sqrt(e / w));
  }
  return { loud: 20 * Math.log10(loud), peak: 20 * Math.log10(peak) };
}

// Writes float audio from `args`, then a 24-bit file at its natural loudness. levelDb: SOUND_META.level.
export function synthesize(args, out, what, levelDb = 0) {
  const raw = `${out}.raw.wav`;
  try {
    ffmpeg([...args, '-ar', String(SR), '-ac', '2', '-c:a', 'pcm_f32le', raw], what);
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', raw, '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
    const { loud, peak } = levels(new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4));
    if (!Number.isFinite(peak)) throw new Error(`ffmpeg measured no signal while trying to ${what}: the recipe renders silence.`);
    const gain = Math.min(LOUD_REF + levelDb - loud, PEAK_MAX - peak);
    ffmpeg(['-i', raw, '-af', `volume=${gain.toFixed(2)}dB`, '-c:a', 'pcm_s24le', out], `normalize (${what})`);
  } finally {
    rmSync(raw, { force: true });
  }
}

const stemOf = (name, variant, p) =>
  [name, `v${variant}`, p.dur != null ? `d${Math.round(p.dur * 1000)}` : null, p.pitch != null && p.pitch !== 1 ? `p${Math.round(p.pitch * 100)}` : null, p.bright != null && p.bright !== 1 ? `b${Math.round(p.bright * 100)}` : null, p.dir != null && p.dir !== 1 ? `r${p.dir < 0 ? 'l' : 'c'}` : null, p.crest != null && p.crest !== 0.315 ? `c${Math.round(p.crest * 100)}` : null].filter(Boolean).join('-');

// Variants make repeats sound like new contacts, not one file replayed: each changes the attack and the tone color
// first, then pitch by at most 4%, and reseeds the noise.
//   tune: pitch factor. tilt: shelf gain in dB at 2.5 kHz. attack: onset feather factor.
const VARIANTS = [
  { tune: 1, tilt: 0, attack: 1 },
  { tune: 0.97, tilt: -2.5, attack: 1.8 },
  { tune: 1.03, tilt: 2, attack: 0.6 },
  { tune: 1.015, tilt: -1, attack: 1.35 },
];

// Returns the WAV for one hit of a sound, in one of the four VARIANTS.
// params: { dur, pitch, bright } from dynamics(). A container cue with hits goes through compositeFile instead.
export function soundFile(name, { variant = 0, dur, pitch, bright, dir, crest, material, key = DEFAULT_KEY } = {}) {
  if (!SOUNDS[name]) throw new Error(`Unknown data-sfx "${name}". Use one of: ${Object.keys(SOUNDS).join(', ')}.`);
  if (!Number.isInteger(variant) || variant < 0 || variant > 3) throw new Error(`Sound variant must be 0-3, got ${variant}.`);
  const p = { dur, pitch, bright, dir, crest };
  const r = recipe(name, p, { material, key });
  const v = VARIANTS[variant];
  // A keyed recipe lands on the key: variants keep its note and differ in attack and color only.
  const raw = r.tune ? keyFactor(r.tune, r.base, key, pitch ?? 1) : (r.fixedPitch ? 1 : (pitch ?? 1)) * v.tune;
  // A struck material never pitches below the floor small speakers can play.
  const tune = r.material ? Math.max(raw, struckFloor(name, r.material)) : raw;
  const stem = [stemOf(name, variant, p), r.material, r.tune ? key.name.replace(' ', '-') : null].filter(Boolean).join('-');
  return cached(stem, JSON.stringify({ ENGINE, SR, name, r, v, tune }), (file) => {
    const release = r.release ?? Math.min(0.04, r.d * 0.15);
    const seed = `st(0,${12345 + variant * 7919});st(1,${54321 + variant * 104729})`;
    const expr = r.layers
      ? null
      : r.expr
      .split('|')
      .map((ch) => `if(eq(n,0),${seed},0);${ch.replace(/sin\(2\*PI\*/g, `sin(2*PI*${tune.toFixed(4)}*`)}`)
      .join('|');
    const feather = (((SOUND_META[name]?.feather ?? 1) * v.attack) / 1000).toFixed(4);
    const tilt = v.tilt ? `,treble=g=${v.tilt}:f=2500:t=q:w=0.7` : '';
    const edges = `afade=t=in:d=${feather}:curve=qsin,afade=t=out:st=${(r.d - release).toFixed(4)}:d=${release}:curve=qsin`;
    if (r.layers) {
      // Layered recipe: one mono noise source per layer, each with its own envelope and spectrum, mixed, then shaped
      // like any other sound. Each layer takes its own seed, and each variant reseeds them all.
      const inputs = r.layers.flatMap((l, i) => ['-f', 'lavfi', '-i', `aevalsrc='if(eq(n,0),st(0,${12345 + variant * 7919 + i * 104729}),0);${l.expr}':s=${SR}:d=${r.d}`]);
      const graph = r.layers.map((l, i) => `[${i}:a]${l.filter}[l${i}]`);
      const color = r.variantEq?.[variant] ? `,${r.variantEq[variant]}` : '';
      graph.push(`${r.layers.map((_, i) => `[l${i}]`).join('')}amix=inputs=${r.layers.length}:normalize=0${tilt}${color},${edges}[o]`);
      synthesize([...inputs, '-filter_complex', graph.join(';'), '-map', '[o]'], file, `synthesize sound "${name}"`, SOUND_META[name]?.level ?? 0);
      return;
    }
    synthesize(['-f', 'lavfi', '-i', `aevalsrc='${expr}':s=${SR}:d=${r.d}`, '-af', `${r.filter}${tilt},${edges}`], file, `synthesize sound "${name}"`, SOUND_META[name]?.level ?? 0);
  });
}

// One sound for a cued container: a hit per child landing (hits, seconds from the first), each with its own
// variant and a slight level change, plus a bed under the whole span for sounds that have one (paper rustle).
// rotate: the variant of the first accent, so two containers with the same rhythm still differ.
export function compositeFile(name, hits, { pitch, rotate = 0, material, key = DEFAULT_KEY } = {}) {
  const r = recipe(name, {}, { material, key });
  const span = hits[hits.length - 1] + r.d;
  const stem = [`${stemOf(name, rotate, { pitch })}-x${hits.length}-s${Math.round(span * 1000)}`, r.material, r.tune ? key.name.replace(' ', '-') : null].filter(Boolean).join('-');
  return cached(stem, JSON.stringify({ ENGINE, name, hits, pitch, rotate, r, key }), (file) => {
    const sources = [0, 1, 2, 3].map((v) => soundFile(name, { variant: v, pitch, material, key }));
    const inputs = sources.flatMap((f) => ['-i', f]);
    const graph = [];
    const uses = [0, 0, 0, 0];
    const legs = hits.map((h, i) => {
      const v = (i + rotate) % 4;
      uses[v]++;
      return { v, k: uses[v] - 1, h, gain: 0.8 + ((i * 37) % 10) / 50 };
    });
    for (let v = 0; v < 4; v++) if (uses[v]) graph.push(`[${v}:a]asplit=${uses[v]}${Array.from({ length: uses[v] }, (_, k) => `[s${v}_${k}]`).join('')}`);
    const tags = legs.map(({ v, k, h, gain }, i) => {
      graph.push(`[s${v}_${k}]adelay=delays=${Math.round(h * 1000)}:all=1,volume=${gain.toFixed(2)}[h${i}]`);
      return `[h${i}]`;
    });
    let n = tags.length;
    if (r.bed) {
      // A soft rustle under the whole span: rises in over 40 ms, falls away after the last hit.
      inputs.push('-f', 'lavfi', '-i', `aevalsrc='(random(0)-0.5)*${r.bed}*min(1,t/0.04)*min(1,max(0,(${span.toFixed(3)}-t)/0.12))|(random(1)-0.5)*${r.bed}*min(1,t/0.04)*min(1,max(0,(${span.toFixed(3)}-t)/0.12))':s=${SR}:d=${span.toFixed(3)}`);
      graph.push(`[4:a]${r.filter}[bed]`);
      tags.push('[bed]');
      n++;
    }
    graph.push(`${tags.join('')}amix=inputs=${n}:normalize=0:duration=longest[o]`);
    synthesize([...inputs, '-filter_complex', graph.join(';'), '-map', '[o]'], file, `compose "${name}" x${hits.length}`, SOUND_META[name]?.level ?? 0);
  });
}

// Cuts the part of a sound that would fall before video time 0, so it still lands on time instead of playing late.
function trimmed(file, fromSample) {
  const stem = `${basename(file, '.wav').replace(/-[0-9a-f]{8}$/, '')}-trim${fromSample}`;
  return cached(stem, JSON.stringify({ ENGINE, file, fromSample }), (out) => {
    ffmpeg(['-i', file, '-af', `atrim=start_sample=${fromSample},asetpts=PTS-STARTPTS,afade=t=in:d=0.003`, '-ar', String(SR), '-c:a', 'pcm_s24le', out], 'trim a sound');
  });
}

// The material a cue is struck in: its own data-material when that names a material, else the video's palette.
export function materialFor(c, palette = 'synth') {
  if (MATERIALS[c.material]) return c.material;
  return palette !== 'synth' ? palette : undefined;
}

// Decoded stereo float samples of a WAV, interleaved.
function samples(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg cannot read ${file}: ${r.stderr?.toString().trim()}`);
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4);
}

// A user-supplied sound (data-sfx-src) standing in for a recipe. It is loudness-matched to the level of the sound it
// replaces, so the mix keeps its proportions. peak: seconds to its loudest 50 ms, for data-sfx-anchor="peak".
export function srcSound(name, src) {
  if (!existsSync(src)) throw new Error(`data-sfx-src file ${src} does not exist. Fix the path (it resolves from the scene's folder).`);
  const st = statSync(src);
  const file = cached(`src-${name}-${basename(src).replace(/\.[^.]+$/, '').replace(/[^\w-]/g, '_')}`, JSON.stringify({ ENGINE, name, src, size: st.size, mtime: st.mtimeMs }), (out) => {
    synthesize(['-i', src], out, `level-match data-sfx-src ${src}`, SOUND_META[name]?.level ?? 0);
  });
  const x = samples(file);
  const w = Math.round(0.05 * SR) * 2;
  let best = 0;
  let at = 0;
  for (let i = 0; i + w <= x.length; i += w / 4) {
    let e = 0;
    for (let k = i; k < i + w; k++) e += x[k] * x[k];
    if (e > best) [best, at] = [e, i / 2 / SR + 0.025];
  }
  return { file, d: x.length / 2 / SR, peak: at };
}

// The rendered file and its length for a cue, after dynamics.
//   opts.palette: "sound.palette". opts.key: the video's key.
export function cueSound(c, { palette = 'synth', key = DEFAULT_KEY } = {}) {
  const p = c.params ?? {};
  if (c.src) return srcSound(c.sound, c.src);
  const material = materialFor(c, palette);
  if (p.hits?.length > 1) {
    const r = recipe(c.sound, {}, { material, key });
    return { file: compositeFile(c.sound, p.hits, { pitch: p.pitch, rotate: c.variant ?? 0, material, key }), d: p.hits[p.hits.length - 1] + r.d };
  }
  return { file: soundFile(c.sound, { variant: c.variant ?? 0, dur: p.dur, pitch: p.pitch, bright: p.bright, dir: p.dir, crest: p.crest, material, key }), d: recipe(c.sound, p, { material, key }).d };
}

// Converts page cues into placed clips: { file, at (video seconds), volume }.
// A sound whose lead-in starts before its scene plays into the previous scene. Tails ring past the cut.
// opts: { palette, key } from "sound" in video.json.
export function placeCues(cues, sceneStart, sceneDuration, opts = {}) {
  const out = [];
  for (const c of cues) {
    if (c.problem) continue;
    if (!SOUNDS[c.sound]) throw new Error(`Unknown data-sfx "${c.sound}" on ${c.target}. Use one of: ${Object.keys(SOUNDS).join(', ')}.`);
    const event = c.at / 1000;
    if (event < 0 || event >= sceneDuration || c.volume === 0) continue;
    const params = c.params ?? {};
    const snd = cueSound(c, opts);
    const { file: sourceFile, d } = snd;
    // A user file has no recipe: its own loudest moment is its peak.
    const lead = c.src ? ({ peak: snd.peak, end: d }[c.anchor] ?? 0) : soundLead(c.sound, c.anchor, params);
    const start = sceneStart + event - lead;
    let file = sourceFile;
    if (start < 0) {
      const from = Math.round(-start * SR);
      if (from >= Math.round(d * SR)) continue;
      file = trimmed(file, from);
    }
    // sound, target, event (video seconds) and params feed out/cues.json for the audit.
    out.push({
      file,
      sourceFile,
      at: Math.max(0, start),
      d,
      volume: c.volume,
      sound: c.sound,
      params,
      material: c.material ?? null,
      struck: !c.src && MATERIAL_AWARE.has(c.sound) ? (materialFor(c, opts.palette) ?? null) : null,
      src: c.src ?? null,
      intent: c.intent ?? null,
      layer: c.layer ?? null,
      motif: !!c.motif,
      target: c.target,
      event: sceneStart + event,
      box: c.box ?? null,
      // Container cues: each child's landing and box, in video time, so the audit judges every accent.
      accents: c.accentBoxes ? c.accentBoxes.map((a) => ({ box: a.box, event: sceneStart + (a.at + (c.at - c.impact)) / 1000 })) : null,
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

// Sounds that mark a moment of arrival or contact. Risers and reverses crest on the moment the reveal arrives.
const ARRIVAL = new Set(['pop', 'paper', 'click', 'tap', 'tick', 'blip', 'snap', 'thud', 'slam', 'spring', 'shimmer', 'ding', 'success', 'error', 'boom', 'riser', 'reverse',
  'pluck', 'toggle-on', 'toggle-off', 'shutter', 'glitch', 'coin', 'drop', 'subdrop', 'hit', 'sting', 'warning', 'stamp', 'jelly', 'drone']);

function probeElement(sel) {
  const el = document.querySelector(sel);
  if (!el) return null;
  // A 3D wrapper has an empty layout box; its visible faces are absolutely positioned descendants. Use their union.
  let r = el.getBoundingClientRect();
  if (r.width * r.height < 1) {
    let u = null;
    for (const d of el.querySelectorAll('*')) {
      const b = d.getBoundingClientRect();
      if (b.width * b.height < 1) continue;
      u = u ? { left: Math.min(u.left, b.left), top: Math.min(u.top, b.top), right: Math.max(u.right, b.right), bottom: Math.max(u.bottom, b.bottom) } : { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    }
    if (!u) return null;
    r = { left: u.left, top: u.top, width: u.right - u.left, height: u.bottom - u.top };
  }
  let o = 1;
  for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
  // The element's own animated properties. Arrival compares these, so content changing inside it cannot delay the cue.
  const cs = getComputedStyle(el);
  const nums = (v) => (v && v !== 'none' ? v.split(/\s+/).map(parseFloat).filter(Number.isFinite) : []);
  const sc = nums(cs.scale);
  const tr = nums(cs.translate);
  const rot = cs.rotate && cs.rotate !== 'none' ? parseFloat(cs.rotate.split(/\s+/).pop()) : 0;
  const m = cs.transform && cs.transform !== 'none' ? new DOMMatrix(cs.transform) : new DOMMatrix();
  const props = {
    scale: sc.length ? (sc[0] + (sc[1] ?? sc[0])) / 2 : 1,
    tx: tr[0] ?? 0,
    ty: tr[1] ?? 0,
    tz: tr[2] ?? 0,
    rot,
    opacity: Number(cs.opacity),
    offset: parseFloat(cs.offsetDistance) || 0,
    // A blur entrance arrives when it is sharp, not when its opacity and scale settle.
    blur: parseFloat(cs.filter.match(/blur\(([\d.]+)px\)/)?.[1] ?? 0),
    matrix: [m.m11, m.m12, m.m21, m.m22, m.m41, m.m42, m.m43],
  };
  return { x: r.left, y: r.top, w: r.width, h: r.height, o, props, vw: innerWidth, vh: innerHeight };
}

// True when an element's own animated properties sit within visual tolerance of their final values.
// Position is judged on screen, by the box's center: an SVG part's translate is in its drawing's own units, which
// differ from screen pixels whenever the SVG is scaled.
const center = (b) => [b.x + b.w / 2, b.y + b.h / 2];
const apart = (a, b) => Math.hypot(center(a)[0] - center(b)[0], center(a)[1] - center(b)[1]);

function arrived(s, fin, size) {
  const p = s.props;
  const f = fin.props;
  const px = Math.max(2, 0.02 * size);
  const near = (a, b, t) => Math.abs(a - b) <= t;
  return (
    near(p.scale, f.scale, 0.1 * Math.max(Math.abs(f.scale), 0.05)) &&
    apart(s, fin) <= px &&
    near(p.tz, f.tz, px) &&
    near(p.rot, f.rot, 5) &&
    near(p.opacity, f.opacity, 0.1) &&
    near(p.offset, f.offset, 2) &&
    near(p.blur, f.blur, 0.75) &&
    p.matrix.slice(0, 4).every((v, i) => near(v, f.matrix[i], 0.1))
  );
}

// How much of an element's change is left, 0 (arrived) to 1 (where it started): the largest share left in any
// property that changes by a visible amount.
function remaining(s, first, fin, size) {
  const p = s.props;
  const px = Math.max(2, 0.02 * size);
  const share = (a, from, to, visible) => (Math.abs(to - from) < visible ? 0 : Math.abs(a - to) / Math.abs(to - from));
  const move = apart(first, fin);
  return Math.max(
    share(p.scale, first.props.scale, fin.props.scale, 0.05),
    move < px ? 0 : apart(s, fin) / move,
    share(p.rot, first.props.rot, fin.props.rot, 5),
    share(p.opacity, first.props.opacity, fin.props.opacity, 0.1),
    share(p.blur, first.props.blur, fin.props.blur, 0.75),
    ...p.matrix.slice(0, 4).map((v, i) => share(v, first.props.matrix[i], fin.props.matrix[i], 0.1)),
  );
}

// Steps one element's animation frame by frame. Returns its final box, the first frame where it has visibly arrived
// (its own animated properties within tolerance of their final values), and how far and fast it travelled.
async function measureMotion(page, seek, sel, span, fps) {
  await seek(span.end);
  const fin = await page.evaluate(probeElement, sel);
  if (!fin) return null;
  const to1080 = 1080 / Math.min(fin.vw, fin.vh);
  const size = Math.max(fin.w, fin.h);
  const start = Math.max(0, span.start);
  await seek(start);
  const first = await page.evaluate(probeElement, sel);
  let arrival = null;
  let landing = null;
  let prevRem = null;
  let fastestChange = 0.02;
  const shown = (x) => x.o * Math.abs(x.props.matrix[0] * x.props.matrix[3] - x.props.matrix[1] * x.props.matrix[2]) * x.props.scale ** 2;
  const fades = !!first && Math.abs(shown(fin) - shown(first)) > 0.2 * Math.max(shown(fin), 1e-6);
  // The box the element sweeps through from its first frame to its landing: a moving sound belongs to all of it.
  const sweep = { l: fin.x, t: fin.y, r: fin.x + fin.w, b: fin.y + fin.h };
  const grow = (s) => {
    sweep.l = Math.min(sweep.l, s.x);
    sweep.t = Math.min(sweep.t, s.y);
    sweep.r = Math.max(sweep.r, s.x + s.w);
    sweep.b = Math.max(sweep.b, s.y + s.h);
  };
  // Centers per frame: the fastest step places a slide's crest, and the net sideways travel sets its pan.
  const path = [];
  for (let t = start; t <= span.end + 1; t += 1000 / fps) {
    await seek(t);
    const s = await page.evaluate(probeElement, sel);
    if (s) {
      path.push({ t, x: s.x + s.w / 2, y: s.y + s.h / 2 });
      if (s.o > 0.05) grow(s);
    }
    // Appearance: the frame where the element changes fastest (scale, opacity, position together), where the eye
    // takes it in. An ease-out entrance changes fastest at its start, a spring near its end.
    // An element that grows or fades in is measured by how much of it shows (opacity times area), as the eye sees
    // it: a pop from zero scale grows in area fastest well after its scale does. One that only moves is measured by
    // how much of its move is left.
    if (s && first) {
      const rem = fades ? 1 - Math.min(1, shown(s) / Math.max(shown(fin), 1e-6)) : remaining(s, first, fin, size);
      if (prevRem != null && prevRem - rem > fastestChange) {
        fastestChange = prevRem - rem;
        landing = t - 500 / fps;
      }
      prevRem = rem;
    }
    if (s && arrived(s, fin, size)) {
      arrival = t;
      break;
    }
  }
  const cx = (b) => b.x + b.w / 2;
  const distance = first ? Math.hypot(cx(first) - cx(fin), first.y + first.h / 2 - (fin.y + fin.h / 2)) * to1080 : 0;
  const dx = first ? (cx(fin) - cx(first)) * to1080 : 0;
  const moveDur = Math.max(0.05, ((arrival ?? span.end) - start) / 1000);
  let peakAt = null;
  let fastest = 0;
  for (let i = 1; i < path.length; i++) {
    const v = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    if (v > fastest) {
      fastest = v;
      peakAt = (path[i].t + path[i - 1].t) / 2;
    }
  }
  // crest: where the fastest frame falls in the move. A move longer than the longest swoosh plays a shorter sound,
  // so the crest is kept as a fraction for the sound's shape, and peakAt (absolute ms) places it.
  const crest = fastest > 0 ? (peakAt - start) / (moveDur * 1000) : null;
  return { fin, landing, sweep: { l: sweep.l, t: sweep.t, w: sweep.r - sweep.l, h: sweep.b - sweep.t }, arrival, size: size * to1080, distance, dx, crest, peakAt: fastest > 0 ? peakAt : null, speed: distance / moveDur, moveDur };
}

// Replaces guessed impact fractions with measured motion, before any frame is captured:
//   arrival cues land on the first frame the element has visibly arrived (easing and overshoot included);
//   spanning cues (swoosh, whoosh) start with the move, last as long as it, and crest where it is fastest;
//   container cues get one accent per child landing, as a single composite sound.
// seek(ms) must seek the page. Mutates cues: at, impact, box, params, volume, measured.
export async function measureImpacts(page, seek, cues, fps) {
  for (const c of cues) {
    if (c.problem || c.id == null) continue;
    const sel = `[data-sfx-id="${c.id}"]`;
    const overrides = { dur: c.durOverride ?? undefined, pitch: c.pitchOverride ?? undefined };
    if (c.subs?.length > 1) {
      // Container: measure each animated child; each landing becomes one accent of the composite.
      let found = [];
      let box = null;
      for (const sub of c.subs) {
        const mm = await measureMotion(page, seek, `[data-sfx-sub="${sub.key}"]`, sub.span, fps);
        if (!mm) continue;
        const f = mm.fin;
        found.push({ at: (APPEAR.has(c.sound) ? mm.landing : null) ?? mm.arrival ?? sub.span.end, box: { l: f.x, t: f.y, w: f.w, h: f.h } });
        box = box ? { l: Math.min(box.l, f.x), t: Math.min(box.t, f.y), r: Math.max(box.r, f.x + f.w), b: Math.max(box.b, f.y + f.h) } : { l: f.x, t: f.y, r: f.x + f.w, b: f.y + f.h };
      }
      if (!found.length) continue;
      found.sort((a, b) => a.at - b.at);
      // data-sfx-accents caps a dense group: evenly spaced landings keep the rhythm with fewer hits.
      if (c.accentCap && found.length > c.accentCap) {
        const keep = c.accentCap;
        found = Array.from({ length: keep }, (_, k) => found[Math.round((k * (found.length - 1)) / Math.max(1, keep - 1))]);
      }
      const first = found[0].at;
      c.box = { l: box.l, t: box.t, w: box.r - box.l, h: box.b - box.t };
      c.accentBoxes = found.map((x) => ({ box: x.box, at: x.at }));
      c.impact = first;
      c.measured = true;
      c.params = dynamics(c.sound, { hits: found.map((x) => (x.at - first) / 1000), size: Math.max(c.box.w, c.box.h) }, overrides);
      if (!c.manual) c.at = first + (c.offset ?? 0);
      continue;
    }
    if (!c.span) {
      c.params = dynamics(c.sound, {}, overrides);
      continue;
    }
    const mm = await measureMotion(page, seek, sel, c.span, fps);
    if (!mm) continue;
    // A counter or drawn stroke changes content, not position: its move lasts its whole scripted span.
    if (c.scripted) {
      mm.arrival = c.span.end;
      mm.landing = c.span.end;
      mm.moveDur = Math.max(0.05, (c.span.end - c.span.start) / 1000);
    }
    c.box = { l: mm.fin.x, t: mm.fin.y, w: mm.fin.w, h: mm.fin.h };
    c.finalOpacity = mm.fin.o;
    c.motion = { size: Math.round(mm.size), distance: Math.round(mm.distance), speed: Math.round(mm.speed), moveDur: Number(mm.moveDur.toFixed(3)) };
    c.params = dynamics(c.sound, mm, overrides);
    c.volume *= dynamicGain(c.sound, mm);
    if (c.on != null) continue;
    // A flick starts with the swipe but stays short: it marks the start of a long scroll without spanning it.
    // A sound that follows the move (a swoosh crests mid-path, a drag spans it) is judged where the element travels,
    // not only where it lands.
    if (SPAN[c.sound]?.withMove || SPAN[c.sound]?.crest || c.sound === 'flick') c.box = mm.sweep;
    if (SPAN[c.sound]?.withMove || c.sound === 'flick') {
      // A stroke, a zip, a drag, a count or a spin starts with the move and lasts as long as it.
      c.impact = Math.max(0, c.span.start);
    } else if (SPAN[c.sound]?.crest) {
      // The sound's crest lands on the measured fastest frame. When the move outlasts the sound, the sound sits
      // around that frame instead of starting with the move.
      c.impact = mm.peakAt ?? Math.max(0, c.span.start) + soundLead(c.sound, 'peak', c.params) * 1000;
    } else if (APPEAR.has(c.sound) && mm.landing != null) {
      // An appearance sounds on its fastest change, where the eye takes it in, not when the last of it settles.
      c.impact = mm.landing;
    } else if (ARRIVAL.has(c.sound) && mm.arrival != null) {
      c.impact = mm.arrival;
    } else continue;
    c.measured = true;
    if (!c.manual) c.at = c.impact + (c.offset ?? 0);
  }
  return cues;
}

// Runs in the page before any seek. Reads every [data-sfx] cue and the motion that owns it.
// Invalid attributes come back as cues with a `problem`, which check reports.
export function collectCues() {
  // Fraction of each keyframe animation's active duration where its visual impact lands. Used until measured.
  const IMPACT = { 'pop-in': 0.35, pop: 0.3, 'drop-in': 0.6, slam: 0.6, 'cursor-move': 1, press: 0.12, ripple: 0, zoom: 0.15, blur: 0.2, rise: 0.1, drop: 0.1, left: 0.1, right: 0.1, reveal: 0.15, wipe: 0.1, fade: 0.1, 'grow-x': 0.2, 'grow-y': 0.2, draw: 0 };
  const BY_SOUND = { pop: 0.3, paper: 0.6, slam: 0.6, thud: 0.6, snap: 0.9, spring: 0.5, click: 1, tap: 1, ding: 0.2, success: 0.2, shimmer: 0.2, boom: 0.3, downer: 0,
    pluck: 0.3, 'toggle-on': 1, 'toggle-off': 1, flick: 0, shutter: 1, glitch: 0.3, coin: 0.6, drop: 0.6, subdrop: 0.3, hit: 0.3, sting: 0.2, warning: 0, stamp: 0.6, jelly: 0.5,
    draw: 0, zip: 0, drag: 0, ticker: 0, spin: 0 };
  // Materials that recolor contact sounds. They set timbre, not intent: paper is the one material that is also a sound.
  const STRUCK = ['wood', 'glass', 'metal', 'plastic', 'stone', 'rubber', 'ceramic'];
  const finite = (a) => {
    const t = a.effect.getComputedTiming();
    return Number.isFinite(t.duration) && Number.isFinite(t.iterations);
  };
  const cues = [];
  let uid = 0;
  for (const el of document.querySelectorAll('[data-sfx]')) {
    const d = el.dataset;
    // A stable handle, so the renderer can measure this element's motion.
    d.sfxId ??= String(uid++);
    const target = `${el.localName}${el.id ? `#${el.id}` : el.classList.length ? `.${[...el.classList].slice(0, 2).join('.')}` : ''}`;
    const material = el.closest('[data-material]')?.dataset.material ?? null;
    // A material marked on an ancestor describes the group. A cue that names its own intent (a pencil stroke on
    // a paper card) is not held to it.
    const materialBinds = el.hasAttribute('data-material') || !d.sfxIntent;
    const intent = d.sfxIntent ?? (STRUCK.includes(material) ? null : material) ?? (d.sfx === 'type' && d.type !== undefined ? 'typing' : null);
    const layer = d.sfxLayer ?? null;
    const problems = [];
    const num = (v, label, min = -Infinity, max = Infinity) => {
      if (v == null) return null;
      const n = Number(v);
      if (String(v).trim() === '' || !Number.isFinite(n) || n < min || n > max) {
        problems.push(`${label}="${v}" must be a number from ${min} to ${max}`);
        return null;
      }
      return n;
    };
    const volume = num(d.sfxVol ?? 1, 'data-sfx-vol', 0, 4) ?? 1;
    const offset = (num(d.sfxOffset, 'data-sfx-offset') ?? 0) * 1000;
    // A set variant, or a motif, repeats one exact sound on purpose. Otherwise render rotates variants across repeats.
    let variant = num(d.sfxVariant, 'data-sfx-variant', 0, 3);
    if (variant != null && !Number.isInteger(variant)) {
      problems.push(`data-sfx-variant="${d.sfxVariant}" must be a whole number from 0 to 3`);
      variant = null;
    }
    const motif = d.sfxMotif != null;
    const durOverride = num(d.sfxDur, 'data-sfx-dur', 0.1, 4);
    const pitchOverride = num(d.sfxPitch, 'data-sfx-pitch', 0.8, 1.25);
    const accents = num(d.sfxAccents, 'data-sfx-accents', 2, 32);
    const anchor = d.sfxAnchor;
    if (anchor != null && !['start', 'peak', 'end'].includes(anchor)) problems.push(`data-sfx-anchor="${anchor}" must be start, peak or end`);
    if (layer != null && layer !== 'allow') problems.push(`data-sfx-layer="${layer}" must be allow`);
    const explicit = num(d.sfxAt, 'data-sfx-at');
    const own = el.getAnimations().filter(finite);
    const inner = el.getAnimations({ subtree: true }).filter((a) => finite(a) && a.effect.target !== el);
    // A container: no motion of its own, several animated children. It sounds once, with one accent per child.
    // Each direct child is one accent, landing with its entrance: the earliest-starting animation in its subtree that
    // is not an exit (-out). Exits and inner details (a fade on a label inside the child) never place an accent.
    let subs = null;
    const groups = new Map();
    for (const a of inner) {
      let top = a.effect.target;
      if (!(top instanceof Element)) continue;
      while (top.parentElement && top.parentElement !== el) top = top.parentElement;
      if (/-out$/.test(a.animationName ?? '')) continue;
      const t = a.effect.getComputedTiming();
      const g = groups.get(top);
      if (!g || t.delay < g.t.delay) groups.set(top, { a, t });
    }
    const childTargets = [...groups.keys()];
    if (!own.length && groups.size > 1 && d.sfx !== 'type') {
      subs = [...groups.values()].slice(0, 32).map(({ a, t }, k) => {
        const key = `${d.sfxId}-${k}`;
        a.effect.target.dataset.sfxSub = key;
        return { key, span: { start: t.delay, end: t.delay + t.activeDuration } };
      });
    }
    const anims = [...own, ...inner];
    let impact = null;
    let span = null;
    // Scripted motion from motion.js has no CSS animation: a counter (data-count) or a drawn stroke (data-draw)
    // takes its span from its own data-at and data-dur.
    const scripted = !anims[0] && (d.count !== undefined || d.draw !== undefined)
      ? { start: Number(d.at ?? 0) * 1000, end: (Number(d.at ?? 0) + Number(d.dur ?? (d.count !== undefined ? 1.2 : 0.8))) * 1000 }
      : null;
    if (anims[0] || scripted) {
      const t = anims[0]?.effect.getComputedTiming();
      span = scripted ?? { start: t.delay, end: t.delay + t.activeDuration };
      const on = d.sfxOn;
      let frac = IMPACT[anims[0]?.animationName ?? ''] ?? BY_SOUND[d.sfx] ?? 0;
      if (on === 'start') frac = 0;
      else if (on === 'end') frac = 1;
      else if (on != null) frac = num(on, 'data-sfx-on', 0, 1) ?? frac;
      impact = span.start + (span.end - span.start) * frac;
    }
    if (problems.length) {
      cues.push({ sound: d.sfx, at: 0, volume: 0, target, problem: problems.join('; ') });
      continue;
    }
    if (d.sfx === 'type' && d.type !== undefined) {
      // Key sounds across the typed span, at a human rhythm measured from recorded typing: about 5.5 keys per second,
      // with uneven gaps from 125 to 420 ms. Fast on-screen typing keeps this rhythm rather than a click per letter.
      // In rhythm mode every key sounds, the spacebar included. Slow typing (letters further apart than the rhythm's gap)
      // sounds once per letter and skips spaces, since the gap there is the letter's own. At most 60 per element.
      const GAPS = [180, 145, 220, 125, 290, 190, 155, 420, 175, 140, 205, 240, 150, 190, 130, 270];
      const full = d.full ?? el.textContent;
      const cps = num(d.cps ?? 22, 'data-cps', 0.1) ?? 22;
      const start = (explicit ?? Number(d.at ?? 0)) * 1000 + offset;
      const end = start + (full.length * 1000) / cps;
      const perChar = 1000 / cps;
      let k = 0;
      for (let t = start, i = 0; t < end && k < 60; i++) {
        const gap = GAPS[(i + Number(d.sfxId)) % GAPS.length];
        const ch = full[Math.min(full.length - 1, Math.floor((t - start) / perChar))];
        if (perChar < gap || !/\s/.test(ch)) {
          // Keystroke force varies: recorded keys spread about 10 dB in level. Most land near full, some fall soft.
          const soft = (((i * 37 + Number(d.sfxId) * 11) % 16) / 15) ** 1.6;
          cues.push({ sound: 'type', material, materialBinds, intent, layer, at: t, volume: volume * 10 ** ((-8 * soft) / 20), target, variant: ((variant ?? 0) + k) % 4 });
          k++;
        }
        t += Math.max(perChar, gap);
      }
      continue;
    }
    const manual = explicit != null;
    const at = (explicit != null ? explicit * 1000 : impact ?? 0) + offset;
    // A group that also moves itself sounds once, at its own arrival, not once per child. Flag it for check.
    // data-sfx-once states that one sound for the whole group is the intent.
    const ownAndChildren = own.length > 0 && childTargets.length > 1 && d.sfxOnce === undefined ? childTargets.length : 0;
    cues.push({ sound: d.sfx, material, materialBinds, intent, layer, at, volume, target, impact, manual, variant, motif, id: d.sfxId, span, scripted: !!scripted, subs, durOverride, pitchOverride, accentCap: accents ?? null, ownAndChildren, on: d.sfxOn ?? null, offset, src: d.sfxSrc || null, ...(anchor ? { anchor } : {}) });
  }
  return cues.sort((a, b) => a.at - b.at);
}
