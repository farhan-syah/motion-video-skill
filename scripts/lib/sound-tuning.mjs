// Musical tuning for tonal effects. Every tonal sound in one video shares a key, so chimes, plucks and stings never
// clash with each other or with the music.
//   tonic sounds - a fixed motif (ding, success, sting) moves to the nearest tonic of the key, within 6 semitones.
//   scale sounds - a sound pitched by element size (pop, pluck, drop) snaps to the key's pentatonic scale, so any
//                  two of them form a consonant interval.

const PITCH_CLASS = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const PENTATONIC = { major: [0, 2, 4, 7, 9], minor: [0, 3, 5, 7, 10] };

export const DEFAULT_KEY = Object.freeze({ tonic: 0, mode: 'major', name: 'C major' });

// Parses "C", "F# minor", "Ebm", "A major". Returns null for anything else.
export function parseKey(spec) {
  if (typeof spec !== 'string') return null;
  const m = spec.trim().match(/^([A-G])([#b]?)\s*(m|min|minor|maj|major)?$/i);
  if (!m) return null;
  const root = m[1].toUpperCase() + (m[2] ?? '');
  const tonic = PITCH_CLASS[root];
  if (tonic == null) return null;
  // "m", "min" and "minor" mean minor. A capital "M" follows chord notation and means major.
  const mode = m[3] && /^m(in(or)?)?$/i.test(m[3]) && m[3] !== 'M' ? 'minor' : 'major';
  return Object.freeze({ tonic, mode, name: `${NAMES[tonic]} ${mode}` });
}

// Frequency ratio of a major or minor third: chord recipes write R3 where the third goes.
export const thirdRatio = (key) => (key.mode === 'minor' ? 2 ** (3 / 12) : 2 ** (4 / 12));

const semis = (hz) => 12 * Math.log2(hz / 440) + 69;
const hzOf = (midi) => 440 * 2 ** ((midi - 69) / 12);

// The tonic nearest to hz: a fixed motif keeps its register and lands on the key.
export function nearestTonic(hz, key) {
  const m = semis(hz);
  const offset = (((Math.round(m) - key.tonic) % 12) + 12) % 12;
  const down = Math.round(m) - offset;
  const pick = Math.abs(m - down) <= Math.abs(down + 12 - m) ? down : down + 12;
  return hzOf(pick);
}

// The pentatonic note of the key nearest to hz.
export function nearestScaleNote(hz, key) {
  const m = semis(hz);
  let best = null;
  for (let octave = Math.floor(m / 12) - 1; octave <= Math.floor(m / 12) + 1; octave++) {
    for (const d of PENTATONIC[key.mode]) {
      const n = octave * 12 + key.tonic + d;
      if (!best || Math.abs(n - m) < Math.abs(best - m)) best = n;
    }
  }
  return hzOf(best);
}

// The factor that moves a recipe written at `base` Hz onto the key.
//   tune: 'tonic' or 'scale'. pitch: the size factor (scale sounds only).
export function keyFactor(tune, base, key, pitch = 1) {
  if (tune === 'tonic') return nearestTonic(base, key) / base;
  if (tune === 'scale') return nearestScaleNote(base * pitch, key) / base;
  return pitch;
}

// Key of a music track from its chroma: Krumhansl-Kessler profiles correlated against the pitch-class energy.
//   chroma: 12 energies, C first.
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
export function keyFromChroma(chroma) {
  const corr = (a, b) => {
    const ma = a.reduce((s, v) => s + v, 0) / 12;
    const mb = b.reduce((s, v) => s + v, 0) / 12;
    let n = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < 12; i++) {
      n += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2;
      db += (b[i] - mb) ** 2;
    }
    return n / Math.sqrt(da * db || 1);
  };
  let best = { r: -Infinity };
  for (let t = 0; t < 12; t++) {
    for (const [mode, profile] of [['major', MAJOR], ['minor', MINOR]]) {
      const rotated = profile.map((_, i) => profile[(i - t + 12) % 12]);
      const r = corr(chroma, rotated);
      if (r > best.r) best = { r, tonic: t, mode };
    }
  }
  return { tonic: best.tonic, mode: best.mode, name: `${NAMES[best.tonic]} ${best.mode}`, confidence: Number(best.r.toFixed(2)) };
}
