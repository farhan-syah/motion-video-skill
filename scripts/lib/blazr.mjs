// blazr is the Rust build of speak and transcribe. The skill's own runner stays as the fallback.
import { spawnSync } from 'node:child_process';
import { ManifestError } from './manifest.mjs';
import { config, configFile } from './paths.mjs';

export const MIN_BLAZR = '0.1.2';

const INSTALL = 'Install it with `cargo install blazr --locked --features audio` (add `,cuda` for an NVIDIA GPU), or from a release archive at https://github.com/ml-rust/blazr/releases.';

function atLeast(version, min) {
  const a = version.split('.').map(Number);
  const b = min.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}

// Which blazr to use and what it can do. `why` says in words an agent can act on why it is not usable.
export function blazrInfo() {
  const cfg = config().blazr;
  const configured = typeof cfg === 'string';
  const info = { bin: configured ? cfg : 'blazr', configured, version: null, features: [], usable: false, why: '' };
  if (cfg === false) return { ...info, why: 'blazr is off: "blazr" is false in the config file.' };
  const r = spawnSync(info.bin, ['--version'], { encoding: 'utf8' });
  const m = r.status === 0 ? /^blazr (\d+\.\d+\.\d+)(?: \(([^)]*)\))?/.exec(r.stdout.trim()) : null;
  if (!m) {
    if (configured) {
      const err = r.error ? r.error.message : (r.stderr || r.stdout || `exit ${r.status}`).trim();
      return { ...info, why: `The blazr at ${cfg} does not run (${err}). Fix or remove "blazr" in ${configFile()}.` };
    }
    return { ...info, why: `blazr is not found on PATH. ${INSTALL}` };
  }
  info.version = m[1];
  info.features = (m[2] || '').split(',').map((f) => f.trim()).filter(Boolean);
  if (!atLeast(info.version, MIN_BLAZR)) info.why = `blazr ${info.version} at ${info.bin} is older than ${MIN_BLAZR}. Update it with \`cargo install blazr --locked --features audio --force\`.`;
  else if (!info.features.includes('audio')) info.why = `The blazr at ${info.bin} is built without audio. Install it with \`cargo install blazr --locked --features audio --force\`.`;
  else info.usable = true;
  return info;
}

// Exit 3 falls back because blazr refuses what only the skill's runner handles: a TTS model other than VITS safetensors,
// VoxCPM2 on a GPU when blazr has no CUDA, and a Whisper model with ONNX weights only.
// Returns the exit code when blazr ran the command, else null.
export function runBlazr(cmd, argv) {
  const info = blazrInfo();
  if (!info.usable) {
    // A blazr named in the config is the user's choice: one that cannot run the command is an error, not a fallback.
    if (info.configured) throw new ManifestError(info.why);
    return null;
  }
  // A positive marker: without it, only a missing fallback line shows that blazr ran the command.
  console.error(`${cmd}: running in blazr ${info.version} (${info.features.join(', ')})`);
  const r = spawnSync(info.bin, [cmd, ...argv], { stdio: 'inherit' });
  if (r.status === 3) {
    console.error(`${cmd}: blazr hands this run to the skill's own runner.`);
    return null;
  }
  return r.status ?? 1;
}
