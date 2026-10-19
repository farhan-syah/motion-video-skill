import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ManifestError, loadManifest, pickScenes, projectOutputs } from './manifest.mjs';

// A project folder holding the given manifests, each with one 2-second scene.
function project(manifests) {
  const root = mkdtempSync(join(tmpdir(), 'mv-manifest-'));
  for (const [name, extra] of Object.entries(manifests)) writeFileSync(join(root, name), JSON.stringify({ scenes: [{ file: 'scenes/01-a.html', duration: 2 }], ...extra }));
  return root;
}

test('--scene takes a name, the number a file name starts with, or a place when names carry none', () => {
  const project = (names) => ({ path: 'video.json', scenes: names.map((name) => ({ name, file: `/p/${name}.html` })) });
  const numbered = project(['00-open', '01-doctor', '02-engines']);
  assert.equal(pickScenes(numbered, '2')[0].name, '02-engines');
  assert.equal(pickScenes(numbered, '0')[0].name, '00-open');
  assert.equal(pickScenes(numbered, '01-doctor')[0].name, '01-doctor');
  assert.throws(() => pickScenes(numbered, '7'), /Use a scene number or name/);
  assert.equal(pickScenes(project(['intro', 'engines']), '2')[0].name, 'engines');
});

test('outDir defaults to out, and output defaults to video.mp4 inside it', (t) => {
  const root = project({ 'video.json': {} });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const m = loadManifest(join(root, 'video.json'));
  assert.equal(m.outDir, join(root, 'out'));
  assert.equal(m.output, join(root, 'out', 'video.mp4'));
});

test('a custom outDir holds the default output, and an explicit output keeps its own path', (t) => {
  const root = project({ 'video.json': { outDir: 'renders/b' }, 'video-c.json': { outDir: 'out-c', output: 'final/c.mp4' } });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const b = loadManifest(join(root, 'video.json'));
  assert.equal(b.outDir, join(root, 'renders', 'b'));
  assert.equal(b.output, join(root, 'renders', 'b', 'video.mp4'));
  const c = loadManifest(join(root, 'video-c.json'));
  assert.equal(c.outDir, join(root, 'out-c'));
  assert.equal(c.output, join(root, 'final', 'c.mp4'));
});

test('"bars" reads beats.json from the manifest outDir', (t) => {
  const root = project({ 'video.json': { outDir: 'out-b', scenes: [{ file: 'scenes/01-a.html', bars: 2 }] } });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.throws(() => loadManifest(join(root, 'video.json')), new RegExp(`${join(root, 'out-b', 'beats.json').replace(/[.\\]/g, '\\$&')} does not exist`));
  mkdirSync(join(root, 'out-b'));
  writeFileSync(join(root, 'out-b', 'beats.json'), JSON.stringify({ beat: 0.5 }));
  assert.equal(loadManifest(join(root, 'video.json')).totalDuration, 4);
});

test('outDir must be a non-empty relative path inside the project directory', (t) => {
  const root = project({});
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const bad of ['', '  ', 3, null, '/tmp/out', '..', '../out', 'a/../../out', '.', 'a/..']) {
    writeFileSync(join(root, 'video.json'), JSON.stringify({ outDir: bad, scenes: [{ file: 'a.html', duration: 1 }] }));
    // null means the field is absent: the default applies.
    if (bad === null) {
      assert.equal(loadManifest(join(root, 'video.json')).outDir, join(root, 'out'));
      continue;
    }
    assert.throws(() => loadManifest(join(root, 'video.json')), (e) => e instanceof ManifestError && /"outDir"/.test(e.message) && /relative folder inside the project directory/.test(e.message), `outDir ${JSON.stringify(bad)}`);
  }
});

test('projectOutputs lists every manifest, its outDir and its output files, and skips other JSON', (t) => {
  const root = project({ 'video.json': {}, 'video-b.json': { outDir: 'out-b', output: 'final/b.mp4' }, 'video-bad.json': { outDir: '../x' } });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x' }));
  writeFileSync(join(root, 'broken.json'), '{');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const p = projectOutputs(root);
  assert.deepEqual([...p.manifests].sort(), ['video-b.json', 'video-bad.json', 'video.json'].map((f) => join(root, f)));
  assert.deepEqual([...p.outDirs].sort(), [join(root, 'out'), join(root, 'out-b')]);
  for (const f of ['final/b.mp4', 'final/b.no-bed.mp4', 'final/b-compressed.mp4', 'final/thumbnail.png', 'out/video.mp4']) assert.ok(p.files.has(join(root, f)), f);
});
