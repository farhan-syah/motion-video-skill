import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseSubtitles, parseTimedScript, readScript } from './subtitles.mjs';

test('SRT and WebVTT cues read as timed phrases, markup removed', () => {
  const srt = '1\n00:00:00,500 --> 00:00:02,250\n<i>Korang tahu tak?</i>\n\n2\n00:00:03,000 --> 00:00:05,000\nKuala Lumpur ni\nmaksudnya kuala berlumpur.\n';
  assert.deepEqual(parseSubtitles(srt), [
    { start: 0.5, end: 2.25, text: 'Korang tahu tak?' },
    { start: 3, end: 5, text: 'Kuala Lumpur ni maksudnya kuala berlumpur.' },
  ]);
  const vtt = 'WEBVTT\n\n00:01.000 --> 00:02.500 align:start\n{\\an8}Hello there.\n';
  assert.deepEqual(parseSubtitles(vtt), [{ start: 1, end: 2.5, text: 'Hello there.' }]);
});

test('a subtitle file gives the script text and its phrases, a text file only its text', () => {
  const dir = mkdtempSync(join(tmpdir(), 'subs-'));
  writeFileSync(join(dir, 'a.srt'), '1\n00:00:01,000 --> 00:00:02,000\nOne.\n\n2\n00:00:02,500 --> 00:00:03,000\nTwo.\n');
  writeFileSync(join(dir, 'a.txt'), 'One.\nTwo.\n');
  assert.equal(readScript(join(dir, 'a.srt')).text, 'One. Two.');
  assert.equal(readScript(join(dir, 'a.srt')).phrases.length, 2);
  assert.equal(readScript(join(dir, 'a.txt')).phrases, null);
  rmSync(dir, { recursive: true, force: true });
});

test('a script with rough times, in the forms users write them', () => {
  const script = [
    '0-5s: Korang tahu tak?',
    'Kuala Lumpur ni maksudnya kuala berlumpur.',
    '[00:05] Kat sinilah Sungai Gombak bertemu Sungai Klang.',
    '10 sec - Semuanya bermula tahun 1857.',
    '0:15 | 1880: ibu negeri dipindah.',
    '20s–25s Siapa sangka.',
  ].join('\n');
  assert.deepEqual(parseTimedScript(script), [
    { start: 0, end: 5, text: 'Korang tahu tak?\nKuala Lumpur ni maksudnya kuala berlumpur.' },
    { start: 5, end: null, text: 'Kat sinilah Sungai Gombak bertemu Sungai Klang.' },
    { start: 10, end: null, text: 'Semuanya bermula tahun 1857.' },
    { start: 15, end: null, text: '1880: ibu negeri dipindah.' },
    { start: 20, end: 25, text: 'Siapa sangka.' },
  ]);
});

test('a plain script is not mistaken for a timed one', () => {
  assert.equal(parseTimedScript('5 people came to town.\nThen 3 more.\n1857: the mine opened.\n1880: the capital moved.'), null);
  assert.equal(parseTimedScript('Korang tahu tak?\nKuala Lumpur ni maksudnya kuala berlumpur.'), null);
});
