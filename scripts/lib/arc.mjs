import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Sound direction: the planned shape of the whole soundtrack, not the reaction to single motions.
//   energy  - planned intensity, 0-1: one value per scene, or a curve of points inside it (tease, hit, drop, hit).
//             Every effect follows it in level and in tone, ramped across cuts.
//   space   - the room every effect sits in: "tight", "room" or "hall". Each sound sends its own share to it.
//   fadeIn / fadeOut - the mix breathes in from silence and resolves out, instead of starting and stopping on a cut.
//   in      - a scene's transition sound, pre-lapped across its cut (a J-cut): it starts in the previous scene.

const SR = 48000;
const RAMP = 0.3; // Seconds an energy change takes across a cut.

export const SPACES = {
  tight: { rt: 0.35, wet: 0.1 },
  room: { rt: 0.8, wet: 0.18 },
  hall: { rt: 1.8, wet: 0.26 },
};

// Energy 0.6 plays effects at about their mixed level. 1.0 lifts them 3.5 dB; 0.3 drops them 4.2 dB.
export const gainOf = (energy) => 0.4 + 1.1 * energy;

// Tone follows energy as well as level: a soft tease plays darker, a hit brighter. Shelf gain in dB at 3 kHz.
export const toneOf = (energy) => Number(((energy - 0.6) * 8).toFixed(1));

// Breakpoints of the energy curve in video time. Inside a scene the curve follows its points (linear between them);
// a scene with one value holds it. Changes across a cut ramp over RAMP seconds.
export function energyPoints(scenes) {
  const pts = [];
  scenes.forEach((s, i) => {
    const curve = s.curve ?? [[0, s.energy]];
    const a = s.start;
    const inRamp = i === 0 ? 0 : RAMP / 2;
    const outRamp = i === scenes.length - 1 ? 0 : RAMP / 2;
    const lo = inRamp;
    const hi = s.duration - outRamp;
    pts.push([a + lo, energyAt(curve, lo)]);
    for (const [t, e] of curve) if (t > lo && t < hi) pts.push([a + t, e]);
    pts.push([a + hi, energyAt(curve, hi)]);
  });
  return pts;
}

export function energyAt(points, t) {
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [t1, e1] = points[i];
    if (t <= t1) {
      const [t0, e0] = points[i - 1];
      return t1 === t0 ? e1 : e0 + ((e1 - e0) * (t - t0)) / (t1 - t0);
    }
  }
  return points[points.length - 1][1];
}

const cacheDir = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'motion-video', 'ir');

// A synthesized room impulse: decaying noise, different per channel, darker as it decays, after a 12 ms pre-delay.
export function impulseFile(space) {
  const s = SPACES[space];
  if (!s) throw new Error(`Unknown sound space "${space}". Use tight, room or hall.`);
  mkdirSync(cacheDir, { recursive: true });
  const key = createHash('sha256').update(JSON.stringify({ v: 1, space, s })).digest('hex').slice(0, 8);
  const file = join(cacheDir, `${space}-${key}.wav`);
  if (existsSync(file)) return file;
  const decay = (6.9 / s.rt).toFixed(4);
  const tmp = `${file}.${randomUUID()}.tmp.wav`;
  const r = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
    '-i', `aevalsrc='if(eq(n,0),st(0,99991)+st(1,77773),0);(random(0)-0.5)*exp(-${decay}*t)|(random(1)-0.5)*exp(-${decay}*t)':s=${SR}:d=${s.rt}`,
    '-af', 'highpass=f=250,lowpass=f=5500,adelay=delays=12:all=1', '-c:a', 'pcm_f32le', tmp,
  ], { encoding: 'utf8' });
  if (r.status !== 0) {
    rmSync(tmp, { force: true });
    throw new Error(`ffmpeg failed to synthesize the "${space}" room impulse: ${r.stderr?.trim()}`);
  }
  renameSync(tmp, file);
  return file;
}

// Transition sounds planned per cut. Each lands on the cut: a whoosh centers on it, a riser or reverse crests on it.
const TRANSITION_INTENT = { whoosh: 'transition', swoosh: 'slide', reverse: 'anticipation', riser: 'build' };
export function transitionCues(scene) {
  if (!scene.in) return [];
  return [{ sound: scene.in, at: 0, volume: scene.inVol ?? 0.8, target: `cut into ${scene.name}`, intent: TRANSITION_INTENT[scene.in], params: scene.inDur ? { dur: scene.inDur } : {}, anchor: 'peak' }];
}
