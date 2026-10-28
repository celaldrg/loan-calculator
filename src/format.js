/**
 * Number, money and percent formatting and parsing in English (1,234.56)
 * or Turkish (1.234,56) style, plus live formatting of the amount field.
 * Hand-rolled instead of Intl so the output is identical everywhere.
 */

/** Separators per number style. */
const STYLES = Object.freeze({
  en: Object.freeze({ group: ',', decimal: '.' }),
  tr: Object.freeze({ group: '.', decimal: ',' }),
});

/** Symbols of the display currencies. */
export const SYMBOLS = Object.freeze({ TRY: '₺', USD: '$', EUR: '€' });

/** Decimals the amount field accepts. */
const AMOUNT_DECIMALS = 2;

/** A plain decimal number after separators have been normalized. */
const NUMBER_PATTERN = /^-?(\d+\.?\d*|\.\d+)$/;

/** Magnitude from which Number#toFixed switches to exponent notation. */
const EXPONENT_FROM = 1e21;

/**
 * Separators of a number style.
 * @param {'en'|'tr'} style number style
 * @returns {{group: string, decimal: string}} group and decimal separator
 */
export function separators(style) {
  const found = STYLES[style];
  if (!found) throw new RangeError(`unknown number style ${style}`);
  return found;
}

/**
 * Formats a number with group separators and fixed decimals.
 * @param {number} value number to format
 * @param {'en'|'tr'} [style='en'] number style
 * @param {number} [decimals=2] digits after the decimal separator
 * @returns {string} e.g. "1,234.50" (en) or "1.234,50" (tr)
 */
export function formatNumber(value, style = 'en', decimals = 2) {
  const { group, decimal } = separators(style);
  const fixed = fixedDigits(Math.abs(value), decimals);
  const [whole, fraction] = fixed.split('.');
  const body = groupDigits(whole, group) + (fraction ? decimal + fraction : '');
  return value < 0 && Number(fixed) !== 0 ? `-${body}` : body;
}

/**
 * Formats integer cents as money with a currency symbol.
 * @param {number} cents amount in cents
 * @param {'TRY'|'USD'|'EUR'} [currency='USD'] display currency
 * @param {'en'|'tr'} [style='en'] number style
 * @returns {string} e.g. "$8,884.88" (en) or "₺8.884,88" (tr)
 */
export function formatMoney(cents, currency = 'USD', style = 'en') {
  const symbol = SYMBOLS[currency];
  if (!symbol) throw new RangeError(`unknown currency ${currency}`);
  const { group, decimal } = separators(style);
  const { sign, whole, fraction } = centsParts(cents);
  return `${sign}${symbol}${groupDigits(whole, group)}${decimal}${fraction}`;
}

/**
 * Formats integer cents without symbol or group separators, for CSV files.
 * @param {number} cents amount in cents
 * @param {'en'|'tr'} [style='en'] number style (decides the decimal separator)
 * @returns {string} e.g. "8884.88" (en) or "8884,88" (tr)
 */
export function formatPlain(cents, style = 'en') {
  const { decimal } = separators(style);
  const { sign, whole, fraction } = centsParts(cents);
  return `${sign}${whole}${decimal}${fraction}`;
}

/**
 * Formats a fraction as a percentage; Turkish puts the sign in front.
 * @param {number} fraction value as a fraction (0.1268 = 12.68 %)
 * @param {'en'|'tr'} [style='en'] number style
 * @param {number} [decimals=2] digits after the decimal separator
 * @returns {string} e.g. "12.68%" (en) or "%12,68" (tr)
 */
export function formatPercent(fraction, style = 'en', decimals = 2) {
  const text = formatNumber(fraction * 100, style, decimals);
  if (style !== 'tr') return `${text}%`;
  return text.startsWith('-') ? `-%${text.slice(1)}` : `%${text}`;
}

/**
 * Parses a number typed in the given style; group separators and spaces are ignored.
 * @param {string} text typed text, e.g. "1,234.5" (en) or "1.234,5" (tr)
 * @param {'en'|'tr'} [style='en'] number style
 * @returns {number} the value, or NaN when the text is not a number
 */
export function parseNumber(text, style = 'en') {
  const { group, decimal } = separators(style);
  const compact = String(text).replace(/\s/g, '').split(group).join('').replace(decimal, '.');
  return NUMBER_PATTERN.test(compact) ? Number(compact) : NaN;
}

/**
 * Parses a short decimal such as a rate: either "," or "." is the decimal
 * separator and a percent sign is ignored.
 * @param {string} text typed text, e.g. "2,99", "2.99" or "%2,99"
 * @returns {number} the value, or NaN when the text is not a number
 */
export function parseDecimal(text) {
  const compact = String(text).replace(/[\s%]/g, '').replace(',', '.');
  return NUMBER_PATTERN.test(compact) ? Number(compact) : NaN;
}

/**
 * Re-formats the amount field while the user types: keeps digits and one
 * decimal separator (two decimals at most), drops leading zeros, inserts
 * group separators and keeps the caret after the same digit.
 * @param {string} text current field text
 * @param {number} caret caret position in text
 * @param {'en'|'tr'} [style='en'] number style
 * @returns {{text: string, caret: number}} formatted text and new caret position
 */
export function formatAmountInput(text, caret, style = 'en') {
  const { group, decimal } = separators(style);
  const kept = keepAmountChars(text, decimal);
  const before = kept.filter((entry) => entry.index < caret).length;
  const [whole, fraction] = kept.map((entry) => entry.char).join('').split(decimal);
  const formatted = groupDigits(whole, group) + (fraction === undefined ? '' : decimal + fraction);
  return { text: formatted, caret: caretAfter(formatted, before, group) };
}

/**
 * Like Number#toFixed, but writes every digit of huge values (such as the
 * cost rate of a loan whose fees swallow almost all of it) instead of
 * switching to exponent notation.
 * @param {number} magnitude non-negative value
 * @param {number} decimals digits after the decimal point
 * @returns {string} digits with "." as the decimal point
 */
function fixedDigits(magnitude, decimals) {
  if (!Number.isFinite(magnitude) || magnitude < EXPONENT_FROM) return magnitude.toFixed(decimals);
  return decimals > 0 ? `${BigInt(magnitude)}.${'0'.repeat(decimals)}` : String(BigInt(magnitude));
}

/**
 * Inserts a group separator every three digits from the right.
 * @param {string} digits string of digits
 * @param {string} group group separator
 * @returns {string} grouped digits
 */
function groupDigits(digits, group) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, group);
}

/**
 * Splits integer cents into sign, whole units and two-digit fraction.
 * @param {number} cents amount in cents
 * @returns {{sign: string, whole: string, fraction: string}} parts
 */
function centsParts(cents) {
  const magnitude = Math.round(Math.abs(cents));
  return {
    sign: cents < 0 && magnitude > 0 ? '-' : '',
    whole: String(Math.floor(magnitude / 100)),
    fraction: String(magnitude % 100).padStart(2, '0'),
  };
}

/**
 * Picks the characters of the amount field worth keeping, with their
 * original positions so the caret can be restored.
 * @param {string} text field text
 * @param {string} decimal decimal separator
 * @returns {{char: string, index: number}[]} kept characters (index -1 = inserted)
 */
function keepAmountChars(text, decimal) {
  const kept = [];
  let decimals = -1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char >= '0' && char <= '9' && decimals < AMOUNT_DECIMALS) {
      kept.push({ char, index });
      if (decimals >= 0) decimals += 1;
    } else if (char === decimal && decimals < 0) {
      kept.push({ char, index });
      decimals = 0;
    }
  }
  while (kept.length > 1 && kept[0].char === '0' && kept[1].char !== decimal) kept.shift();
  if (kept.length > 0 && kept[0].char === decimal) kept.unshift({ char: '0', index: -1 });
  return kept;
}

/**
 * Caret position right after the count-th non-separator character.
 * @param {string} text formatted text
 * @param {number} count characters (digits or decimal separator) before the caret
 * @param {string} group group separator
 * @returns {number} caret position
 */
function caretAfter(text, count, group) {
  if (count === 0) return 0;
  let seen = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== group) seen += 1;
    if (seen === count) return index + 1;
  }
  return text.length;
}
