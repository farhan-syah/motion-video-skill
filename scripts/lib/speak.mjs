// Text to speech for narration, from one of four engines:
//   command: any TTS the user already runs (Piper, XTTS, F5, a cloud CLI), through a command template.
//   voxcpm:  VoxCPM2 (OpenBMB, Apache 2.0): 30 languages, voice design and cloning. Needs an NVIDIA GPU with 8 GB.
//   model:   any text-to-speech model transformers.js runs locally (a Hugging Face ONNX model id).
//   default: Kokoro-82M (Apache 2.0) through kokoro-js: local, English voices, no setup.
// Flags choose, else "tts" in ~/.config/motion-video/config.json.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
    out.push({ text: p.text, start: +t.toFixed(3), end: +(t + len).toFixed(3) });
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

// Sentences, so long scripts stay within a model's input length and get a natural pause between sentences.
// Narration is paced, not read out: the script marks its pauses. A blank line is a long pause (a new beat), a line
// break a breath, a sentence end inside a line a short stop, and [pause] or [pause 0.6] an exact pause in seconds.
// Returns the phrases to speak, each with the silence after it.
export const PAUSES = { beat: 0.8, line: 0.45, sentence: 0.3, mark: 0.6 };
export function phrases(script) {
  const out = [];
  const add = (text, pause) => {
    const t = text.replace(/\s+/g, ' ').trim();
    if (t) out.push({ text: t, pause });
    else if (out.length) out[out.length - 1].pause = Math.max(out[out.length - 1].pause, pause);
  };
  const beats = script.replace(/\r/g, '').split(/\n\s*\n/);
  beats.forEach((beat, bi) => {
    const lines = beat.split('\n');
    lines.forEach((line, li) => {
      const end = li < lines.length - 1 ? PAUSES.line : bi < beats.length - 1 ? PAUSES.beat : 0;
      // [pause] marks split a line into pieces.
      const pieces = line.split(/\[pause(?:\s+([\d.]+))?\]/i);
      for (let k = 0; k < pieces.length; k += 2) {
        const mark = k + 1 < pieces.length ? Number(pieces[k + 1] ?? PAUSES.mark) || PAUSES.mark : null;
        const said = sentences(pieces[k]);
        said.forEach((s, si) => add(s, si < said.length - 1 ? PAUSES.sentence : mark ?? end));
        if (!said.length && mark != null) add('', mark);
      }
    });
  });
  if (out.length) out[out.length - 1].pause = 0;
  return out;
}

// The words of a script as spoken: pause marks removed, one line. This is the script captions and checks read.
export const spoken = (script) => script.replace(/\[pause(?:\s+[\d.]+)?\]/gi, ' ').replace(/\s+/g, ' ').trim();

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
    const audio = await tts.generate(p.text, { voice, speed });
    rate = audio.sampling_rate;
    parts.push(audio.audio, new Float32Array(Math.round(p.pause * rate)));
  }
  return { ...wav(parts, rate), phrases: spans(list, parts, rate) };
}

async function transformersModel(script, { model }) {
  const { pipeline } = await speechModule();
  const tts = await pipeline('text-to-speech', model, { dtype: 'fp32' }).catch((e) => {
    throw new Error(`speak: cannot load "${model}" as a transformers.js text-to-speech model (${e.message.split('\n')[0]}). It needs ONNX weights on the Hugging Face hub, for example Xenova/mms-tts-eng. For other engines, use --command.`);
  });
  const parts = [];
  let rate = 16000;
  const list = phrases(script);
  for (const p of list) {
    const out = await tts(p.text);
    rate = out.sampling_rate;
    parts.push(out.audio, new Float32Array(Math.round(p.pause * rate)));
  }
  return { ...wav(parts, rate), phrases: spans(list, parts, rate) };
}

// Runs the user's TTS command. Placeholders: {text} (the script, shell-quoted), {text_file} (a file holding it),
// {out} (the audio file the command must write, any format ffmpeg reads), {voice} and {reference} (a recording to clone).
function command(script, { command: template, voice = '', reference = '' }, out) {
  const dir = mkdtempSync(join(tmpdir(), 'motion-video-tts-'));
  try {
    const textFile = join(dir, 'script.txt');
    const raw = join(dir, 'speech.wav');
    writeFileSync(textFile, `${script}\n`);
    const quote = (t) => (process.platform === 'win32' ? `"${t.replace(/"/g, '\\"')}"` : `'${t.replace(/'/g, `'\\''`)}'`);
    const cmd = template.replaceAll('{text_file}', quote(textFile)).replaceAll('{out}', quote(raw)).replaceAll('{voice}', quote(voice)).replaceAll('{reference}', quote(reference)).replaceAll('{text}', quote(script));
    const r = spawnSync(cmd, { shell: true, stdio: ['ignore', 'inherit', 'inherit'] });
    if (r.status !== 0) throw new Error(`speak: the TTS command exited ${r.status}: ${template}`);
    // Whatever the command wrote (wav, mp3, flac), the narration is 48 kHz mono 16-bit PCM.
    const c = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', out]);
    if (c.status !== 0) throw new Error(`speak: the TTS command wrote no audio ffmpeg can read at {out}. Check that the command writes its output to the {out} path.`);
    const p = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' });
    return { duration: Number(p.stdout) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The NVIDIA GPU and its memory, or null. VoxCPM2 needs about 8 GB.
export function nvidiaGpu() {
  const r = spawnSync('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const [name, mib] = r.stdout.split('\n')[0].split(',').map((x) => x.trim());
  return { name, gb: Number(mib) / 1024 };
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

// Decodes an audio file to 48 kHz mono float samples.
function samples(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`speak: ffmpeg cannot decode ${file}.`);
  return new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.length));
}

// Transcribes a take and checks it against its text. A generated voice can babble past the end of a sentence, add
// a stray word, or drop words; the take is then regenerated.
const clip = (t, n = 140) => (t.length > n ? `${t.slice(0, n)}…` : t);

async function heardCheck(file, text, language) {
  const { transcribe, checkSpeech, asrModel, SMALL_MODEL } = await import('./voice.mjs');
  const model = asrModel(language);
  let t = await transcribe(file, { model, language });
  let c = checkSpeech(t.words, text);
  // A recognizer that loops on a phrase proves nothing about the take: the larger model hears it again.
  if (!c.ok && t.looped && model !== SMALL_MODEL) {
    t = await transcribe(file, { model: SMALL_MODEL, language });
    c = checkSpeech(t.words, text);
  }
  return { ...c, heard: clip(t.words.map((w) => w.text).join(' ')) };
}

// VoxCPM2 through its runner (scripts/tts/voxcpm_speak.py). uv builds the Python environment on first use (PyTorch,
// several GB). The model loads from a checkpoint already on disk, offline, and downloads into the model folder only
// when none exists. Each sentence is its own take, transcribed back and checked. A failed take is regenerated with
// another seed, up to 3 tries, and the best take of each sentence is kept.
async function voxcpm(script, { voice = '', reference = '', device, seed = 7, language, reroll = [] }, out) {
  const ready = voxcpmReady();
  if (!ready.ok && !device) throw new Error(`speak --engine voxcpm ${ready.why}. Use the default Kokoro engine, another TTS with --command, or --device cpu (very slow).`);
  const units = phrases(script);
  const said = units.map((u) => u.text);
  if (!said.length) throw new Error('speak: the script is empty.');
  for (const n of reroll) if (!(n >= 1 && n <= said.length)) throw new Error(`speak --reroll ${n}: the script has phrases 1 to ${said.length}.`);
  // VoxCPM2 garbles a phrase of one or two words far more often than a longer one.
  const short = said.map((t, i) => ({ t, i })).filter((p) => p.t.split(/\s+/).length < 3);
  if (short.length) console.error(`speak: short phrases fail more often with VoxCPM2: ${short.map((p) => `${p.i + 1} "${p.t}"`).join(', ')}. When one fails, join it to the next line ("Korang tahu tak, Kuala Lumpur ni…").`);
  const dir = mkdtempSync(join(tmpdir(), 'motion-video-tts-'));
  // Takes are kept by what makes them: the model, the voice, the text and the seed. A run speaks only the phrases it
  // has no take for, so a re-run after rewording one phrase keeps every other phrase exactly as it was.
  const cache = join(cacheRoot(), 'speak', 'voxcpm');
  mkdirSync(cache, { recursive: true });
  const checkpoint = voxcpmCheckpoint();
  const refId = reference ? `${reference}:${statSync(reference).size}:${statSync(reference).mtimeMs}` : '';
  const hash = (...parts) => createHash('sha1').update(JSON.stringify([checkpoint ?? VOXCPM, voice, refId, ...parts])).digest('hex').slice(0, 20);
  // Without a reference, the first phrase's designed voice is the anchor every phrase clones.
  const anchorKey = reference ? null : hash('anchor', said[0], seed);
  const anchorFile = anchorKey ? join(cache, `anchor-${anchorKey}.wav`) : null;
  const takeFile = (s) => join(cache, `${hash(anchorKey, s.text, s.seed)}.wav`);
  try {
    const runner = fileURLToPath(new URL('../tts/voxcpm_speak.py', import.meta.url));
    if (!checkpoint) console.error(`speak: no VoxCPM2 checkpoint on disk. Downloading it (about 4.7 GB) into ${modelsDir()}. This happens once.`);
    const env = {
      ...process.env, HF_HUB_CACHE: modelsDir(), TQDM_DISABLE: '1', PYTHONWARNINGS: 'ignore',
      ...(checkpoint ? { HF_HUB_OFFLINE: '1' } : {}), ...(device === 'cpu' ? { CUDA_VISIBLE_DEVICES: '' } : {}),
    };
    const generate = (list, designing = false) => {
      console.error(`speak: VoxCPM2 is speaking ${list.length} phrase(s)${checkpoint ? '' : ' after the download'}, about 3 s each on a GPU.`);
      const listFile = join(dir, 'sentences.json');
      writeFileSync(listFile, JSON.stringify(list));
      const args = ['run', '--quiet', runner, '--sentences', listFile, '--dir', dir, '--model', checkpoint ?? VOXCPM];
      if (voice && designing) args.push('--voice', voice);
      if (reference) args.push('--reference', reference);
      else if (!designing) args.push('--reference', anchorFile);
      // The runner's own output (compiler warnings, library notices) stays out of the way: its progress lines show,
      // and everything else only when it fails.
      const r = spawnSync('uv', args, { stdio: ['ignore', 'pipe', 'pipe'], env, encoding: 'utf8', maxBuffer: 1 << 28 });
      for (const line of `${r.stderr}`.split('\n')) if (/^voxcpm: /.test(line)) console.error(`  ${line}`);
      if (r.status !== 0) throw new Error(`speak: VoxCPM2 exited ${r.status}:\n${`${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-25).join('\n')}`);
      for (const s of list) copyFileSync(join(dir, `seg-${String(s.index).padStart(3, '0')}.wav`), takeFile(s));
    };
    if (anchorFile && !existsSync(anchorFile)) {
      // The designed voice: phrase 1 spoken from the description alone. Its take is also phrase 1's first take.
      const first = { index: 0, text: said[0], seed };
      generate([first], true);
      copyFileSync(join(dir, 'anchor.wav'), anchorFile);
    }
    // A re-rolled phrase draws a fresh seed, printed so the take can be found again.
    const fresh = new Map(reroll.map((n) => [n - 1, 100000 + Math.floor(Math.random() * 900000)]));
    const best = new Array(said.length).fill(null);
    let todo = said.map((text, index) => ({ index, text, seed: fresh.get(index) ?? seed + index }));
    for (const [i, s] of fresh) console.error(`speak: phrase ${i + 1} re-rolled with seed ${s}.`);
    for (let attempt = 0; attempt < 3 && todo.length; attempt++) {
      const missing = todo.filter((s) => !existsSync(takeFile(s)));
      if (missing.length) generate(missing);
      const again = [];
      for (const s of todo) {
        const take = takeFile(s);
        const c = await heardCheck(take, s.text, language);
        if (!best[s.index] || c.badness < best[s.index].badness) best[s.index] = { ...c, file: take, seed: s.seed };
        if (!c.ok) {
          console.error(`speak: phrase ${s.index + 1} (seed ${s.seed}): ${c.why}. Heard: "${c.heard}".${attempt < 2 ? ' Regenerating.' : ''}`);
          again.push({ ...s, seed: s.seed + 1000 });
        }
      }
      todo = again;
    }
    const parts = best.flatMap((b, i) => [samples(b.file), new Float32Array(Math.round(units[i].pause * 48000))]);
    const r = wav(parts, 48000);
    writeFileSync(out, r.buf);
    const failed = best.map((b, i) => ({ ...b, i })).filter((b) => !b.ok);
    const placed = spans(units, parts, 48000);
    return {
      duration: r.duration,
      phrases: placed,
      checks: best.map((b, i) => ({ at: placed[i].start, text: said[i], ok: b.ok, heard: b.heard, why: b.why, seed: b.seed })),
      problems: failed.map((b) => `phrase ${b.i + 1} "${said[b.i]}": ${b.why} (heard "${b.heard}"). Reword it, or draw new takes with --reroll ${b.i + 1}.`),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Syllables in a text, from its vowel groups: the unit a listener hears pace in, across languages written in Latin
// letters ("ber-lum-pur" is 3).
const syllables = (text) => (text.toLowerCase().normalize('NFKD').match(/[aeiouy]+/g) ?? []).length;

// Speaking pace: syllables per second while speaking (pauses left out). Explainers read best around 4-5.
export function pace(phrases) {
  const talk = phrases.reduce((t, p) => t + (p.end - p.start), 0);
  return talk > 0 ? phrases.reduce((n, p) => n + syllables(p.text), 0) / talk : 0;
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
function placeOnTimes(out, spoken, cues) {
  const rate = 48000;
  const audio = samples(out);
  const blocks = [];
  let p = 0;
  for (const c of cues) {
    const n = phrases(c.text).length;
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

// Speaks the script into a WAV at `out`. Returns { duration, engine }.
// opts.cues: the lines of a timed script ([{ start, end, text }]); each line is then placed at its time.
export async function speak(script, out, opts = {}) {
  const speed = opts.speed ?? config().tts?.speed ?? 1;
  if (!(speed >= 0.5 && speed <= 2)) throw new Error(`speak --speed ${speed}: use 0.5 to 2 (0.9 is 10% slower).`);
  // Kokoro sets its own speed. Every other engine is time-stretched once its audio is joined.
  if (speed !== 1 && !opts.stretched) {
    const kokoroEngine = !(opts.engine ?? config().tts?.engine) && !opts.command && !config().tts?.command && /kokoro/i.test(opts.model ?? config().tts?.model ?? KOKORO);
    if (!kokoroEngine) {
      const r = await speak(script, out, { ...opts, speed: 1, stretched: true, cues: null });
      const s = stretch(out, r.phrases, speed);
      const done = { ...r, ...s, checks: r.checks?.map((c) => ({ ...c, at: +(c.at / speed).toFixed(2) })) };
      if (!opts.cues) return done;
      const p = placeOnTimes(out, done.phrases, opts.cues);
      return { ...done, duration: p.duration, phrases: p.phrases, timing: p.late };
    }
  }
  if (opts.cues) {
    const r = await speak(opts.cues.map((c) => c.text).join('\n'), out, { ...opts, cues: null });
    if (!r.phrases) return { ...r, problems: [...(r.problems ?? []), 'This engine speaks the script in one piece, so its lines cannot be placed at their times. Use Kokoro, VoxCPM2 or --model for a timed script.'] };
    const p = placeOnTimes(out, r.phrases, opts.cues);
    return { ...r, duration: p.duration, phrases: p.phrases, timing: p.late };
  }
  const tts = config().tts ?? {};
  const engine = opts.engine ?? (opts.command || opts.model ? null : tts.engine);
  if (engine === 'voxcpm') {
    const voice = opts.voice ?? tts.voice ?? '';
    const r = await voxcpm(script, { voice, reference: opts.reference ?? tts.reference ?? '', device: opts.device, seed: opts.seed ?? tts.seed ?? 7, language: opts.language, reroll: opts.reroll ?? [] }, out);
    return { ...r, engine: `VoxCPM2${voice ? ` ${voice}` : ''}` };
  }
  if (engine && engine !== 'kokoro') throw new Error(`speak --engine "${engine}": use kokoro or voxcpm, or --model / --command for other engines.`);
  const cmd = opts.command ?? (opts.model || engine ? null : tts.command);
  const model = opts.model ?? tts.model ?? KOKORO;
  const voice = opts.voice ?? tts.voice ?? DEFAULT_VOICE;
  let result;
  if (cmd) result = { ...command(spoken(script), { command: cmd, voice: opts.voice ?? tts.voice ?? '', reference: opts.reference ?? tts.reference ?? '' }, out), engine: `command: ${cmd}` };
  else {
    const r = /kokoro/i.test(model) ? await kokoro(script, { model, voice, speed }) : await transformersModel(script, { model });
    writeFileSync(out, r.buf);
    result = { duration: r.duration, phrases: r.phrases, engine: /kokoro/i.test(model) ? `Kokoro (${voice})` : model };
  }
  // The whole file is transcribed back once: a problem is reported, since these engines speak the script in one go.
  const c = await heardCheck(out, spoken(script), opts.language);
  return { ...result, checks: [{ at: 0, text: spoken(script), ok: c.ok, heard: c.heard, why: c.why }], problems: c.ok ? [] : [`${c.why}. Heard: "${c.heard}".`] };
}

