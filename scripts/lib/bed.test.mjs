import assert from 'node:assert/strict';
import { test } from 'node:test';
import { energyPoints } from './arc.mjs';
import { bedSources, planBed, revealTimes } from './bed.mjs';

const scenes = [
  { name: 'a', start: 0, duration: 10, energy: 0.6 },
  { name: 'b', start: 10, duration: 10, energy: 1, curve: [[0, 0.4], [6, 0.4], [6.3, 1], [7, 1], [7.5, 0.5]] },
];
const plan = scenes.map((s) => ({ scene: s.name, start: s.start, end: s.start + s.duration, energy: s.energy, curve: (s.curve ?? [[0, s.energy]]).map(([t, e]) => [s.start + t, e]) }));
const arc = energyPoints(scenes);
const cues = [
  { sound: 'pop', event: 1.2, sourceFile: '/c/pop-v0.wav', target: 'div.a' },
  { sound: 'pop', event: 5.1, sourceFile: '/c/pop-v1.wav', target: 'div.b' },
  { sound: 'snap', event: 8.4, sourceFile: '/c/snap-v0.wav', target: 'div.c', motif: true },
  { sound: 'whoosh', event: 10, sourceFile: '/c/whoosh.wav', target: 'cut into b' },
  { sound: 'boom', event: 17.3, sourceFile: '/c/boom.wav', target: 'div.logo' },
];
const opts = { fragments: 8, level: -18, seed: 7 };
const input = { cues, plan, arc, duration: 20, fadeOut: 0.8 };

test('the bed is built from the motif sound first, and never from sweeps or the payoff', () => {
  assert.deepEqual(bedSources(cues).cues.map((c) => c.sound), ['snap']);
  const noMotif = cues.map((c) => ({ ...c, motif: false }));
  assert.equal(bedSources(noMotif).from, 'most used');
  assert.deepEqual(bedSources(noMotif).cues.map((c) => c.sound), ['pop', 'pop']);
  assert.deepEqual(bedSources(cues.filter((c) => ['whoosh', 'boom'].includes(c.sound))).cues, []);
});

test('one manifest always renders the same bed', () => {
  assert.deepEqual(planBed(input, opts), planBed(input, opts));
  assert.notDeepEqual(planBed(input, opts).fragments, planBed(input, { ...opts, seed: 8 }).fragments);
});

test('fragments stay off hits, clear before reveals, and stay out from under voice', () => {
  const voice = [{ from: 2, to: 4.5 }];
  const reveals = revealTimes(cues, plan);
  assert.deepEqual(reveals, [16.3, 17.3]);
  for (const seed of [1, 2, 3, 4, 5]) {
    const p = planBed({ ...input, voice }, { ...opts, seed });
    for (const f of p.fragments) {
      assert.ok(!cues.some((c) => c.event > f.at - 0.35 && c.event < f.at + 0.5), `fragment at ${f.at} sits on a hit`);
      assert.ok(!reveals.some((r) => f.at > r - 1 && f.at < r + 0.4), `fragment at ${f.at} sits in a reveal`);
      assert.ok(!(f.at > 1.8 && f.at < 4.7), `fragment at ${f.at} sits under voice`);
      assert.ok(f.at + 2.5 < 20 - 0.8, `fragment at ${f.at} runs into the end`);
    }
  }
});
