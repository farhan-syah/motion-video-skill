import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spokenNumbers, writtenNumbers } from './numbers.mjs';

test('Malay years, counts and dates read as their values', () => {
  assert.deepEqual(spokenNumbers('Semuanya bermula tahun lapan belas lima puluh tujuh.'), [1857]);
  assert.deepEqual(spokenNumbers('Raja Abdullah upah lapan puluh tujuh orang pelombong'), [87]);
  assert.deepEqual(spokenNumbers('enam puluh sembilan orang meninggal'), [69]);
  assert.deepEqual(spokenNumbers('Masuk tahun lapan belas sembilan puluh enam, Kuala Lumpur'), [1896]);
  assert.deepEqual(spokenNumbers('satu Februari sembilan belas tujuh puluh empat'), [1, 1974]);
  assert.deepEqual(spokenNumbers('seribu lapan ratus lima puluh'), [1850]);
  assert.deepEqual(spokenNumbers('dua ratus ribu orang'), [200000]);
  assert.deepEqual(spokenNumbers('sepuluh tahun'), [10]);
});

test('English years, counts and plain numbers read as their values', () => {
  assert.deepEqual(spokenNumbers('It opened in nineteen eighty-five.'), [1985]);
  assert.deepEqual(spokenNumbers('nineteen oh five'), [1905]);
  assert.deepEqual(spokenNumbers('eighty-seven miners and sixty-nine died'), [87, 69]);
  assert.deepEqual(spokenNumbers('one thousand eight hundred and ninety six'), [1896]);
  assert.deepEqual(spokenNumbers('two hundred people'), [200]);
  assert.deepEqual(spokenNumbers('no numbers here'), []);
});

test('digits read as numbers', () => {
  assert.deepEqual(writtenNumbers('1 Februari 1974, 13.5 km, 1,896 people'), [1, 1974, 13.5, 1896]);
});

test('halves and decimals read as their values', () => {
  assert.deepEqual(spokenNumbers('boleh tampung tiga setengah liter air'), [3.5]);
  assert.deepEqual(spokenNumbers('tiga perpuluhan lima kilometer'), [3.5]);
  assert.deepEqual(spokenNumbers('three and a half litres, or three point five'), [3.5, 3.5]);
});
