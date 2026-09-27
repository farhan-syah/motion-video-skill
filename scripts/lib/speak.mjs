// Text to speech for narration, from one of four engines:
//   command: any TTS the user already runs (Piper, XTTS, F5, a cloud CLI), through a command template.
//   voxcpm:  VoxCPM2 (OpenBMB, Apache 2.0): 30 languages, voice design and cloning. Needs an NVIDIA GPU with 8 GB.
//   model:   any Hugging Face text-to-speech model, run locally: transformers.js for ONNX weights, else the
//            transformers pipeline in Python on the CPU.
//   default: Kokoro-82M (Apache 2.0) through kokoro-js: local, English voices, no setup.
// Flags choose, else "tts" in ~/.config/motion-video/config.json.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheRoot, config, hubCaches, modelsDir } from './paths.mjs';
import { speechModule } from './voice.mjs';

export const DEFAULT_VOICE = 'af_heart';
const KOKORO = 'onnx-community/Kokoro-82M-v1.0-ONNX';

// Where each phrase sits in the joined audio: [{ text, start, end }] in seconds. parts alternate audio and pause.
function spans(list, parts, rate) {
  const out = [];
  let t = 0;
  list.forEach((p, i) => {
    const len = parts[i * 2].length / rate;
    out.push({ text: spoken(p.text), start: +t.toFixed(3), end: +(t + len).toFixed(3) });
    t += len + parts[i * 2 + 1].length / rate;
  });
  return out;
}

function wav(parts, rate) {
  const n = parts.reduce((k, p) => k + p.length, 0);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  let o = 44;
  for (const p of parts) {
    for (const v of p) {
      buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), o);
      o += 2;
    }
  }
  return { buf, duration: n / rate };
}

// Any audio file ffmpeg reads, as 48 kHz mono samples. Null when ffmpeg cannot read it.
const RATE = 48000;
function decode(file) {
  const c = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return c.status === 0 && c.stdout.length ? new Float32Array(Uint8Array.from(c.stdout).buffer) : null;
}

// Sentences, so long scripts stay within a model's input length and get a natural pause between sentences.
// Narration is paced, not read out: the script marks its pauses. A blank line is a long pause (a new beat), a line
// break a breath, a sentence end inside a line a short stop, and [pause] or [pause 0.6] an exact pause in seconds.
// Returns the phrases to speak, each with the silence after it and its kind: sentence, line, beat, mark or end.
export const PAUSES = { beat: 0.8, line: 0.45, sentence: 0.3, mark: 0.6 };
export function phrases(script) {
  const out = [];
  let delivery = null;
  const add = (text, pause, kind) => {
    const t = text.replace(/\s+/g, ' ').trim();
    if (t) {
      out.push({ text: t, pause, kind, ...(delivery ? { delivery } : {}) });
      delivery = null;
    }
    else if (out.length) {
      const last = out[out.length - 1];
      // A [pause] mark is exact, so it wins over the break it sits on.
      if (kind === 'mark' || (last.kind !== 'mark' && pause > last.pause)) last.kind = kind;
      last.pause = kind === 'mark' ? pause : Math.max(last.pause, pause);
    }
  };
  const beats = script.replace(/\r/g, '').split(/\n\s*\n/);
  beats.forEach((beat, bi) => {
    const lines = beat.split('\n');
    lines.forEach((raw, li) => {
      // A delivery note opens a line: "(asking a question) Want your own voice?". VoxCPM2 speaks by it, and it is never
      // spoken, shown in captions or checked.
      const lead = LEAD.exec(raw);
      if (lead) delivery = `(${lead[1].trim()})`;
      const line = lead ? raw.slice(lead[0].length) : raw;
      const end = li < lines.length - 1 ? PAUSES.line : bi < beats.length - 1 ? PAUSES.beat : 0;
      const endKind = li < lines.length - 1 ? 'line' : bi < beats.length - 1 ? 'beat' : 'end';
      // [pause] marks split a line into pieces.
      const pieces = line.split(/\[pause(?:\s+([\d.]+))?\]/i);
      for (let k = 0; k < pieces.length; k += 2) {
        const mark = k + 1 < pieces.length ? Number(pieces[k + 1] ?? PAUSES.mark) || PAUSES.mark : null;
        const said = sentences(pieces[k]);
        said.forEach((s, si) => (si < said.length - 1 ? add(s, PAUSES.sentence, 'sentence') : mark != null ? add(s, mark, 'mark') : add(s, end, endKind)));
        if (!said.length && mark != null) add('', mark, 'mark');
      }
    });
  });
  if (out.length) Object.assign(out[out.length - 1], { pause: 0, kind: 'end' });
  return out;
}

// What VoxCPM2 speaks in one generation: a beat, the phrases between blank lines and [pause] marks, joined so the
// model sets the pauses inside it from the meaning. Each generation is a separate draw of the voice, so fewer, longer
// ones keep it steadier and its delivery connected. A beat over `max` words splits at a sentence end, since long
// inputs make the model unstable. lines: every line break also splits (a timed script places each line at its time).
// Each chunk keeps its sentences, to speak them one by one when the whole chunk keeps failing.
// whole: blank lines and [pause] marks stay inside a chunk (their silence is set after generation), so the script is
// one take up to `max` words: one draw of the voice, with no seams for it to drift across.
export function chunks(script, { lines = false, max = 40, whole = false } = {}) {
  const out = [];
  let group = [];
  const count = (list) => list.reduce((n, p) => n + p.text.split(/\s+/).length, 0);
  // A delivery note covers its own line as one generation: VoxCPM2 applies an instruction to everything it speaks in
  // that generation, so the lines after it return to --style in a generation of their own.
  let delivery = null;
  let groupDelivery = null;
  const flush = () => {
    if (!group.length) return;
    const last = group[group.length - 1];
    out.push({ text: group.map((p) => p.text).join(' '), pause: last.pause, kind: last.kind, sentences: group, ...(groupDelivery ? { delivery: groupDelivery } : {}) });
    group = [];
  };
  for (const p of phrases(script)) {
    if (p.delivery) {
      flush();
      delivery = p.delivery;
    }
    if (group.length && count(group) + count([p]) > max) flush();
    if (!group.length) groupDelivery = delivery;
    group.push(p);
    if (delivery && p.kind !== 'sentence') {
      flush();
      delivery = null;
    }
    if (!(p.kind === 'sentence' || (p.kind === 'line' && !lines) || (whole && (p.kind === 'beat' || p.kind === 'mark')))) flush();
  }
  flush();
  return out;
}

// VoxCPM2's non-verbal tags: a laugh, a sigh, a thinking sound, a question or surprise particle, written in the script
// where it happens ("[sigh] Not again."). VoxCPM2 voices them. Captions, the speech check and every other engine drop
// them, since they are not words.
export const TAGS = /\[(?:laughing|sigh|uhm|shh|question-(?:ah|ei|en|oh)|surprise-(?:wa|yo)|dissatisfaction-hnn)\]/gi;
export const withoutTags = (text) => text.replace(TAGS, ' ').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();

// A delivery note at the start of a line, in parentheses.
const LEAD = /^[ \t]*\(([^()\n]{2,120})\)[ \t]*/;

// The words of a script as spoken: delivery notes, pause marks and tags removed, one line. This is the script captions
// and checks read.
const clean = (script) => withoutTags(script.replace(new RegExp(LEAD.source, 'gm'), '').replace(/\[pause(?:\s+[\d.]+)?\]/gi, ' ')).replace(/\s+/g, ' ').trim();

// A word written one way and said another: {VoxCPM2|Vox C P M two}, {--command|dash dash command}. Captions and the
// screen show the written form. The voice says the spoken form, and the speech check listens for it.
const SAID = /\{([^{}|\n]+)\|([^{}\n]+)\}/g;
export const say = (text) => text.replace(SAID, '$2');
export const shown = (text) => text.replace(SAID, '$1');
export const spoken = (script) => clean(shown(script));
// The words as the voice says them: what the speech check compares a take with.
export const sayable = (script) => clean(say(script));

// The written script: the ear script's words with the punctuation grammar wants. The voice speaks the ear script,
// whose commas and dashes set its pauses. Captions and transcribe show the written one. Words are matched letter by
// letter, case, punctuation and spacing aside ("motion-video" matches "motion video"). Returns { text, spans } where
// spans(phrases) gives each spoken phrase the written words it covers, or throws where the words differ.
export function writtenScript(ear, written) {
  const key = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const text = spoken(written);
  // Written tokens, each with where its letters start in the letter stream. A mark standing alone joins the word before.
  const tokens = [];
  let at = 0;
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (!key(w) && tokens.length) tokens[tokens.length - 1].text += ` ${w}`;
    else tokens.push({ text: w, at });
    at += key(w).length;
  }
  const a = key(spoken(ear));
  const b = key(text);
  if (a !== b) {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    const around = (t, script) => {
      let n = 0;
      for (const w of spoken(script).split(/\s+/)) {
        n += key(w).length;
        if (n > i) return w;
      }
      return '(the end)';
    };
    throw new Error(`speak --written: the scripts' words differ at "${around(a, ear)}" in the ear script and "${around(b, written)}" in the written one. The written script holds the same words, with only punctuation, case or spacing changed.`);
  }
  const spans = (list) => {
    let from = 0;
    return list.map((p) => {
      const to = from + key(p.text).length;
      const words = tokens.filter((t) => t.at >= from && t.at < to).map((t) => t.text);
      from = to;
      return { ...p, text: words.join(' ') };
    });
  };
  return { text, spans };
}

// A stop inside a number ("13.5") or a name ("Node.js") is not a sentence end: Latin stops end one only before a
// space or the end of the text. CJK stops always do.
const sentences = (text) => text.replace(/\s+/g, ' ').match(/.+?(?:[.!?…]+["')\]」』]*(?=\s|$)|[。！？]+[」』]*|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [];

async function kokoro(script, { model = KOKORO, voice = DEFAULT_VOICE, speed = 1 }) {
  const { KokoroTTS } = await speechModule('kokoro-js');
  const tts = await KokoroTTS.from_pretrained(model, { dtype: 'q8' });
  if (!tts.voices[voice]) throw new Error(`speak: Kokoro has no voice "${voice}". Voices: ${Object.keys(tts.voices).join(', ')}.`);
  const parts = [];
  let rate = 24000;
  const list = phrases(script);
  for (const p of list) {
    const audio = await tts.generate(say(p.text), { voice, speed });
    rate = audio.sampling_rate;
    parts.push(audio.audio, new Float32Array(Math.round(p.pause * rate)));
  }
  return { ...wav(parts, rate), phrases: spans(list, parts, rate) };
}

async function transformersModel(script, { model }) {
  const { pipeline } = await speechModule();
  let tts;
  try {
    tts = await pipeline('text-to-speech', model, { dtype: 'fp32' });
  } catch (e) {
    // Most Hugging Face TTS models ship PyTorch weights only: Python runs them.
    return pythonModel(script, { model, why: e.message.split('\n')[0] });
  }
  const parts = [];
  let rate = 16000;
  const list = phrases(script);
  for (const p of list) {
    const out = await tts(say(p.text));
    rate = out.sampling_rate;
    parts.push(out.audio, new Float32Array(Math.round(p.pause * rate)));
  }
  return { ...wav(parts, rate), phrases: spans(list, parts, rate) };
}

// A Hugging Face TTS model without ONNX weights, through the transformers pipeline in Python (scripts/tts/hf_speak.py)
// on the CPU. uv builds its environment on first use. The model loads once for every phrase.
function pythonModel(script, { model, why }) {
  if (spawnSync('uv', ['--version'], { stdio: 'ignore' }).status !== 0) {
    throw new Error(`speak: "${model}" has no ONNX weights transformers.js can load (${why}). Install uv (https://docs.astral.sh/uv) to run it in Python, or use --command.`);
  }
  const list = phrases(script);
  if (!list.length) throw new Error('speak: the script is empty.');
  const dir = mkdtempSync(join(tmpdir(), 'motion-video-tts-'));
  try {
    const listFile = join(dir, 'sentences.json');
    writeFileSync(listFile, JSON.stringify(list.map((p, index) => ({ index, text: say(p.text), seed: 7 }))));
    const runner = fileURLToPath(new URL('../tts/hf_speak.py', import.meta.url));
    console.error(`speak: running ${model} in Python on the CPU. The first run builds its environment and downloads the model.`);
    const env = { ...process.env, HF_HUB_CACHE: process.env.HF_HUB_CACHE ?? modelsDir(), TQDM_DISABLE: '1', PYTHONWARNINGS: 'ignore', TRANSFORMERS_VERBOSITY: 'error' };
    const r = spawnSync('uv', ['run', '--quiet', runner, '--sentences', listFile, '--dir', dir, '--model', model], { stdio: ['ignore', 'pipe', 'pipe'], env, encoding: 'utf8', maxBuffer: 1 << 28 });
    if (r.status !== 0) throw new Error(`speak: "${model}" loads neither in transformers.js (${why}) nor in Python:\n${`${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-15).join('\n')}\nUse a model whose pipeline tag is text-to-speech, or --command.`);
    const parts = [];
    list.forEach((p, i) => {
      const audio = decode(join(dir, `seg-${String(i).padStart(3, '0')}.wav`));
      if (!audio) throw new Error(`speak: ${model} wrote no audio for "${p.text}".`);
      parts.push(audio, new Float32Array(Math.round(p.pause * RATE)));
    });
    return { ...wav(parts, RATE), phrases: spans(list, parts, RATE) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Runs the user's TTS command. Placeholders: {text} (the text, shell-quoted), {text_file} (a file holding it),
// {out} (the audio file the command must write, any format ffmpeg reads), {voice} and {reference} (a recording to clone).
// It runs once per phrase, so the script's pauses, timed lines and phrase spans hold as with the built-in engines.
// oneCall runs it once on the whole script without the pause marks: for an engine that loads slowly on every call.
export function command(script, { command: template, voice = '', reference = '', oneCall = false }) {
  const dir = mkdtempSync(join(tmpdir(), 'motion-video-tts-'));
  const quote = (t) => (process.platform === 'win32' ? `"${t.replace(/"/g, '\\"')}"` : `'${t.replace(/'/g, `'\\''`)}'`);
  const run = (text) => {
    const textFile = join(dir, 'script.txt');
    const raw = join(dir, 'speech.wav');
    rmSync(raw, { force: true });
    writeFileSync(textFile, `${text}\n`);
    const cmd = template.replaceAll('{text_file}', quote(textFile)).replaceAll('{out}', quote(raw)).replaceAll('{voice}', quote(voice)).replaceAll('{reference}', quote(reference)).replaceAll('{text}', quote(text));
    const r = spawnSync(cmd, { shell: true, stdio: ['ignore', 'inherit', 'inherit'] });
    if (r.status !== 0) throw new Error(`speak: the TTS command exited ${r.status} on "${text}": ${template}`);
    // Whatever the command wrote (wav, mp3, flac), the narration is 48 kHz mono.
    const audio = decode(raw);
    if (!audio) throw new Error(`speak: the TTS command wrote no audio ffmpeg can read at {out}. Check that the command writes its output to the {out} path.`);
    return audio;
  };
  try {
    if (oneCall) return wav([run(sayable(script))], RATE);
    const list = phrases(script);
    const parts = [];
    list.forEach((p, i) => {
      parts.push(run(say(p.text)), new Float32Array(Math.round(p.pause * RATE)));
      if (list.length > 1) console.error(`tts command: ${i + 1}/${list.length} phrases`);
    });
    return { ...wav(parts, RATE), phrases: spans(list, parts, RATE) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The NVIDIA GPU and its memory, or null. VoxCPM2 needs about 8 GB.
export function nvidiaGpu() {
  const r = spawnSync('nvidia-smi', ['--query-gpu=name,memory.total,memory.free', '--format=csv,noheader,nounits'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const [name, mib, free] = r.stdout.split('\n')[0].split(',').map((x) => x.trim());
  return { name, gb: Number(mib) / 1024, freeGb: Number(free) / 1024 };
}

export function voxcpmReady() {
  const gpu = nvidiaGpu();
  const uv = spawnSync('uv', ['--version'], { stdio: 'ignore' }).status === 0;
  if (!gpu) return { ok: false, why: 'needs an NVIDIA GPU with 8 GB of memory (none found)' };
  if (gpu.gb < 7.5) return { ok: false, why: `needs 8 GB of GPU memory (${gpu.name} has ${gpu.gb.toFixed(0)} GB)` };
  if (!uv) return { ok: false, why: `needs uv (https://docs.astral.sh/uv) to build its Python environment. The GPU (${gpu.name}, ${gpu.gb.toFixed(0)} GB) is enough.` };
  return { ok: true, why: `${gpu.name}, ${gpu.gb.toFixed(0)} GB` };
}

const VOXCPM = 'openbmb/VoxCPM2';
// A complete checkpoint holds the weights and the audio VAE. existsSync follows symlinks, so a snapshot whose
// download stalled (a blob still .incomplete) does not count.
const complete = (dir) => ['model.safetensors', 'audiovae.pth', 'config.json'].every((f) => existsSync(join(dir, f)));

// A VoxCPM2 checkpoint already on disk: "tts.checkpoint" in the config, else a complete snapshot in the model folder or
// the standard Hugging Face cache. Null when none exists, and the first run downloads it (about 4.7 GB).
export function voxcpmCheckpoint() {
  const set = config().tts?.checkpoint;
  if (set) {
    if (!complete(set)) throw new Error(`tts.checkpoint in the config is "${set}", which lacks model.safetensors, audiovae.pth or config.json. Point it at a full VoxCPM2 checkpoint directory.`);
    return set;
  }
  for (const hub of hubCaches()) {
    const snaps = join(hub, `models--${VOXCPM.replace('/', '--')}`, 'snapshots');
    if (!existsSync(snaps)) continue;
    const hit = readdirSync(snaps).map((s) => join(snaps, s)).find(complete);
    if (hit) return hit;
  }
  return null;
}

// A generated take can carry glitches a listener hears at once. Tidying repairs what it can in place, which is
// faster than a new take: a thump set apart from the speech at either edge is silenced, and each edge fades (10 ms in,
// 25 ms out), so no take starts or stops on a click. A real sound mistaken for a thump goes missing from what the
// check hears, so the take still fails on its words. A take cut off mid-sound cannot be repaired.
// Returns { samples, faults, repairs } with faults and repairs in words.
export function tidy(x, rate = 48000) {
  const hop = Math.round(rate / 100);
  const env = [];
  // Brightness per frame: high-frequency energy against all of it. A consonant ("t", "s", "k") is bright, a thump dark.
  const bright = [];
  for (let i = 0; i + hop <= x.length; i += hop) {
    let e = 0;
    let d = 0;
    for (let k = i; k < i + hop; k++) {
      e += x[k] * x[k];
      if (k) d += (x[k] - x[k - 1]) ** 2;
    }
    env.push(Math.sqrt(e / hop));
    bright.push(10 * Math.log10(d / (e + 1e-12) + 1e-12));
  }
  let peak = 1e-9;
  for (const v of env) peak = Math.max(peak, v);
  const loud = env.map((v) => v > peak * 10 ** (-40 / 20));
  const runs = [];
  for (let f = 0; f < loud.length; f++) {
    if (!loud[f]) continue;
    let g = f;
    while (g + 1 < loud.length && loud[g + 1]) g++;
    runs.push([f, g]);
    f = g;
  }
  const faults = [];
  const repairs = [];
  const out = new Float32Array(x);
  const mean = (a, b) => bright.slice(a, b + 1).reduce((t, v) => t + v, 0) / (b - a + 1);
  // A thump: a burst under 70 ms, dark, set apart from the speech by 40 ms or more, at either edge. It is silenced
  // from the take's edge to 20 ms into the gap, which the gap's 40 ms leaves clear of the speech.
  const thump = (run, next) => run && next && run[1] - run[0] + 1 < 7 && mean(run[0], run[1]) < -16 && Math.abs(next[0] - run[1]) >= 4;
  if (runs.length > 1 && thump(runs[0], runs[1])) {
    out.fill(0, 0, Math.min(out.length, (runs[0][1] + 3) * hop));
    repairs.push(`a thump before the speech at ${((runs[0][0] * hop) / rate).toFixed(2)}s`);
  }
  if (runs.length > 1 && thump(runs[runs.length - 1], [runs[runs.length - 2][1]])) {
    out.fill(0, Math.max(0, (runs[runs.length - 1][0] - 2) * hop));
    repairs.push(`a thump after the speech at ${((runs[runs.length - 1][0] * hop) / rate).toFixed(2)}s`);
  }
  // Cut off: the take ends while still loud, mid-sound.
  // A clean take fades to silence. One whose last 30 ms still sound within 30 dB of its peak stops mid-sound.
  // A natural ending decays over its last frames. A cut-off one is still at full strength when the audio stops.
  const n = env.length;
  if (n > 3 && env.slice(-3).every((v) => v > peak * 10 ** (-30 / 20)) && env[n - 1] > 0.5 * env[n - 3]) faults.push('it stops mid-sound, cut off');
  const fadeIn = Math.min(out.length, Math.round(rate * 0.01));
  const fadeOut = Math.min(out.length, Math.round(rate * 0.025));
  for (let k = 0; k < fadeIn; k++) out[k] *= k / fadeIn;
  for (let k = 0; k < fadeOut; k++) out[out.length - 1 - k] *= k / fadeOut;
  return { samples: out, faults, repairs };
}

// Clicks in a take: impulses a few milliseconds wide, far sharper than any sound around them (found in the second
// difference, which an impulse dominates and a voice does not). Only a click in a pause counts: both sides quiet,
// 30 dB under the take's loud level. Inside speech a /t/ or /k/ burst has the same shape, and heard on VoxCPM2
// takes nearly every spike there was one, so speech is never flagged or edited. Returns their times in seconds.
export function clicks(x, rate = 48000) {
  const hop = Math.round(rate / 500);
  // The median of the wave's size: a spike beside the one measured does not raise it, a voice does.
  const level = (a, b) => {
    const v = Array.from(x.subarray(Math.max(0, a), Math.min(x.length, b)), Math.abs).sort((p, q) => p - q);
    return v[v.length >> 1] ?? 0;
  };
  const frames = [];
  for (let k = 0; k + hop * 5 <= x.length; k += hop * 5) frames.push(level(k, k + hop * 5));
  frames.sort((a, b) => a - b);
  const loud = frames[Math.floor(frames.length * 0.95)] || 1e-9;
  // Both sides of the spike, 3 to 20 ms away from it.
  const inPause = (c) => Math.max(level(c - Math.round(0.02 * rate), c - Math.round(0.003 * rate)), level(c + Math.round(0.003 * rate), c + Math.round(0.02 * rate))) < loud * 10 ** (-30 / 20);
  const e = [];
  for (let i = 0; i + hop < x.length; i += hop) {
    let s = 0;
    for (let k = Math.max(2, i); k < i + hop; k++) {
      const d = x[k] - 2 * x[k - 1] + x[k - 2];
      s += d * d;
    }
    e.push(Math.sqrt(s / hop));
  }
  const edge = 2;
  const out = [];
  for (let f = edge; f < e.length - edge; f++) {
    if (e[f] < 0.01 || e[f] < e[f - 1] || e[f] < e[f + 1]) continue;
    const near = [];
    for (let k = f - 75; k <= f + 75; k++) if (k >= 0 && k < e.length && Math.abs(k - f) > 3) near.push(e[k]);
    near.sort((a, b) => a - b);
    const p90 = near[Math.floor(near.length * 0.9)] || 1e-9;
    // A click is a discontinuity about a millisecond long. A consonant burst (/k/, /t/, /tʃ/) is as sharp but lasts
    // 8 ms or more, so a spike wider than 3 hops (6 ms) at half its height is speech, not a click.
    let width = 1;
    for (let k = f - 1; k >= 0 && e[k] > e[f] / 2; k--) width++;
    for (let k = f + 1; k < e.length && e[k] > e[f] / 2; k++) width++;
    if (width > 3) continue;
    if (e[f] > 6 * p90 && inPause(f * hop + Math.round(0.001 * rate)) && (!out.length || (f * hop) / rate - out[out.length - 1] > 0.05)) out.push(+((f * hop) / rate).toFixed(2));
  }
  return out;
}

// Repairs clicks in place: each click time's 4 ms is smoothed (a 17-sample moving average), blended in over 1 ms at
// each edge. A click is a discontinuity about a millisecond long, so smoothing it away leaves the speech around it.
// halfMs widens the smoothed span for a click spread over more of the wave.
export function declick(x, times, rate = 48000, halfMs = 2) {
  const y = Float32Array.from(x);
  const half = Math.round((halfMs / 1000) * rate);
  const blend = Math.round(0.001 * rate);
  for (const t of times) {
    // clicks() reports the start of a 2 ms hop: the discontinuity sits inside it.
    const c = Math.round((t + 0.001) * rate);
    for (let k = Math.max(8, c - half - blend); k < Math.min(x.length - 8, c + half + blend); k++) {
      let m = 0;
      for (let j = -8; j <= 8; j++) m += x[k + j];
      m /= 17;
      const d = Math.abs(k - c);
      const w = d <= half ? 1 : 1 - (d - half) / blend;
      y[k] = x[k] * (1 - w) + m * w;
    }
  }
  return y;
}

// Repairs every click it can: a click left after a pass is smoothed over a wider span (4, 8, 16, then 24 ms). A click
// only counts in a pause, so the smoothing never reaches the voice. Returns { samples, fixed, left } with click times
// in seconds.
export function repairClicks(x, rate = 48000) {
  const fixed = clicks(x, rate);
  let y = x;
  let left = fixed;
  for (const halfMs of [2, 4, 8, 12]) {
    if (!left.length) break;
    y = declick(y, left, rate, halfMs);
    left = clicks(y, rate);
  }
  return { samples: y, fixed: fixed.filter((t) => !left.some((v) => Math.abs(v - t) < 0.05)), left };
}

function samples(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`speak: ffmpeg cannot decode ${file}.`);
  return new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.length));
}

// Transcribes a take and checks it against its text. A generated voice can babble past the end of a sentence, add
// a stray word, or drop words; the take is then regenerated.
const clip = (t, n = 140) => (t.length > n ? `${t.slice(0, n)}…` : t);

// Opening words a speaker pauses after, and joining words a speaker breathes before.
const TRANSITIONS = /^(then|now|first|next|so|here|finally|also|still|today|instead|meanwhile|later|afterwards|otherwise|however|yes|okay|well)$/i;
const JOINS = /^(and|but|so|then|because|while|which|until|or)$/i;

// A script read the way a voice will read it, before any audio: what the voice is likely to misread or run together.
// Returns [{ line, text, note }]. Judgment the rules cannot make (a word that reads as a noun or a verb) stays with
// the writer: narration.md, Prepare the script for speech.
// notes: the engine voices delivery notes (VoxCPM2), so a question without its own note is flagged.
export function review(script, { language, notes = false } = {}) {
  const out = [];
  const english = !language || /^en/i.test(language);
  script.replace(/\r/g, '').split('\n').forEach((raw, n) => {
    const noted = LEAD.test(raw);
    const line = raw.replace(LEAD, '').trim();
    if (!line) return;
    const where = n + 1;
    // Only the words the voice says: written forms and tags removed, spoken forms kept.
    const said = withoutTags(say(line.replace(/\[pause(?:\s+[\d.]+)?\]/gi, ' ')));
    const bare = line.replace(SAID, ' ');
    for (const token of bare.split(/\s+/)) {
      const t = token.replace(/^["'“‘(\[]+|["'”’)\].,;:!?…]+$/g, '');
      if (!t) continue;
      if (/^-{1,2}\w|\w[./_@\\]\w|^https?:|\.\w{2,4}$/i.test(t)) out.push({ line: where, text: t, note: `a flag, file name or address: write how it is said, {${t}|…}` });
      else if (/\d/.test(t) && /\p{L}/u.test(t)) out.push({ line: where, text: t, note: `letters and digits together: write how it is said, {${t}|…}` });
      else if (!english && /^\d[\d.,]*$/.test(t)) out.push({ line: where, text: t, note: 'digits outside English: write the number as words' });
    }
    for (const s of said.match(/[^.!?…]+[.!?…]*/g) ?? []) {
      const words = s.trim().split(/\s+/).filter(Boolean);
      // A spoken sentence breathes after an opening word ("Then, it…") and before a joined phrase ("…, and…").
      // Written grammar leaves both out, and the voice runs the words together.
      if (words.length > 3 && TRANSITIONS.test(words[0]) && !/[,;:—–…]$/.test(words[0]) && !/\?["'”’)]*$/.test(s.trim())) out.push({ line: where, text: `${words.slice(0, 4).join(' ')}…`, note: `no breath after "${words[0]}": "${words[0]}, …"` });
      else if (words.length >= 9 && !/[,;:—–…]/.test(s)) {
        const joint = words.findIndex((w, i) => i >= 2 && i < words.length - 2 && JOINS.test(w));
        out.push({ line: where, text: `${words.slice(0, 6).join(' ')}…`, note: `${words.length} words with no breath: the voice picks its own pauses. A comma after the subject${joint > 0 ? `, or before "${words[joint]}",` : ', or before a joined phrase,'} sets one` });
      }
    }
    // A delivery note covers its whole line, and a line without one takes the take's delivery.
    if (notes) {
      const parts = said.match(/[^.!?…]+[.!?…]*/g)?.map((x) => x.trim()).filter(Boolean) ?? [];
      const asks = parts.filter((x) => /\?["'”’)]*$/.test(x));
      if (asks.length && !noted) out.push({ line: where, text: asks[0], note: 'a question with no delivery note: VoxCPM2 reads it in the take\'s delivery, and it can come out as a statement. Give it its own line with a note (tts/voxcpm2.md)' });
      else if (asks.length && parts.length > asks.length) out.push({ line: where, text: asks[0], note: 'a question shares its line with other sentences: its note covers them too. Give the question a line of its own' });
    }
    if (/\p{L}/u.test(said) && !/[.!?…:;,"'”’)\]]$/u.test(said.trim())) out.push({ line: where, text: said.trim().split(/\s+/).slice(-3).join(' '), note: 'no end punctuation: the voice runs into the next line' });
  });
  return out;
}

// Pauses the script does not ask for: a silence over 0.45 s between two words with no punctuation between them. A
// voice phrases by how it reads the grammar, so a word that can be a noun or a verb ("recognition times each word")
// can pull the pause to the wrong place. Every word is still said, so the word check passes it.
export const STRAY_PAUSE = 0.45;
export function strayPauses(heard, text, alignScript) {
  const out = [];
  const al = alignScript(heard, text);
  // A break after a word: its own trailing punctuation, or a dash or ellipsis standing alone before the next word.
  const breaks = [];
  for (const tok of text.split(/\s+/)) {
    if (/[\p{L}\p{N}%]/u.test(tok)) breaks.push(/[,.;:!?…—–-]["'”’)\]]*$/.test(tok));
    else if (breaks.length && /[—–…-]/.test(tok)) breaks[breaks.length - 1] = true;
  }
  for (let i = 0; i + 1 < al.length; i++) {
    const [a, b] = [al[i], al[i + 1]];
    if (a.end == null || b.start == null || breaks[i]) continue;
    const gap = b.start - a.end;
    if (gap > STRAY_PAUSE) out.push({ after: a.text, before: b.text, gap: +gap.toFixed(2) });
  }
  return out;
}

async function heardCheck(file, text, language) {
  const { transcribe, checkSpeech, asrModel, DEFAULT_MODEL, SMALL_MODEL } = await import('./voice.mjs');
  const model = asrModel(language);
  let t = await transcribe(file, { model, language });
  let c = checkSpeech(t.words, text);
  // A recognizer that loops on a phrase proves nothing about the take: the larger model hears it again.
  if (!c.ok && t.looped && model !== SMALL_MODEL) {
    t = await transcribe(file, { model: SMALL_MODEL, language });
    c = checkSpeech(t.words, text);
  }
  // A passing take with words heard differently or not at all gets a second opinion from the other model. A word both
  // models miss or mishear is likely dropped or said wrong (listen to it). One heard right by either is likely the
  // recognizer's slip.
  let doubt = [];
  if (c.ok && (c.unsure.length || c.missing.length)) {
    const other = model === SMALL_MODEL ? DEFAULT_MODEL : SMALL_MODEL;
    const c2 = checkSpeech((await transcribe(file, { model: other, language })).words, text);
    const off = (x) => [...x.unsure, ...x.missing];
    doubt = [...new Set(off(c).filter((w) => off(c2).includes(w)))];
  }
  const { alignScript } = await import('./voice.mjs');
  return { ...c, doubt, words: t.words, pauses: strayPauses(t.words, text, alignScript), heard: clip(t.words.map((w) => w.text).join(' ')) };
}

// VoxCPM2 through its runner (scripts/tts/voxcpm_speak.py). uv builds the Python environment on first use (PyTorch,
// several GB). The model loads from a checkpoint already on disk, offline, and downloads into the model folder only
// when none exists.
// The voice comes first: a recording to clone (--reference), or a reference designed once from --voice by speaking
// the script's opening (about 10 s), saved beside the audio to listen to. Then each beat (chunks) is one generation
// that clones it, transcribed back and checked. A failed take is regenerated with another seed, up to 3 tries, and the
// best take is kept. A beat that fails every take is spoken sentence by sentence instead.
async function voxcpm(script, { voice = '', reference = '', style = '', hifi = false, cfg = 1.6, steps = 16, device, seed: asked, configSeed, language, reroll = [], lines = false }, out) {
  const ready = voxcpmReady();
  if (!ready.ok && !device) throw new Error(`speak --engine voxcpm ${ready.why}. Use the default Kokoro engine, another TTS with --command, or --device cpu (very slow).`);
  if (!voice && !reference) console.error('speak: no --voice given, so VoxCPM2 picks its own voice. Design one with --voice "(age, pitch, tone, accent)" (references/tts/voxcpm2.md).');
  // One take for the whole script: one draw of the voice. A timed script keeps each line apart, to place it.
  let units = chunks(script, lines ? { lines } : { whole: true, max: 700 });
  if (!units.length) throw new Error('speak: the script is empty.');
  for (const n of reroll) if (!(n >= 1 && n <= units.length)) throw new Error(`speak --reroll ${n}: the script has parts 1 to ${units.length}.`);
  // VoxCPM2 garbles a part of one or two words far more often than a longer one.
  const short = units.map((u, i) => ({ t: u.text, i })).filter((p) => p.t.split(/\s+/).length < 3);
  if (short.length) console.error(`speak: short parts fail more often with VoxCPM2: ${short.map((p) => `${p.i + 1} "${p.t}"`).join(', ')}. When one fails, join it to the line before or after.`);
  // The take chosen for each part is recorded beside the audio with the seed that made the voice, so a later run (a
  // new speed, one reworded line) keeps both, re-rolled takes included. Only a --seed other than the recorded one
  // starts over.
  const record = out.replace(/\.[^./]+$/, '') + '.takes.json';
  let saved = {};
  try {
    saved = JSON.parse(readFileSync(record, 'utf8'));
  } catch {}
  const current = saved.takes && typeof saved.takes === 'object';
  const before = current ? saved.seed : configSeed ?? 7;
  const seed = asked ?? before ?? configSeed ?? 7;
  const chosen = asked != null && asked !== before ? {} : current ? saved.takes : saved;
  const dir = mkdtempSync(join(tmpdir(), 'motion-video-tts-'));
  // Takes are kept by what makes them: the model, the voice, the style, the text and the seed. A run speaks only the
  // parts it has no take for, so a re-run after rewording one part keeps every other part exactly as it was.
  const cache = join(cacheRoot(), 'speak', 'voxcpm');
  mkdirSync(cache, { recursive: true });
  const checkpoint = voxcpmCheckpoint();
  const refId = reference ? `${reference}:${statSync(reference).size}:${statSync(reference).mtimeMs}` : '';
  const hash = (...parts) => createHash('sha1').update(JSON.stringify([checkpoint ?? VOXCPM, voice, refId, ...parts])).digest('hex').slice(0, 20);
  // A designed voice is kept by its description, seed and language, so every speak call with the same --voice (per
  // scene files included) clones the same one.
  const anchorKey = reference ? null : hash('reference', seed, language ?? '');
  const anchorFile = anchorKey ? join(cache, `voice-${anchorKey}.wav`) : null;
  // A user's recording is cloned from a prepared copy (prepareReference), kept in the cache. The recording itself is
  // never changed.
  const cloneFrom = reference ? join(cache, `ref-${hash('breaths', 'compressed', 'normalized')}.wav`) : null;
  if (cloneFrom && !existsSync(cloneFrom)) writeFileSync(cloneFrom, wav([prepareReference(samples(reference))], 48000).buf);
  // Takes made at the runner's own settings (cfg 2, 10 steps) keep their older keys.
  const takeFile = (s) => join(cache, `${hash(anchorKey, s.style ?? style, s.text, s.seed, ...(cfg !== 2 || steps !== 10 ? [cfg, steps] : []), ...(hifi ? ['hifi'] : []))}.wav`);
  // The designed voice speaks the script's opening, 25 words or more: a clip long enough for every part to hold it.
  const opening = [];
  for (const p of phrases(script)) {
    opening.push(p.text);
    if (opening.join(' ').split(/\s+/).length >= 25) break;
  }
  // Hi-Fi cloning: the reference and its exact transcript, which holds the voice closer to the reference. A designed
  // voice keeps the words it was designed on; a user's recording is transcribed. VoxCPM2 ignores the style then.
  let hifiText = null;
  if (hifi) {
    const saidFile = anchorFile?.replace(/\.wav$/, '.txt');
    if (reference) {
      const { transcribe, asrModel } = await import('./voice.mjs');
      hifiText = (await transcribe(reference, { model: asrModel(language), language })).words.map((w) => w.text).join(' ');
    } else if (saidFile && existsSync(saidFile)) hifiText = readFileSync(saidFile, 'utf8').trim();
    if (!hifiText && anchorFile && existsSync(anchorFile)) console.error('speak --hifi: this designed voice has no saved transcript (it was made before --hifi existed). Pass a new --seed to design it again with one, or drop --hifi.');
    if (hifiText && style) console.error('speak --hifi: VoxCPM2 ignores --style in Hi-Fi cloning. Delivery notes on a line still apply to that line.');
  }
  try {
    const runner = fileURLToPath(new URL('../tts/voxcpm_speak.py', import.meta.url));
    if (!checkpoint) console.error(`speak: no VoxCPM2 checkpoint on disk. Downloading it (about 4.7 GB) into ${modelsDir()}. This happens once.`);
    const env = {
      ...process.env, HF_HUB_CACHE: modelsDir(), TQDM_DISABLE: '1', PYTHONWARNINGS: 'ignore',
      ...(checkpoint ? { HF_HUB_OFFLINE: '1' } : {}), ...(device === 'cpu' ? { CUDA_VISIBLE_DEVICES: '' } : {}),
    };
    const generate = (list, designing = false) => {
      console.error(`speak: VoxCPM2 is speaking ${list.length} part(s)${checkpoint ? '' : ' after the download'}, about 3 s per sentence on a GPU.`);
      const listFile = join(dir, 'sentences.json');
      writeFileSync(listFile, JSON.stringify(list.map((s) => ({ ...s, text: say(s.text) }))));
      const args = ['run', '--quiet', runner, '--sentences', listFile, '--dir', dir, '--model', checkpoint ?? VOXCPM, '--cfg', String(cfg), '--steps', String(steps)];
      if (voice && designing) args.push('--voice', voice);
      if (style && !designing) args.push('--style', style);
      if (hifiText && !designing) args.push('--prompt-text', hifiText);
      if (reference) args.push('--reference', cloneFrom);
      else if (!designing) args.push('--reference', anchorFile);
      // The runner's own output (compiler warnings, library notices) stays out of the way: its progress lines show,
      // and everything else only when it fails.
      const r = spawnSync('uv', args, { stdio: ['ignore', 'pipe', 'pipe'], env, encoding: 'utf8', maxBuffer: 1 << 28 });
      for (const line of `${r.stderr}`.split('\n')) if (/^voxcpm: /.test(line)) console.error(`  ${line}`);
      if (r.status !== 0 && /OutOfMemoryError|CUDA out of memory/.test(r.stderr)) {
        const gpu = nvidiaGpu();
        throw new Error(`speak: VoxCPM2 ran out of GPU memory: ${gpu ? `${gpu.freeGb.toFixed(1)} of ${gpu.gb.toFixed(0)} GB free` : 'the GPU is full'}, and it needs about 8 GB. Another process holds the rest (nvidia-smi lists it). Run again once it ends, or pass --engine kokoro for English.`);
      }
      if (r.status !== 0) throw new Error(`speak: VoxCPM2 exited ${r.status}:\n${`${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-25).join('\n')}`);
      if (!designing) for (const s of list) copyFileSync(join(dir, `seg-${String(s.index).padStart(3, '0')}.wav`), takeFile(s));
    };
    // Designs a voice from --voice into the current anchor file, then speaks its reference again.
    const design = (designSeed) => {
      console.error(`speak: designing the voice from --voice${designSeed !== seed ? ` (seed ${designSeed})` : ''}, speaking the script's opening: "${opening.join(' ')}"`);
      generate([{ index: 0, text: say(opening.join(' ')), seed: designSeed }], true);
      // The reference is repaired like a take: a glitch in it would carry into every part cloned from it.
      writeFileSync(anchorFile, wav([repairClicks(tidy(samples(join(dir, 'anchor.wav'))).samples).samples], 48000).buf);
      // The words the reference says, for Hi-Fi cloning, which needs its exact transcript.
      writeFileSync(anchorFile.replace(/\.wav$/, '.txt'), say(opening.join(' ')));
      // A clone takes its pace and manner from the reference far more than from a pace word: measured on one voice, a
      // reference at 4.3 syllables per second (pauses included) gave clones at 5.0, and the same words spoken slowly,
      // at 3.8, gave 3.9. A design speaks in whatever manner its description implies, which can be emphatic, with a
      // harsh "s". So the design speaks its opening again from itself, calm and natural at a slow pace, and that becomes
      // the reference. If it is still faster than 3.9, once more, very slowly. Without "natural" it sounded angry.
      const refPace = (file) => pace([{ text: say(opening.join(' ')), start: 0, end: samples(file).length / 48000 }], file);
      // The design as first spoken stays beside it, to compare or to clone from with another manner.
      copyFileSync(anchorFile, anchorFile.replace(/\.wav$/, '.design.wav'));
      for (const [n, ask] of [[1, '(calm, natural tone, speaking slowly)'], [2, '(calm, natural tone, speaking very slowly)']]) {
        const was = refPace(anchorFile);
        if (n > 1 && was <= REF_PACE) break;
        console.error(`speak: speaking the designed voice's reference again, ${ask.slice(1, -1)} (it spoke at ${was.toFixed(1)} syllables per second): clones follow a reference's pace and manner.`);
        const again = { index: 0, text: say(opening.join(' ')), seed: designSeed + n, style: ask };
        generate([again]);
        writeFileSync(anchorFile, wav([repairClicks(tidy(samples(takeFile(again))).samples).samples], 48000).buf);
      }
    };
    if (anchorFile && !existsSync(anchorFile)) {
      design(seed);
      // It is prepared (prepareReference): breaths turned down, so clones do not learn a breathy manner, then
      // compressed and normalized.
      const x = samples(anchorFile);
      const runs = quietBreaths(x).runs;
      writeFileSync(anchorFile, wav([prepareReference(x)], 48000).buf);
      if (runs) console.error(`speak: turned down ${runs} breath(s) in the designed voice's reference.`);
      if (hifi) hifiText = say(opening.join(' '));
    }
    // The voice sits beside the audio too: listen to it before judging the rest, and pass it as --reference to give
    // another video the same voice.
    const voiceFile = anchorFile ? out.replace(/\.[^./]+$/, '') + '.voice.wav' : null;
    if (voiceFile) copyFileSync(anchorFile, voiceFile);
    // A take, repaired (thumps silenced, clicks smoothed, edges faded) and heard: the check hears what is used. A
    // repair is faster than a new take, so only what cannot be repaired fails it: a wrong word, or a cut-off end. A
    // click the repair leaves is marked for a listen.
    const judge = async (s) => {
      const take = takeFile(s);
      const tidied = take.replace(/\.wav$/, '.tidy.wav');
      const t = tidy(samples(take));
      const pops = repairClicks(t.samples);
      writeFileSync(tidied, wav([pops.samples], 48000).buf);
      const c = await heardCheck(tidied, sayable(s.text), language);
      if (t.faults.length) {
        c.ok = false;
        c.why = [c.why, ...t.faults].filter(Boolean).join(', ');
        c.badness = (c.badness ?? 0) + t.faults.length;
      }
      return { ...c, file: tidied, seed: s.seed, thumps: t.repairs.length, fixed: pops.fixed.length, clicks: pops.left };
    };
    // A part's first seed comes from its own text, not its place: adding or splitting a line leaves every other
    // part's seed, and so its cached take, as it was.
    const textSeed = (text) => seed + (parseInt(createHash('sha1').update(text).digest('hex').slice(0, 6), 16) % 1000);
    // The best take of each part: its recorded take, else its text seed, retried with new seeds. A re-rolled part
    // draws a fresh seed and competes with the take it had, so a worse draw never replaces a better one.
    const pick = async (list, rolls) => {
      const said = list.map((u) => u.text);
      const fresh = new Map(rolls.map((n) => [n - 1, 100000 + Math.floor(Math.random() * 900000)]));
      const best = new Array(said.length).fill(null);
      for (const i of fresh.keys()) {
        const prev = chosen[said[i]];
        const s = { index: i, text: said[i], seed: prev, ...(list[i].delivery ? { style: list[i].delivery } : {}) };
        if (prev != null && existsSync(takeFile(s))) best[i] = await judge(s);
      }
      // A part's own delivery note replaces --style for it. A note appended to a long style is outweighed by it, and
      // the line keeps the base delivery.
      const styleOf = (i) => (list[i].delivery ? { style: list[i].delivery } : {});
      let todo = said.map((text, index) => ({ index, text, seed: fresh.get(index) ?? chosen[text] ?? textSeed(text), ...styleOf(index) }));
      for (const [i, s] of fresh) console.error(`speak: part ${i + 1} re-rolled with seed ${s}.`);
      for (let attempt = 0; attempt < 3 && todo.length; attempt++) {
        const missing = todo.filter((s) => !existsSync(takeFile(s)));
        if (missing.length) generate(missing);
        const made = new Set(missing.map((s) => s.index));
        const again = [];
        for (const s of todo) {
          const c = await judge(s);
          // A re-roll is asked for what the check cannot hear (static, a wrong tone), so a fresh take that passes as
          // well as the old one replaces it. Otherwise only a better take does.
          if (!best[s.index] || c.badness < best[s.index].badness || (fresh.has(s.index) && c.badness <= best[s.index].badness)) best[s.index] = c;
          if (!c.ok) {
            const retry = { ...s, seed: s.seed + 1000 };
            // Say why whenever a new take follows, or this one is new. A cached failure with a cached retry is quiet.
            if (made.has(s.index) || (attempt < 2 && !existsSync(takeFile(retry)))) console.error(`speak: part ${s.index + 1} (seed ${s.seed}): ${c.why}. Heard: "${c.heard}".${attempt < 2 ? ' Regenerating.' : ''}`);
            again.push(retry);
          }
        }
        todo = again;
      }
      return best;
    };
    let best = await pick(units, reroll);
    // A take that failed every try is split and spoken again: into its beats first, then a beat into its sentences.
    // Shorter inputs keep the model stable, at the cost of more draws of the voice.
    const breakUp = (u) => {
      const groups = [];
      let g = [];
      u.sentences.forEach((p, k) => {
        g.push(p);
        if (p.kind === 'beat' || p.kind === 'mark' || k === u.sentences.length - 1) (groups.push(g), (g = []));
      });
      const pieces = groups.length > 1 ? groups : u.sentences.map((p) => [p]);
      return pieces.map((ps, k) => ({ text: ps.map((p) => p.text).join(' '), pause: k === pieces.length - 1 ? u.pause : ps[ps.length - 1].pause, kind: ps[ps.length - 1].kind, sentences: ps, ...(u.delivery ? { delivery: u.delivery } : {}) }));
    };
    for (let round = 0; round < 2; round++) {
      const split = units.map((u, i) => !best[i].ok && u.sentences.length > 1);
      if (!split.some(Boolean)) break;
      console.error(`speak: part(s) ${split.map((s, i) => (s ? i + 1 : null)).filter(Boolean).join(', ')} failed every take whole, so ${round ? 'their sentences' : 'their beats'} are spoken apart.`);
      units = units.flatMap((u, i) => (split[i] ? breakUp(u) : [u]));
      best = await pick(units, []);
    }
    // Each take is shaped: its sentences found in the audio, the silence at each blank line and [pause] set to its
    // length, and each sentence's pitch swing measured. A part whose pitch swings far above the voice's usual pitch
    // tends to sound shouted or excited, which the speech check cannot hear. It is flagged for a listen.
    const voiceMedian = medianPitch(samples(reference || anchorFile));
    const { alignScript } = await import('./voice.mjs');
    const shaped = best.map((b, i) => shapeTake(samples(b.file), b.words, units[i].sentences, alignScript));
    best.forEach((b, i) => {
      // A question rises on purpose, so it is left out.
      const hot = shaped[i].spans.filter((sp) => !/\?["'”’)]*$/.test(sp.text.trim())).map((sp) => ({ text: sp.text, heat: heat(shaped[i].audio.subarray(Math.round(sp.start * 48000), Math.round(sp.end * 48000)), voiceMedian) }));
      const top = hot.reduce((a, h) => (h.heat > a.heat ? h : a), { heat: 0 });
      b.heat = +top.heat.toFixed(2);
      b.hotText = top.text;
    });
    const parts = shaped.flatMap((s, i) => [s.audio, new Float32Array(Math.round(units[i].pause * 48000))]);
    const r = wav(parts, 48000);
    writeFileSync(out, r.buf);
    writeFileSync(record, JSON.stringify({ seed, takes: Object.fromEntries(best.map((b, i) => [units[i].text, b.seed])) }, null, 1));
    // One span per sentence on the whole voiceover's clock.
    const sentenceSpans = [];
    const partStart = [];
    let t = 0;
    shaped.forEach((s, i) => {
      partStart.push(t);
      for (const sp of s.spans) sentenceSpans.push({ text: spoken(sp.text), start: +(t + sp.start).toFixed(3), end: +(t + sp.end).toFixed(3) });
      t += s.audio.length / 48000 + units[i].pause;
    });
    const thumps = best.reduce((n, b) => n + b.thumps, 0);
    const fixed = best.reduce((n, b) => n + b.fixed, 0);
    if (thumps || fixed) console.error(`speak: repaired in place: ${[thumps && `${thumps} thump(s)`, fixed && `${fixed} click(s)`].filter(Boolean).join(', ')}.`);
    const failed = best.map((b, i) => ({ ...b, i })).filter((b) => !b.ok);
    return {
      duration: r.duration,
      phrases: sentenceSpans,
      voiceFile,
      checks: best.map((b, i) => ({ at: +partStart[i].toFixed(2), text: spoken(units[i].text), ok: b.ok, heard: b.heard, why: b.why, seed: b.seed, doubt: b.doubt ?? [], heat: b.heat, hotText: b.hotText, pauses: b.pauses ?? [], clicks: b.clicks })),
      problems: failed.map((b) => `part ${b.i + 1} "${units[b.i].text}": ${b.why} (heard "${b.heard}"). Three takes failed, so reword it first (a longer line, another word order). --reroll ${b.i + 1} draws new takes.`),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// In-place radix-2 FFT of re/im (length a power of two). inverse: the inverse transform, scaled by 1/n.
function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) (re[i] /= n), (im[i] /= n);
}

// De-esses generated speech: an "s" louder than the voice's own vowels sounds harsh, and a generated voice often
// makes it so (VoxCPM2's peaked 5-6 dB over its vowels, Kokoro's 3 dB under). In each 21 ms frame where the
// 4.5-11 kHz band rises above 4 dB under the vowel level (the median 100-3000 Hz energy of the louder frames), that
// band is turned down to that limit, by at most 15 dB, easing back over about 40 ms. Everything else passes untouched.
// stats, when given, receives the share of frames turned down and the deepest cut in dB.
export function deEss(x, rate = 48000, stats = null) {
  const n = 1024;
  const hop = n / 2;
  // A sqrt-Hann window on analysis and synthesis at half overlap rebuilds the signal exactly where no gain applies.
  const win = Float32Array.from({ length: n }, (_, i) => Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)));
  const bin = (hz) => Math.round((hz * n) / rate);
  const [v0, v1, s0, s1, edge] = [bin(100), bin(3000), bin(4500), bin(11000), bin(3500)];
  const frames = Math.max(0, Math.ceil((x.length - n) / hop) + 1);
  const spectra = [];
  const vowel = [];
  const sib = [];
  for (let f = 0; f < frames; f++) {
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = (x[f * hop + i] ?? 0) * win[i];
    fft(re, im);
    let v = 0;
    let s = 0;
    for (let k = v0; k < v1; k++) v += re[k] ** 2 + im[k] ** 2;
    for (let k = s0; k < s1; k++) s += re[k] ** 2 + im[k] ** 2;
    spectra.push([re, im]);
    vowel.push(v);
    sib.push(s);
  }
  const loud = vowel.filter((v) => v > 0).sort((a, b) => a - b);
  const upper = loud.slice(Math.floor(loud.length / 2));
  const ref = upper[Math.floor(upper.length / 2)] ?? 0;
  const out = new Float32Array(x.length);
  if (!ref) return x;
  // Natural speech keeps its "s" a few dB under its vowels.
  const limit = ref * 10 ** (-4 / 10);
  // Gain per frame in dB: instant down, back up at 1.5 dB a frame (about 40 ms to recover 6 dB).
  let g = 0;
  let cut = 0;
  let deepest = 0;
  for (let f = 0; f < frames; f++) {
    const want = sib[f] > limit ? Math.max(-15, 10 * Math.log10(limit / sib[f])) : 0;
    g = want < g ? want : Math.min(want, g + 1.5);
    const [re, im] = spectra[f];
    if (g < -0.5) cut++;
    deepest = Math.min(deepest, g);
    if (g < -0.05) {
      const lin = 10 ** (g / 20);
      for (let k = edge; k <= n / 2; k++) {
        // A soft edge from 3.5 to 4.5 kHz, full cut above.
        const m = k >= s0 ? lin : 1 + (lin - 1) * ((k - edge) / (s0 - edge));
        re[k] *= m;
        im[k] *= m;
        if (k > 0 && k < n / 2) {
          re[n - k] *= m;
          im[n - k] *= m;
        }
      }
    }
    fft(re, im, true);
    for (let i = 0; i < n; i++) if (f * hop + i < out.length) out[f * hop + i] += re[i] * win[i];
  }
  if (stats) Object.assign(stats, { share: frames ? cut / frames : 0, deepest });
  return out;
}

// A take's sentences found in its audio from the heard words, and its silences set: at each blank line and [pause]
// mark inside the take, the gap between two sentences is widened to the script's pause, at its quietest 10 ms.
// Returns the audio and one span per sentence, in seconds. Without usable word times the take stays one span.
export function shapeTake(audio, heard, sentences, alignScript) {
  const rate = 48000;
  const whole = { audio, spans: [{ text: sentences.map((p) => p.text).join(' '), start: 0, end: +(audio.length / rate).toFixed(3) }] };
  if (!heard?.length || sentences.length < 2) return whole;
  const texts = sentences.map((p) => sayable(p.text));
  const counts = texts.map((t) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}%]/u.test(w)).length);
  const al = alignScript(heard, texts.join(' '));
  if (al.length !== counts.reduce((a, b) => a + b, 0)) return whole;
  const bounds = [];
  let k = 0;
  for (const c of counts) {
    const ws = al.slice(k, k + c);
    k += c;
    bounds.push({ start: ws.find((w) => w.start != null)?.start, end: [...ws].reverse().find((w) => w.end != null)?.end });
  }
  if (bounds.some((b) => b.start == null || b.end == null)) return whole;
  const inserts = [];
  sentences.forEach((p, i) => {
    if (i + 1 >= sentences.length || (p.kind !== 'beat' && p.kind !== 'mark')) return;
    const gap = bounds[i + 1].start - bounds[i].end;
    if (gap >= p.pause) return;
    const a = Math.round(bounds[i].end * rate);
    const b = Math.max(a + 480, Math.round(bounds[i + 1].start * rate));
    let at = a;
    let low = Infinity;
    for (let x = a; x + 480 <= b && x + 480 <= audio.length; x += 240) {
      let e = 0;
      for (let j = x; j < x + 480; j++) e += audio[j] * audio[j];
      if (e < low) (low = e), (at = x + 240);
    }
    inserts.push({ at, n: Math.round((p.pause - Math.max(0, gap)) * rate) });
  });
  const pieces = [];
  let from = 0;
  for (const ins of inserts) {
    pieces.push(audio.subarray(from, ins.at), new Float32Array(ins.n));
    from = ins.at;
  }
  pieces.push(audio.subarray(from));
  const out = new Float32Array(pieces.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of pieces) (out.set(p, o), (o += p.length));
  const shiftAt = (t) => inserts.filter((ins) => ins.at <= t * rate).reduce((n, ins) => n + ins.n, 0) / rate;
  const spans = sentences.map((p, i) => ({ text: p.text, start: +Math.max(0, bounds[i].start - 0.05 + shiftAt(bounds[i].start)).toFixed(3), end: +(bounds[i].end + 0.05 + shiftAt(bounds[i].start)).toFixed(3) }));
  return { audio: out, spans };
}

// Loudness of the sounding 10 ms frames of a span, in dB. Null when it holds no speech.
function speechLevel(x, start, end, rate = 48000) {
  const hop = rate / 100;
  let e = 0;
  let n = 0;
  for (let i = Math.floor(start * rate); i + hop <= Math.min(x.length, Math.ceil(end * rate)); i += hop) {
    let f = 0;
    for (let k = i; k < i + hop; k++) f += x[k] * x[k];
    if (Math.sqrt(f / hop) > 0.01) (e += f), (n += hop);
  }
  return n ? 10 * Math.log10(e / n) : null;
}

// The voice layer's own processing, sentence by sentence, for any engine's output. It never time-stretches: a
// stretch (ffmpeg atempo) turns a voice's faint crackle in an "s" into audible static, so pace is set in the take.
// - level: each sentence's speech is brought toward the median level, by at most 6 dB, with 40 ms ramps. A long take
//   starts louder than it goes on; this evens it.
// - compression (compressVoice): evens loud and soft syllables, the same settings as a reference's. Before
//   de-essing, since it lifts the soft parts, an "s" among them.
// - de-essing (deEss).
// Rewrites the file and returns the moved sentence spans and what was done.
export function polish(file, phrases) {
  const rate = 48000;
  let x = samples(file);
  const spans = phrases.map((p) => ({ ...p }));
  const stats = { leveled: 0, maxGain: 0 };
  const levels = spans.map((sp) => speechLevel(x, sp.start, sp.end));
  const target = percentile(levels.filter((l) => l != null), 0.5);
  if (levels.filter((l) => l != null).length >= 2) {
    const ramp = Math.round(0.04 * rate);
    spans.forEach((sp, i) => {
      if (levels[i] == null) return;
      const g = Math.max(-6, Math.min(6, target - levels[i]));
      if (Math.abs(g) < 1) return;
      stats.leveled++;
      stats.maxGain = Math.max(stats.maxGain, Math.abs(g));
      const lin = 10 ** (g / 20);
      const a = Math.round(sp.start * rate);
      const b = Math.min(x.length, Math.round(sp.end * rate));
      for (let k = a; k < b; k++) {
        const edge = Math.min(1, (k - a) / ramp, (b - k) / ramp);
        x[k] *= 1 + (lin - 1) * edge;
      }
    });
  }
  x = compressVoice(x, rate);
  const ess = {};
  x = deEss(x, rate, ess);
  writeFileSync(file, wav([x], rate).buf);
  return { phrases: spans, stats: { ...stats, essShare: ess.share ?? 0, essDeepest: ess.deepest ?? 0 } };
}

// De-esses a generated voiceover file in place.
export function deEssFile(file) {
  const stats = {};
  writeFileSync(file, wav([deEss(samples(file), 48000, stats)], 48000).buf);
  return stats;
}

// Pitch in Hz of each voiced 40 ms frame of 48 kHz audio, by autocorrelation at 16 kHz (60-400 Hz).
export function pitches(x) {
  const y = new Float32Array(Math.floor(x.length / 3));
  for (let i = 0; i < y.length; i++) y[i] = (x[3 * i] + x[3 * i + 1] + x[3 * i + 2]) / 3;
  const sr = 16000;
  const w = 640;
  const [lo, hi] = [Math.floor(sr / 400), Math.floor(sr / 60)];
  const out = [];
  for (let i = 0; i + w <= y.length; i += 320) {
    let mean = 0;
    for (let k = 0; k < w; k++) mean += y[i + k];
    mean /= w;
    let e = 0;
    for (let k = 0; k < w; k++) e += (y[i + k] - mean) ** 2;
    if (Math.sqrt(e / w) < 0.01) continue;
    let best = 0;
    let lag = 0;
    for (let l = lo; l <= hi; l++) {
      let c = 0;
      for (let k = 0; k + l < w; k++) c += (y[i + k] - mean) * (y[i + k + l] - mean);
      if (c > best) (best = c), (lag = l);
    }
    if (lag && best > 0.4 * e) out.push(sr / lag);
  }
  return out;
}

const percentile = (list, p) => {
  const s = [...list].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0;
};

// How far a part's pitch peaks (95th percentile) rise above the voice's usual pitch (the reference's median). A calm
// read stays under about 1.5; a part over 1.6 tends to sound shouted or excited.
export const HEATED = 1.6;
// Readings more than an octave off the part's own median are tracking errors, and dropped. A part with under 40
// readings (about 0.8 s of voicing) is too short to judge.
export function heat(part, voiceMedian) {
  const p = pitches(part);
  const own = percentile(p, 0.5);
  const kept = p.filter((f) => f < own * 1.9 && f > own / 1.9);
  return kept.length >= 40 && voiceMedian ? percentile(kept, 0.95) / voiceMedian : 0;
}
export const medianPitch = (x) => percentile(pitches(x), 0.5);

// Syllables in a text, from its vowel groups: the unit a listener hears pace in, across languages written in Latin
// letters ("ber-lum-pur" is 3).
const syllables = (text) => (text.toLowerCase().normalize('NFKD').match(/[aeiouy]+/g) ?? []).length;

// Speaking pace: syllables per second while speaking (pauses left out). Explainers read best around 4-5.
// With the audio file, each span counts only from its first sound to its last: the silence at a phrase's edges does
// not scale with the speed, so counting it made the suggested --speed overshoot.
// Breath in a voice: runs of 80 ms or more that are quiet (20 to 45 dB under its loud level) and unpitched, the
// breath heard between words. A breathy voice, with a stray "hh" through its words, shows it there, where no voice
// covers it. Measured by ear, clean references held 0.5 to 2.2% of their length in such runs, breathy ones 4.1 to
// 6.4%. Returns the runs as [start, end] sample indices.
function breathRuns(x, rate = 48000) {
  const hop = Math.round(rate / 100);
  const frames = [];
  for (let k = 0; k + hop <= x.length; k += hop) {
    let e = 0;
    for (let i = k; i < k + hop; i++) e += x[i] * x[i];
    // Pitched or not: the best autocorrelation over lags of 2 to 10 ms (voices from 100 to 500 Hz).
    let best = 0;
    for (let lag = Math.round(rate / 500); lag <= Math.round(rate / 100) && k + hop + lag <= x.length; lag += 4) {
      let c = 0;
      let e2 = 0;
      for (let i = k; i < k + hop; i++) {
        c += x[i] * x[i + lag];
        e2 += x[i + lag] * x[i + lag];
      }
      best = Math.max(best, c / Math.sqrt(e * e2 + 1e-12));
    }
    frames.push({ level: 10 * Math.log10(e / hop + 1e-12), pitched: best >= 0.5 });
  }
  if (!frames.length) return [];
  const loud = frames.map((f) => f.level).sort((a, b) => a - b)[Math.floor(frames.length * 0.95)];
  const runs = [];
  let run = 0;
  [...frames, { level: -Infinity, pitched: true }].forEach((f, i) => {
    if (f.level < loud - 20 && f.level > loud - 45 && !f.pitched) run++;
    else {
      if (run >= 8) runs.push([(i - run) * hop, i * hop]);
      run = 0;
    }
  });
  return runs;
}

// The share of a voice's length in breath runs.
export function breathiness(x, rate = 48000) {
  return x.length ? breathRuns(x, rate).reduce((n, [a, b]) => n + b - a, 0) / x.length : 0;
}

// Turns the breath runs down by 20 dB, with 10 ms ramps, and leaves the speech as it is. A clone learns its manner from
// its reference: heard on one breathy voice, a reference with its breaths turned down gave a clone without the stray
// "hh" through its words. Returns { samples, runs }.
export function quietBreaths(x, rate = 48000) {
  const runs = breathRuns(x, rate);
  const y = Float32Array.from(x);
  const low = 10 ** (-20 / 20);
  const ramp = Math.round(0.01 * rate);
  for (const [a, b] of runs) {
    for (let k = a; k < b; k++) y[k] *= 1 - (1 - low) * Math.min(1, (k - a) / ramp, (b - k) / ramp);
  }
  return { samples: y, runs: runs.length };
}

// A gentle vocal compressor for a reference: threshold -22 dB, ratio 1.5, a 30 dB soft knee, 2 ms attack, 450 ms
// release, +3.6 dB make-up. It evens the reference's loud and soft syllables, and heard by ear it improved a reference
// markedly. Feed-forward, with the soft-knee gain curve (Giannoulis, Massberg and Reiss) smoothed per sample.
export function compressVoice(x, rate = 48000, { threshold = -22, ratio = 1.5, knee = 30, attack = 0.002, release = 0.45, makeup = 3.6 } = {}) {
  const y = new Float32Array(x.length);
  const up = Math.exp(-1 / (attack * rate));
  const down = Math.exp(-1 / (release * rate));
  let smooth = 0;
  for (let k = 0; k < x.length; k++) {
    const level = 20 * Math.log10(Math.abs(x[k]) + 1e-9);
    const over = level - threshold;
    let out = level;
    if (2 * over > knee) out = threshold + over / ratio;
    else if (2 * Math.abs(over) <= knee) out = level + ((1 / ratio - 1) * (over + knee / 2) ** 2) / (2 * knee);
    const cut = out - level;
    // More reduction follows at the attack rate, less at the release rate.
    smooth = cut < smooth ? up * smooth + (1 - up) * cut : down * smooth + (1 - down) * cut;
    y[k] = x[k] * 10 ** ((smooth + makeup) / 20);
  }
  return y;
}

// Centers a wave on zero (removes its DC offset), then scales its peak to peakDb.
export function normalizePeak(x, peakDb = -1) {
  let mean = 0;
  for (const v of x) mean += v;
  mean /= x.length || 1;
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v - mean));
  const g = peak ? 10 ** (peakDb / 20) / peak : 1;
  return Float32Array.from(x, (v) => (v - mean) * g);
}

// A reference as VoxCPM2 clones from it: breaths in its pauses turned down, gently compressed, then centered with its
// peak at -1 dB. Heard by ear, compression improved a reference markedly and the normalizing held it steadier still.
export const prepareReference = (x) => normalizePeak(compressVoice(quietBreaths(x).samples));

// The pace a designed reference is brought to, in syllables per second with its pauses: clones speak near it.
export const REF_PACE = 3.9;
export function pace(phrases, file) {
  const audio = file ? samples(file) : null;
  const talk = phrases.reduce((t, p) => t + (audio ? sounding(audio, p.start, p.end) : p.end - p.start), 0);
  return talk > 0 ? phrases.reduce((n, p) => n + syllables(p.text), 0) / talk : 0;
}

// Seconds from the first to the last 10 ms frame louder than 5% of the span's peak (and above the noise floor).
function sounding(audio, start, end, rate = 48000) {
  const hop = rate / 100;
  const a = Math.floor(start * rate);
  const b = Math.min(audio.length, Math.ceil(end * rate));
  const rms = [];
  for (let i = a; i + hop <= b; i += hop) {
    let s = 0;
    for (let k = i; k < i + hop; k++) s += audio[k] * audio[k];
    rms.push(Math.sqrt(s / hop));
  }
  const floor = Math.max(0.005, Math.max(0, ...rms) * 0.05);
  const first = rms.findIndex((v) => v > floor);
  if (first < 0) return 0;
  let last = rms.length - 1;
  while (rms[last] <= floor) last--;
  return (last - first + 1) / 100;
}

// Slows or quickens speech without changing its pitch (ffmpeg atempo), and the phrase spans with it.
function stretch(out, spans, speed) {
  const tmp = `${out}.stretch.wav`;
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', out, '-af', `atempo=${speed}`, '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', tmp]);
  if (r.status !== 0) throw new Error(`speak --speed ${speed}: ffmpeg could not time-stretch ${out}.`);
  renameSync(tmp, out);
  const p = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' });
  return { duration: Number(p.stdout), phrases: spans?.map((s) => ({ ...s, start: +(s.start / speed).toFixed(3), end: +(s.end / speed).toFixed(3) })) };
}

// Places each line of a timed script at its time: the line's phrases, with their own pauses, start at the time
// the script asks for, or right after the line before when that one runs past it. Rewrites the WAV at `out` and
// returns the new phrase spans and the lines that could not start on time or overrun their slot.
function placeOnTimes(out, spoken, cues, units = (t) => phrases(t).length) {
  const rate = 48000;
  const audio = samples(out);
  const blocks = [];
  let p = 0;
  for (const c of cues) {
    const n = units(c.text);
    const list = spoken.slice(p, p + n);
    p += n;
    blocks.push({ cue: c, list, from: list[0].start, to: list[list.length - 1].end });
  }
  const late = [];
  let cursor = 0;
  const placed = [];
  const parts = [];
  blocks.forEach((b, i) => {
    const at = Math.max(b.cue.start, cursor + (i ? 0.25 : 0));
    const slotEnd = b.cue.end ?? cues[i + 1]?.start ?? null;
    const len = b.to - b.from;
    if (at > b.cue.start + 0.05) late.push(`line ${i + 1} ("${b.cue.text.slice(0, 40)}") starts at ${at.toFixed(2)}s, ${(at - b.cue.start).toFixed(2)}s after its ${b.cue.start}s mark: the line before runs long.`);
    else if (slotEnd != null && at + len > slotEnd + 0.05) late.push(`line ${i + 1} ("${b.cue.text.slice(0, 40)}") runs ${(at + len - slotEnd).toFixed(2)}s past its slot (${b.cue.start}-${slotEnd}s): shorten it, or give it more time.`);
    parts.push(new Float32Array(Math.round((at - cursor) * rate)), audio.subarray(Math.round(b.from * rate), Math.round(b.to * rate)));
    for (const s of b.list) placed.push({ text: s.text, start: +(at + s.start - b.from).toFixed(3), end: +(at + s.end - b.from).toFixed(3) });
    cursor = at + len;
  });
  const r = wav(parts, rate);
  writeFileSync(out, r.buf);
  return { duration: r.duration, phrases: placed, late };
}

// The engine when no flag or config names one: the best this machine runs. VoxCPM2 when its GPU and uv are here, else
// Kokoro, which speaks English only. A Kokoro voice name (af_heart) picks Kokoro. A recording to clone picks VoxCPM2.
export function defaultEngine({ voice, reference, language } = {}) {
  if (voice && /^[ab][fm]_[a-z]+$/.test(voice)) return 'kokoro';
  const vox = voxcpmReady();
  if (vox.ok || reference) return 'voxcpm';
  if (language && !/^en/i.test(language)) {
    throw new Error(`speak --language ${language}: Kokoro speaks English only, and VoxCPM2 ${vox.why}. Use the user's TTS (--command), a recording, or a Hugging Face model whose license allows the video's use (--model, references/tts.md).`);
  }
  return 'kokoro';
}

// Speaks the script into a WAV at `out`. Returns { duration, engine }.
// opts.cues: the lines of a timed script ([{ start, end, text }]); each line is then placed at its time.
export async function speak(script, out, opts = {}) {
  const tts = config().tts ?? {};
  if (!opts.engine && !opts.command && !opts.model && !tts.engine && !tts.command && !tts.model) opts = { ...opts, engine: defaultEngine(opts) };
  // Only VoxCPM2 voices the non-verbal tags. Every other engine would read them out as words.
  if ((opts.engine ?? (opts.command || opts.model ? null : tts.engine)) !== 'voxcpm' && TAGS.test(script)) {
    if (!opts.stretched && !opts.lines) console.error('speak: only VoxCPM2 voices tags like [laughing] or [sigh]. This engine speaks the script without them.');
    script = withoutTags(script);
  }
  TAGS.lastIndex = 0;
  const speed = opts.speed ?? tts.speed ?? 1;
  if (!(speed >= 0.5 && speed <= 2)) throw new Error(`speak --speed ${speed}: use 0.5 to 2 (0.9 is 10% slower).`);
  // Kokoro sets its own speed. Every other engine is time-stretched once its audio is joined.
  // A timed script's lines are placed one by one: VoxCPM2 speaks each line apart, and the spans count that way.
  const voxcpmEngine = (opts.engine ?? (opts.command || opts.model ? null : tts.engine)) === 'voxcpm';
  const units = voxcpmEngine ? (t) => chunks(t, { lines: true }).length : (t) => phrases(t).length;
  if (speed !== 1 && !opts.stretched) {
    const eng = opts.engine ?? (opts.command || opts.model ? null : tts.engine);
    const kokoroEngine = eng === 'kokoro' || (!eng && !(opts.command ?? (opts.model ? null : tts.command)) && /kokoro/i.test(opts.model ?? tts.model ?? KOKORO));
    if (!kokoroEngine) {
      const r = await speak(script, out, { ...opts, speed: 1, stretched: true, cues: null, lines: !!opts.cues });
      const s = stretch(out, r.phrases, speed);
      const done = { ...r, ...s, checks: r.checks?.map((c) => ({ ...c, at: +(c.at / speed).toFixed(2) })) };
      if (!opts.cues) return done;
      const p = placeOnTimes(out, done.phrases, opts.cues, units);
      return { ...done, duration: p.duration, phrases: p.phrases, timing: p.late };
    }
  }
  if (opts.cues) {
    const r = await speak(opts.cues.map((c) => c.text).join('\n'), out, { ...opts, cues: null, lines: true });
    if (!r.phrases) return { ...r, problems: [...(r.problems ?? []), 'This engine speaks the script in one piece, so its lines cannot be placed at their times. Run the command without --one-call, or use Kokoro, VoxCPM2 or --model.'] };
    const p = placeOnTimes(out, r.phrases, opts.cues, units);
    return { ...r, duration: p.duration, phrases: p.phrases, timing: p.late };
  }
  const engine = opts.engine ?? (opts.command || opts.model ? null : tts.engine);
  if (engine === 'voxcpm') {
    const voice = opts.voice ?? tts.voice ?? '';
    const r = await voxcpm(script, { voice, reference: opts.reference ?? tts.reference ?? '', style: opts.style ?? tts.style ?? '', hifi: opts.hifi ?? tts.hifi ?? false, cfg: opts.cfg ?? tts.cfg ?? 1.6, steps: opts.steps ?? tts.steps ?? 16, device: opts.device, seed: opts.seed, configSeed: tts.seed, language: opts.language, reroll: opts.reroll ?? [], lines: !!opts.lines }, out);
    return { ...r, engine: `VoxCPM2${voice ? ` ${voice}` : ''}` };
  }
  if (engine && engine !== 'kokoro') throw new Error(`speak --engine "${engine}": use kokoro or voxcpm, or --model / --command for other engines.`);
  const cmd = opts.command ?? (opts.model || engine ? null : tts.command);
  const model = opts.model ?? (engine === 'kokoro' ? KOKORO : tts.model ?? KOKORO);
  const voice = opts.voice ?? tts.voice ?? DEFAULT_VOICE;
  let result;
  if (cmd) {
    const r = command(script, { command: cmd, voice: opts.voice ?? tts.voice ?? '', reference: opts.reference ?? tts.reference ?? '', oneCall: opts.oneCall ?? tts.oneCall ?? false });
    writeFileSync(out, r.buf);
    result = { duration: r.duration, phrases: r.phrases, engine: `command: ${cmd}` };
  } else {
    const r = /kokoro/i.test(model) ? await kokoro(script, { model, voice, speed }) : await transformersModel(script, { model });
    writeFileSync(out, r.buf);
    result = { duration: r.duration, phrases: r.phrases, engine: /kokoro/i.test(model) ? `Kokoro (${voice})` : model };
  }
  // The whole file is transcribed back once: a problem is reported, since these engines keep no per-phrase takes.
  const c = await heardCheck(out, sayable(script), opts.language);
  return { ...result, checks: [{ at: 0, text: spoken(script), ok: c.ok, heard: c.heard, why: c.why, doubt: c.doubt ?? [], pauses: c.pauses ?? [] }], problems: c.ok ? [] : [`${c.why}. Heard: "${c.heard}".`] };
}

