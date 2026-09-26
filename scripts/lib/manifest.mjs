import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PALETTES } from './sfx.mjs';
import { parseKey } from './sound-tuning.mjs';

// Narration starts this long after the scene starts, and the scene holds this long after it ends.
export const AUDIO_LEAD = 0.3;
export const AUDIO_TAIL = 0.5;

export class ManifestError extends Error {}

function fail(path, msg) {
  throw new ManifestError(`${path}: ${msg}`);
}

export function probeDuration(file) {
  let out;
  try {
    out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' });
  } catch (e) {
    throw new ManifestError(`ffprobe cannot read ${file}: ${e.stderr || e.message}. Check the file is a valid audio file.`);
  }
  const d = Number.parseFloat(out.trim());
  if (!Number.isFinite(d) || d <= 0) throw new ManifestError(`ffprobe returned no duration for ${file}. Re-export the file as WAV or MP3.`);
  return d;
}

// voiceoverFits: false lets a voiceover run past the video's end (transcribe needs the new words to size the scenes).
// The overrun is then reported in `voiceoverOverrun` (seconds) instead of failing.
export function loadManifest(manifestPath, { voiceoverFits = true } = {}) {
  const path = resolve(manifestPath);
  if (!existsSync(path)) throw new ManifestError(`${path} not found. Run "init <dir>" or pass the manifest path.`);
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(path, `invalid JSON: ${e.message}`);
  }
  const root = dirname(path);
  const width = raw.width ?? 1920;
  const height = raw.height ?? 1080;
  const fps = raw.fps ?? 30;
  for (const [k, v] of [['width', width], ['height', height]]) {
    if (!Number.isInteger(v) || v < 2 || v % 2 !== 0) fail(path, `"${k}" is ${v}. It must be a positive even integer, because H.264 yuv420p rejects odd sizes.`);
  }
  if (!Number.isInteger(fps) || fps < 12 || fps > 120) fail(path, `"fps" is ${fps}. Use an integer from 12 to 120.`);
  if (!Array.isArray(raw.scenes) || raw.scenes.length === 0) fail(path, `"scenes" must be a non-empty array.`);

  const outDir = resolve(root, 'out');
  let bar = null;
  if (raw.scenes.some((s) => s?.bars != null)) {
    const beatsFile = join(outDir, 'beats.json');
    if (!existsSync(beatsFile)) fail(path, `a scene uses "bars" but ${beatsFile} does not exist. Run "beats" first.`);
    bar = JSON.parse(readFileSync(beatsFile, 'utf8')).beat * 4;
  }

  const names = new Set();
  const scenes = raw.scenes.map((s, i) => {
    const where = `scenes[${i}]`;
    if (typeof s?.file !== 'string') fail(path, `${where}.file must be a path to an .html file.`);
    const file = resolve(root, s.file);
    const name = basename(file, extname(file));
    if (names.has(name)) fail(path, `${where}: scene name "${name}" repeats. Scene file basenames must be unique.`);
    names.add(name);

    let audio = null;
    let audioDuration = 0;
    if (s.audio != null) {
      audio = resolve(root, s.audio);
      if (!existsSync(audio)) fail(path, `${where}.audio ${audio} does not exist.`);
      audioDuration = probeDuration(audio);
    }
    let script = null;
    if (s.script != null) {
      script = resolve(root, s.script);
      if (!existsSync(script)) fail(path, `${where}.script ${script} does not exist.`);
    }
    if (s.duration != null && s.bars != null) fail(path, `${where} sets both "duration" and "bars". Keep one.`);
    let duration = s.bars != null ? s.bars * bar : s.duration;
    if (s.bars != null && (typeof s.bars !== 'number' || s.bars <= 0)) fail(path, `${where}.bars must be a positive number.`);
    const needed = audio ? AUDIO_LEAD + audioDuration + AUDIO_TAIL : 0;
    if (duration == null) {
      if (!audio) fail(path, `${where} needs "duration" in seconds, "bars", or "audio" to derive it from.`);
      duration = Math.ceil(needed * fps) / fps;
    }
    if (typeof duration !== 'number' || duration <= 0) fail(path, `${where}.duration must be a positive number of seconds.`);
    if (audio && duration < needed) {
      fail(path, `${where} lasts ${duration.toFixed(2)}s but the narration needs ${needed.toFixed(2)}s (${AUDIO_LEAD}s lead + ${audioDuration.toFixed(2)}s audio + ${AUDIO_TAIL}s tail). Remove "duration" to derive it, or raise it.`);
    }
    // Sound direction per scene: planned energy (0-1), and an optional transition sound pre-lapped across its cut.
    // energy is one number held for the scene, or a curve of [sceneSeconds, energy] points: tease, hit, drop, hit.
    const rawEnergy = s.energy ?? 0.6;
    const unit = (e) => typeof e === 'number' && e >= 0 && e <= 1;
    let curve;
    if (typeof rawEnergy === 'number') {
      if (!unit(rawEnergy)) fail(path, `${where}.energy is ${rawEnergy}. Use a number from 0 to 1, or a list of [seconds, energy] points.`);
      curve = [[0, rawEnergy]];
    } else if (Array.isArray(rawEnergy) && rawEnergy.length) {
      rawEnergy.forEach((p, k) => {
        if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'number' || !unit(p[1])) fail(path, `${where}.energy[${k}] is ${JSON.stringify(p)}. Use [seconds into the scene, energy 0-1].`);
        if (p[0] < 0 || p[0] > duration) fail(path, `${where}.energy[${k}] sits at ${p[0]}s, outside the scene's 0-${duration.toFixed(2)}s.`);
        if (k > 0 && p[0] < rawEnergy[k - 1][0]) fail(path, `${where}.energy[${k}] at ${p[0]}s comes before the point at ${rawEnergy[k - 1][0]}s. List points in time order.`);
      });
      curve = rawEnergy.map(([t, e]) => [t, e]);
    } else {
      fail(path, `${where}.energy is ${JSON.stringify(rawEnergy)}. Use a number from 0 to 1, or a list of [seconds, energy] points.`);
    }
    const energy = Math.max(...curve.map((p) => p[1]));
    const TRANSITIONS = ['whoosh', 'swoosh', 'reverse', 'riser'];
    if (s.in != null && !TRANSITIONS.includes(s.in)) fail(path, `${where}.in is "${s.in}". Use one of: ${TRANSITIONS.join(', ')}.`);
    if (s.in != null && i === 0) fail(path, `${where}.in: the first scene has no cut to transition across. Remove it.`);
    for (const [k, lo, hi] of [['inVol', 0, 4], ['inDur', 0.2, 4]]) {
      if (s[k] != null && (typeof s[k] !== 'number' || s[k] < lo || s[k] > hi)) fail(path, `${where}.${k} is ${s[k]}. Use a number from ${lo} to ${hi}.`);
    }
    return { name, index: i + 1, file, missing: !existsSync(file), duration, audio, audioDuration, script, energy, curve, in: s.in ?? null, inVol: s.inVol, inDur: s.inDur };
  });

  // Frame boundaries round the cumulative time, so per-scene rounding never drifts the total.
  let t = 0;
  for (const s of scenes) {
    const a = Math.round(t * fps);
    t += s.duration;
    s.start = a / fps;
    s.frames = Math.round(t * fps) - a;
    s.duration = s.frames / fps;
  }
  const start = t;

  let music = null;
  if (raw.music != null) {
    const file = resolve(root, raw.music.file ?? '');
    if (!raw.music.file || !existsSync(file)) fail(path, `"music.file" ${file} does not exist.`);
    const volume = raw.music.volume ?? 0.25;
    if (typeof volume !== 'number' || volume <= 0 || volume > 1) fail(path, `"music.volume" is ${volume}. Use a number above 0 and at most 1.`);
    const start = raw.music.start ?? 0;
    if (typeof start !== 'number' || start < 0) fail(path, `"music.start" is ${start}. Use seconds into the track, 0 or more.`);
    music = { file, volume, start };
  }

  // One narration for the whole video (a TTS file, a recording, or a video file's sound): "voiceover": "vo.wav" or
  // { "file": "vo.wav", "start": 0.5, "script": "vo.txt" }, start in video seconds, script as text or subtitles. Per-scene "audio" stays for narration cut per scene.
  let voiceover = null;
  let voiceoverOverrun = 0;
  if (raw.voiceover != null) {
    const spec = typeof raw.voiceover === 'string' ? { file: raw.voiceover } : raw.voiceover;
    const file = resolve(root, spec.file ?? '');
    if (!spec.file || !existsSync(file)) fail(path, `"voiceover" file ${file} does not exist.`);
    const at = spec.start ?? 0;
    // A negative start skips the file's first seconds (a count-in, dead air before the first word).
    if (typeof at !== 'number' || !Number.isFinite(at)) fail(path, `"voiceover.start" is ${JSON.stringify(at)}. Use video seconds: 0.5 starts it half a second in, -2 skips its first 2 seconds.`);
    const duration = probeDuration(file);
    const total = Math.round(start * fps) / fps;
    if (at + duration > total + 0.01 && !voiceoverFits) voiceoverOverrun = at + duration - total;
    else if (at + duration > total + 0.01) fail(path, `"voiceover" runs to ${(at + duration).toFixed(2)}s, past the video's end at ${total.toFixed(2)}s: the scenes need ${(at + duration - total + 0.5).toFixed(2)}s more (with a 0.5s tail). Run transcribe (it reads the narration anyway), size each scene to its words, then check again.`);
    let script = null;
    if (spec.script != null) {
      script = resolve(root, spec.script);
      if (!existsSync(script)) fail(path, `"voiceover.script" ${script} does not exist.`);
    }
    voiceover = { file, at, duration, script };
  }

  return {
    path,
    voiceoverOverrun,
    root,
    width,
    height,
    fps,
    output: resolve(root, raw.output ?? 'out/video.mp4'),
    outDir,
    scenes,
    music,
    voiceover,
    // data-sfx cues play unless the manifest sets "sfx": false.
    sfx: raw.sfx !== false,
    sound: soundDirection(path, raw),
    totalDuration: Math.round(start * fps) / fps,
  };
}

// The soundtrack's shape: the room effects sit in, and how the mix fades in and out.
function soundDirection(path, raw) {
  const s = raw.sound ?? {};
  const bed = bedDirection(path, s.bed);
  const space = s.space ?? 'room';
  if (!['tight', 'room', 'hall'].includes(space)) fail(path, `"sound.space" is "${space}". Use "tight", "room" or "hall".`);
  const fadeIn = s.fadeIn ?? 0.3;
  const fadeOut = s.fadeOut ?? 0.8;
  for (const [k, v] of [['fadeIn', fadeIn], ['fadeOut', fadeOut]]) {
    if (typeof v !== 'number' || v < 0 || v > 5) fail(path, `"sound.${k}" is ${v}. Use seconds from 0 to 5.`);
  }
  const palette = s.palette ?? 'synth';
  if (!PALETTES.includes(palette)) fail(path, `"sound.palette" is ${JSON.stringify(palette)}. Use one of: ${PALETTES.join(', ')}.`);
  // "auto" takes the key of the music, or C major without music. A fixed key is a name such as "D minor".
  const key = s.key ?? 'auto';
  if (key !== 'auto' && !parseKey(key)) fail(path, `"sound.key" is ${JSON.stringify(key)}. Use "auto" or a key such as "C", "F# minor" or "Ebm".`);
  return { space, fadeIn, fadeOut, bed, palette, key };
}

// The optional bed under the effects. true takes every default; an object overrides fields; absent or false is none.
//   fragments: echoes of the video's own sounds per 10 s (1-8).
//   level: fragment level in dB against an effect at volume 1 (-40 to -6). seed: which of the seeded variations plays.
function bedDirection(path, raw) {
  if (raw == null || raw === false) return null;
  if (raw !== true && (typeof raw !== 'object' || Array.isArray(raw))) fail(path, `"sound.bed" is ${JSON.stringify(raw)}. Use true, false, or an object with fragments, level and seed.`);
  const b = { fragments: 2, level: -32, seed: 1, ...(raw === true ? {} : raw) };
  if ('air' in b) fail(path, '"sound.bed.air" was removed: the bed has no noise layer. Delete the field.');
  const unknown = Object.keys(b).filter((k) => !['fragments', 'level', 'seed'].includes(k));
  if (unknown.length) fail(path, `"sound.bed" has unknown field(s) ${unknown.join(', ')}. Use fragments, level and seed.`);
  for (const [k, lo, hi] of [['fragments', 1, 8], ['level', -48, -12]]) {
    if (typeof b[k] !== 'number' || b[k] < lo || b[k] > hi) fail(path, `"sound.bed.${k}" is ${JSON.stringify(b[k])}. Use a number from ${lo} to ${hi}.`);
  }
  if (!Number.isInteger(b.seed) || b.seed < 0) fail(path, `"sound.bed.seed" is ${JSON.stringify(b.seed)}. Use a whole number of 0 or more.`);
  return b;
}

// Selects one scene by 1-based index, basename or path, or every scene. Selected scenes must exist on disk.
export function pickScenes(m, key) {
  let picked = m.scenes;
  if (key != null) {
    // A number matches the number a scene's name starts with ("2" is 02-engines, even when numbering starts at 00),
    // and falls back to the 1-based place for names without one.
    const numbered = (x) => /^(\d+)[-_]/.exec(x.name)?.[1];
    const s = /^\d+$/.test(key)
      ? (m.scenes.find((x) => numbered(x) != null && Number(numbered(x)) === Number(key)) ?? (m.scenes.some((x) => numbered(x) != null) ? null : m.scenes[Number(key) - 1]))
      : m.scenes.find((x) => x.name === key || x.file === resolve(key));
    if (!s) throw new ManifestError(`No scene "${key}" in ${m.path}. Use a scene number or name: ${m.scenes.map((x) => x.name).join(', ')}.`);
    picked = [s];
  }
  const missing = picked.filter((s) => s.missing);
  if (missing.length) throw new ManifestError(`Scene file missing: ${missing.map((s) => s.file).join(', ')}. Write it, or pass --scene to work on one that exists.`);
  return picked;
}
