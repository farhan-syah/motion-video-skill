import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { profileSound } from './audit.mjs';
import { MATERIAL_AWARE, MATERIALS, SOUND_META, SOUNDS, collectCues, cueSound, placeCues, recipe, soundFile } from './sfx.mjs';
import { cueSoundErrors, soundProfileErrors } from './sound-policy.mjs';

test('every material-aware contact keeps its shape in every material', async () => {
  for (const name of MATERIAL_AWARE) {
    for (const material of Object.keys(MATERIALS)) {
      const profile = await profileSound(soundFile(name, { material }));
      assert.deepEqual(soundProfileErrors(name, profile, recipe(name, {}, { material }).d, { struck: material }), [], `${name} on ${material}`);
    }
  }
});

test('a material recolors contacts only, and the palette fills in when a cue names none', () => {
  assert.notEqual(soundFile('tap', { material: 'wood' }), soundFile('tap', { material: 'glass' }));
  assert.equal(recipe('whoosh', {}, { material: 'metal' }).material, undefined);
  assert.throws(() => recipe('tap', {}, { material: 'velvet' }), /Unknown material "velvet"/);
  const cue = { sound: 'tap', at: 100, volume: 1, target: 'div#key', intent: 'touch' };
  assert.equal(placeCues([cue], 0, 2, { palette: 'wood' })[0].struck, 'wood');
  assert.equal(placeCues([{ ...cue, material: 'glass' }], 0, 2, { palette: 'wood' })[0].struck, 'glass');
  assert.equal(placeCues([cue], 0, 2)[0].struck, null);
  assert.equal(placeCues([{ ...cue, sound: 'sting', intent: 'chime' }], 0, 2, { palette: 'wood' })[0].struck, null, 'a sound materials do not change is never struck');
});

test('a struck material is a timbre, not an intent; paper stays both', () => {
  const wood = [{ sound: 'thud', intent: 'soft-impact', material: 'wood', target: 'div#box', at: 500, volume: 1 }];
  assert.deepEqual(cueSoundErrors(wood, (c) => c.at / 1000), []);
  const paper = [{ sound: 'thud', intent: 'soft-impact', material: 'paper', target: 'div#sheet', at: 500, volume: 1 }];
  assert.match(cueSoundErrors(paper, (c) => c.at / 1000)[0].message, /does not match material "paper"/);
});

test('the page-side cue reader knows every material', () => {
  const src = collectCues.toString();
  // Bun prints a function's source with double quotes, Node as written: either quote counts.
  for (const m of Object.keys(MATERIALS)) assert.ok(src.includes(`'${m}'`) || src.includes(`"${m}"`), `collectCues does not list material "${m}"`);
});

test('every sound in the catalog carries a listener description for the review', () => {
  for (const name of Object.keys(SOUNDS)) assert.ok(typeof SOUND_META[name].says === 'string' && SOUND_META[name].says.length > 8, name);
});

test('a user file stands in for a recipe, level-matched, and lands its loudest moment on a peak anchor', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mv-src-'));
  const file = join(dir, 'hero.wav');
  // 0.3 s of quiet, then a loud 0.2 s burst: the peak sits near 0.4 s.
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', "aevalsrc='sin(2*PI*300*t)*if(gte(t,0.3),0.8,0.05)':s=48000:d=0.6", file]);
  assert.equal(r.status, 0, r.stderr?.toString());
  const snd = cueSound({ sound: 'boom', src: file });
  assert.ok(Math.abs(snd.d - 0.6) < 0.01, `duration ${snd.d}`);
  assert.ok(snd.peak > 0.3 && snd.peak < 0.6, `peak ${snd.peak}`);
  const [placed] = placeCues([{ sound: 'boom', src: file, anchor: 'peak', at: 1000, volume: 1, target: 'div#logo', intent: 'deep-impact' }], 0, 3);
  assert.ok(Math.abs(placed.at - (1 - snd.peak)) < 1e-6);
  assert.equal(placed.src, file);
  assert.throws(() => cueSound({ sound: 'boom', src: join(dir, 'missing.wav') }), /does not exist/);
});

test('every catalog sound has an audit sync class, except typing, which is a texture', async () => {
  const { classOf } = await import('./audit.mjs');
  for (const name of Object.keys(SOUNDS)) if (name !== 'type') assert.ok(classOf(name), `"${name}" has no sync class in audit.mjs`);
});
