// Numbers spoken as words, read back as values, so a check can compare a script's "lapan belas sembilan puluh
// enam" with the "1896" a recognizer writes. Covers English and Malay/Indonesian number words, including years read
// in pairs ("eighteen fifty-seven", "sembilan belas tujuh puluh empat"). Words of other languages are not read.

const UNITS = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  kosong: 0, sifar: 0, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, lapan: 8, delapan: 8, sembilan: 9,
};
const TEENS = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  sepuluh: 10, sebelas: 11,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
// Malay/Indonesian: a unit then "belas" (teens), "puluh" (tens), "ratus" (hundreds), "ribu" (thousands); "se-" is one.
const SCALE_MS = { belas: 'teen', puluh: 10, ratus: 100, ribu: 1000, juta: 1e6 };
const ONE_MS = { seratus: 100, seribu: 1000, sejuta: 1e6 };
const SCALE_EN = { hundred: 100, thousand: 1000, million: 1e6 };

const tokens = (text) => text.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/[\s-]+/).filter(Boolean);

// Reads one number starting at token i: a value under 100, or a larger one built with hundred/thousand words.
// Returns { value, next, small } or null. small: the value is under 100 and could be half of a year.
function readNumber(t, i) {
  let total = 0;
  let group = 0;
  let k = i;
  let read = false;
  let small = true;
  while (k < t.length) {
    const w = t[k];
    if (w in UNITS && t[k + 1] in SCALE_MS) {
      const scale = SCALE_MS[t[k + 1]];
      if (scale === 'teen') {
        if (group % 100 >= 10) break;
        group += 10 + UNITS[w];
        k += 2;
        read = true;
        // A teen closes a small number: "lapan belas" then "lima puluh tujuh" is two halves of a year.
        if (!(t[k] in SCALE_MS) && !(t[k] in ONE_MS) && !(t[k] in SCALE_EN)) break;
        continue;
      }
      if (scale === 10) {
        if (group % 100 >= 10) break;
        group += UNITS[w] * 10;
        k += 2;
        read = true;
        if (t[k] in UNITS && !(t[k + 1] in SCALE_MS)) group += UNITS[t[k++]];
        break;
      }
      group = (group + UNITS[w]) * scale;
      if (scale >= 1000) {
        total += group;
        group = 0;
      }
      small = false;
      k += 2;
      read = true;
      continue;
    }
    // A bare scale word multiplies what came before: "dua ratus ribu" is 200 000.
    if (read && w in SCALE_MS && SCALE_MS[w] !== 'teen' && SCALE_MS[w] >= 100) {
      group *= SCALE_MS[w];
      if (SCALE_MS[w] >= 1000) {
        total += group;
        group = 0;
      }
      small = false;
      k++;
      continue;
    }
    if (w in ONE_MS) {
      const scale = ONE_MS[w];
      if (scale >= 1000) total += scale;
      else group += scale;
      small = false;
      k++;
      read = true;
      continue;
    }
    if (w in SCALE_EN && read) {
      group = Math.max(group, 1) * SCALE_EN[w];
      if (SCALE_EN[w] >= 1000) {
        total += group;
        group = 0;
      }
      small = false;
      k++;
      if (t[k] === 'and') k++;
      continue;
    }
    if (w in TENS) {
      if (group % 100 >= 10) break;
      group += TENS[w];
      k++;
      read = true;
      if (t[k] in UNITS) group += UNITS[t[k++]];
      // "twenty-five hundred" is 2500.
      if (t[k] === 'hundred' && group < 100) continue;
      break;
    }
    if (w in TEENS) {
      if (group % 100 >= 10) break;
      group += TEENS[w];
      k++;
      read = true;
      // "eleven hundred" is 1100, "nineteen hundred and five" 1905.
      if (t[k] === 'hundred' && group < 100) continue;
      break;
    }
    if (w in UNITS) {
      if (read && group % 10 !== 0) break;
      group += UNITS[w];
      k++;
      read = true;
      if (!(t[k] in SCALE_EN)) break;
      continue;
    }
    break;
  }
  if (!read) return null;
  const value = total + group;
  return { value, next: k, small: small && value < 100 };
}

// Every number spoken as words in a text, in order. Two small numbers in a row, the first from 10 to 99, are a year
// read in pairs: "nineteen eighty-five" is 1985, "lapan belas lima puluh tujuh" is 1857. "oh" joins as a zero tens:
// "nineteen oh five" is 1905.
export function spokenNumbers(text) {
  const t = tokens(text);
  const out = [];
  for (let i = 0; i < t.length; ) {
    const a = readNumber(t, i);
    if (!a) {
      i++;
      continue;
    }
    // A fraction or decimal after a number: "tiga setengah" and "three and a half" are 3.5, "tiga perpuluhan lima"
    // and "three point five" are 3.5.
    const after = a.next;
    if (t[after] === 'setengah' || (t[after] === 'and' && t[after + 1] === 'a' && t[after + 2] === 'half')) {
      out.push(a.value + 0.5);
      i = after + (t[after] === 'setengah' ? 1 : 3);
      continue;
    }
    if (['perpuluhan', 'point', 'koma'].includes(t[after])) {
      const digits = [];
      let k = after + 1;
      while (k < t.length && t[k] in UNITS) digits.push(UNITS[t[k++]]);
      if (digits.length) {
        out.push(Number(`${a.value}.${digits.join('')}`));
        i = k;
        continue;
      }
    }
    const zero = ['oh', 'kosong'].includes(t[a.next]);
    const b = a.small && a.value >= 10 ? readNumber(t, zero ? a.next + 1 : a.next) : null;
    if (b && b.small && (zero ? b.value < 10 : b.value >= 10)) {
      out.push(a.value * 100 + b.value);
      i = b.next;
    } else {
      out.push(a.value);
      i = a.next;
    }
  }
  return out;
}

// Numbers written as digits in a text: "1,896" and "13.5" read as 1896 and 13.5.
export function writtenNumbers(text) {
  return (text.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g) ?? []).map((n) => Number(n.replace(/,/g, '')));
}

// A word that is part of a number spoken as words.
const NUMBER_WORDS = new Set([...Object.keys(UNITS), ...Object.keys(TEENS), ...Object.keys(TENS), ...Object.keys(SCALE_MS), ...Object.keys(ONE_MS), ...Object.keys(SCALE_EN), 'and', 'setengah', 'perpuluhan', 'koma', 'point', 'half']);
export const isNumberWord = (w) => /\d/.test(w) || tokens(w).every((t) => NUMBER_WORDS.has(t));

// All numbers in a text, spoken or written, sorted: the multiset two texts must share.
// A recognizer can space a decimal out ("3 .5"): it is one number.
export const numbersIn = (text) => {
  const t = text.replace(/(\d)\s+([.,])\s*(\d)/g, '$1$2$3');
  return [...spokenNumbers(t), ...writtenNumbers(t)].sort((a, b) => a - b);
};
