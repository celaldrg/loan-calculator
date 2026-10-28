/**
 * CSV export of an amortization schedule (RFC 4180 quoting, CRLF lines).
 * English style uses "," between fields and "." for decimals; Turkish style
 * uses ";" and "," as spreadsheet programs in Türkiye expect.
 */
import { formatPlain } from './format.js';

/** Default column titles, in row field order. */
const DEFAULT_HEADERS = Object.freeze(['Month', 'Payment', 'Principal', 'Interest', 'Tax', 'Extra', 'Balance']);

/** Money fields of a schedule row, in column order after the month. */
const MONEY_FIELDS = Object.freeze(['payment', 'principal', 'interest', 'tax', 'extra', 'balance']);

/**
 * Builds the CSV text of a schedule.
 * @param {import('./loan.js').ScheduleRow[]} rows schedule rows (amounts in cents)
 * @param {{headers?: readonly string[], style?: 'en'|'tr'}} [options] translated
 *   column titles (seven, in DEFAULT_HEADERS order) and number style
 * @returns {string} CSV text ending with a line break
 */
export function scheduleToCsv(rows, { headers = DEFAULT_HEADERS, style = 'en' } = {}) {
  const separator = style === 'tr' ? ';' : ',';
  const lines = [
    headers,
    ...rows.map((row) => [String(row.month), ...MONEY_FIELDS.map((field) => formatPlain(row[field], style))]),
  ];
  return lines.map((fields) => fields.map((field) => quote(field, separator)).join(separator)).join('\r\n') + '\r\n';
}

/**
 * Quotes a field when it contains the separator, a quote or a line break.
 * @param {string} field field text
 * @param {string} separator field separator
 * @returns {string} CSV-safe field
 */
function quote(field, separator) {
  const text = String(field);
  const needsQuotes = text.includes(separator) || /["\r\n]/.test(text);
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}
