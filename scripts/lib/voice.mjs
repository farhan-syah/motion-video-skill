// Speech timing for narration: word-level timestamps from a local Whisper model (transformers.js on ONNX Runtime).
// No external API: the runtime installs once into ~/.cache/motion-video/asr, and the model downloads once from the
// Hugging Face hub into the persistent model folder (paths.mjs). Every later run is offline.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AUDIO_LEAD } from './manifest.mjs';
import { isNumberWord, numbersIn } from './numbers.mjs';
import { cacheRoot, config, modelsDir } from './paths.mjs';

export const DEFAULT_MODEL = 'onnx-community/whisper-base_timestamped';
export const SMALL_MODEL = 'onnx-community/whisper-small_timestamped';

// The recognizer for a language: "asr.model" in the config, else the small model outside English (the base one
// mishears other languages too often, in words and in timing), else the base model.
export const asrModel = (language) => config().asr?.model ?? (language && !/^en/i.test(language) ? SMALL_MODEL : DEFAULT_MODEL);
const PKG = '@huggingface/transformers';

function cacheDir() {
  return join(cacheRoot(), 'asr');
}

// Installs a package of the speech runtime on first use (transformers.js and ONNX Runtime, about 500 MB), with Bun
// when present, else npm. Returns the loaded module. Models it fetches go to the persistent model folder.
// The speech runtime is one set of pinned versions, installed together, so every package shares one copy of
// transformers.js and ONNX Runtime. Two copies in one process (kokoro-js pulling its own) fail to load together.
const RUNTIME = { '@huggingface/transformers': '3.8.1', 'kokoro-js': '1.2.1' };

export async function speechModule(pkg = PKG) {
  const dir = cacheDir();
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, 'package.json'))) writeFileSync(join(dir, 'package.json'), '{"name":"motion-video-asr","private":true}\n');
  const req = createRequire(join(dir, 'package.json'));
  const installed = (name) => {
    try {
      return JSON.parse(readFileSync(join(dir, 'node_modules', name, 'package.json'), 'utf8')).version;
    } catch {
      return null;
    }
  };
  const stale = Object.entries(RUNTIME).filter(([name, v]) => installed(name) !== v);
  if (stale.length) {
    const specs = Object.entries(RUNTIME).map(([name, v]) => `${name}@${v}`);
    console.error(`Installing the local speech runtime (${specs.join(', ')}) into ${dir}. This happens once.`);
    // A nested copy left by an earlier install would still load: start clean.
    rmSync(join(dir, 'node_modules'), { recursive: true, force: true });
    for (const lock of ['bun.lock', 'bun.lockb', 'package-lock.json']) rmSync(join(dir, lock), { force: true });
    const bun = spawnSync('bun', ['--version'], { stdio: 'ignore' }).status === 0;
    const r = spawnSync(bun ? 'bun' : 'npm', [bun ? 'add' : 'install', '--exact', ...specs], { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) throw new Error(`Installing the speech runtime into ${dir} failed. Check the network, then run the command again.`);
  }
  const entry = req.resolve(pkg);
  // A package can carry its own copy of transformers.js. Point the copy it loads at the persistent model folder.
  const own = createRequire(entry);
  let tfEntry;
  try {
    tfEntry = own.resolve(PKG);
  } catch {
    tfEntry = req.resolve(PKG);
  }
  // A CommonJS build comes back under default.
  const load = async (f) => {
    const mod = await import(pathToFileURL(f).href);
    return mod.env || mod.pipeline || mod.KokoroTTS ? mod : (mod.default ?? mod);
  };
  const tf = await load(tfEntry);
  tf.env.cacheDir = modelsDir();
  return pkg === PKG ? tf : load(entry);
}

const runtime = () => speechModule(PKG);

function decode(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg cannot decode ${file}: ${r.stderr.toString().trim()}`);
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4);
}

// Words with start and end in seconds of the file. Whisper can place the last word's end past the audio, so ends
// are clamped to the file's length.
const recognizers = new Map();

export async function transcribe(file, { model = DEFAULT_MODEL, language } = {}) {
  const { pipeline } = await runtime();
  const pcm = decode(file);
  const duration = pcm.length / 16000;
  // One recognizer per model, loaded once: speak checks every sentence it generates.
  // 8-bit weights: a quarter of the size, as fast or faster on a CPU, and measured as accurate as full precision on
  // English and Malay narration (base 75 MB, small 238 MB).
  if (!recognizers.has(model)) recognizers.set(model, pipeline('automatic-speech-recognition', model, { dtype: 'q8' }));
  const asr = await recognizers.get(model);
  const env = envelope(pcm);
  // Whisper drops or invents text over long audio. Each piece of at most 20 s, cut in a silence, is read alone.
  let words = [];
  for (const [a, b] of pieces(env, pcm.length)) {
    // Without a language, transformers.js assumes English and says so on every piece: English is named instead.
    const out = await asr(pcm.subarray(a, b), { return_timestamps: 'word', chunk_length_s: 30, language: language ?? 'en' });
    const at = a / 16000;
    for (const c of out.chunks) {
      const text = c.text.trim();
      if (!text) continue;
      const s = at + (c.timestamp[0] ?? 0);
      const e = at + (c.timestamp[1] ?? (b - a) / 16000);
      words.push({ text, start: Math.min(s, duration), end: Math.min(Math.max(e, s), duration) });
    }
  }
  // A recognizer invents words in digital silence (a "you" after the last line). A word whose whole span stays under
  // -50 dBFS was never spoken.
  words = words.filter((w) => {
    let peak = 0;
    for (let i = Math.floor(w.start * 16000), end = Math.min(pcm.length, Math.ceil(w.end * 16000)); i < end; i++) peak = Math.max(peak, Math.abs(pcm[i]));
    return peak > 10 ** (-50 / 20);
  });
  const looped = collapseLoops(words);
  words = looped.words;
  snapOnsets(words, env);
  snapEnds(words, env, duration);
  fitToSound(words, env, duration);
  for (const w of words) {
    w.start = +w.start.toFixed(3);
    w.end = +w.end.toFixed(3);
  }
  return { file, model, duration: +duration.toFixed(3), words, looped: looped.found };
}

// Cut points for recognition: pieces of at most 20 s, each ending in the middle of the longest silence (80 ms or
// more) in its last 8 s. Audio with no silence there is cut at 20 s.
function pieces({ env, floor }, length) {
  const frames = env.length;
  const max = 2000;
  const out = [];
  let from = 0;
  while (from < frames) {
    if (frames - from <= max) {
      out.push([from * HOP, length]);
      break;
    }
    let best = null;
    let run = 0;
    for (let k = from + max - 800; k < from + max; k++) {
      if (env[k] <= floor) run++;
      else run = 0;
      if (run >= 8 && (!best || run > best.run)) best = { run, at: k - Math.floor(run / 2) };
    }
    const cut = best ? best.at : from + max;
    out.push([from * HOP, cut * HOP]);
    from = cut;
  }
  return out;
}

// Whisper can loop on a phrase ("dengan kembali dengan kembali …"). A run of 1-4 words repeated three or more times in
// a row keeps its first copy. Returns { words, found }.
export function collapseLoops(words) {
  const key = (w) => norm(w.text).join(' ');
  let found = false;
  const out = [...words];
  for (let n = 1; n <= 4; n++) {
    for (let i = 0; i + 3 * n <= out.length; i++) {
      const same = (a, b) => out.slice(a, a + n).map(key).join('|') === out.slice(b, b + n).map(key).join('|');
      if (!same(i, i + n) || !same(i, i + 2 * n)) continue;
      let end = i + n;
      while (end + n <= out.length && same(i, end)) end += n;
      out.splice(i + n, end - (i + n));
      found = true;
    }
  }
  return { words: out, found };
}

// Settles word times on the audio, after recognition or after a script replaced the words:
//   1. times run in order, and no word ends before it starts;
//   2. a word placed in silence (after a pause, a line break) starts where its sound does: searching forward at most
//      1.5 s, and stopping 50 ms before the next word;
//   3. no word runs into the next one;
//   4. a run of crushed words (under 80 ms), with the swollen word before it that took their time, shares that time
//      by letter count;
//   5. an end that runs well past its sound stops where the sound does;
//   6. with no silence before the next word, a word lasts until it, and the last word to its sound's end.
export function fitToSound(words, { env, floor }, duration) {
  const frame = (t) => Math.max(0, Math.floor((t * 16000) / HOP));
  const loud = (k) => env[k] > floor && env[k + 1] > floor && env[k + 2] > floor;
  words.forEach((w, i) => {
    if (i) w.start = Math.max(w.start, words[i - 1].start + 0.02);
    w.end = Math.min(duration, Math.max(w.end, w.start));
  });
  words.forEach((w, i) => {
    const next = words[i + 1];
    const f = frame(w.start);
    if (f >= env.length - 3 || env[f] > floor) return;
    const stop = Math.min(env.length - 3, frame(w.start + 1.5), next ? frame(next.start - 0.05) : env.length - 3);
    let k = f;
    while (k < stop && !loud(k)) k++;
    if (k >= stop) return;
    const start = (k * HOP) / 16000;
    w.end = Math.max(w.end, start + Math.min(0.5, w.end - w.start));
    w.start = start;
  });
  words.forEach((w, i) => {
    const next = words[i + 1];
    if (next && w.end > next.start) w.end = Math.max(w.start, next.start);
  });
  evenOut(words);
  // A word ends where 150 ms of silence starts: a shorter dip is a stop consonant inside it ("k" in "Persekutuan").
  const quietRun = (from, to) => {
    let run = 0;
    for (let k = frame(from); k < Math.min(env.length, frame(to)); k++) {
      if (env[k] > floor) run = 0;
      else if (++run >= 15) return true;
    }
    return false;
  };
  const soundEnd = (from, to) => {
    let last = -1;
    let quiet = 0;
    for (let k = frame(from); k < Math.min(env.length, frame(to)); k++) {
      if (env[k] > floor) {
        last = k;
        quiet = 0;
      } else if (++quiet >= 15 && last >= 0) break;
    }
    return last < 0 ? null : ((last + 1) * HOP) / 16000;
  };
  const letters = (w) => Math.max(1, norm(w.text).join('').length);
  words.forEach((w, i) => {
    const next = words[i + 1];
    const to = next ? next.start : duration;
    const end = soundEnd(w.start, to);
    if (end == null) return;
    // 5. Trim an end that runs well past its sound, never below what the word's letters need.
    if (w.end > end + 0.05 && end - w.start >= Math.min(0.3, 0.05 * letters(w))) w.end = end;
    // 6. Speech runs on: with no silence before the next word, a word lasts until it. The last word lasts to its
    // sound's end.
    if (next && next.start > w.end && !quietRun(w.end, next.start)) w.end = next.start;
    else if (!next && end > w.end) w.end = end;
  });
  // Closing gaps can crush a word again (a phrase's last word): spread once more, within the audio.
  evenOut(words, duration);
  return words;
}

// Recognizer times can overlap: one word swallows the time of the next few, which are left with none. A run of
// crushed words (under 80 ms), with the swollen word before it (much longer than its letters need), shares the run's
// time by letter count. When the next word starts too soon to leave the run room, that word joins the run.
function evenOut(words, limit = Infinity) {
  const letters = (w) => Math.max(1, norm(w.text).join('').length);
  const crushed = (w) => w.end - w.start < 0.08;
  const swollen = (w) => w.end - w.start > 0.25 + 0.12 * letters(w);
  for (let i = 0; i < words.length; i++) {
    if (!crushed(words[i])) continue;
    let a = i;
    while (a > 0 && crushed(words[a - 1])) a--;
    if (a > 0 && swollen(words[a - 1])) a--;
    let b = i;
    while (b + 1 < words.length && crushed(words[b + 1])) b++;
    const from = words[a].start;
    const need = (k) => 0.05 * words.slice(a, k + 1).reduce((n, w) => n + letters(w), 0);
    while (b + 1 < words.length && words[b + 1].start - from < need(b) && b - a < 6) b++;
    // At the end of the words (or the phrase), with no room ahead, the run borrows from the words before it.
    const ceiling = b + 1 < words.length ? words[b + 1].start : Math.min(limit, words[b].end + 0.12 * letters(words[b]));
    while (a > 0 && ceiling - words[a].start < 0.05 * words.slice(a, b + 1).reduce((n, w) => n + letters(w), 0) && b - a < 6) a--;
    const run = words.slice(a, b + 1);
    const total = run.reduce((n, w) => n + letters(w), 0);
    const start = words[a].start;
    // The run takes the time up to the next word (or the end of the audio), at most what its letters need at a slow
    // pace.
    const to = Math.max(words[b].end, Math.min(ceiling, start + 0.12 * total + 0.1 * run.length));
    let t = start;
    for (const w of run) {
      const d = ((to - start) * letters(w)) / total;
      w.start = t;
      w.end = t + d;
      t += d;
    }
    i = b;
  }
}

// The last stretch of sound (30 ms or more) between two times, as [start, end] in seconds, or null.
function lastRun({ env, floor }, from, to) {
  const frame = (t) => Math.max(0, Math.floor((t * 16000) / HOP));
  let end = -1;
  let start = -1;
  for (let k = Math.min(env.length, frame(to)) - 1; k >= frame(from); k--) {
    if (env[k] > floor) {
      if (end < 0) end = k;
      start = k;
    } else if (end >= 0 && start - k > 15) break;
  }
  if (end < 0 || end - start < 3) return null;
  return [(start * HOP) / 16000, ((end + 1) * HOP) / 16000];
}

// fitToSound for a word list and the audio file it came from: run after a script replaces the recognized words.
// With phrase spans, each phrase settles alone and its words stay inside its span.
export function fitFile(words, file, phrases = null) {
  const pcm = decode(file);
  const env = envelope(pcm);
  const duration = pcm.length / 16000;
  if (!phrases) return fitToSound(words, env, duration);
  phrases.forEach((p, pi) => {
    const group = words.filter((w) => w.phrase === pi);
    if (!group.length) return;
    fitToSound(group, env, Math.min(duration, p.end));
    for (const w of group) {
      w.start = Math.min(Math.max(w.start, p.start), p.end - 0.04);
      w.end = Math.min(Math.max(w.end, w.start + 0.04), p.end);
    }
    // Speech after a pause at the end of the phrase with no word on it ("statusnya, [pause] terancam") belongs to the
    // last word: the recognizer placed it too early, in the tail of the word before.
    const last = group[group.length - 1];
    const run = lastRun(env, last.end + 0.15, p.end);
    if (run && run[0] > last.end + 0.15) {
      last.start = run[0];
      last.end = run[1];
      if (group.length > 1) group[group.length - 2].end = Math.min(group[group.length - 2].end, last.start);
    }
    // Keeping words inside the span can crush the last ones against its end: spread them within it.
    evenOut(group, p.end);
  });
  for (const w of words) delete w.phrase;
  return words;
}

const HOP = 160;

// Loudness in 10 ms RMS frames at 16 kHz, with the silence floor 40 dB under the loudest frame.
function envelope(pcm) {
  const env = [];
  for (let i = 0; i + HOP <= pcm.length; i += HOP) {
    let e = 0;
    for (let k = i; k < i + HOP; k++) e += pcm[k] * pcm[k];
    env.push(Math.sqrt(e / HOP));
  }
  let peak = 1e-9;
  for (const v of env) peak = Math.max(peak, v);
  return { env, floor: peak * 10 ** (-40 / 20) };
}

// Whisper places a word's start late when speech resumes after silence: it can miss the first syllable. A word that
// follows a pause starts where the sound rises: walking back at most 0.6 s, never before the previous word's end,
// until 80 ms of silence.
function snapOnsets(words, { env, floor }) {
  const hop = HOP;
  words.forEach((w, i) => {
    const prevEnd = i ? words[i - 1].end : 0;
    if (i && w.start - prevEnd < 0.15) return;
    let f = Math.floor((w.start * 16000) / hop);
    const stop = Math.max(Math.ceil((prevEnd * 16000) / hop), f - 60);
    // Walk back through the sound, across dips inside a syllable. 80 ms of silence marks where the word begins.
    let onset = f;
    let quiet = 0;
    for (let k = f - 1; k >= stop; k--) {
      if (env[k] > floor) {
        onset = k;
        quiet = 0;
      } else if (++quiet >= 8) break;
    }
    w.start = Math.min(w.start, (onset * hop) / 16000);
  });
}

// Whisper's word ends are loose: an end can run a second into the pause after it, and a word can get no length at
// all. A word ends where its sound stops: the last loud frame before 80 ms of silence, searched from its start up to
// the next word's start. A word with no length shares the span up to the next word's end by letter count.
function snapEnds(words, { env, floor }, duration) {
  const frame = (t) => Math.floor((t * 16000) / HOP);
  words.forEach((w, i) => {
    const next = words[i + 1];
    if (w.end - w.start < 0.06 && next && next.start - w.start < 0.06) {
      const share = w.text.length / (w.text.length + next.text.length);
      w.end = next.start = +(w.start + (Math.max(next.end, w.start + 0.12) - w.start) * share).toFixed(3);
      return;
    }
    const bound = Math.min(env.length, frame(next ? Math.max(next.start, w.start) : duration));
    let last = -1;
    let quiet = 0;
    for (let k = frame(w.start); k < bound; k++) {
      if (env[k] > floor) {
        last = k;
        quiet = 0;
      } else if (++quiet >= 8 && last >= 0) break;
    }
    if (last < 0) return;
    const soundEnd = ((last + 1) * HOP) / 16000;
    if (w.end > soundEnd + 0.05 || w.end - w.start < 0.06) w.end = Math.max(w.start + 0.06, Math.min(soundEnd, next ? next.start : duration));
  });
}

export function wordsFile(m, file) {
  return join(m.outDir, 'voice', `${basename(file).replace(/\.[^.]+$/, '')}.words.json`);
}

// Every narration file in the manifest and where it plays, in video seconds.
export function narrations(m) {
  const list = [];
  if (m.voiceover) list.push({ file: m.voiceover.file, at: m.voiceover.at, where: 'voiceover', script: m.voiceover.script });
  for (const s of m.scenes) if (s.audio) list.push({ file: s.audio, at: s.start + AUDIO_LEAD, where: `scene ${s.name}`, script: s.script });
  return list;
}

// All transcribed words on the video timeline. Narrations with no transcript yet come back in `missing`.
export function spokenWords(m) {
  const words = [];
  const missing = [];
  for (const n of narrations(m)) {
    const f = wordsFile(m, n.file);
    if (!existsSync(f)) {
      missing.push(n);
      continue;
    }
    // Words in a skipped lead (a negative voiceover start) are never heard in the video.
    for (const w of JSON.parse(readFileSync(f, 'utf8')).words) if (n.at + w.end > 0) words.push({ text: w.text, start: Math.max(0, n.at + w.start), end: n.at + w.end });
  }
  return { words: words.sort((a, b) => a.start - b.start), missing };
}

// Words in lower case, punctuation removed, and a number split from a unit written onto it ("5L" is "5 l").
const norm = (t) => t.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s%]/gu, ' ').replace(/(\d)(\p{L}|%)/gu, '$1 $2').split(/\s+/).filter(Boolean);

// Units a recognizer writes short: "L" for "liter", "km" for "kilometer". Each set is one word.
const UNITS = [['l', 'liter', 'litre', 'liters', 'litres'], ['km', 'kilometer', 'kilometre', 'kilometers', 'kilometres'], ['m', 'meter', 'metre', 'meters', 'metres'],
  ['kg', 'kilogram', 'kilograms'], ['g', 'gram', 'grams'], ['cm', 'sentimeter', 'centimeter', 'centimetre'], ['%', 'peratus', 'percent', 'persen'],
  ['kb', 'kilobyte', 'kilobytes'], ['mb', 'megabyte', 'megabytes'], ['gb', 'gigabyte', 'gigabytes'], ['tb', 'terabyte', 'terabytes'],
  ['mhz', 'megahertz'], ['ghz', 'gigahertz']];
const unitOf = new Map(UNITS.flatMap((set, i) => set.map((w) => [w, i])));

// Spoken short forms a recognizer writes out in full, and loanword spellings: each set is one word.
const SAME = [['ni', 'ini'], ['tu', 'itu'], ['tak', 'tidak'], ['dah', 'sudah'], ['je', 'saja', 'sahaja'], ['kat', 'dekat'], ['nak', 'hendak'],
  ['org', 'orang'], ['yg', 'yang'], ['dgn', 'dengan'], ['utk', 'untuk'], ['saintis', 'scientist'], ['teknologi', 'technology']];
const sameOf = new Map(SAME.flatMap((set, i) => set.map((w) => [w, i])));

// A recognizer splits some written words apart: "non-stop" comes back as "non" and "-stop", "1,100" as "1"
// and ",100". A piece that starts with a hyphen or a comma before a digit rejoins the word before it.
const joinFragments = (words) => words.reduce((out, w) => {
  const prev = out[out.length - 1];
  if (prev && /^\s*(-\p{L}|,\d)/u.test(w.text)) out[out.length - 1] = { ...prev, text: prev.text.trimEnd() + w.text.trim(), end: w.end };
  else out.push(w);
  return out;
}, []);

// A recognized word with a unit written onto its number ("5L") becomes two words at the same time, so the unit can
// match the script's word for it.
const splitUnits = (words) => joinFragments(words).flatMap((w) => {
  const m = /^(.*\d)\s*(\p{L}+|%)([.,!?]*)$/u.exec(w.text);
  return m && unitOf.has(m[2].toLowerCase()) ? [{ ...w, text: m[1] }, { ...w, text: m[2] + m[3] }] : [w];
});

// Edit distance, for words the recognizer spelled slightly wrong ("iscribe" for "describe"). Numbers match exactly.
function distance(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}
// A number is a fact: 1982 and 1985 never match, whatever their spelling distance.
// Short words (4 letters or fewer) match only exactly: one letter changes them ("tahi" is not "tapi").
const alike = (a, b) => a === b || (unitOf.has(a) && unitOf.get(a) === unitOf.get(b)) || (sameOf.has(a) && sameOf.get(a) === sameOf.get(b)) || (!/\d/.test(a) && !/\d/.test(b) && Math.max(a.length, b.length) > 4 && distance(a, b) <= Math.floor(Math.max(a.length, b.length) / 4));

// Finds a phrase in the spoken words: the run of words that matches it best, in order. Speech recognition gets some
// words wrong, so a run matches when at least 70% of its words are alike. Ties go to the run nearest `near` (video
// seconds). Returns { start, end, score } in video seconds, or null.
export function findPhrase(words, phrase, near = 0) {
  const want = norm(phrase);
  if (!want.length) return null;
  const said = words.flatMap((w) => norm(w.text).map((t) => ({ t, w })));
  let best = null;
  for (let i = 0; i + want.length <= said.length; i++) {
    const score = want.filter((t, k) => alike(said[i + k].t, t)).length / want.length;
    if (score < 0.7) continue;
    const hit = { start: said[i].w.start, end: said[i + want.length - 1].w.end, score };
    if (!best || score > best.score || (score === best.score && Math.abs(hit.start - near) < Math.abs(best.start - near))) best = hit;
  }
  return best;
}

// Puts the known script's words on the recognized timings. Recognition misspells words ("iscribe" for "Describe")
// and drops some, but a narration read from a script (a TTS file, a recorded read) should show the script's exact
// words. The two word lists are aligned by edit distance over words, with alike words matching.
// A mismatched pair costs a little less than a skipped word on each side: a lone misheard word still pairs up, but
// alike words never shift out of line to pair two mismatches (babble after a sentence pairing with its last words).
const SUB = 1.9;

// Aligns script words to recognized words by edit distance over words. pair[i] is the recognized word script word i
// lines up with, or null. sure[i] marks the pairs of alike words.
function matchWords(words, said) {
  const a = said.map((w) => norm(w).join(''));
  const b = words.map((w) => norm(w.text).join(''));
  const n = a.length;
  const m = b.length;
  const cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = 0; i <= n; i++) cost[i][0] = i;
  for (let j = 0; j <= m; j++) cost[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      cost[i][j] = Math.min(cost[i - 1][j - 1] + (alike(a[i - 1], b[j - 1]) ? 0 : SUB), cost[i - 1][j] + 1, cost[i][j - 1] + 1);
    }
  }
  // Backtrack: each script word gets the recognized word it aligns with, or none.
  const pair = new Array(n).fill(null);
  for (let i = n, j = m; i > 0 && j >= 0; ) {
    if (j > 0 && cost[i][j] === cost[i - 1][j - 1] + (alike(a[i - 1], b[j - 1]) ? 0 : SUB)) {
      pair[i - 1] = j - 1;
      i--;
      j--;
    } else if (cost[i][j] === cost[i - 1][j] + 1) i--;
    else j--;
  }
  return { pair, sure: pair.map((j, i) => j != null && alike(a[i], b[j])) };
}

// A pair of alike words is a sure match and keeps its recognized time. The rest (a word misheard beyond recognition,
// a number spoken as words but written as digits, a dropped word) is spread by letter count over the speech heard
// between the sure matches around it. Spoken "lapan belas lima puluh tujuh" then shares the span of "1857".
export function alignScript(heard, script) {
  const words = splitUnits(heard);
  const said = script.split(/\s+/).filter((w) => norm(w).length);
  if (!said.length || !words.length) return words;
  const { pair, sure } = matchWords(words, said);
  const out = said.map((text, i) => (sure[i] ? { text, start: words[pair[i]].start, end: words[pair[i]].end } : { text, start: null, end: null }));
  let lastSure = -1;
  for (let i = 0; i < out.length; ) {
    if (sure[i]) {
      lastSure = pair[i];
      i++;
      continue;
    }
    let k = i;
    while (k < out.length && !sure[k]) k++;
    const nextSure = k < out.length ? pair[k] : words.length;
    const gap = words.slice(lastSure + 1, nextSure);
    const prevEnd = i > 0 ? out[i - 1].end : words[0].start;
    const nextStart = k < out.length ? out[k].start : words[words.length - 1].end;
    const from = gap.length ? Math.max(prevEnd, gap[0].start) : prevEnd;
    const to = gap.length ? Math.min(nextStart, Math.max(gap[gap.length - 1].end, from)) : nextStart;
    const weight = out.slice(i, k).map((w) => Math.max(1, norm(w.text).join('').length));
    const total = weight.reduce((x, y) => x + y, 0);
    let t = from;
    for (let q = i; q < k; q++) {
      const d = (Math.max(0, to - from) * weight[q - i]) / total;
      out[q].start = +t.toFixed(3);
      out[q].end = +(t + d).toFixed(3);
      t += d;
    }
    i = k;
  }
  return out;
}

// Checks one spoken take against its sentence: speech the sentence does not contain (a generated voice can babble on
// after the text, or add a stray word), and sentence words with no speech at all. Recognized words between sure
// matches stand for the script words there, so a number written as digits covers its spoken words.
// Returns { ok, extra: [{ text, seconds }], missing: [words], why }.
export function checkSpeech(heard, sentence) {
  const words = splitUnits(heard);
  const said = sentence.split(/\s+/).filter((w) => norm(w).length);
  const extra = [];
  const missing = [];
  if (!words.length) return { ok: false, extra, missing: said, why: 'no speech recognized' };
  const { pair, sure } = matchWords(words, said);
  let lastScript = -1;
  let lastHeard = -1;
  const gap = (i, j) => {
    const script = said.slice(lastScript + 1, i);
    const heard = words.slice(lastHeard + 1, j);
    // Misheard words pair up one to one. Heard words beyond the script's own words (numbers aside) are extra speech.
    const other = heard.filter((w) => !isNumberWord(w.text));
    const surplus = other.length - script.filter((w) => !isNumberWord(w)).length;
    if (heard.length && !script.length) extra.push({ text: heard.map((w) => w.text).join(' '), seconds: heard[heard.length - 1].end - heard[0].start });
    else if (surplus >= 2) extra.push({ text: other.map((w) => w.text).join(' '), seconds: 0 });
    if (script.length && !heard.length) missing.push(...script);
  };
  sure.forEach((ok, i) => {
    if (!ok) return;
    gap(i, pair[i]);
    lastScript = i;
    lastHeard = pair[i];
  });
  gap(said.length, words.length);
  const extraSeconds = extra.reduce((t, e) => t + e.seconds, 0);
  const extraWords = extra.reduce((n, e) => n + norm(e.text).length, 0);
  // Words are scored apart from numbers, which have their own exact check: a phrase with a long spoken year and a
  // garbled rest ("saya baru lewat tahun 1857" for "Semuanya bermula tahun …") must not pass on its number.
  const plain = said.map((w, i) => ({ w, i })).filter((x) => !isNumberWord(x.w));
  const sureShare = plain.length ? plain.filter((x) => sure[x.i]).length / plain.length : 1;
  // A number is a fact: every number in the sentence must be heard, as digits or words, and no other.
  const want = numbersIn(sentence);
  const got = numbersIn(words.map((w) => w.text).join(' '));
  const wrongNumber = want.join() !== got.join();
  const why = [
    wrongNumber ? `numbers heard as ${got.join(', ') || 'none'}, the script says ${want.join(', ') || 'none'}` : null,
    extraSeconds > 0.35 || extraWords >= 2 ? `extra speech "${extra.map((e) => e.text).join(' … ')}"` : null,
    missing.length > Math.max(1, said.length * 0.15) ? `missing "${missing.join(' ')}"` : null,
    // Recognition mishears some words, so a take passes with a few unsure ones, but not with most of them.
    sureShare < 0.6 ? `only ${Math.round(sureShare * 100)}% of its words recognized` : null,
  ].filter(Boolean);
  // How far the take is from its sentence, to keep the best of several takes.
  const badness = extraSeconds + 0.3 * extraWords + 0.3 * missing.length + (wrongNumber ? 1 : 0) + 2 * Math.max(0, 1 - sureShare);
  // Words the recognizer did not hear as written (numbers aside): a mispronounced word, or a misheard one. A compound
  // heard as two words ("Wi -Fi" for "Wi-Fi") was heard right.
  const stream = words.map((w) => norm(w.text).join('')).join('');
  const unsure = plain.filter((x) => !sure[x.i] && !(norm(x.w).join('').length > 4 && norm(x.w).length > 1 && stream.includes(norm(x.w).join('')))).map((x) => x.w);
  return { ok: !why.length, extra, missing, unsure, why: why.join(', '), badness };
}

// The phrase spans speak writes beside its audio: voiceover.wav -> voiceover.phrases.json.
export const phrasesFile = (audio) => audio.replace(/\.[^./]+$/, '') + '.phrases.json';

// Script words on recognized timings, phrase by phrase, when the audio's phrase spans are known (speak made it, or
// subtitles give them). The words align with the whole transcript first, by text, so a word the recognizer timed early
// still finds its phrase. Then each phrase's words are placed inside its span. Every word carries its phrase index.
export function alignPhrases(words, phrases) {
  const all = alignScript(words, phrases.map((p) => p.text).join(' '));
  const out = [];
  let k = 0;
  phrases.forEach((p, pi) => {
    const n = p.text.split(/\s+/).filter((w) => norm(w).length).length;
    const group = all.slice(k, k + n).map((w) => ({ ...w, phrase: pi }));
    k += n;
    if (!group.length) return;
    // Words the recognizer timed inside the span keep their times. Words that spill past an edge (the recognizer runs
    // early at phrase starts) share the room between that edge and the nearest word inside, by letter count.
    const letters = (w) => Math.max(1, norm(w.text).join('').length);
    const spread = (list, from, to) => {
      const total = list.reduce((n, w) => n + letters(w), 0);
      let t = from;
      for (const w of list) {
        const d = (Math.max(0, to - from) * letters(w)) / total;
        w.start = t;
        w.end = t + d;
        t += d;
      }
    };
    const inside = (w) => w.start >= p.start - 0.02 && w.end <= p.end + 0.02 && w.end - w.start >= 0.04;
    const first = group.findIndex(inside);
    if (first < 0) spread(group, p.start, p.end);
    else {
      let last = group.length - 1;
      while (!inside(group[last])) last--;
      if (first > 0) spread(group.slice(0, first), p.start, group[first].start);
      if (last < group.length - 1) spread(group.slice(last + 1), group[last].end, p.end);
      // A word between the two that sits outside the span (a stray time) goes between its neighbors.
      for (let i = first + 1; i < last; i++) {
        if (inside(group[i])) continue;
        group[i].start = group[i - 1].end;
        group[i].end = Math.max(group[i].start, group[i + 1].start);
      }
    }
    out.push(...group);
  });
  return out;
}
