import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickScenes } from './manifest.mjs';

test('--scene takes a name, the number a file name starts with, or a place when names carry none', () => {
  const project = (names) => ({ path: 'video.json', scenes: names.map((name) => ({ name, file: `/p/${name}.html` })) });
  const numbered = project(['00-open', '01-doctor', '02-engines']);
  assert.equal(pickScenes(numbered, '2')[0].name, '02-engines');
  assert.equal(pickScenes(numbered, '0')[0].name, '00-open');
  assert.equal(pickScenes(numbered, '01-doctor')[0].name, '01-doctor');
  assert.throws(() => pickScenes(numbered, '7'), /Use a scene number or name/);
  assert.equal(pickScenes(project(['intro', 'engines']), '2')[0].name, 'engines');
});
