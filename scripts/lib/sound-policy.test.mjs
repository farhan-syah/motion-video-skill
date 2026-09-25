import assert from 'node:assert/strict';
import { test } from 'node:test';
import { profileSound, sourceMatchThreshold, sourceSimilarity } from './audit.mjs';
import { SR } from './beats.mjs';
import { SOUND_META, SOUNDS, compositeFile, dynamics, placeCues, soundFile, soundLead } from './sfx.mjs';
import { cueSoundErrors, soundProfileErrors } from './sound-policy.mjs';

test('every sound has an intent and a texture class', () => {
  assert.deepEqual(Object.keys(SOUND_META).sort(), Object.keys(SOUNDS).sort());
  for (const meta of Object.values(SOUND_META)) {
    assert.ok(meta.intents.length);
    assert.ok(['noise', 'tone', 'mixed'].includes(meta.texture));
  }
});

test('visible intent must match the selected sound', () => {
  const cues = [{ material: 'paper', intent: 'paper', sound: 'pop', target: 'div#sheet', at: 1200, volume: 1 }];
  assert.match(cueSoundErrors(cues, (cue) => cue.at / 1000)[0].message, /does not match intent "paper"/);
  cues[0].intent = 'appearance';
  assert.match(cueSoundErrors(cues, (cue) => cue.at / 1000)[0].message, /does not match material "paper"/);
  cues[0].sound = 'paper';
  cues[0].intent = 'paper';
  assert.deepEqual(cueSoundErrors(cues, (cue) => cue.at / 1000), []);
  cues[0].intent = null;
  assert.match(cueSoundErrors(cues, (cue) => cue.at / 1000)[0].message, /needs data-sfx-intent/);
});

test('nearby transient effects need an explicit layer', () => {
  const cues = [
    { sound: 'tick', intent: 'checkmark', target: 'div#check', event: 2, volume: 1 },
    { sound: 'snap', intent: 'dock', target: 'div#card', event: 2.05, volume: 1 },
  ];
  assert.match(cueSoundErrors(cues, (cue) => cue.event)[0].message, /starts within 100 ms/);
  cues[1].layer = 'allow';
  assert.deepEqual(cueSoundErrors(cues, (cue) => cue.event), []);
});

test('overlap uses sound placement after an anchor override', () => {
  const cues = [
    { sound: 'click', intent: 'button-press', anchor: 'end', target: 'button#pay', event: 1.085, volume: 1 },
    { sound: 'pop', intent: 'badge', target: 'div#badge', event: 1.02, volume: 1 },
  ];
  assert.match(cueSoundErrors(cues, (cue) => cue.event)[0].message, /starts within 100 ms/);
});

test('every generated effect matches its catalog shape', async () => {
  for (const name of Object.keys(SOUNDS)) {
    const profile = await profileSound(soundFile(name));
    assert.deepEqual(soundProfileErrors(name, profile), [], name);
  }
});

test('the sound shape rule rejects a stale tonal switch source', () => {
  const profile = { duration: 0.12, flatness: 0.02, speakerShare: 0.98 };
  assert.ok(soundProfileErrors('click', profile).length >= 2);
});

test('a sound trimmed at video start keeps its full source for profiling', async () => {
  const [cue] = placeCues([{ sound: 'whoosh', at: 100, volume: 1, target: 'div#camera', intent: 'camera' }], 0, 2);
  assert.notEqual(cue.file, cue.sourceFile);
  assert.deepEqual(soundProfileErrors(cue.sound, await profileSound(cue.sourceFile)), []);
});

test('rendered audio must contain its placed sound', () => {
  const source = Float32Array.from({ length: Math.round(SR * 0.1) }, (_, i) => Math.sin(i * 0.31) * Math.exp(-i / 500));
  const mix = new Float32Array(SR);
  mix.set(source, Math.round(SR * 0.2));
  assert.ok(sourceSimilarity(mix, source, 0.2) > 0.99);
  assert.equal(sourceSimilarity(new Float32Array(SR), source, 0.2), 0);
});

test('unrelated noise cannot pass the source match threshold', () => {
  let state = 0x12345678;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff - 0.5;
  };
  const source = Float32Array.from({ length: Math.round(SR * 0.1) }, random);
  const mix = Float32Array.from({ length: SR }, random);
  assert.ok(sourceSimilarity(mix, source, 0.2) < sourceMatchThreshold(source.length));
});

test('source matching rejects a one-sample overlap at video end', () => {
  const source = new Float32Array(Math.round(SR * 0.1)).fill(0.1);
  const mix = new Float32Array(SR);
  mix[mix.length - 1] = 0.1;
  assert.equal(sourceSimilarity(mix, source, (mix.length - 1) / SR), 0);
});

test('a cued container renders one sound spanning every child landing', async () => {
  const hits = [0, 0.1, 0.22, 0.35];
  const profile = await profileSound(compositeFile('paper', hits));
  assert.ok(Math.abs(profile.duration - (0.35 + SOUNDS.paper.d)) < 0.012, `duration ${profile.duration}`);
  assert.deepEqual(soundProfileErrors('paper', profile, 0.35 + SOUNDS.paper.d), []);
});

test('pitch follows size, except for tuned sounds', async () => {
  const small = await profileSound(soundFile('pop', dynamics('pop', { size: 60 })));
  const large = await profileSound(soundFile('pop', dynamics('pop', { size: 700 })));
  assert.ok(small.centroidHz > large.centroidHz * 1.3, `${small.centroidHz} vs ${large.centroidHz}`);
  assert.equal(dynamics('ding', { size: 60 }).pitch, undefined);
});

test('a swoosh spans its move and crests on the fast stretch', async () => {
  const p = dynamics('swoosh', { moveDur: 0.9, speed: 400 });
  assert.equal(p.dur, 0.9);
  const profile = await profileSound(soundFile('swoosh', p));
  assert.ok(Math.abs(profile.duration - 0.9) < 0.012);
  assert.ok(Math.abs(soundLead('swoosh', 'peak', p) - 0.9 * 0.315) < 1e-9);
  assert.ok(dynamics('swoosh', { moveDur: 0.25, speed: 3000 }).bright > p.bright);
});
