import assert from 'node:assert/strict';
import { test } from 'node:test';
import { entranceProgress, screenDrift } from './check.mjs';

const SCENE = 4000;

test('an entrance started 0.2 s early is a quarter through at frame 0', () => {
  assert.equal(entranceProgress({ delay: -200, activeDuration: 800, localTime: 0 }, SCENE), 0.25);
});

test('an entrance started a full entrance early is at rest at frame 0', () => {
  assert.equal(entranceProgress({ delay: -800, activeDuration: 800, localTime: 0 }, SCENE), null);
  assert.equal(entranceProgress({ delay: -1200, activeDuration: 1200, localTime: 0 }, SCENE), null, 'a custom --in-dur');
});

test('a stagger step keeps a full-early entrance running', () => {
  // --t: -0.8s plus --i: 2 at 0.09 s a step.
  const p = entranceProgress({ delay: -800 + 180, activeDuration: 800, localTime: 0 }, SCENE);
  assert.ok(Math.abs(p - 0.775) < 1e-9);
});

test('an entrance that has not started, an infinite loop and a scene-long move are not running', () => {
  assert.equal(entranceProgress({ delay: 0, activeDuration: 800, localTime: 0 }, SCENE), null);
  assert.equal(entranceProgress({ delay: 300, activeDuration: 800, localTime: 0 }, SCENE), null);
  assert.equal(entranceProgress({ delay: 0, activeDuration: Infinity, localTime: 100 }, SCENE), null);
  assert.equal(entranceProgress({ delay: -100, activeDuration: SCENE, localTime: 0 }, SCENE), null);
  assert.equal(entranceProgress({ delay: 0, activeDuration: 800, localTime: null }, SCENE), null);
});

test('a box that holds still has no drift', () => {
  const box = { l: 100, t: 800, w: 400, h: 60 };
  assert.deepEqual(screenDrift([box, { ...box }, { ...box }]), { move: 0, grow: 0 });
});

test('drift is the largest center move and width change from the first box', () => {
  const first = { l: 100, t: 100, w: 200, h: 50 };
  // A 4% push about the frame center moves and widens the box.
  const pushed = { l: 96, t: 98, w: 208, h: 52 };
  const panned = { l: 130, t: 140, w: 200, h: 50 };
  const { move, grow } = screenDrift([first, pushed, panned]);
  assert.equal(move, 50);
  assert.ok(Math.abs(grow - 0.04) < 1e-9);
});
