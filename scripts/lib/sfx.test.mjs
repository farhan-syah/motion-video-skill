import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SR, decode } from './beats.mjs';
import { dynamics, recipe, soundFile } from './sfx.mjs';

test('a slide pans the way it travels, and stays centered when it barely moves sideways', () => {
  assert.equal(dynamics('swoosh', { dx: 300, distance: 320, moveDur: 0.4, speed: 800 }).dir, 1);
  assert.equal(dynamics('swoosh', { dx: -300, distance: 320, moveDur: 0.4, speed: 800 }).dir, -1);
  assert.equal(dynamics('whoosh', { dx: 20, distance: 400, moveDur: 0.6, speed: 700 }).dir, 0);
  const [left, right] = recipe('swoosh', { dur: 0.4, dir: -1 }).expr.split('|');
  assert.match(left, /\(0\.30\+0\.7\*t\/0\.4\)$/, 'right to left: the left channel grows');
  assert.match(right, /\(1-0\.7\*t\/0\.4\)$/, 'right to left: the right channel fades');
  const [cl, cr] = recipe('swoosh', { dur: 0.4, dir: 0 }).expr.split('|');
  assert.ok(cl.endsWith('*0.65') && cr.endsWith('*0.65'));
});

test('a slide crests on its measured fastest frame', async () => {
  const p = dynamics('swoosh', { dx: 300, distance: 300, moveDur: 0.5, speed: 600, crest: 0.62 });
  assert.equal(p.crest, 0.6);
  assert.ok(Math.abs(recipe('swoosh', p).peak - 0.3) < 1e-9);
  const x = await decode(soundFile('swoosh', p));
  const win = Math.round(0.02 * SR);
  let best = 0;
  let at = 0;
  for (let i = 0; i + win < x.length; i += win / 2) {
    let e = 0;
    for (let k = i; k < i + win; k++) e += x[k] * x[k];
    if (e > best) [best, at] = [e, (i + win / 2) / SR];
  }
  assert.ok(Math.abs(at - 0.3) < 0.06, `loudest at ${at.toFixed(3)}s, want about 0.3s`);
});

test('variants differ in more than pitch, and each renders its own file', () => {
  const files = [0, 1, 2, 3].map((v) => soundFile('pop', { variant: v }));
  assert.equal(new Set(files).size, 4);
  assert.throws(() => soundFile('pop', { variant: 1.5 }), /must be 0-3/);
});
