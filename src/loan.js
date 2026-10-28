/**
 * Loan engine: rate conversions, the annuity formula and cent-exact
 * amortization schedules. Pure functions; amounts are integer cents and
 * rates are fractions (0.01 = 1 %).
 */
import { requireInteger, requireNumber, requireOneOf } from './checks.js';
import { roundCents } from './money.js';

/** Repayment methods: equal installments or equal principal parts. */
export const METHODS = Object.freeze(['annuity', 'equalPrincipal']);

/** Grace period kinds: pay only interest, or pay nothing and capitalize the interest. */
export const GRACE_TYPES = Object.freeze(['interestOnly', 'capitalized']);

/** Extra payments either keep the installment (shorter loan) or keep the term (lower installment). */
export const EXTRA_STRATEGIES = Object.freeze(['shortenTerm', 'lowerPayment']);

/** Longest supported term: 50 years. */
export const MAX_TERM_MONTHS = 600;

/** Largest balance in cents the engine accepts; keeps every total a safe integer. */
export const MAX_BALANCE_CENTS = 1e12;

/**
 * Share of the installment by which rounding drift may move the last
 * installment before an equal-installment loan counts as fragile.
 */
const DRIFT_LIMIT = 0.02;

/** A fragile loan's level is corrected until its last installment is projected within this share of it. */
const DRIFT_TARGET = 0.01;

/** Row fields that are added up into totals. */
const TOTAL_KEYS = Object.freeze(['payment', 'principal', 'interest', 'tax', 'extra']);

/**
 * @typedef {object} ExtraPayment
 * @property {number} amount extra amount in cents
 * @property {number} month month (1-based) in which it is paid, after the installment
 * @property {number} [every=0] repeat interval in months; 0 means one-off
 * @property {number} [end] last month a recurring extra is paid (default: end of term)
 */

/**
 * @typedef {object} ScheduleParams
 * @property {number} principal loan amount in cents
 * @property {number} monthlyRate monthly interest rate as a fraction
 * @property {number} termMonths total term in months, grace months included
 * @property {'annuity'|'equalPrincipal'} [method='annuity'] repayment method
 * @property {number} [taxRate=0] tax charged on every interest part, as a fraction
 * @property {number} [graceMonths=0] months at the start without principal repayment
 * @property {'interestOnly'|'capitalized'} [graceType='interestOnly'] grace period kind
 * @property {ExtraPayment[]} [extras=[]] extra payments
 * @property {'shortenTerm'|'lowerPayment'} [extraStrategy='shortenTerm'] effect of extras
 */

/**
 * @typedef {object} ScheduleRow
 * @property {number} month 1-based month number
 * @property {number} payment installment in cents, always principal + interest + tax
 * @property {number} principal principal part in cents (negative while interest is capitalized)
 * @property {number} interest interest part in cents
 * @property {number} tax tax on the interest part in cents
 * @property {number} extra extra payment made after this installment, in cents
 * @property {number} balance remaining balance after this month, in cents
 * @property {boolean} grace whether the month belongs to the grace period
 */

/**
 * @typedef {object} RowTotals
 * @property {number} payment sum of installments
 * @property {number} principal sum of principal parts
 * @property {number} interest sum of interest parts
 * @property {number} tax sum of taxes
 * @property {number} extra sum of extra payments
 */

/**
 * Converts a nominal rate to a monthly rate.
 * @param {number} rate nominal rate as a fraction (0.12 = 12 %)
 * @param {'monthly'|'annual'} basis whether the rate is quoted per month or per year
 * @returns {number} monthly rate as a fraction
 */
export function toMonthlyRate(rate, basis) {
  return basis === 'annual' ? rate / 12 : rate;
}

/**
 * Effective annual rate of a monthly rate compounded twelve times a year.
 * @param {number} monthlyRate monthly rate as a fraction
 * @returns {number} effective annual rate as a fraction
 */
export function effectiveAnnualRate(monthlyRate) {
  return Math.expm1(12 * Math.log1p(monthlyRate));
}

/**
 * Installment per unit of principal of an equal-installment loan,
 * r / (1 - (1 + r)^-n), or 1 / n when the rate is zero.
 * @param {number} rate periodic rate as a fraction (greater than -1)
 * @param {number} months number of installments
 * @returns {number} installment per unit of principal
 */
export function annuityFactor(rate, months) {
  if (rate === 0) return 1 / months;
  return rate / -Math.expm1(-months * Math.log1p(rate));
}

/**
 * Exact (unrounded) equal installment of a loan.
 * @param {number} principal loan amount, usually in cents
 * @param {number} rate periodic rate as a fraction
 * @param {number} months number of installments
 * @returns {number} installment in the unit of principal
 */
export function annuityPayment(principal, rate, months) {
  return principal * annuityFactor(rate, months);
}

/**
 * Builds the month-by-month amortization schedule in integer cents.
 *
 * Interest is the balance times the monthly rate and tax is the interest
 * times the tax rate, each rounded to the cent. Equal installments are
 * computed at the gross rate monthlyRate * (1 + taxRate), so the tax is part
 * of the level installment, as banks in Türkiye quote it. The last
 * installment absorbs every rounding difference and the balance ends at
 * exactly zero.
 *
 * Very long, very expensive loans are numerically fragile: a fraction of a
 * cent in the installment then compounds into a huge last installment. While
 * the projected last installment stays within DRIFT_LIMIT of the installment,
 * the level is kept and the last installment absorbs the drift; normal loans
 * never leave this range. Beyond it the level is corrected in one-cent steps
 * until the last installment is projected within DRIFT_TARGET (driftCorrector).
 * @param {ScheduleParams} params loan parameters
 * @returns {ScheduleRow[]} one row per month until the balance is repaid
 */
export function buildSchedule(params) {
  const loan = normalizeParams(params);
  const extras = extrasByMonth(loan.extras, loan.termMonths);
  const grossRate = loan.monthlyRate * (1 + loan.taxRate);
  const correctDrift = driftCorrector(grossRate);
  const rows = [];
  let balance = loan.principal;
  let level = null;
  let targetsTerm = true;
  for (let month = 1; month <= loan.termMonths && balance > 0; month += 1) {
    const interest = roundCents(balance * loan.monthlyRate);
    const tax = roundCents(interest * loan.taxRate);
    const grace = month <= loan.graceMonths;
    const remaining = loan.termMonths - month + 1;
    if (!grace) level = nextLevel(loan, { level, targetsTerm, balance, grossRate, remaining, correctDrift });
    const principal = grace
      ? gracePrincipal(loan.graceType, interest, tax)
      : regularPrincipal(loan, { month, level, interest, tax, balance });
    balance -= principal;
    const extra = Math.min(extras[month], balance);
    balance -= extra;
    if (balance > MAX_BALANCE_CENTS) throw new RangeError('balance exceeds the supported range');
    rows.push({ month, payment: principal + interest + tax, principal, interest, tax, extra, balance, grace });
    if (extra > 0 && loan.extraStrategy === 'lowerPayment') level = null;
    else if (extra > 0 && !grace) targetsTerm = false;
  }
  return rows;
}

/**
 * Adds up the money columns of schedule rows.
 * @param {ScheduleRow[]} rows schedule rows
 * @returns {RowTotals} column totals in cents
 */
export function sumRows(rows) {
  const totals = { payment: 0, principal: 0, interest: 0, tax: 0, extra: 0 };
  for (const row of rows) {
    for (const key of TOTAL_KEYS) totals[key] += row[key];
  }
  return totals;
}

/**
 * @typedef {object} ScheduleSummary
 * @property {number} months number of months until the loan is repaid
 * @property {number} installment first installment after the grace period, in cents
 * @property {number} lastPayment last installment, in cents
 * @property {number} totalPayment all installments plus extra payments, in cents
 * @property {number} totalPrincipal principal repaid (equals the loan), in cents
 * @property {number} totalInterest total interest, in cents
 * @property {number} totalTax total tax on interest, in cents
 * @property {number} totalExtra total extra payments, in cents
 * @property {number} fees upfront fees, in cents
 * @property {number} totalCost totalPayment plus fees, in cents
 */

/**
 * Summarizes a schedule: headline installment and totals.
 * @param {ScheduleRow[]} rows schedule rows
 * @param {number} [fees=0] upfront fees in cents
 * @returns {ScheduleSummary} summary in cents
 */
export function summarizeSchedule(rows, fees = 0) {
  const totals = sumRows(rows);
  const firstRegular = rows.find((row) => !row.grace);
  const totalPayment = totals.payment + totals.extra;
  return {
    months: rows.length,
    installment: firstRegular ? firstRegular.payment : 0,
    lastPayment: rows.length > 0 ? rows[rows.length - 1].payment : 0,
    totalPayment,
    totalPrincipal: totals.principal + totals.extra,
    totalInterest: totals.interest,
    totalTax: totals.tax,
    totalExtra: totals.extra,
    fees,
    totalCost: totalPayment + fees,
  };
}

/**
 * @typedef {object} YearGroup
 * @property {number} year 1-based loan year
 * @property {ScheduleRow[]} rows the months of that year
 * @property {RowTotals} totals column totals of the year, in cents
 * @property {number} balance balance at the end of the year, in cents
 */

/**
 * Groups schedule rows by loan year (months 1-12 are year 1).
 * @param {ScheduleRow[]} rows schedule rows
 * @returns {YearGroup[]} one group per year
 */
export function groupByYear(rows) {
  const years = [];
  for (const row of rows) {
    const year = Math.ceil(row.month / 12);
    if (years.length === 0 || years[years.length - 1].year !== year) {
      years.push({ year, rows: [] });
    }
    years[years.length - 1].rows.push(row);
  }
  return years.map(({ year, rows: yearRows }) => ({
    year,
    rows: yearRows,
    totals: sumRows(yearRows),
    balance: yearRows[yearRows.length - 1].balance,
  }));
}

/**
 * Applies defaults to schedule parameters and validates them.
 * @param {ScheduleParams} params raw parameters
 * @returns {Required<ScheduleParams>} complete parameters
 */
function normalizeParams(params) {
  const loan = {
    principal: params.principal,
    monthlyRate: params.monthlyRate,
    termMonths: params.termMonths,
    method: params.method ?? 'annuity',
    taxRate: params.taxRate ?? 0,
    graceMonths: params.graceMonths ?? 0,
    graceType: params.graceType ?? 'interestOnly',
    extras: params.extras ?? [],
    extraStrategy: params.extraStrategy ?? 'shortenTerm',
  };
  requireInteger('principal', loan.principal, 1, MAX_BALANCE_CENTS);
  requireNumber('monthlyRate', loan.monthlyRate, 0, 1);
  requireInteger('termMonths', loan.termMonths, 1, MAX_TERM_MONTHS);
  requireOneOf('method', loan.method, METHODS);
  requireNumber('taxRate', loan.taxRate, 0, 1);
  requireInteger('graceMonths', loan.graceMonths, 0, loan.termMonths - 1);
  requireOneOf('graceType', loan.graceType, GRACE_TYPES);
  requireOneOf('extraStrategy', loan.extraStrategy, EXTRA_STRATEGIES);
  if (!Array.isArray(loan.extras)) throw new RangeError('extras must be an array');
  loan.extras.forEach(checkExtra);
  return loan;
}

/**
 * Validates one extra payment.
 * @param {ExtraPayment} extra extra payment
 * @param {number} index position in the list, for the error message
 */
function checkExtra(extra, index) {
  requireInteger(`extras[${index}].amount`, extra.amount, 1, MAX_BALANCE_CENTS);
  requireInteger(`extras[${index}].month`, extra.month, 1, MAX_TERM_MONTHS);
  requireInteger(`extras[${index}].every`, extra.every ?? 0, 0, MAX_TERM_MONTHS);
  if (extra.end !== undefined) {
    requireInteger(`extras[${index}].end`, extra.end, extra.month, MAX_TERM_MONTHS);
  }
}

/**
 * Expands one-off and recurring extra payments into an amount per month.
 * @param {ExtraPayment[]} extras extra payments
 * @param {number} termMonths loan term
 * @returns {number[]} extra cents indexed by month (index 0 unused)
 */
function extrasByMonth(extras, termMonths) {
  const byMonth = new Array(termMonths + 1).fill(0);
  for (const { amount, month, every = 0, end = termMonths } of extras) {
    const last = Math.min(end, termMonths);
    const step = every > 0 ? every : termMonths;
    for (let m = month; m <= last; m += step) byMonth[m] += amount;
  }
  return byMonth;
}

/**
 * Level amount to use this month: computed when the amortization starts or
 * after an extra payment lowered it, then kept; an annuity level is corrected
 * for rounding drift unless an extra payment has deliberately shortened the loan.
 * @param {Required<ScheduleParams>} loan loan parameters
 * @param {{level: number|null, targetsTerm: boolean, balance: number, grossRate: number,
 *   remaining: number, correctDrift: DriftCorrector}} state current level and month state
 * @returns {number} level amount in cents
 */
function nextLevel(loan, { level, targetsTerm, balance, grossRate, remaining, correctDrift }) {
  if (level === null) return levelAmount(loan.method, balance, grossRate, remaining);
  return targetsTerm && loan.method === 'annuity' ? correctDrift(level, balance, remaining) : level;
}

/**
 * @callback DriftCorrector
 * @param {number} level current level installment in cents
 * @param {number} balance current balance in cents
 * @param {number} months remaining installments, this month included
 * @returns {number} level to use, at most one cent away from the current one
 */

/**
 * Creates the rounding-drift correction of one equal-installment schedule.
 * The level is kept while its projected last installment stays within
 * DRIFT_LIMIT of it. Past that the loan counts as fragile and the tolerance
 * tightens to DRIFT_TARGET for the rest of the schedule. A fragile level moves
 * one cent at a time, and only when the step at least halves the projected
 * drift, so it never flips between two cents from month to month.
 * @param {number} grossRate monthly rate including tax on interest
 * @returns {DriftCorrector} corrector that remembers whether the loan is fragile
 */
function driftCorrector(grossRate) {
  let fragile = false;
  return (level, balance, months) => {
    const deviation = projectedDeviation(balance, level, grossRate, months);
    if (Math.abs(deviation) <= level * (fragile ? DRIFT_TARGET : DRIFT_LIMIT)) return level;
    fragile = true;
    const step = Math.sign(deviation);
    const after = projectedDeviation(balance, level + step, grossRate, months);
    return Math.abs(after) * 2 <= Math.abs(deviation) ? level + step : level;
  };
}

/**
 * How far the last installment would end up from the level installment if
 * the level were kept for the remaining months (exact arithmetic):
 * (exact installment - level) x ((1 + r)^n - 1) / r.
 * @param {number} balance current balance in cents
 * @param {number} level level installment in cents
 * @param {number} rate gross monthly rate
 * @param {number} months remaining installments
 * @returns {number} projected deviation of the last installment, in cents
 */
function projectedDeviation(balance, level, rate, months) {
  const growth = rate === 0 ? months : Math.expm1(months * Math.log1p(rate)) / rate;
  return (annuityPayment(balance, rate, months) - level) * growth;
}

/**
 * Level amount for the amortization phase: the equal installment for
 * annuity loans, the equal principal part otherwise.
 * @param {string} method repayment method
 * @param {number} balance balance to amortize, in cents
 * @param {number} grossRate monthly rate including tax on interest
 * @param {number} months remaining installments
 * @returns {number} level amount in cents
 */
function levelAmount(method, balance, grossRate, months) {
  return method === 'annuity'
    ? roundCents(annuityPayment(balance, grossRate, months))
    : roundCents(balance / months);
}

/**
 * Principal part of a grace month: nothing is repaid, or the unpaid interest
 * and its tax are added to the balance.
 * @param {string} graceType grace period kind
 * @param {number} interest interest of the month, in cents
 * @param {number} tax tax of the month, in cents
 * @returns {number} principal part in cents (zero or negative)
 */
function gracePrincipal(graceType, interest, tax) {
  return graceType === 'capitalized' ? -(interest + tax) : 0;
}

/**
 * Principal part of a regular month. The final month repays the whole
 * balance, which absorbs all rounding differences.
 * @param {Required<ScheduleParams>} loan loan parameters
 * @param {{month:number, level:number, interest:number, tax:number, balance:number}} state month state
 * @returns {number} principal part in cents
 */
function regularPrincipal(loan, { month, level, interest, tax, balance }) {
  if (month === loan.termMonths) return balance;
  const part = loan.method === 'annuity' ? level - interest - tax : level;
  return Math.min(balance, Math.max(0, part));
}
