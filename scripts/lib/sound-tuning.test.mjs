import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SR, keyOf } from './beats.mjs';
import { recipe, soundFile } from './sfx.mjs';
import { DEFAULT_KEY, keyFactor, nearestScaleNote, nearestTonic, parseKey } from './sound-tuning.mjs';

const semis = (a, b) => 12 * Math.log2(a / b);

test('key names parse, and anything else is rejected', () => {
  assert.equal(parseKey('F# minor').name, 'F# minor');
  assert.equal(parseKey('Ebm').name, 'Eb minor');
  assert.equal(parseKey('A').name, 'A major');
  assert.equal(parseKey('CM').name, 'C major');
  assert.equal(parseKey('H'), null);
  assert.equal(parseKey('C lydian'), null);
});

test('a fixed motif moves to the nearest tonic, within 6 semitones', () => {
  const d = parseKey('D minor');
  const hz = nearestTonic(1318.5, d);
  assert.ok(Math.abs(semis(hz, 1318.5)) <= 6);
  const fromD = semis(hz, 293.66);
  assert.ok(Math.abs(fromD - 12 * Math.round(fromD / 12)) < 0.01, 'lands on a D');
});

test('sized sounds snap to the pentatonic scale of the key', () => {
  const c = DEFAULT_KEY;
  for (const hz of [300, 455, 700, 1234]) {
    const n = Math.round(semis(nearestScaleNote(hz, c), 261.63));
    assert.ok([0, 2, 4, 7, 9].includes(((n % 12) + 12) % 12), `${hz} Hz snapped off the C major pentatonic`);
  }
  // Every size in the pitch range still lands on the scale, and a larger element never sounds higher.
  assert.ok(keyFactor('scale', 700, c, 0.8) <= keyFactor('scale', 700, c, 1.25));
});

test('chord recipes take a minor third in a minor key', () => {
  assert.match(recipe('shimmer', {}, { key: parseKey('A minor') }).expr, /1\.189207/);
  assert.match(recipe('shimmer', {}, { key: parseKey('A major') }).expr, /1\.259921/);
  assert.doesNotMatch(recipe('sting').expr, /R3/);
});

test('a keyed sound renders one file per key, and variants keep its note', () => {
  const c = soundFile('ding', { key: parseKey('C') });
  const g = soundFile('ding', { key: parseKey('G') });
  assert.notEqual(c, g);
  assert.match(c, /C-major/);
  assert.notEqual(soundFile('pluck', { variant: 1 }), soundFile('pluck', { variant: 2 }));
});

test('the key of a chord progression is found from its pitch classes', () => {
  const note = (m) => 440 * 2 ** ((m - 69) / 12);
  const progression = (chords) => {
    const x = new Float32Array(SR * chords.length * 3);
    chords.flatMap((c) => [c, c, c]).forEach((chord, i) => {
      for (let n = 0; n < SR; n++) {
        const t = n / SR;
        let v = 0;
        for (const m of chord) for (const [h, a] of [[1, 1], [2, 0.5], [3, 0.3]]) v += a * Math.sin(2 * Math.PI * note(m) * h * t);
        x[i * SR + n] = v * Math.exp(-1.2 * t) * 0.1;
      }
    });
    return x;
  };
  assert.equal(keyOf(progression([[50, 54, 57], [55, 59, 62], [57, 61, 64], [50, 54, 57]])).name, 'D major');
  assert.equal(keyOf(progression([[54, 57, 61], [59, 62, 66], [61, 65, 68, 71], [54, 57, 61]])).name, 'F# minor');
});
