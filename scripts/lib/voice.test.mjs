import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alignScript, findPhrase } from './voice.mjs';

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
