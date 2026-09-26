import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PAUSES, phrases, spoken } from './speak.mjs';

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
