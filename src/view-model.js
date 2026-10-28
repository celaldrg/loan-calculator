/**
 * Pure helpers that turn calculator results into what the UI shows: term
 * slider stops, chart bars and axis scales, input texts, savings and the
 * rows of the offer comparison. No DOM access, so node --test covers them.
 */
import { LIMITS, RATE_TIE } from './calculator.js';
import { formatNumber, separators } from './format.js';
import { groupByYear } from './loan.js';

/** Loans up to this many months get one bar per month; longer ones one bar per year. */
export const MAX_MONTHLY_BARS = 60;

/** Cost rates above this fraction (10,000 %) are shown as "over 10,000 %". */
export const RATE_DISPLAY_CAP = 100;

/** Month values the term slider snaps to: every month for short loans, coarser steps for long ones. */
export const TERM_STOPS = buildTermStops();

/** Multipliers of a power of ten that make readable axis steps. */
const NICE_FACTORS = Object.freeze([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]);

/** Short suffixes for large axis values, largest first. */
const COMPACT = Object.freeze({
  en: Object.freeze([[1e9, 'B'], [1e6, 'M']]),
  tr: Object.freeze([[1e9, ' Mr'], [1e6, ' Mn']]),
});

/** Metrics of the offer comparison: summary field and how to show it. */
const COMPARE_METRICS = Object.freeze([
  ['installment', 'money'],
  ['totalPayment', 'money'],
  ['totalInterest', 'money'],
  ['fees', 'money'],
  ['totalCost', 'money'],
  ['annualCostRate', 'rate'],
]);

/**
 * @typedef {object} ChartBar
 * @property {number} label month or year number
 * @property {number} principal principal repaid in cents
 * @property {number} interest interest paid in cents
 * @property {number} tax tax paid in cents
 * @property {number} extra extra payments in cents
 * @property {number} capitalized unpaid interest and tax added to the balance, in cents
 * @property {number} paid everything paid in the period, in cents
 * @property {number} balance balance at the end of the period, in cents
 */

/**
 * Index of the slider stop closest to a term (ties go to the shorter term).
 * @param {number} months term in months
 * @returns {number} index into TERM_STOPS
 */
export function nearestStop(months) {
  let best = 0;
  TERM_STOPS.forEach((stop, index) => {
    if (Math.abs(stop - months) < Math.abs(TERM_STOPS[best] - months)) best = index;
  });
  return best;
}

/**
 * Picks a readable axis step so that `intervals` steps cover max.
 * @param {number} max largest value to show
 * @param {number} [intervals=4] number of grid intervals
 * @returns {{step: number, top: number}} step size and axis top (step x intervals)
 */
export function niceScale(max, intervals = 4) {
  if (!(max > 0)) return { step: 1, top: intervals };
  const power = 10 ** Math.floor(Math.log10(max / intervals));
  const factor = NICE_FACTORS.find((candidate) => candidate * power * intervals >= max) ?? 10;
  const step = factor * power;
  return { step, top: step * intervals };
}

/**
 * Formats an axis value: grouped digits, millions and billions shortened.
 * @param {number} value value in currency units
 * @param {'en'|'tr'} style number style
 * @returns {string} e.g. "24,000", "1.5M" (en) or "1,5 Mn" (tr)
 */
export function formatAxis(value, style) {
  const [size, suffix] = COMPACT[style].find(([limit]) => Math.abs(value) >= limit) ?? [1, ''];
  const scaled = value / size;
  return formatNumber(scaled, style, decimalsOf(scaled)) + suffix;
}

/**
 * Chart bars of a schedule: one per month, or one per loan year for long loans.
 * Capitalized grace months pay nothing, so their bar is empty.
 * @param {import('./loan.js').ScheduleRow[]} rows schedule rows
 * @param {number} [maxMonthly=MAX_MONTHLY_BARS] most months drawn one by one
 * @returns {{unit: 'month'|'year', bars: ChartBar[], startBalance: number}} bars and the opening balance in cents
 */
export function chartBars(rows, maxMonthly = MAX_MONTHLY_BARS) {
  if (rows.length === 0) return { unit: 'month', bars: [], startBalance: 0 };
  const first = rows[0];
  const monthly = rows.length <= maxMonthly;
  const groups = monthly
    ? rows.map((row) => ({ label: row.month, rows: [row] }))
    : groupByYear(rows).map((year) => ({ label: year.year, rows: year.rows }));
  return {
    unit: monthly ? 'month' : 'year',
    bars: groups.map((group) => barOf(group.label, group.rows)),
    startBalance: first.balance + first.principal + first.extra,
  };
}

/**
 * Text for a money input: whole amounts without decimals, others with two.
 * @param {number} value amount in currency units
 * @param {'en'|'tr'} style number style
 * @returns {string} e.g. "100,000" or "1.234,50"; empty for a missing value
 */
export function amountText(value, style) {
  if (!Number.isFinite(value)) return '';
  return formatNumber(value, style, Number.isInteger(value) ? 0 : 2);
}

/**
 * Text for a short decimal input such as a rate, without trailing zeros.
 * @param {number} value number to show
 * @param {'en'|'tr'} style number style (decides the decimal separator)
 * @param {number} [maxDecimals=4] digits kept after the decimal separator
 * @returns {string} e.g. "2.99" (en) or "2,99" (tr); empty for a missing value
 */
export function decimalText(value, style, maxDecimals = 4) {
  if (!Number.isFinite(value)) return '';
  return String(Number(value.toFixed(maxDecimals))).replace('.', separators(style).decimal);
}

/**
 * Caps a rate for display; absurd cost rates (fees that swallow the loan)
 * would otherwise print dozens of digits.
 * @param {number} rate rate as a fraction
 * @returns {{value: number, over: boolean}} the rate to show and whether it was capped
 */
export function cappedRate(rate) {
  return rate > RATE_DISPLAY_CAP ? { value: RATE_DISPLAY_CAP, over: true } : { value: rate, over: false };
}

/**
 * Label key of the headline installment.
 * @param {import('./calculator.js').LoanInputs} inputs form values
 * @returns {string} i18n key
 */
export function headlineKey(inputs) {
  const changing = inputs.method === 'equalPrincipal'
    || (inputs.extras.length > 0 && inputs.extraStrategy === 'lowerPayment');
  if (inputs.graceMonths > 0) return changing ? 'results.firstAfterGrace' : 'results.afterGrace';
  return changing ? 'results.firstInstallment' : 'results.installment';
}

/**
 * What the extra payments save compared with the same loan without them.
 * @param {import('./calculator.js').CalcResult} result loan with extra payments
 * @param {import('./calculator.js').CalcResult|null} baseline same loan without extras
 * @returns {{amount: number, months: number}|null} interest plus tax saved (cents)
 *   and months saved, or null when there is nothing to compare
 */
export function extraSavings(result, baseline) {
  if (!result.ok || !baseline?.ok || result.inputs.extras.length === 0) return null;
  const cost = (summary) => summary.totalInterest + summary.totalTax;
  return {
    amount: cost(baseline.summary) - cost(result.summary),
    months: baseline.summary.months - result.summary.months,
  };
}

/**
 * Rows of the side-by-side comparison; lower is better for every metric.
 * @param {import('./calculator.js').Comparison} comparison result of compareOffers
 * @returns {{key: string, kind: 'money'|'rate', a: number|null, b: number|null,
 *   better: 'a'|'b'|null}[]} one row per metric (null values for an invalid offer)
 */
export function comparisonRows({ a, b }) {
  return COMPARE_METRICS.map(([key, kind]) => {
    const valueA = a.ok ? a.summary[key] : null;
    const valueB = b.ok ? b.summary[key] : null;
    return { key, kind, a: valueA, b: valueB, better: lower(valueA, valueB, kind === 'rate' ? RATE_TIE : 0) };
  });
}

/**
 * Slider stops: 1-60 by month, then 6-, 12- and 24-month steps up to the term limit.
 * @returns {readonly number[]} ascending month values
 */
function buildTermStops() {
  const segments = [[1, 60, 1], [66, 120, 6], [132, 360, 12], [384, LIMITS.maxTermMonths, 24]];
  const stops = [];
  for (const [from, to, step] of segments) {
    for (let months = from; months <= to; months += step) stops.push(months);
  }
  return Object.freeze(stops);
}

/**
 * Adds up the schedule rows of one chart bar.
 * @param {number} label month or year number
 * @param {import('./loan.js').ScheduleRow[]} rows rows of the period
 * @returns {ChartBar} the bar
 */
function barOf(label, rows) {
  const bar = { label, principal: 0, interest: 0, tax: 0, extra: 0, capitalized: 0, paid: 0, balance: rows[rows.length - 1].balance };
  for (const row of rows) {
    if (row.principal < 0) {
      bar.capitalized -= row.principal;
    } else {
      bar.principal += row.principal;
      bar.interest += row.interest;
      bar.tax += row.tax;
    }
    bar.extra += row.extra;
  }
  bar.paid = bar.principal + bar.interest + bar.tax + bar.extra;
  return bar;
}

/**
 * Fewest decimals (0-2) that show a value exactly.
 * @param {number} value number to show
 * @returns {number} decimals
 */
function decimalsOf(value) {
  for (let decimals = 0; decimals < 2; decimals += 1) {
    const scaled = value * 10 ** decimals;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-6) return decimals;
  }
  return 2;
}

/**
 * Names the lower of two values.
 * @param {number|null} a value of offer a
 * @param {number|null} b value of offer b
 * @param {number} tolerance differences up to this count as equal
 * @returns {'a'|'b'|null} the lower one, or null when unknown or equal
 */
function lower(a, b, tolerance) {
  if (a === null || b === null || Math.abs(a - b) <= tolerance) return null;
  return a < b ? 'a' : 'b';
}
