import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  formatAmountInput,
  formatMoney,
  formatNumber,
  formatPercent,
  formatPlain,
  parseDecimal,
  parseNumber,
  separators,
} from '../src/format.js';

describe('formatting', () => {
  test('money in English and Turkish style', () => {
    assert.equal(formatMoney(888_488, 'USD', 'en'), '$8,884.88');
    assert.equal(formatMoney(888_488, 'TRY', 'tr'), '₺8.884,88');
    assert.equal(formatMoney(100_000_000_000, 'EUR', 'en'), '€1,000,000,000.00');
    assert.equal(formatMoney(5, 'USD'), '$0.05');
    assert.equal(formatMoney(0, 'TRY', 'tr'), '₺0,00');
    assert.equal(formatMoney(-123_456, 'USD', 'en'), '-$1,234.56');
  });

  test('numbers get group separators and fixed decimals', () => {
    assert.equal(formatNumber(1234.5), '1,234.50');
    assert.equal(formatNumber(1234.5, 'tr'), '1.234,50');
    assert.equal(formatNumber(1234.5, 'en', 0), '1,235');
    assert.equal(formatNumber(999.995), '1,000.00');
    assert.equal(formatNumber(-1234567.891, 'tr', 1), '-1.234.567,9');
    assert.equal(formatNumber(-0.001), '0.00', 'no negative zero');
  });

  test('huge numbers are written out instead of switching to exponent notation', () => {
    assert.equal(formatNumber(1e21), '1,000,000,000,000,000,000,000.00');
    assert.equal(formatNumber(-2e21, 'tr', 0), '-2.000.000.000.000.000.000.000');
    assert.equal(formatPercent(1e20, 'tr'), '%10.000.000.000.000.000.000.000,00');
  });

  test('percentages put the sign after in English and before in Turkish', () => {
    assert.equal(formatPercent(0.12682503013196977), '12.68%');
    assert.equal(formatPercent(0.12682503013196977, 'tr'), '%12,68');
    assert.equal(formatPercent(-0.05, 'tr'), '-%5,00');
    assert.equal(formatPercent(0.0123456, 'en', 4), '1.2346%');
  });

  test('plain amounts for CSV have no symbol and no group separator', () => {
    assert.equal(formatPlain(123_456_789), '1234567.89');
    assert.equal(formatPlain(123_456_789, 'tr'), '1234567,89');
    assert.equal(formatPlain(-5), '-0.05');
  });

  test('unknown styles and currencies are rejected', () => {
    assert.deepEqual(separators('tr'), { group: '.', decimal: ',' });
    assert.throws(() => separators('de'), RangeError);
    assert.throws(() => formatNumber(1, 'fr'), RangeError);
    assert.throws(() => formatMoney(1, 'GBP'), RangeError);
  });
});

describe('parsing', () => {
  test('numbers typed in English or Turkish style', () => {
    assert.equal(parseNumber('1,234.5'), 1234.5);
    assert.equal(parseNumber('1.234,5', 'tr'), 1234.5);
    assert.equal(parseNumber('1.234', 'tr'), 1234);
    assert.equal(parseNumber('1,234', 'tr'), 1.234);
    assert.equal(parseNumber(' 100 000 '), 100_000);
    assert.equal(parseNumber('-12.5'), -12.5);
    assert.equal(parseNumber('.5'), 0.5);
  });

  test('anything else is NaN', () => {
    for (const text of ['', 'abc', '1e5', '1.2.3', '12-3', '--1']) {
      assert.ok(Number.isNaN(parseNumber(text)), JSON.stringify(text));
    }
  });

  test('short decimals take either separator and ignore the percent sign', () => {
    assert.equal(parseDecimal('2,99'), 2.99);
    assert.equal(parseDecimal('2.99'), 2.99);
    assert.equal(parseDecimal('%2,99'), 2.99);
    assert.equal(parseDecimal(' 1.5 % '), 1.5);
    assert.equal(parseDecimal('-1'), -1);
    assert.ok(Number.isNaN(parseDecimal('')));
    assert.ok(Number.isNaN(parseDecimal('1,234.5')));
  });
});

describe('live formatting of the amount field', () => {
  const cases = [
    ['groups thousands with the caret at the end', '1234567', 7, 'en', '1,234,567', 9],
    ['groups with dots in Turkish style', '1234567', 7, 'tr', '1.234.567', 9],
    ['keeps the caret after the same digit', '12345', 2, 'en', '12,345', 2],
    ['moves the caret with its digit when separators shift', '1,2345', 2, 'en', '12,345', 1],
    ['allows two decimals', '1234.567', 8, 'en', '1,234.56', 8],
    ['uses a decimal comma in Turkish style', '1234,5', 6, 'tr', '1.234,5', 7],
    ['treats a Turkish dot as a group separator', '1.234', 5, 'tr', '1.234', 5],
    ['keeps only the first decimal separator', '1.2.3', 5, 'en', '1.23', 4],
    ['drops leading zeros', '000123', 6, 'en', '123', 3],
    ['keeps the zero before the decimal separator', '0.5', 3, 'en', '0.5', 3],
    ['adds a zero before a leading decimal separator', '.5', 2, 'en', '0.5', 3],
    ['drops letters', '12a3', 4, 'en', '123', 3],
    ['keeps the caret at the start', '1,000', 0, 'en', '1,000', 0],
    ['leaves an empty field empty', '', 0, 'en', '', 0],
  ];
  for (const [name, text, caret, style, expectedText, expectedCaret] of cases) {
    test(name, () => {
      assert.deepEqual(formatAmountInput(text, caret, style), { text: expectedText, caret: expectedCaret });
    });
  }

  test('formatting twice changes nothing', () => {
    for (const [name, text, caret, style] of cases) {
      const once = formatAmountInput(text, caret, style);
      assert.deepEqual(formatAmountInput(once.text, once.caret, style), once, name);
    }
  });

  test('the formatted text parses back to the typed number', () => {
    assert.equal(parseNumber(formatAmountInput('1234567.89', 10).text), 1234567.89);
    assert.equal(parseNumber(formatAmountInput('1234567,89', 10, 'tr').text, 'tr'), 1234567.89);
  });
});
