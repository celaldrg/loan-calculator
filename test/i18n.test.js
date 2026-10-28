import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, test } from 'node:test';

import { LIMITS, validateInputs } from '../src/calculator.js';
import { LANGUAGES, STRINGS, formatDuration, getLanguage, setLanguage, t } from '../src/i18n.js';

/**
 * Reads a project file.
 * @param {string} path path from the project root
 * @returns {string} file contents
 */
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/**
 * Sorted placeholder names of a string, or of both forms of a plural entry.
 * @param {string|string[]} entry translation entry
 * @returns {string[]} e.g. ['{amount}', '{n}']
 */
function placeholders(entry) {
  const text = Array.isArray(entry) ? entry.join(' ') : entry;
  return [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();
}

describe('strings', () => {
  test('English and Turkish define the same keys', () => {
    assert.deepEqual(Object.keys(STRINGS.tr).sort(), Object.keys(STRINGS.en).sort());
  });

  test('every translation keeps the placeholders of the English string', () => {
    for (const key of Object.keys(STRINGS.en)) {
      assert.deepEqual(placeholders(STRINGS.tr[key]), placeholders(STRINGS.en[key]), key);
    }
  });

  test('plural entries hold a singular and a plural form of {n}', () => {
    for (const lang of LANGUAGES) {
      for (const [key, entry] of Object.entries(STRINGS[lang])) {
        if (!Array.isArray(entry)) continue;
        assert.equal(entry.length, 2, key);
        for (const form of entry) assert.match(form, /\{n\}/, key);
      }
    }
  });

  test('no string is empty', () => {
    for (const lang of LANGUAGES) {
      for (const [key, entry] of Object.entries(STRINGS[lang])) {
        for (const form of [entry].flat()) assert.ok(form.trim().length > 0, `${lang} ${key}`);
      }
    }
  });

  test('every key the page markup uses exists', () => {
    const keys = [...read('index.html').matchAll(/data-i18n(?:-aria-label)?="([^"]+)"/g)].map((match) => match[1]);
    assert.ok(keys.length > 50, 'the page is translated through data-i18n');
    for (const key of keys) assert.ok(key in STRINGS.en, key);
  });

  test('every fixed key the scripts translate exists', () => {
    const dir = new URL('../src/', import.meta.url);
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.js'))) {
      const source = readFileSync(new URL(file, dir), 'utf8');
      for (const [, key] of source.matchAll(/\bt\('([\w.]+)'/g)) assert.ok(key in STRINGS.en, `${file}: ${key}`);
    }
  });

  test('every validation error has a message', () => {
    const invalid = [
      { amount: Number.NaN },
      { rate: -1 },
      { taxRate: 101 },
      { termMonths: 1.5 },
      { method: 'weekly' },
      { fees: 100_000 },
      { extras: 'none' },
      { extras: Array.from({ length: LIMITS.maxExtras + 1 }, () => ({ amount: 1, month: 1 })) },
      { amount: 1e9, rate: 20, termMonths: 600, graceMonths: 599, graceType: 'capitalized' },
      { extras: [{ amount: 0, month: 1 }, { amount: 1, month: 13 }, { amount: 1, month: 1, every: 1.5 }, { amount: 1, month: 5, every: 1, end: 3 }] },
    ];
    const codes = new Set();
    for (const inputs of invalid) {
      for (const error of validateInputs(inputs).errors) {
        const key = error.index === undefined ? `error.${error.code}` : `error.extra.${error.code}`;
        assert.ok(key in STRINGS.en, key);
        codes.add(key);
      }
    }
    assert.equal(codes.size, 12, 'all twelve error kinds were produced');
  });
});

describe('t', () => {
  afterEach(() => setLanguage('en'));

  test('fills in placeholders and leaves unknown ones visible', () => {
    assert.equal(t('results.withFees', { fees: '$240.00' }), 'incl. $240.00 fees');
    assert.equal(t('results.withFees'), 'incl. {fees} fees');
  });

  test('n picks the singular or the plural form', () => {
    assert.equal(t('unit.month', { n: 1 }), '1 month');
    assert.equal(t('unit.month', { n: 0 }), '0 months');
    assert.equal(t('unit.month', { n: 2 }), '2 months');
    assert.equal(t('results.count', { n: 12, last: '$2,200.30' }), '12 installments · last $2,200.30');
  });

  test('Turkish strings do not inflect after numbers', () => {
    setLanguage('tr');
    assert.equal(t('unit.month', { n: 1 }), '1 ay');
    assert.equal(t('unit.month', { n: 5 }), '5 ay');
    assert.equal(t('table.year', { n: 3 }), '3. yıl');
  });

  test('an unknown key comes back unchanged', () => {
    assert.equal(t('no.such.key'), 'no.such.key');
  });
});

describe('language', () => {
  afterEach(() => setLanguage('en'));

  test('English is the default and unknown languages fall back to it', () => {
    assert.equal(getLanguage(), 'en');
    assert.equal(setLanguage('tr'), 'tr');
    assert.equal(getLanguage(), 'tr');
    assert.equal(t('app.title'), 'Kredi Hesaplayıcı');
    assert.equal(setLanguage('de'), 'en');
    assert.equal(getLanguage(), 'en');
    assert.equal(t('app.title'), 'Loan Calculator');
  });
});

describe('formatDuration', () => {
  afterEach(() => setLanguage('en'));

  test('months under a year', () => {
    assert.equal(formatDuration(0), '0 months');
    assert.equal(formatDuration(1), '1 month');
    assert.equal(formatDuration(11), '11 months');
  });

  test('whole years leave out the months', () => {
    assert.equal(formatDuration(12), '1 year');
    assert.equal(formatDuration(240), '20 years');
  });

  test('years and months', () => {
    assert.equal(formatDuration(13), '1 year 1 month');
    assert.equal(formatDuration(30), '2 years 6 months');
  });

  test('Turkish', () => {
    setLanguage('tr');
    assert.equal(formatDuration(1), '1 ay');
    assert.equal(formatDuration(30), '2 yıl 6 ay');
    assert.equal(formatDuration(36), '3 yıl');
  });
});
