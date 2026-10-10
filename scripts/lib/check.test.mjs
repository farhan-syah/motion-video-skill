import assert from 'node:assert/strict';
import { test } from 'node:test';
import { entranceProgress } from './check.mjs';

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
