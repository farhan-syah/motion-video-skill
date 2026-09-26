import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alignScript, checkSpeech, findPhrase } from './voice.mjs';

const words = [
  { text: 'iscribe', start: 0.5, end: 1.0 },
  { text: 'the', start: 1.0, end: 1.2 },
  { text: 'video', start: 1.2, end: 1.5 },
  { text: 'you', start: 1.5, end: 1.7 },
  { text: 'want.', start: 1.7, end: 2.0 },
  { text: 'Your', start: 2.4, end: 2.6 },
  { text: 'agent', start: 2.6, end: 2.9 },
  { text: 'directs', start: 2.9, end: 3.3 },
  { text: 'it.', start: 3.3, end: 3.5 },
  { text: 'Your', start: 8.0, end: 8.2 },
  { text: 'agent', start: 8.2, end: 8.5 },
];

test('a phrase matches the spoken words, ignoring case and punctuation', () => {
  assert.deepEqual(findPhrase(words, 'Your agent directs it!'), { start: 2.4, end: 3.5, score: 1 });
});

test('a word the recognizer spelled slightly wrong still matches', () => {
  const hit = findPhrase(words, 'Describe the video you want');
  assert.equal(hit.start, 0.5);
  assert.equal(hit.end, 2.0);
});

test('a phrase that is not spoken finds nothing', () => {
  assert.equal(findPhrase(words, 'Render it in the cloud'), null);
});

test('a repeated phrase resolves to the occurrence nearest the scene', () => {
  assert.equal(findPhrase(words, 'your agent', 7.5).start, 8.0);
  assert.equal(findPhrase(words, 'your agent', 2).start, 2.4);
});

test('a known script replaces misheard words and fills dropped ones between their neighbors', () => {
  const heard = [
    { text: 'iscribe', start: 0.5, end: 1.0 },
    { text: 'the', start: 1.0, end: 1.2 },
    { text: 'VIDEO', start: 1.2, end: 1.5 },
    { text: 'want', start: 1.7, end: 2.0 },
  ];
  assert.deepEqual(alignScript(heard, 'Describe the video you want.'), [
    { text: 'Describe', start: 0.5, end: 1.0 },
    { text: 'the', start: 1.0, end: 1.2 },
    { text: 'video', start: 1.2, end: 1.5 },
    { text: 'you', start: 1.5, end: 1.7 },
    { text: 'want.', start: 1.7, end: 2.0 },
  ]);
});

test('numbers match only exactly: 1985 is not 1982', () => {
  const years = [
    { text: 'in', start: 1, end: 1.2 },
    { text: '1982', start: 1.2, end: 2 },
    { text: 'then', start: 5, end: 5.3 },
    { text: '1985', start: 5.3, end: 6 },
  ];
  assert.equal(findPhrase(years, '1985').start, 5.3);
  assert.equal(findPhrase(years, '1990'), null);
});

test('a number spoken as words shares the time of the digits the recognizer wrote', () => {
  const heard = [
    { text: 'Pada', start: 6.2, end: 6.5 },
    { text: 'tahun', start: 6.5, end: 7.0 },
    { text: '1857,', start: 7.08, end: 7.97 },
    { text: 'Raja', start: 8.2, end: 8.5 },
  ];
  const out = alignScript(heard, 'Pada tahun lapan belas lima puluh tujuh, Raja');
  const num = out.slice(2, 7);
  assert.equal(num[0].start, 7.08);
  assert.equal(num[4].end, 7.97);
  for (const w of num) assert.ok(w.end - w.start > 0.1, `${w.text} has a real span`);
  assert.equal(out[7].start, 8.2);
});

test('a take with babble after its sentence fails, and a clean take with digits passes', () => {
  const clean = [
    { text: 'Pada', start: 0, end: 0.3 },
    { text: 'tahun', start: 0.3, end: 0.6 },
    { text: '1857,', start: 0.6, end: 1.5 },
    { text: 'Raja', start: 1.6, end: 1.9 },
    { text: 'Abdullah.', start: 1.9, end: 2.4 },
  ];
  const sentence = 'Pada tahun lapan belas lima puluh tujuh, Raja Abdullah.';
  assert.equal(checkSpeech(clean, sentence).ok, true);
  const babble = [...clean, { text: 'marbulan', start: 2.6, end: 3.1 }, { text: 'nambar', start: 3.1, end: 3.6 }];
  const r = checkSpeech(babble, sentence);
  assert.equal(r.ok, false);
  assert.match(r.why, /extra speech "marbulan nambar"/);
  assert.equal(checkSpeech(clean.slice(0, 2), sentence).ok, false, 'a take cut short misses words');
});

test('a take that says the wrong year, or slips words in beside a number, fails', () => {
  const heard = (t) => t.split(' ').map((text, i) => ({ text, start: i * 0.4, end: i * 0.4 + 0.35 }));
  const sentence = 'Masuk tahun lapan belas sembilan puluh enam, Kuala Lumpur jadi ibu kota.';
  assert.equal(checkSpeech(heard('Masuk tahun 1896, Kuala Lumpur jadi ibu kota.'), sentence).ok, true);
  const wrong = checkSpeech(heard('Masuk tahun 1860, Kuala Lumpur jadi ibu kota.'), sentence);
  assert.match(wrong.why, /numbers heard as 1860, the script says 1896/);
  const stray = checkSpeech(heard('Tahun 1880, saya nampak ibu negeri Selangor dipindah.'), 'Tahun lapan belas lapan puluh, ibu negeri Selangor dipindah.');
  assert.match(stray.why, /extra speech "saya nampak/);
});

test('a take heard as something else fails, even when a number turns up in it', () => {
  const heard = (t) => t.split(' ').map((text, i) => ({ text, start: i * 0.4, end: i * 0.4 + 0.35 }));
  assert.equal(checkSpeech(heard('40 buta'), 'Eh, korang tahu tak?').ok, false);
  assert.equal(checkSpeech(heard('Saya jadi bijeh timah.'), 'nak cari bijih timah.').ok, false);
  assert.equal(checkSpeech(heard('Kuala yang belum po.'), 'kuala yang berlumpur.').ok, true, 'one misheard word in three passes');
});

test('a long spoken number does not carry a garbled phrase', () => {
  const heard = (t) => t.split(' ').map((text, i) => ({ text, start: i * 0.4, end: i * 0.4 + 0.35 }));
  assert.equal(checkSpeech(heard('saya baru lewat tahun 1857.'), 'Semuanya bermula tahun lapan belas lima puluh tujuh.').ok, false);
  assert.equal(checkSpeech(heard('Semuanya bermula tahun 1857.'), 'Semuanya bermula tahun lapan belas lima puluh tujuh.').ok, true);
});

test('a unit written short, and a spaced decimal, match the spoken words', () => {
  const heard = (t) => t.split(' ').map((text, i) => ({ text, start: i * 0.4, end: i * 0.4 + 0.35 }));
  assert.equal(checkSpeech(heard('sampai 3 .5L air.'), 'sampai tiga setengah liter air.').ok, true);
});

test('a short word matches only exactly: "Tahi" is not "Tapi"', () => {
  const words = [
    { text: 'Tapi', start: 17.5, end: 17.8 },
    { text: 'rezeki', start: 17.8, end: 18.3 },
    { text: 'Tahi', start: 21.58, end: 21.74 },
  ];
  assert.equal(findPhrase(words, 'Tahi', 17).start, 21.58);
});

test('spoken short forms and loanword spellings count as the same word', () => {
  const heard = (t) => t.split(' ').map((text, i) => ({ text, start: i * 0.4, end: i * 0.4 + 0.35 }));
  const r = checkSpeech(heard('Pokok ini cuma tumbuh di Sabah, yang lagi pelik, scientist ukur itu.'), 'Pokok ni cuma tumbuh di Sabah, yang lagi pelik, saintis ukur tu.');
  assert.equal(r.ok, true);
  assert.deepEqual(r.unsure, []);
});

test('data units and split compounds count as heard', async () => {
  const { checkSpeech } = await import('./voice.mjs');
  const w = (text) => text.split(' ').map((t, i) => ({ text: t, start: i * 0.3, end: i * 0.3 + 0.25 }));
  const a = checkSpeech(w('It needs 8GB of memory.'), 'It needs eight gigabytes of memory.');
  assert.ok(a.ok);
  assert.deepEqual(a.unsure, []);
  const b = checkSpeech(w('The cafe has free Wi -Fi for every guest.'), 'The cafe has free Wi-Fi for every guest.');
  assert.ok(b.ok);
  assert.deepEqual(b.unsure, []);
});

test('a word the recognizer split apart rejoins', async () => {
  const { checkSpeech } = await import('./voice.mjs');
  const w = (text) => text.split(' ').map((t, i) => ({ text: t, start: i * 0.3, end: i * 0.3 + 0.25 }));
  const c = checkSpeech(w('The airline flies non -stop to over 1 ,100 cities.'), 'The airline flies non-stop to over 1,100 cities.');
  assert.ok(c.ok, c.why);
  assert.deepEqual(c.extra, []);
});
