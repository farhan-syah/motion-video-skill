// The skill's version, and updates from its git remote. Only `update` and `update --check` touch the network, and only
// when run: nothing checks on its own. The last check is remembered, so `doctor` can say when one is due.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheRoot } from './paths.mjs';

export const skillDir = () => join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const version = () => JSON.parse(readFileSync(join(skillDir(), 'scripts', 'package.json'), 'utf8')).version;
const stateFile = () => join(cacheRoot(), 'update.json');
const REPO = 'https://github.com/farhan-syah/motion-video-skill';

const git = (...args) => spawnSync('git', ['-C', skillDir(), ...args], { encoding: 'utf8' });
export const newer = (a, b) => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

// Days since the last update check, or null when none ran.
export function lastCheck() {
  try {
    const s = JSON.parse(readFileSync(stateFile(), 'utf8'));
    return { days: (Date.now() - Date.parse(s.checked)) / 864e5, latest: s.latest };
  } catch {
    return null;
  }
}

// The changelog sections after `from`, up to and including `to`.
function notes(changelog, from, to) {
  const out = [];
  let keep = false;
  for (const line of changelog.split('\n')) {
    const m = /^## \[?(\d+\.\d+\.\d+)\]?/.exec(line);
    if (m) keep = newer(m[1], from) && !newer(m[1], to);
    if (keep) out.push(line);
  }
  return out.join('\n').trim();
}

// Fetches the remote and compares versions. Returns { current, latest, branch, notes } or throws with the next step.
export function check() {
  if (!existsSync(join(skillDir(), '.git'))) {
    throw new Error(`${skillDir()} is not a git clone, so it cannot check for updates. Replace it with a clone: git clone ${REPO} motion-video, then run bun install (or npm install) in motion-video/scripts.`);
  }
  const f = git('fetch', '--quiet', 'origin');
  if (f.status !== 0) throw new Error(`git fetch failed in ${skillDir()}: ${f.stderr.trim() || 'no output'}. Check the network and the "origin" remote.`);
  const head = git('symbolic-ref', '--short', 'refs/remotes/origin/HEAD').stdout.trim() || 'origin/main';
  const remotePkg = git('show', `${head}:scripts/package.json`);
  if (remotePkg.status !== 0) throw new Error(`${head} has no scripts/package.json: the "origin" remote is not this skill's repository.`);
  const latest = JSON.parse(remotePkg.stdout).version ?? '0.0.0';
  const current = version();
  const log = git('show', `${head}:CHANGELOG.md`).stdout ?? '';
  mkdirSync(cacheRoot(), { recursive: true });
  writeFileSync(stateFile(), JSON.stringify({ checked: new Date().toISOString(), latest }));
  return { current, latest, branch: head, available: newer(latest, current), notes: notes(log, current, latest) };
}

// Pulls the latest version and reinstalls the dependencies. Refuses on local changes or another branch.
export function update() {
  const c = check();
  if (!c.available) return { ...c, updated: false };
  const dirty = git('status', '--porcelain').stdout.trim();
  if (dirty) throw new Error(`${skillDir()} has local changes, so it was not updated:\n${dirty}\nCommit or move them, then run update again.`);
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim();
  const target = c.branch.replace(/^origin\//, '');
  if (branch !== target) throw new Error(`${skillDir()} is on branch "${branch}", not "${target}", so it was not updated. Run: git -C ${skillDir()} switch ${target}, then update again.`);
  const p = git('pull', '--ff-only', '--quiet');
  if (p.status !== 0) throw new Error(`git pull failed: ${p.stderr.trim()}. The local branch has diverged from ${c.branch}.`);
  const bun = spawnSync('bun', ['--version'], { stdio: 'ignore' }).status === 0;
  const i = spawnSync(bun ? 'bun' : 'npm', ['install'], { cwd: join(skillDir(), 'scripts'), stdio: 'inherit', shell: process.platform === 'win32' });
  if (i.status !== 0) throw new Error(`Updated to ${c.latest}, but ${bun ? 'bun' : 'npm'} install failed in ${join(skillDir(), 'scripts')}. Run it there by hand.`);
  return { ...c, updated: true };
}
