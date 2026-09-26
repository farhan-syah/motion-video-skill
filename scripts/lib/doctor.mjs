// A sweep of what this machine and folder offer, run before directing: hardware, tools, speech engines and models,
// and the user's material. Direction then plans with what exists, not with assumptions.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { cpus, freemem, platform, totalmem } from 'node:os';
import { extname, join, relative } from 'node:path';
import { cacheRoot, config, configFile, modelsDir } from './paths.mjs';

const first = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' });
  return r.status === 0 ? (r.stdout || r.stderr).split('\n')[0].trim() : null;
};
const gb = (b) => `${(b / 1024 ** 3).toFixed(0)} GB`;

const KINDS = {
  image: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif'],
  video: ['.mp4', '.mov', '.webm', '.mkv', '.m4v'],
  audio: ['.wav', '.mp3', '.m4a', '.aac', '.flac', '.ogg', '.opus'],
  font: ['.woff2', '.woff', '.ttf', '.otf'],
  text: ['.md', '.txt', '.pdf', '.json', '.csv'],
};

// Media and documents in the folder, two levels deep, skipping build output and dependencies.
function material(root) {
  const found = { image: [], video: [], audio: [], font: [], text: [] };
  const walk = (dir, depth) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || ['node_modules', 'out', 'fonts', 'lib'].includes(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < 2) walk(p, depth + 1);
        continue;
      }
      const ext = extname(e.name).toLowerCase();
      for (const [kind, exts] of Object.entries(KINDS)) if (exts.includes(ext) && found[kind]) found[kind].push(p);
    }
  };
  walk(root, 0);
  return found;
}

export async function doctor(root) {
  const lines = [];
  const say = (k, v) => lines.push(`${k.padEnd(14)} ${v}`);
  const c = cpus();
  lines.push('MACHINE');
  say('platform', `${platform()} ${process.arch}`);
  say('cpu', `${c.length} threads, ${c[0]?.model.trim() ?? 'unknown'}`);
  say('memory', `${gb(totalmem())} total, ${gb(freemem())} free`);
  const ff = first('ffmpeg', ['-version']);
  say('ffmpeg', ff ? ff.replace(/ Copyright.*/, '') : 'MISSING: install ffmpeg (rendering needs it)');
  say('node', process.version);
  say('bun', first('bun', ['--version']) ?? 'not found (npm is used instead)');
  const { systemBrowser, launch, renderer } = await import('./browser.mjs');
  say('chromium', systemBrowser() ?? 'none on PATH: Playwright\'s build is used');
  let gpu = 'unknown';
  try {
    const b = await launch();
    gpu = await renderer(b);
    await b.close();
  } catch (e) {
    gpu = `browser failed: ${e.message.split('\n')[0]}`;
  }
  const soft = /swiftshader|llvmpipe|software|none/i.test(gpu);
  say('drawing', soft ? `software (${gpu}): renders are slower, keep 3D and blur light` : `GPU (${gpu})`);
  const { hasNvenc } = await import('./encode.mjs');
  say('encoding', hasNvenc() ? 'NVENC (GPU)' : 'libx264 (CPU)');

  lines.push('', 'SPEECH');
  const cfg = config();
  const asrDir = join(cacheRoot(), 'asr', 'node_modules');
  const runtime = existsSync(join(asrDir, '@huggingface', 'transformers'));
  say('runtime', runtime ? 'installed' : 'not installed: speak or transcribe installs it once (about 500 MB)');
  say('kokoro', existsSync(join(asrDir, 'kokoro-js')) ? 'installed' : 'installs on first speak');
  const models = modelsDir();
  say('model folder', `${models}${existsSync(configFile()) ? `  (from ${configFile()})` : ''}`);
  const have = (id) => existsSync(join(models, ...id.split('/')));
  const whisper = existsSync(join(models, 'onnx-community')) ? readdirSync(join(models, 'onnx-community')).filter((d) => d.startsWith('whisper')) : [];
  say('whisper', whisper.length ? whisper.join(', ') : 'none yet: transcribe downloads whisper-base (about 75 MB), and whisper-small (about 240 MB) for other languages');
  say('kokoro model', have('onnx-community/Kokoro-82M-v1.0-ONNX') ? 'ready' : 'downloads on first speak (about 90 MB)');
  const { voxcpmCheckpoint, voxcpmReady } = await import('./speak.mjs');
  const vox = voxcpmReady();
  let ckpt;
  try {
    ckpt = voxcpmCheckpoint();
    ckpt = ckpt ? `checkpoint ${ckpt}` : 'no checkpoint on disk yet: the first run downloads about 4.7 GB';
  } catch (e) {
    ckpt = e.message;
  }
  say('voxcpm2', vox.ok ? `available (${vox.why}), ${ckpt}. 30 languages incl. Malay, voice design and cloning. speak --engine voxcpm` : `not available: ${vox.why}`);
  const engine = cfg.tts?.engine ? cfg.tts.engine : cfg.tts?.command ? `command: ${cfg.tts.command}` : cfg.tts?.model ? `model: ${cfg.tts.model}` : null;
  say('tts engine', engine ?? (vox.ok ? 'Kokoro by default (English). VoxCPM2 covers other languages and better voices.' : 'Kokoro (English only). For other languages, ask for the user\'s TTS or a recording.'));
  if (cfg.asr?.model) say('asr model', cfg.asr.model);

  lines.push('', `MATERIAL in ${root}`);
  const found = material(root);
  for (const [kind, files] of Object.entries(found)) {
    if (!files.length) continue;
    const shown = files.slice(0, 8).map((f) => {
      const kb = statSync(f).size / 1024;
      return `${relative(root, f)} (${kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`})`;
    });
    say(kind, `${files.length}: ${shown.join(', ')}${files.length > 8 ? ', …' : ''}`);
  }
  if (!Object.values(found).some((f) => f.length)) say('files', 'no media or documents here');
  const git = first('git', ['-C', root, 'rev-parse', '--show-toplevel']);
  if (git) say('repo', `${git}: read its README and docs for facts`);
  return lines.join('\n');
}
