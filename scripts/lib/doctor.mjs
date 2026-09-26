// A sweep of what this machine and folder offer, run before directing: hardware, tools, speech engines and models,
// and the user's material. Direction then plans with what exists, not with assumptions.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statfsSync, statSync } from 'node:fs';
import { cpus, freemem, platform, totalmem } from 'node:os';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
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

// Files init copies into a project, and files the skill writes: the skill's own, not the user's material.
const SKILL_FILES = new Set(readdirSync(fileURLToPath(new URL('../../templates', import.meta.url))));
const skillFile = (name) => SKILL_FILES.has(name) || /\.phrases\.json$|\.words\.json$/.test(name);

// Free space on the disk that holds a folder, or null.
const freeSpace = (dir) => {
  try {
    const s = statfsSync(dir);
    return s.bavail * s.bsize;
  } catch {
    return null;
  }
};

// Media and documents in the folder, two levels deep, skipping build output, dependencies and the skill's own files.
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
      if (skillFile(e.name)) continue;
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
  // What stops or limits a video, with the fix: printed last, under READY.
  const missing = [];
  const limits = [];
  const c = cpus();
  const { lastCheck, newer, version } = await import('./update.mjs');
  const last = lastCheck();
  const v = version();
  const ago = (d) => (d < 1 ? 'today' : `${Math.floor(d)} day(s) ago`);
  lines.push('SKILL');
  let status;
  if (!last) status = 'never checked for updates: run "update --check" when the user wants the latest';
  else if (last.latest && newer(last.latest, v)) status = `${last.latest} is available (checked ${ago(last.days)}): "update" installs it, with the user's consent`;
  else if (last.days > 30) status = `last update check ${Math.floor(last.days)} days ago: run "update --check" when the user wants the latest`;
  else status = `up to date (checked ${ago(last.days)})`;
  say('version', `${v}, ${status}`);
  lines.push('MACHINE');
  say('platform', `${platform()} ${process.arch}`);
  say('cpu', `${c.length} threads, ${c[0]?.model.trim() ?? 'unknown'}`);
  say('memory', `${gb(totalmem())} total, ${gb(freemem())} free`);
  const ff = first('ffmpeg', ['-version']);
  say('ffmpeg', ff ? ff.replace(/ Copyright.*/, '') : 'MISSING');
  if (!ff) missing.push('ffmpeg and ffprobe: install them (https://ffmpeg.org/download.html, or the system package manager). Rendering needs both.');
  const free = freeSpace(root);
  if (free != null) {
    say('disk', `${gb(free)} free here`);
    if (free < 5 * 1024 ** 3) limits.push(`only ${gb(free)} free: a render needs several GB for frames and cache. Free some space, or work on another disk.`);
  }
  say('node', process.version);
  say('bun', first('bun', ['--version']) ?? 'not found: npm is used instead');
  const { systemBrowser, launch, renderer } = await import('./browser.mjs');
  say('chromium', systemBrowser() ?? 'none on PATH: Playwright\'s build is used');
  let gpu = 'unknown';
  try {
    const b = await launch({ quiet: true });
    gpu = await renderer(b);
    await b.close();
  } catch (e) {
    gpu = 'browser failed';
    missing.push(`Chromium: ${e.message.split('\n')[0]}`);
  }
  const soft = /swiftshader|llvmpipe|software|none/i.test(gpu);
  const failed = gpu.startsWith('browser failed');
  say('drawing', failed ? 'unknown: the browser did not start (see READY)' : soft ? `software (${gpu})` : `GPU (${gpu})`);
  if (soft && !failed) limits.push('drawing runs in software: renders are slower. Keep 3D and blur light.');
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
  const whisperState = (name, size, use) => `${name} (${use}): ${have(`onnx-community/whisper-${name}_timestamped`) ? 'ready' : `downloads on first use, about ${size}`}`;
  say('whisper', `${whisperState('base', '75 MB', 'English')}; ${whisperState('small', '240 MB', 'other languages')}`);
  if (cfg.asr?.model) say('asr model', `${cfg.asr.model} (from the config, for every language)`);
  say('kokoro model', have('onnx-community/Kokoro-82M-v1.0-ONNX') ? 'ready' : 'downloads on first speak (about 90 MB)');
  const { voxcpmCheckpoint, voxcpmReady } = await import('./speak.mjs');
  const vox = voxcpmReady();
  const uv = first('uv', ['--version']);
  say('uv', uv ?? 'not found: VoxCPM2 needs it to build its Python environment (https://docs.astral.sh/uv)');
  let ckpt;
  try {
    ckpt = voxcpmCheckpoint();
    ckpt = ckpt ? `checkpoint ${ckpt}` : 'no checkpoint on disk yet: the first run downloads about 4.7 GB';
  } catch (e) {
    ckpt = e.message;
  }
  say('voxcpm2', vox.ok ? `available (${vox.why}): 30 languages, voice design and cloning. ${ckpt}` : `not available: ${vox.why}`);
  const engine = cfg.tts?.engine ? cfg.tts.engine : cfg.tts?.command ? `command: ${cfg.tts.command}` : cfg.tts?.model ? `model: ${cfg.tts.model}` : null;
  say('tts default', engine ? `${engine} (from the config)` : `Kokoro, English only.${vox.ok ? ' For any other language, pass --engine voxcpm (available here).' : ''} "tts" in the config changes the default.`);
  if (!vox.ok && !cfg.tts?.command && !cfg.tts?.model) limits.push(`narration in a language other than English: no engine here (VoxCPM2 ${vox.why}). Ask for the user's TTS (speak --command) or a recording.`);
  const modelFree = freeSpace(existsSync(models) ? models : cacheRoot());
  if (vox.ok && ckpt.startsWith('no checkpoint') && modelFree != null && modelFree < 8 * 1024 ** 3) limits.push(`VoxCPM2's first run downloads about 4.7 GB, and the model folder's disk has ${gb(modelFree)} free.`);

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

  lines.push('', 'READY');
  if (!missing.length) lines.push('  Rendering: yes. Everything it needs is here.');
  for (const m of missing) lines.push(`  MISSING  ${m}`);
  for (const l of limits) lines.push(`  LIMIT    ${l}`);
  return lines.join('\n');
}
