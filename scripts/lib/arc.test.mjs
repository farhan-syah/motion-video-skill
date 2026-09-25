import assert from 'node:assert/strict';
import { test } from 'node:test';
import { energyAt, energyPoints, gainOf, toneOf } from './arc.mjs';
import { auditArc, energyTurns, rankCorrelation } from './audit.mjs';
import { SR } from './beats.mjs';

const scenes = [
  { name: 'a', start: 0, duration: 3, energy: 0.7 },
  { name: 'b', start: 3, duration: 4, energy: 0.4 },
  { name: 'c', start: 7, duration: 3, energy: 1 },
];

test('energy holds within a scene and ramps across each cut', () => {
  const p = energyPoints(scenes);
  assert.equal(energyAt(p, 1.5), 0.7);
  assert.equal(energyAt(p, 5), 0.4);
  const mid = energyAt(p, 3);
  assert.ok(mid < 0.7 && mid > 0.4, `cut midpoint ${mid}`);
  assert.ok(gainOf(1) > gainOf(0.6) && gainOf(0.6) > gainOf(0.3));
});

// A 10 s signal: a tone burst per scene at the given amplitudes, with optional hard edges.
function signal(amps, { hardStart = false, hardEnd = false } = {}) {
  const x = new Float32Array(10 * SR);
  const bounds = [[0, 3], [3, 7], [7, 10]];
  bounds.forEach(([a, b], i) => {
    for (let t = a + 1; t < a + 1.5 && t < b; t += 1 / SR) x[Math.floor(t * SR)] = amps[i] * Math.sin(2 * Math.PI * 440 * t);
  });
  const edge = Math.round(0.05 * SR);
  if (hardStart) for (let i = 0; i < edge; i++) x[i] = 0.5 * Math.sin(i * 0.1);
  if (hardEnd) for (let i = x.length - edge; i < x.length; i++) x[i] = 0.5 * Math.sin(i * 0.1);
  return x;
}
const plan = scenes.map((s) => ({ scene: s.name, start: s.start, end: s.start + s.duration, energy: s.energy }));

test('loudness that follows the plan passes; the reverse order warns', () => {
  const good = auditArc({ plan, cues: [] }, signal([0.3, 0.1, 0.6]), 10);
  assert.deepEqual(good.findings, []);
  const bad = auditArc({ plan, cues: [] }, signal([0.6, 0.6, 0.05]), 10);
  assert.ok(bad.findings.some((f) => f.level === 'warn' && /peak-energy scene/.test(f.msg)));
  assert.ok(rankCorrelation([0.7, 0.4, 1], [3, 1, 2]) < rankCorrelation([0.7, 0.4, 1], [2, 1, 3]));
});

test('a hard start or end fails', () => {
  const r = auditArc({ plan, cues: [] }, signal([0.3, 0.1, 0.6], { hardStart: true, hardEnd: true }), 10);
  assert.ok(r.findings.some((f) => f.level === 'fail' && /starts on a hard edge/.test(f.msg)));
  assert.ok(r.findings.some((f) => f.level === 'fail' && /stops on a hard edge/.test(f.msg)));
});

test('an effect cut off by the end of the video fails', () => {
  const cues = [{ sound: 'ding', event: 9.5, start: 9.5, d: 1.4 }];
  const r = auditArc({ plan, cues }, signal([0.3, 0.1, 0.6]), 10);
  assert.ok(r.findings.some((f) => f.level === 'fail' && /past the end of the video/.test(f.msg)));
});

test('an energy curve shapes a scene: tease, hit, drop, hit', () => {
  const curved = [
    { name: 'a', start: 0, duration: 3, energy: 0.7 },
    { name: 'b', start: 3, duration: 4, energy: 1, curve: [[0, 0.3], [1.8, 0.3], [2, 1], [2.6, 0.2], [3.4, 0.9]] },
  ];
  const p = energyPoints(curved);
  assert.equal(energyAt(p, 4), 0.3);
  assert.equal(energyAt(p, 5), 1);
  assert.ok(Math.abs(energyAt(p, 5.6) - 0.2) < 1e-9);
  assert.ok(toneOf(1) > 0 && toneOf(0.3) < 0);
  const turns = energyTurns([[3, 0.3], [4.8, 0.3], [5, 1], [5.6, 0.2], [6.4, 0.9]], 3, 7);
  assert.deepEqual(turns.map((x) => x.kind), ['trough', 'peak', 'trough', 'peak']);
});

test('a planned hit that is not louder than the tease before it warns', () => {
  const curve = [[0, 0.3], [1.5, 0.3], [1.7, 1], [2.5, 1], [2.7, 0.2], [4, 0.2]];
  const plan1 = [{ scene: 'x', start: 0, end: 4, energy: 1, curve }];
  const x = (amp) => {
    const s = new Float32Array(4 * SR);
    for (let i = 0; i < 1.2 * SR; i++) s[Math.floor(0.2 * SR) + i] = 0.2 * Math.sin(i * 0.06);
    for (let i = 0; i < 0.5 * SR; i++) s[Math.floor(1.8 * SR) + i] = amp * Math.sin(i * 0.06);
    return s;
  };
  assert.ok(!auditArc({ plan: plan1, cues: [] }, x(0.6), 4).findings.some((f) => /peak/.test(f.msg)));
  assert.ok(auditArc({ plan: plan1, cues: [] }, x(0.2), 4).findings.some((f) => /only .* dB over/.test(f.msg)));
});
