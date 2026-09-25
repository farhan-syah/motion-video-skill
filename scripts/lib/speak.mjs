// Text to speech for narration, from one of four engines:
//   command: any TTS the user already runs (Piper, XTTS, F5, a cloud CLI), through a command template.
//   voxcpm:  VoxCPM2 (OpenBMB, Apache 2.0): 30 languages, voice design and cloning. Needs an NVIDIA GPU with 8 GB.
//   model:   any text-to-speech model transformers.js runs locally (a Hugging Face ONNX model id).
//   default: Kokoro-82M (Apache 2.0) through kokoro-js: local, English voices, no setup.
// Flags choose, else "tts" in ~/.config/motion-video/config.json.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, hubCaches, modelsDir } from './paths.mjs';
import { speechModule } from './voice.mjs';

export const DEFAULT_VOICE = 'af_heart';
const KOKORO = 'onnx-community/Kokoro-82M-v1.0-ONNX';

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
const sentences = (text) => text.replace(/\s+/g, ' ').match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [];

async function kokoro(script, { model = KOKORO, voice = DEFAULT_VOICE, speed = 1, pause = 0.28 }) {
  const { KokoroTTS, TextSplitterStream } = await speechModule('kokoro-js');
  const tts = await KokoroTTS.from_pretrained(model, { dtype: 'q8' });
  if (!tts.voices[voice]) throw new Error(`speak: Kokoro has no voice "${voice}". Voices: ${Object.keys(tts.voices).join(', ')}.`);
  const splitter = new TextSplitterStream();
  splitter.push(script);
  splitter.close();
  const parts = [];
  let rate = 24000;
  for await (const { audio } of tts.stream(splitter, { voice, speed })) {
    rate = audio.sampling_rate;
    if (parts.length) parts.push(new Float32Array(Math.round(pause * rate)));
    parts.push(audio.audio);
  }
  return wav(parts, rate);
}

async function transformersModel(script, { model, pause = 0.28 }) {
  const { pipeline } = await speechModule();
  const tts = await pipeline('text-to-speech', model, { dtype: 'fp32' }).catch((e) => {
    throw new Error(`speak: cannot load "${model}" as a transformers.js text-to-speech model (${e.message.split('\n')[0]}). It needs ONNX weights on the Hugging Face hub, for example Xenova/mms-tts-eng. For other engines, use --command.`);
  });
  const parts = [];
  let rate = 16000;
  for (const s of sentences(script)) {
    const out = await tts(s);
    rate = out.sampling_rate;
    if (parts.length) parts.push(new Float32Array(Math.round(pause * rate)));
    parts.push(out.audio);
  }
  return wav(parts, rate);
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

// VoxCPM2 through its runner (scripts/tts/voxcpm_speak.py). uv builds the Python environment on first use (PyTorch,
// several GB). The model loads from a checkpoint already on disk, offline, and downloads into the model folder only
// when none exists.
function voxcpm(script, { voice = '', reference = '', device }, out) {
  const ready = voxcpmReady();
  if (!ready.ok && !device) throw new Error(`speak --engine voxcpm ${ready.why}. Use the default Kokoro engine, another TTS with --command, or --device cpu (very slow).`);
  const dir = mkdtempSync(join(tmpdir(), 'motion-video-tts-'));
  try {
    const textFile = join(dir, 'script.txt');
    writeFileSync(textFile, `${script}\n`);
    const runner = fileURLToPath(new URL('../tts/voxcpm_speak.py', import.meta.url));
    const checkpoint = voxcpmCheckpoint();
    if (!checkpoint) console.error(`speak: no VoxCPM2 checkpoint on disk. Downloading it (about 4.7 GB) into ${modelsDir()}. This happens once.`);
    const args = ['run', '--quiet', runner, '--script', textFile, '--out', out, '--model', checkpoint ?? VOXCPM];
    if (voice) args.push('--voice', voice);
    if (reference) args.push('--reference', reference);
    const env = { ...process.env, HF_HUB_CACHE: modelsDir(), ...(checkpoint ? { HF_HUB_OFFLINE: '1' } : {}), ...(device === 'cpu' ? { CUDA_VISIBLE_DEVICES: '' } : {}) };
    const r = spawnSync('uv', args, { stdio: ['ignore', 'inherit', 'inherit'], env });
    if (r.status !== 0) throw new Error(`speak: VoxCPM2 exited ${r.status}. The lines above show why.`);
    const p = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' });
    return { duration: Number(p.stdout) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Speaks the script into a WAV at `out`. Returns { duration, engine }.
export async function speak(script, out, opts = {}) {
  const tts = config().tts ?? {};
  const engine = opts.engine ?? (opts.command || opts.model ? null : tts.engine);
  if (engine === 'voxcpm') {
    const voice = opts.voice ?? tts.voice ?? '';
    return { ...voxcpm(script, { voice, reference: opts.reference ?? tts.reference ?? '', device: opts.device }, out), engine: `VoxCPM2${voice ? ` ${voice}` : ''}` };
  }
  if (engine && engine !== 'kokoro') throw new Error(`speak --engine "${engine}": use kokoro or voxcpm, or --model / --command for other engines.`);
  const cmd = opts.command ?? (opts.model || engine ? null : tts.command);
  const model = opts.model ?? tts.model ?? KOKORO;
  const voice = opts.voice ?? tts.voice ?? DEFAULT_VOICE;
  if (cmd) return { ...command(script, { command: cmd, voice: opts.voice ?? tts.voice ?? '', reference: opts.reference ?? tts.reference ?? '' }, out), engine: `command: ${cmd}` };
  const r = /kokoro/i.test(model) ? await kokoro(script, { model, voice, speed: opts.speed ?? 1 }) : await transformersModel(script, { model });
  writeFileSync(out, r.buf);
  return { duration: r.duration, engine: /kokoro/i.test(model) ? `Kokoro (${voice})` : model };
}

