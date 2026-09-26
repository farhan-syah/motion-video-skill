import assert from 'node:assert/strict';
import { test } from 'node:test';
import { command, PAUSES, phrases, spoken } from './speak.mjs';

test('a script paces itself: breaths at line breaks, beats at blank lines, exact [pause] marks', () => {
  const script = 'Tahu tak?\nKL ni maksudnya kuala berlumpur. [pause] Betul.\n\nIt runs 13.5 km. [pause 1.2]\nEnd.';
  assert.deepEqual(phrases(script), [
    { text: 'Tahu tak?', pause: PAUSES.line },
    { text: 'KL ni maksudnya kuala berlumpur.', pause: PAUSES.mark },
    { text: 'Betul.', pause: PAUSES.beat },
    { text: 'It runs 13.5 km.', pause: 1.2 },
    { text: 'End.', pause: 0 },
  ]);
  assert.equal(spoken(script), 'Tahu tak? KL ni maksudnya kuala berlumpur. Betul. It runs 13.5 km. End.');
});

// A voiced sound: a 150 Hz tone with a soft attack and release, like a spoken syllable.
const voice = (seconds, rate = 48000) => {
  const x = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < x.length; i++) {
    const env = Math.min(1, i / (0.03 * rate), (x.length - i) / (0.03 * rate));
    x[i] = 0.4 * env * Math.sin((2 * Math.PI * 150 * i) / rate);
  }
  return x;
};

test('a clean take passes, and a click, a thump or a cut-off end is caught', async () => {
  const { tidy, clicks } = await import('./speak.mjs');
  const clean = voice(1.2);
  assert.deepEqual(tidy(clean).faults, []);
  assert.deepEqual(clicks(tidy(clean).samples), []);
  const clicked = voice(1.2);
  clicked[30000] += 0.8;
  assert.equal(clicks(tidy(clicked).samples).length, 1);
  const thumped = new Float32Array(48000 * 1.5);
  thumped.set(voice(0.05), 0);
  thumped.set(voice(1.2), Math.round(0.1 * 48000));
  assert.match(tidy(thumped).faults.join(), /thump before the speech/);
  const cut = voice(1.2).subarray(0, 48000);
  assert.match(tidy(cut).faults.join(), /cut off/);
});

test('a TTS command speaks each phrase, joined with the script pauses', () => {
  // A stand-in TTS: a tone whose length follows the text, written to {out} as MP3.
  const tone = 'ffmpeg -loglevel error -f lavfi -i "sine=d=$(( $(wc -c < {text_file}) / 10 ))" -y -f mp3 {out}';
  const r = command('One two three four five six.\n\nSeven eight nine ten eleven twelve.', { command: tone });
  assert.equal(r.phrases.length, 2);
  assert.equal(r.phrases[0].start, 0);
  assert.ok(Math.abs(r.phrases[0].end - 2) < 0.1);
  assert.ok(Math.abs(r.phrases[1].start - (r.phrases[0].end + PAUSES.beat)) < 0.01);
  const once = command('One two. [pause 2] Three.', { command: tone, oneCall: true });
  assert.equal(once.phrases, undefined);
});
