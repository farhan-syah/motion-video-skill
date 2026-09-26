import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chunks, command, PAUSES, phrases, spoken } from './speak.mjs';

test('a script paces itself: breaths at line breaks, beats at blank lines, exact [pause] marks', () => {
  const script = 'Tahu tak?\nKL ni maksudnya kuala berlumpur. [pause] Betul.\n\nIt runs 13.5 km. [pause 1.2]\nEnd.';
  assert.deepEqual(phrases(script), [
    { text: 'Tahu tak?', pause: PAUSES.line, kind: 'line' },
    { text: 'KL ni maksudnya kuala berlumpur.', pause: PAUSES.mark, kind: 'mark' },
    { text: 'Betul.', pause: PAUSES.beat, kind: 'beat' },
    { text: 'It runs 13.5 km.', pause: 1.2, kind: 'mark' },
    { text: 'End.', pause: 0, kind: 'end' },
  ]);
  assert.equal(spoken(script), 'Tahu tak? KL ni maksudnya kuala berlumpur. Betul. It runs 13.5 km. End.');
});

test('VoxCPM2 speaks a beat at a time: blank lines and marks split, long beats split at a sentence end', () => {
  const script = 'You ask for a video.\nIt runs doctor first.\n\nIt checks the machine. Then it reports. [pause 0.45] Ready.';
  const c = chunks(script);
  assert.deepEqual(c.map((x) => [x.text, x.pause]), [
    ['You ask for a video. It runs doctor first.', PAUSES.beat],
    ['It checks the machine. Then it reports.', 0.45],
    ['Ready.', 0],
  ]);
  assert.equal(c[0].sentences.length, 2);
  // A timed script keeps each line apart.
  assert.equal(chunks('One line here.\nAnother line.', { lines: true }).length, 2);
  // A beat past the word cap splits at a sentence end, never inside one.
  const long = chunks('One two three four five. Six seven eight nine ten. Eleven twelve.', { max: 10 });
  assert.deepEqual(long.map((x) => x.text), ['One two three four five. Six seven eight nine ten.', 'Eleven twelve.']);
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
  // A consonant burst: 12 ms of loud noise, as sharp as a click but far wider. Speech, not a glitch.
  const burst = voice(1.2);
  let seed = 1;
  for (let k = 0; k < 576; k++) burst[30000 + k] += 0.5 * (((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1);
  assert.deepEqual(clicks(tidy(burst).samples), []);
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

test('non-verbal tags reach VoxCPM2 but never captions or checks', async () => {
  const { withoutTags } = await import('./speak.mjs');
  const script = '[sigh] It failed again.\n[pause 0.5] Then it worked. [laughing]';
  assert.equal(spoken(script), 'It failed again. Then it worked.');
  assert.equal(withoutTags(script), 'It failed again.\n[pause 0.5] Then it worked.');
  assert.match(chunks(script)[0].text, /\[sigh\]/);
});

test('a delivery note covers its own line as one generation, and is never spoken', () => {
  const script = 'Rain falls on the hills. Then it runs downhill.\n(curious tone, rising intonation) Where does the water go?\nMost of it sinks into the ground.\nSome reaches the river.\n\nThe river runs to the sea.';
  const c = chunks(script);
  assert.deepEqual(c.map((x) => [x.text, x.delivery ?? null]), [
    ['Rain falls on the hills. Then it runs downhill.', null],
    ['Where does the water go?', '(curious tone, rising intonation)'],
    ['Most of it sinks into the ground. Some reaches the river.', null],
    ['The river runs to the sea.', null],
  ]);
  assert.equal(spoken(script), 'Rain falls on the hills. Then it runs downhill. Where does the water go? Most of it sinks into the ground. Some reaches the river. The river runs to the sea.');
  assert.ok(phrases(script).every((p) => !p.text.includes('(')));
});

test('de-essing turns down a harsh "s" and leaves the rest untouched', async () => {
  const { deEss } = await import('./speak.mjs');
  const rate = 48000;
  const band = (x, lo, hi) => {
    // Energy near one frequency, by correlation with a sine and cosine.
    const f = (lo + hi) / 2;
    let c = 0;
    let s = 0;
    for (let i = 0; i < x.length; i++) {
      c += x[i] * Math.cos((2 * Math.PI * f * i) / rate);
      s += x[i] * Math.sin((2 * Math.PI * f * i) / rate);
    }
    return Math.hypot(c, s);
  };
  // A vowel: 200 Hz for 2 s. Then an "s": 7 kHz, far louder than the vowel, for 0.2 s.
  const x = new Float32Array(Math.round(2.4 * rate));
  for (let i = 0; i < 2 * rate; i++) x[i] = 0.3 * Math.sin((2 * Math.PI * 200 * i) / rate);
  for (let i = 2.1 * rate; i < 2.3 * rate; i++) x[i] = 0.6 * Math.sin((2 * Math.PI * 7000 * i) / rate);
  const y = deEss(x);
  const s = (a) => band(a.subarray(2.12 * rate, 2.28 * rate), 7000, 7000);
  const v = (a) => band(a.subarray(0.5 * rate, 1.5 * rate), 200, 200);
  assert.ok(s(y) < s(x) * 0.5, 'the "s" is turned down by more than 6 dB');
  assert.ok(Math.abs(v(y) / v(x) - 1) < 0.01, 'the vowel passes untouched');
});

test('a word can be written one way and said another', async () => {
  const { say, sayable } = await import('./speak.mjs');
  const script = 'With {uv|U V} installed, {VoxCPM2|Vox C P M two} is the default.\nRun it with {--command|dash dash command}.';
  assert.equal(spoken(script), 'With uv installed, VoxCPM2 is the default. Run it with --command.');
  assert.equal(sayable(script), 'With U V installed, Vox C P M two is the default. Run it with dash dash command.');
  assert.equal(say(chunks(script)[0].text), 'With U V installed, Vox C P M two is the default. Run it with dash dash command.');
});

test('pitch tracking reads a voice, and a pitch swing counts as heat', async () => {
  const { pitches, heat, medianPitch } = await import('./speak.mjs');
  const rate = 48000;
  const tone = (hz, seconds) => Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => 0.3 * Math.sin((2 * Math.PI * hz * i) / rate));
  const p = pitches(tone(150, 1));
  assert.ok(p.length > 10 && Math.abs(medianPitch(tone(150, 1)) - 150) < 5);
  // A part that climbs from the voice's pitch to twice it is heated. One that stays near it is not.
  const climb = new Float32Array(rate);
  climb.set(tone(150, 0.5));
  climb.set(tone(300, 0.5), rate / 2);
  assert.ok(heat(climb, 150) > 1.6);
  assert.ok(heat(tone(160, 1), 150) < 1.2);
});

test('a pause where the script has no break is flagged, one at punctuation is not', async () => {
  const { strayPauses } = await import('./speak.mjs');
  const { alignScript } = await import('./voice.mjs');
  const at = (list) => list.map(([text, start, end]) => ({ text, start, end }));
  const heard = at([['Speech', 0, 0.3], ['recognition', 0.3, 0.8], ['times', 0.8, 1.1], ['each', 1.7, 1.9], ['word.', 1.9, 2.2], ['Captions', 3.0, 3.4], ['follow.', 3.4, 3.8]]);
  const p = strayPauses(heard, 'Speech recognition times each word. Captions follow.', alignScript);
  assert.deepEqual(p, [{ after: 'times', before: 'each', gap: 0.6 }]);
});

test('the script review flags what a voice is likely to misread', async () => {
  const { review } = await import('./speak.mjs');
  const script = 'Run it with --command and save video.mp4\nVoxCPM2 speaks thirty languages. {VoxCPM2|Vox C P M two} is ready.\nThis sentence keeps going on and on without a single pause mark so the voice has to guess where to breathe in it.';
  const notes = review(script).map((r) => [r.line, r.text]);
  assert.deepEqual(notes, [
    [1, '--command'],
    [1, 'video.mp4'],
    [1, 'and save video.mp4'],
    [2, 'VoxCPM2'],
    [3, 'This sentence keeps going on and…'],
  ]);
  assert.deepEqual(review('Tiga puluh bahasa. Harga 25 ringgit.', { language: 'ms' }).map((r) => r.text), ['25']);
});
