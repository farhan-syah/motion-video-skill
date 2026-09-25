// Where downloaded models live. Models are large and slow to fetch, so their folder is persistent and shared:
// MOTION_VIDEO_MODELS, else "models" in ~/.config/motion-video/config.json, else ~/.cache/motion-video/models.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export function configFile() {
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'motion-video', 'config.json');
}

export function cacheRoot() {
  return join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'motion-video');
}

// The user's settings, shared by every project: ~/.config/motion-video/config.json.
//   { "models": "/path/to/models",
//     "tts": { "command": "...", "model": "hf-id", "voice": "af_heart", "engine": "voxcpm", "checkpoint": "/path" },
//     "asr": { "model": "onnx-community/whisper-small_timestamped" } }
export function config() {
  const f = configFile();
  if (!existsSync(f)) return {};
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch (e) {
    throw new Error(`${f} is not valid JSON (${e.message}). Fix it, or delete it to use the defaults.`);
  }
}

// Hugging Face hub caches that can already hold a model: the model folder, then the standard hub cache.
export function hubCaches() {
  const hfHome = process.env.HF_HOME || join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'huggingface');
  return [...new Set([modelsDir(), process.env.HF_HUB_CACHE, join(hfHome, 'hub')].filter(Boolean).map((d) => resolve(d)))];
}

export function modelsDir() {
  if (process.env.MOTION_VIDEO_MODELS) return resolve(process.env.MOTION_VIDEO_MODELS);
  const models = config().models;
  if (models) return resolve(models.replace(/^~(?=$|[\\/])/, homedir()));
  return join(cacheRoot(), 'models');
}
