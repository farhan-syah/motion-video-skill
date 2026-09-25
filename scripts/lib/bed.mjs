import { energyAt, gainOf, impulseFile } from './arc.mjs';
import { energyTurns } from './audit.mjs';
import { cached, synthesize } from './sfx.mjs';

// The bed: faint echoes that keep the world audible between hits. Off unless "sound.bed" is set.
// Fragments of the video's own motif and material sounds, pitched down, darkened and sent far into a hall.
// They sit in the gaps: never on a hit, never in the second before a reveal, never under voice.
// There is no noise layer: a constant hiss reads as a background, not as the world.
// Every choice comes from a seeded generator, so one manifest always renders the same bed.

const SR = 48000;

// Deterministic pseudo-random numbers in [0, 1).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sounds that make no sense as a distant echo: sweeps, strokes, builds, payoffs, alerts and keyboard clatter.
const NOT_A_SOURCE = new Set(['type', 'whoosh', 'swoosh', 'reverse', 'riser', 'boom', 'draw', 'zip', 'drag', 'ticker', 'spin', 'drone', 'hit', 'subdrop', 'sting', 'glitch', 'warning', 'flick']);
// Planned reveals: the bed clears the moment each one lands.
const REVEALS = ['boom', 'riser', 'reverse', 'hit', 'subdrop', 'sting', 'drone'];
// Pitch factors: an octave, a fifth, a fourth and a minor third down. Consonant, so echoes never sound out of tune.
const PITCHES = [0.5, 0.667, 0.75, 0.841];

// The sounds the bed is built from: motif cues first, then material cues, then the most used foreground sound.
export function bedSources(cues) {
  const usable = cues.filter((c) => !NOT_A_SOURCE.has(c.sound) && c.sourceFile && !/^cut into /.test(c.target ?? ''));
  const pick = (list) => [...new Map(list.map((c) => [c.sourceFile, c])).values()];
  const motif = pick(usable.filter((c) => c.motif));
  if (motif.length) return { from: 'motif', cues: motif };
  const material = pick(usable.filter((c) => c.material));
  if (material.length) return { from: 'material', cues: material };
  const counts = usable.reduce((o, c) => ({ ...o, [c.sound]: (o[c.sound] ?? 0) + 1 }), {});
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  return top ? { from: 'most used', cues: pick(usable.filter((c) => c.sound === top)) } : { from: 'none', cues: [] };
}

// Moments the bed clears for: planned reveals (REVEALS) and every energy peak of 0.85 or more.
export function revealTimes(cues, plan) {
  const t = cues.filter((c) => REVEALS.includes(c.sound)).map((c) => c.event);
  for (const p of plan) for (const x of energyTurns(p.curve ?? [[p.start, p.energy]], p.start, p.end)) if (x.kind === 'peak' && x.e >= 0.85) t.push(x.from);
  return [...new Set(t.map((x) => Number(x.toFixed(3))))].sort((a, b) => a - b);
}

// Places the fragments. Pure: the same inputs give the same plan.
//   cues: placed effects (event, sound, sourceFile, motif, material). arc: energy points in video time.
//   voice: [{ from, to }] spans of speech. opts: { fragments (per 10 s), level (dB), seed }.
export function planBed({ cues, plan, arc, voice = [], duration, fadeOut = 0.8 }, opts) {
  const rand = rng(opts.seed);
  const reveals = revealTimes(cues, plan);
  const sources = bedSources(cues);
  const events = cues.map((c) => c.event);
  const fragments = [];
  if (opts.fragments > 0 && sources.cues.length) {
    const gap = 10 / opts.fragments;
    const last = duration - fadeOut - 2.5;
    const free = (t) =>
      t >= 0.3 &&
      t <= last &&
      !events.some((x) => x > t - 0.35 && x < t + 0.5) &&
      !reveals.some((r) => t > r - 1.0 && t < r + 0.4) &&
      !voice.some((v) => t > v.from - 0.2 && t < v.to + 0.2) &&
      !fragments.some((f) => Math.abs(f.at - t) < gap * 0.5);
    for (let slot = 0.6 + rand() * gap * 0.5; slot < last + gap * 0.4; slot += gap * (0.65 + rand() * 0.7)) {
      const src = sources.cues[Math.floor(rand() * sources.cues.length)];
      const pitch = PITCHES[Math.floor(rand() * PITCHES.length)];
      const reverse = rand() < 0.34;
      const pan = Number(((rand() * 2 - 1) * 0.6).toFixed(2));
      const roll = rand();
      // The slot moves to the nearest free moment within 40% of the spacing: a busy stretch shifts it, not drops it.
      let t = null;
      for (let d = 0; d <= gap * 0.4 && t == null; d += 0.05) {
        if (free(slot - d)) t = slot - d;
        else if (free(slot + d)) t = slot + d;
      }
      if (t == null) continue;
      const e = energyAt(arc, t);
      // Low energy thins the bed: a trough keeps about a third of its fragments.
      if (roll >= 0.3 + 0.7 * e) continue;
      fragments.push({ source: src.sourceFile, sound: src.sound, at: Number(t.toFixed(3)), pitch, reverse, pan, gainDb: Number((opts.level + 20 * Math.log10(gainOf(e) / gainOf(0.6))).toFixed(2)) });
    }
  }
  return { from: sources.from, fragments, reveals };
}

// One fragment: the source sound pitched and slowed together (a tape-speed drop), optionally reversed into a swell,
// darkened, and sent mostly wet into the hall, so it sounds far away. Loudness-normalized like every effect source.
export function fragmentFile(source, { pitch, reverse }) {
  const ir = impulseFile('hall');
  const stem = `bed-${source.split('/').pop().replace(/-[0-9a-f]{8}\.wav$/, '')}-p${Math.round(pitch * 1000)}${reverse ? '-rev' : ''}`;
  return cached(stem, JSON.stringify({ v: 2, source, pitch, reverse, ir }), (file) => {
    const fmt = 'aformat=sample_rates=48000:channel_layouts=stereo';
    const graph = [
      `[0:a]${fmt}${reverse ? ',areverse' : ''},asetrate=${Math.round(SR * pitch)},aresample=${SR},lowpass=f=1400,highpass=f=150,apad=pad_dur=2.2[d]`,
      `[1:a]${fmt}[ir]`,
      '[d][ir]afir=dry=0.1:wet=1:gtype=peak,afade=t=in:d=0.04:curve=qsin[w]',
      '[w]atrim=0:3,afade=t=out:st=2.2:d=0.8:curve=qsin[o]',
    ];
    synthesize(['-i', source, '-i', ir, '-filter_complex', graph.join(';'), '-map', '[o]'], file, 'render a bed fragment');
  });
}
