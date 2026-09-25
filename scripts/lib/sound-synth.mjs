// Synthesis primitives for the sound catalog. Every function returns an aevalsrc expression string.
// Registers: random(0) uses 0 (and random(1) uses 1). sweptNoise uses 2, 3, 4 and 6. Recipes may use 5, 7, 8 and 9.
// Each channel expression keeps its own registers, and every channel seeds random(0) the same way, so one expression
// written into two channels renders the same signal in both.

// Exponent that puts the crest of sin(PI*x^k) at fraction c of the sound: x^k = 0.5 there.
export const shapeFor = (c) => (Math.log(0.5) / Math.log(c)).toFixed(4);

// Noise through a Chamberlin state-variable filter, computed per sample, so its cutoff can move.
// fc: cutoff expression in Hz. damp: 1/Q (lower rings more). out: 'band' or 'low'.
export function sweptNoise(fc, damp, out = 'band') {
  return `st(4,2*sin(PI*min(${fc},9000)/48000));st(6,(random(0)-0.5)-ld(2)-${damp}*ld(3));st(3,ld(3)+ld(4)*ld(6));st(2,ld(2)+ld(4)*ld(3));${out === 'low' ? 'ld(2)' : 'ld(3)'}`;
}

// Left and right gains for a source that travels with the motion. span: how far it pans (0-1).
// dir 1 moves left to right, -1 right to left, 0 holds it centered.
export function panGains(span, dur, dir) {
  const x = `t/${dur}`;
  const toRight = `(${(1 - span).toFixed(2)}+${span}*${x})`;
  const toLeft = `(1-${span}*${x})`;
  return dir > 0 ? [toLeft, toRight] : dir < 0 ? [toRight, toLeft] : ['0.65', '0.65'];
}

// A moving noise swell: one point source whose band rises into the crest and falls after it, like air past the ear.
export function travel(env, lo, sweep, damp, span, dur, dir) {
  const [l, r] = panGains(span, dur, dir);
  const m = `${sweptNoise(`(${lo}+${sweep}*${env})`, damp)}*${env}`;
  return `${m}*${l}|${m}*${r}`;
}

// Materials for modal synthesis: an object struck is a few damped resonances plus the noise of the contact.
//   ratios   - mode frequencies against the fundamental (inharmonic for bars, plates and shells)
//   amps     - mode levels
//   decay    - decay rate of the fundamental, 1/s. Mode k decays at decay*(1+growth*k): upper modes die first.
//   register - fundamental against the archetype's own: glass and ceramic sit higher, stone and rubber lower
//   strike   - the contact noise: center Hz, level, decay rate 1/s
//   beat     - Hz offset of a second copy of every mode. Real metal modes come in near-degenerate pairs that beat.
export const MATERIALS = {
  wood: { ratios: [0.5, 1, 1.58, 2.572, 4.644], amps: [0.6, 1, 0.45, 0.35, 0.12], decay: 55, growth: 0.7, register: 0.85, strike: { hz: 750, level: 0.7, decay: 500 } },
  glass: { ratios: [1, 2.32, 4.25, 6.63], amps: [1, 0.6, 0.4, 0.25], decay: 7, growth: 0.35, register: 1.8, strike: { hz: 3200, level: 0.22, decay: 1500 } },
  metal: { ratios: [1, 1.59, 2.14, 2.3, 2.65, 2.92, 3.5, 4.15], amps: [1, 0.8, 0.7, 0.6, 0.55, 0.45, 0.35, 0.25], decay: 5, growth: 0.25, register: 1.1, beat: 2.5, strike: { hz: 2600, level: 0.35, decay: 1100 } },
  plastic: { ratios: [1, 1.93, 3.2, 4.72], amps: [1, 0.4, 0.2, 0.1], decay: 70, growth: 0.8, register: 1.15, strike: { hz: 1700, level: 0.45, decay: 900 } },
  stone: { ratios: [1, 1.63, 2.52, 3.47, 4.61], amps: [1, 0.8, 0.6, 0.45, 0.3], decay: 110, growth: 1.2, register: 0.8, strike: { hz: 700, level: 0.8, decay: 350 } },
  rubber: { ratios: [1, 1.52, 2.21], amps: [1, 0.25, 0.08], decay: 55, growth: 0.6, register: 0.75, strike: { hz: 400, level: 0.3, decay: 250 } },
  ceramic: { ratios: [1, 2.61, 4.89, 7.74], amps: [1, 0.55, 0.35, 0.2], decay: 16, growth: 0.45, register: 1.5, strike: { hz: 2400, level: 0.3, decay: 1300 } },
};

// The five contacts a material recolors. hz: fundamental at register 1. strike: contact noise against the material's.
// ring: decay scale (above 1 damps faster). d: the shortest length. maxRing: the longest ring in seconds. A tiny
// tick on glass still stops fast, while a tap on metal rings out.
export const MATERIAL_ARCHETYPES = {
  tap: { hz: 700, strike: 0.6, ring: 1, d: 0.14, maxRing: 1.2 },
  tick: { hz: 1300, strike: 0.5, ring: 1.6, d: 0.06, maxRing: 0.12 },
  snap: { hz: 1200, strike: 1.2, ring: 1.3, d: 0.1, maxRing: 0.25 },
  thud: { hz: 210, strike: 0.8, ring: 1, d: 0.3, maxRing: 1.2 },
  slam: { hz: 150, strike: 1.5, ring: 0.8, d: 0.45, maxRing: 1.2 },
};

// Highest mode kept. Higher modes add only piercing ring and fold near Nyquist once pitched up.
const MODE_CEILING_HZ = 8000;

// Lowest mode a struck contact may keep. Below it, small speakers lose the body of the sound.
const FLOOR_HZ = 170;

// The lowest pitch factor a struck contact takes: below it, a big element's pitch drop would push its fundamental
// under FLOOR_HZ, and small speakers would lose it.
export function struckFloor(archetype, material) {
  const a = MATERIAL_ARCHETYPES[archetype];
  const m = MATERIALS[material];
  if (!a || !m) return 0;
  return FLOOR_HZ / Math.max(FLOOR_HZ, a.hz * m.register);
}

// A struck object: the archetype's contact on the material. Pitch follows size through the sin(2*PI* factor the
// renderer inserts, so modes stay in proportion.
export function modal(archetype, material) {
  const a = MATERIAL_ARCHETYPES[archetype];
  const m = MATERIALS[material];
  const f0 = Math.max(FLOOR_HZ, a.hz * m.register);
  // The fundamental decays at least fast enough to fall 40 dB within maxRing.
  const base = Math.max(m.decay * a.ring, 4.6 / a.maxRing);
  const kept = m.ratios.map((r, k) => ({ hz: f0 * r, amp: m.amps[k], rate: base * (1 + m.growth * k) })).filter((x) => x.hz >= FLOOR_HZ && x.hz <= MODE_CEILING_HZ);
  const tone = (hz) => (m.beat ? `(sin(2*PI*${hz.toFixed(2)}*t)+sin(2*PI*${(hz + m.beat).toFixed(2)}*t))*0.5` : `sin(2*PI*${hz.toFixed(2)}*t)`);
  const modes = kept.map((x) => `${tone(x.hz)}*${x.amp}*exp(-${x.rate.toFixed(1)}*t)`);
  const contact = `(${sweptNoise(m.strike.hz, 1.3)})*${(m.strike.level * a.strike).toFixed(3)}*exp(-${m.strike.decay}*t)`;
  const d = Math.min(1.2, Math.max(a.d, 4.6 / base));
  return { d: Number(d.toFixed(3)), expr: `(${modes.join('+')})*(1-exp(-3000*t))*0.5+${contact}`, filter: 'highpass=f=60,lowpass=f=9000' };
}
