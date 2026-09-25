// Speech timing for narration: word-level timestamps from a local Whisper model (transformers.js on ONNX Runtime).
// No external API: the runtime installs once into ~/.cache/motion-video/asr, and the model downloads once from the
// Hugging Face hub into the persistent model folder (paths.mjs). Every later run is offline.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AUDIO_LEAD } from './manifest.mjs';
import { cacheRoot, modelsDir } from './paths.mjs';

export const DEFAULT_MODEL = 'onnx-community/whisper-base_timestamped';
const PKG = '@huggingface/transformers';

function cacheDir() {
  return join(cacheRoot(), 'asr');
}

// Installs a package of the speech runtime on first use (transformers.js and ONNX Runtime, about 500 MB), with Bun
// when present, else npm. Returns the loaded module. Models it fetches go to the persistent model folder.
export async function speechModule(pkg = PKG) {
  const dir = cacheDir();
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, 'package.json'))) writeFileSync(join(dir, 'package.json'), '{"name":"motion-video-asr","private":true}\n');
  const req = createRequire(join(dir, 'package.json'));
  let entry;
  try {
    entry = req.resolve(pkg);
  } catch {
    console.error(`Installing ${pkg} for local speech into ${dir}. This happens once.`);
    const bun = spawnSync('bun', ['--version'], { stdio: 'ignore' }).status === 0;
    const r = spawnSync(bun ? 'bun' : 'npm', [bun ? 'add' : 'install', pkg], { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) throw new Error(`Installing ${pkg} into ${dir} failed. Check the network, then run the command again.`);
    entry = req.resolve(pkg);
  }
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
export async function transcribe(file, { model = DEFAULT_MODEL, language } = {}) {
  const { pipeline } = await runtime();
  const pcm = decode(file);
  const duration = pcm.length / 16000;
  const asr = await pipeline('automatic-speech-recognition', model, { dtype: 'fp32' });
  const out = await asr(pcm, { return_timestamps: 'word', chunk_length_s: 30, ...(language ? { language } : {}) });
  const words = out.chunks
    .map((c) => ({ text: c.text.trim(), start: c.timestamp[0] ?? 0, end: c.timestamp[1] ?? duration }))
    .filter((w) => w.text)
    .map((w) => ({ text: w.text, start: Math.min(w.start, duration), end: Math.min(Math.max(w.end, w.start), duration) }));
  const env = envelope(pcm);
  snapOnsets(words, env);
  snapEnds(words, env, duration);
  for (const w of words) {
    w.start = +w.start.toFixed(3);
    w.end = +w.end.toFixed(3);
  }
  return { file, model, duration: +duration.toFixed(3), words };
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
    for (const w of JSON.parse(readFileSync(f, 'utf8')).words) words.push({ text: w.text, start: n.at + w.start, end: n.at + w.end });
  }
  return { words: words.sort((a, b) => a.start - b.start), missing };
}

const norm = (t) => t.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

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
const alike = (a, b) => a === b || (!/\d/.test(a) && !/\d/.test(b) && distance(a, b) <= Math.max(1, Math.floor(Math.max(a.length, b.length) / 4)));

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
// words. The two word lists are aligned by edit distance over words, with alike words matching. A script word with
// no recognized partner gets a time interpolated from its neighbors.
export function alignScript(words, script) {
  const said = script.split(/\s+/).filter((w) => norm(w).length);
  if (!said.length || !words.length) return words;
  const a = said.map((w) => norm(w).join(''));
  const b = words.map((w) => norm(w.text).join(''));
  const n = a.length;
  const m = b.length;
  const cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = 0; i <= n; i++) cost[i][0] = i;
  for (let j = 0; j <= m; j++) cost[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      cost[i][j] = Math.min(cost[i - 1][j - 1] + (alike(a[i - 1], b[j - 1]) ? 0 : 1), cost[i - 1][j] + 1, cost[i][j - 1] + 1);
    }
  }
  // Backtrack: each script word gets the recognized word it aligns with, or none.
  const pair = new Array(n).fill(null);
  for (let i = n, j = m; i > 0 && j >= 0; ) {
    if (j > 0 && cost[i][j] === cost[i - 1][j - 1] + (alike(a[i - 1], b[j - 1]) ? 0 : 1)) {
      pair[i - 1] = j - 1;
      i--;
      j--;
    } else if (cost[i][j] === cost[i - 1][j] + 1) i--;
    else j--;
  }
  const out = said.map((text, i) => (pair[i] == null ? { text, start: null, end: null } : { text, start: words[pair[i]].start, end: words[pair[i]].end }));
  // Unmatched runs share the time between the matched words around them.
  for (let i = 0; i < out.length; ) {
    if (out[i].start != null) {
      i++;
      continue;
    }
    let k = i;
    while (k < out.length && out[k].start == null) k++;
    const from = i > 0 ? out[i - 1].end : words[0].start;
    const to = k < out.length ? out[k].start : words[words.length - 1].end;
    const step = Math.max(0, to - from) / (k - i);
    for (let q = i; q < k; q++) {
      out[q].start = +(from + step * (q - i)).toFixed(3);
      out[q].end = +(from + step * (q - i + 1)).toFixed(3);
    }
    i = k;
  }
  return out;
}
