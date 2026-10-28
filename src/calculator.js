/**
 * High-level calculator API that the UI drives. Inputs use human units
 * (currency amounts and percentages, exactly as typed in the form); results
 * use integer cents and rate fractions from the engine. Pure: no DOM, no
 * storage, no randomness.
 */
import {
  EXTRA_STRATEGIES,
  GRACE_TYPES,
  MAX_BALANCE_CENTS,
  MAX_TERM_MONTHS,
  METHODS,
  buildSchedule,
  effectiveAnnualRate,
  groupByYear,
  summarizeSchedule,
  toMonthlyRate,
} from './loan.js';
import { fromCents, toCents } from './money.js';
import { costRate, maxPrincipal, solveRate, solveTerm } from './solvers.js';

/** Supported rate bases for the monthly/annual toggle. */
export const RATE_BASES = Object.freeze(['monthly', 'annual']);

/** Display currencies (formatting only, no conversion). */
export const CURRENCIES = Object.freeze(['TRY', 'USD', 'EUR']);

/** Input limits the form validates against. */
export const LIMITS = Object.freeze({
  minAmount: 1,
  maxAmount: 1e9,
  maxMonthlyRatePercent: 20,
  maxTaxPercent: 100,
  maxTermMonths: MAX_TERM_MONTHS,
  maxExtras: 24,
});

/** Two cost rates closer than this count as equal (compareOffers and the comparison view). */
export const RATE_TIE = 1e-9;

/** Form fields each reverse solve depends on. */
const SOLVE_FIELDS = Object.freeze({
  amount: ['rate', 'rateBasis', 'termMonths', 'taxRate'],
  rate: ['amount', 'rateBasis', 'termMonths', 'taxRate'],
  term: ['amount', 'rate', 'rateBasis', 'taxRate'],
});

/**
 * @typedef {object} ExtraInput
 * @property {number} amount amount in currency units
 * @property {number} month month (1-based) of the first payment
 * @property {number} [every=0] repeat interval in months (0 one-off, 1 monthly, 12 yearly)
 * @property {number|null} [end] last month of a recurring payment (default: end of term)
 */

/**
 * @typedef {object} LoanInputs
 * @property {number} amount loan amount in currency units
 * @property {number} rate nominal interest rate in percent
 * @property {'monthly'|'annual'} rateBasis whether the rate is per month or per year
 * @property {number} termMonths term in months, grace months included
 * @property {'annuity'|'equalPrincipal'} method repayment method
 * @property {number} taxRate tax on interest in percent (0 = none)
 * @property {number} fees upfront fees in currency units
 * @property {number} graceMonths grace months at the start of the loan
 * @property {'interestOnly'|'capitalized'} graceType grace period kind
 * @property {ExtraInput[]} extras extra payments
 * @property {'shortenTerm'|'lowerPayment'} extraStrategy what extra payments do
 * @property {'TRY'|'USD'|'EUR'} currency display currency
 */

/**
 * @typedef {object} InputError
 * @property {string} field input field name, e.g. 'amount' or 'extras'
 * @property {string} code 'required' | 'integer' | 'min' | 'max' | 'invalid' |
 *   'exceedsAmount' | 'tooMany' | 'tooLarge' | for extras: 'amount' | 'month' | 'every' | 'end'
 * @property {number} [limit] the violated bound, for 'min' / 'max' / 'tooMany'
 * @property {number} [index] position in the extras list
 */

/**
 * @typedef {import('./loan.js').ScheduleParams & {fees: number}} LoanParams
 * Engine parameters (cents and fractions) plus upfront fees in cents.
 */

/**
 * @typedef {import('./loan.js').ScheduleSummary & {
 *   monthlyRate: number, effectiveAnnualRate: number,
 *   monthlyCostRate: number|null, annualCostRate: number|null}} LoanSummary
 * Totals in cents plus rates as fractions. The cost rates are internal rates
 * of return that include tax, fees, grace months and extra payments.
 */

/**
 * @typedef {object} CalcResult
 * @property {boolean} ok whether the inputs were valid
 * @property {LoanInputs} inputs the inputs with defaults applied
 * @property {InputError[]} errors validation errors (empty when ok)
 * @property {LoanParams|null} params engine parameters
 * @property {import('./loan.js').ScheduleRow[]} rows amortization schedule
 * @property {LoanSummary|null} summary totals and rates
 * @property {import('./loan.js').YearGroup[]} years schedule grouped by loan year
 */

/**
 * Fresh default form values: 100,000 at 1 % per month over 12 months.
 * @returns {LoanInputs} default inputs
 */
export function defaultInputs() {
  return {
    amount: 100000,
    rate: 1,
    rateBasis: 'monthly',
    termMonths: 12,
    method: 'annuity',
    taxRate: 0,
    fees: 0,
    graceMonths: 0,
    graceType: 'interestOnly',
    extras: [],
    extraStrategy: 'shortenTerm',
    currency: 'USD',
  };
}

/**
 * Validates form inputs and converts them to engine parameters.
 * @param {Partial<LoanInputs>} inputs form values; missing fields take defaults
 * @returns {{errors: InputError[], params: LoanParams|null}} errors, or the parameters
 */
export function validateInputs(inputs) {
  const values = withDefaults(inputs);
  const errors = [];
  const report = (field, code, details = {}) => errors.push({ field, code, ...details });
  const term = isIntegerIn(values.termMonths, 1, LIMITS.maxTermMonths) ? values.termMonths : LIMITS.maxTermMonths;
  checkNumber(report, 'amount', values.amount, LIMITS.minAmount, LIMITS.maxAmount);
  checkChoice(report, 'rateBasis', values.rateBasis, RATE_BASES);
  checkNumber(report, 'rate', values.rate, 0, maxRatePercent(values.rateBasis));
  checkInteger(report, 'termMonths', values.termMonths, 1, LIMITS.maxTermMonths);
  checkChoice(report, 'method', values.method, METHODS);
  checkNumber(report, 'taxRate', values.taxRate, 0, LIMITS.maxTaxPercent);
  checkFees(report, values.fees, values.amount);
  checkInteger(report, 'graceMonths', values.graceMonths, 0, term - 1);
  checkChoice(report, 'graceType', values.graceType, GRACE_TYPES);
  checkChoice(report, 'extraStrategy', values.extraStrategy, EXTRA_STRATEGIES);
  checkChoice(report, 'currency', values.currency, CURRENCIES);
  checkExtras(report, values.extras, term);
  if (errors.length > 0) return { errors, params: null };
  const params = toParams(values);
  if (peakBalance(params) * 1.001 > MAX_BALANCE_CENTS) {
    return { errors: [{ field: 'graceMonths', code: 'tooLarge' }], params: null };
  }
  return { errors, params };
}

/**
 * Runs the whole calculation for a set of form inputs.
 * @param {Partial<LoanInputs>} inputs form values; missing fields take defaults
 * @returns {CalcResult} schedule, totals and rates, or the validation errors
 */
export function calculate(inputs) {
  const values = withDefaults(inputs);
  const { errors, params } = validateInputs(values);
  if (!params) {
    return { ok: false, inputs: values, errors, params: null, rows: [], summary: null, years: [] };
  }
  const rows = buildSchedule(params);
  return {
    ok: true,
    inputs: values,
    errors,
    params,
    rows,
    summary: summarize(rows, params),
    years: groupByYear(rows),
  };
}

/**
 * @typedef {object} Comparison
 * @property {CalcResult} a first offer
 * @property {CalcResult} b second offer
 * @property {{totalCost: number, totalPayment: number, totalInterest: number,
 *   annualCostRate: number|null}|null} difference b minus a (cents, rate fraction);
 *   null when an offer is invalid
 * @property {'a'|'b'|'tie'|null} cheaperByCost offer with the lower total cost (payments plus fees)
 * @property {'a'|'b'|'tie'|null} cheaperByRate offer with the lower annual cost rate
 */

/**
 * Compares two offers side by side.
 * @param {Partial<LoanInputs>} inputsA first offer
 * @param {Partial<LoanInputs>} inputsB second offer
 * @returns {Comparison} both results and their differences
 */
export function compareOffers(inputsA, inputsB) {
  const a = calculate(inputsA);
  const b = calculate(inputsB);
  if (!a.ok || !b.ok) return { a, b, difference: null, cheaperByCost: null, cheaperByRate: null };
  const rateA = a.summary.annualCostRate;
  const rateB = b.summary.annualCostRate;
  const ratesKnown = rateA !== null && rateB !== null;
  return {
    a,
    b,
    difference: {
      totalCost: b.summary.totalCost - a.summary.totalCost,
      totalPayment: b.summary.totalPayment - a.summary.totalPayment,
      totalInterest: b.summary.totalInterest - a.summary.totalInterest,
      annualCostRate: ratesKnown ? rateB - rateA : null,
    },
    cheaperByCost: cheaper(a.summary.totalCost, b.summary.totalCost, 0),
    cheaperByRate: ratesKnown ? cheaper(rateA, rateB, RATE_TIE) : null,
  };
}

/**
 * Solves an equal-installment loan for one unknown from a desired monthly
 * installment. Grace months, extra payments and the repayment method are
 * ignored; the tax rate is honoured.
 * @param {Partial<LoanInputs>} inputs current form values
 * @param {'amount'|'rate'|'term'} target 'amount' = largest loan (currency units),
 *   'rate' = interest rate in percent in the inputs' rate basis, 'term' = shortest term in months
 * @param {number} payment desired installment in currency units
 * @returns {number|null} the solved value, or null for invalid inputs or no solution
 */
export function reverseSolve(inputs, target, payment) {
  const fields = SOLVE_FIELDS[target];
  if (!fields) throw new RangeError(`unknown reverse-solve target ${target}`);
  const values = withDefaults(inputs);
  const paymentCents = toCents(payment);
  const { errors } = validateInputs(values);
  const invalid = errors.some((error) => fields.includes(error.field));
  if (invalid || !Number.isFinite(paymentCents) || paymentCents <= 0) return null;
  const monthlyRate = toMonthlyRate(values.rate / 100, values.rateBasis);
  const taxRate = values.taxRate / 100;
  const { termMonths } = values;
  if (target === 'amount') {
    return fromCents(maxPrincipal({ payment: paymentCents, monthlyRate, termMonths, taxRate }));
  }
  const principal = toCents(values.amount);
  if (target === 'term') return solveTerm({ principal, payment: paymentCents, monthlyRate, taxRate });
  const rate = solveRate({ principal, payment: paymentCents, termMonths, taxRate });
  return rate === null ? null : rate * (values.rateBasis === 'annual' ? 12 : 1) * 100;
}

/**
 * Minimal state holder for the UI: the current inputs and their result.
 * @param {Partial<LoanInputs>} [initial] starting inputs; defaults fill the rest
 * @returns {{getState: () => CalcResult, update: (patch: Partial<LoanInputs>) => CalcResult,
 *   reset: () => CalcResult}} calculator handle
 */
export function createCalculator(initial = {}) {
  let state = calculate(initial);
  return {
    getState: () => state,
    update(patch) {
      state = calculate({ ...state.inputs, ...patch });
      return state;
    },
    reset() {
      state = calculate({});
      return state;
    },
  };
}

/**
 * Deterministic showcase for the ?demo screenshot: a 12-month loan and a
 * second offer with a lower rate but higher fees.
 * @returns {{inputs: LoanInputs, compare: LoanInputs}} demo inputs
 */
export function demoState() {
  return {
    inputs: { ...defaultInputs(), amount: 24000, rate: 18, rateBasis: 'annual', fees: 240 },
    compare: { ...defaultInputs(), amount: 24000, rate: 16.5, rateBasis: 'annual', fees: 720 },
  };
}

/**
 * Fills missing (undefined) fields with the defaults.
 * @param {Partial<LoanInputs>} [inputs] form values
 * @returns {LoanInputs} complete inputs
 */
function withDefaults(inputs = {}) {
  const given = Object.entries(inputs).filter(([, value]) => value !== undefined);
  return { ...defaultInputs(), ...Object.fromEntries(given) };
}

/**
 * Converts validated form values to engine parameters.
 * @param {LoanInputs} values validated inputs
 * @returns {LoanParams} parameters in cents and fractions
 */
function toParams(values) {
  return {
    principal: toCents(values.amount),
    monthlyRate: toMonthlyRate(values.rate / 100, values.rateBasis),
    termMonths: values.termMonths,
    method: values.method,
    taxRate: values.taxRate / 100,
    graceMonths: values.graceMonths,
    graceType: values.graceType,
    extras: values.extras.map((extra) => ({
      amount: toCents(extra.amount),
      month: extra.month,
      every: extra.every ?? 0,
      end: extra.end ?? values.termMonths,
    })),
    extraStrategy: values.extraStrategy,
    fees: toCents(values.fees),
  };
}

/**
 * Adds rates and the cost rate to the schedule totals.
 * @param {import('./loan.js').ScheduleRow[]} rows schedule rows
 * @param {LoanParams} params engine parameters
 * @returns {LoanSummary} summary
 */
function summarize(rows, params) {
  const payments = rows.map((row) => row.payment + row.extra);
  const monthlyCostRate = costRate(params.principal - params.fees, payments);
  return {
    ...summarizeSchedule(rows, params.fees),
    monthlyRate: params.monthlyRate,
    effectiveAnnualRate: effectiveAnnualRate(params.monthlyRate),
    monthlyCostRate,
    annualCostRate: monthlyCostRate === null ? null : effectiveAnnualRate(monthlyCostRate),
  };
}

/**
 * Highest balance the loan can reach: capitalized grace interest only grows it.
 * @param {LoanParams} params engine parameters
 * @returns {number} peak balance estimate in cents
 */
function peakBalance(params) {
  if (params.graceType !== 'capitalized') return params.principal;
  const grossRate = params.monthlyRate * (1 + params.taxRate);
  return params.principal * (1 + grossRate) ** params.graceMonths;
}

/**
 * Highest accepted rate in percent for a rate basis.
 * @param {string} basis 'monthly' or 'annual'
 * @returns {number} maximum rate in percent
 */
function maxRatePercent(basis) {
  return basis === 'annual' ? LIMITS.maxMonthlyRatePercent * 12 : LIMITS.maxMonthlyRatePercent;
}

/**
 * Names the lower of two costs.
 * @param {number} a cost of offer a
 * @param {number} b cost of offer b
 * @param {number} tolerance differences up to this count as a tie
 * @returns {'a'|'b'|'tie'} the cheaper offer
 */
function cheaper(a, b, tolerance) {
  if (Math.abs(a - b) <= tolerance) return 'tie';
  return a < b ? 'a' : 'b';
}

/**
 * Whether value is a finite number within [min, max].
 * @param {unknown} value value to test
 * @param {number} min inclusive lower bound
 * @param {number} max inclusive upper bound
 * @returns {boolean} true when inside the range
 */
function isNumberIn(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/**
 * Whether value is an integer within [min, max].
 * @param {unknown} value value to test
 * @param {number} min inclusive lower bound
 * @param {number} max inclusive upper bound
 * @returns {boolean} true when inside the range
 */
function isIntegerIn(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Reports 'required', 'min' or 'max' for a numeric field.
 * @param {Function} report error collector
 * @param {string} field field name
 * @param {unknown} value field value
 * @param {number} min inclusive lower bound
 * @param {number} max inclusive upper bound
 */
function checkNumber(report, field, value, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) report(field, 'required');
  else if (value < min) report(field, 'min', { limit: min });
  else if (value > max) report(field, 'max', { limit: max });
}

/**
 * Like checkNumber, and also reports 'integer' for fractional values.
 * @param {Function} report error collector
 * @param {string} field field name
 * @param {unknown} value field value
 * @param {number} min inclusive lower bound
 * @param {number} max inclusive upper bound
 */
function checkInteger(report, field, value, min, max) {
  if (typeof value === 'number' && Number.isFinite(value) && !Number.isInteger(value)) {
    report(field, 'integer');
  } else {
    checkNumber(report, field, value, min, max);
  }
}

/**
 * Reports 'invalid' unless value is one of the options.
 * @param {Function} report error collector
 * @param {string} field field name
 * @param {unknown} value field value
 * @param {readonly string[]} options allowed values
 */
function checkChoice(report, field, value, options) {
  if (!options.includes(value)) report(field, 'invalid');
}

/**
 * Fees must be non-negative and leave some money to receive.
 * @param {Function} report error collector
 * @param {unknown} fees fees in currency units
 * @param {unknown} amount loan amount in currency units
 */
function checkFees(report, fees, amount) {
  checkNumber(report, 'fees', fees, 0, Infinity);
  if (isNumberIn(fees, 0, Infinity) && isNumberIn(amount, LIMITS.minAmount, LIMITS.maxAmount)
    && toCents(fees) >= toCents(amount)) {
    report('fees', 'exceedsAmount');
  }
}

/**
 * Validates the extra payment list.
 * @param {Function} report error collector
 * @param {unknown} extras extra payments
 * @param {number} term loan term used for the month bounds
 */
function checkExtras(report, extras, term) {
  if (!Array.isArray(extras)) {
    report('extras', 'invalid');
  } else if (extras.length > LIMITS.maxExtras) {
    report('extras', 'tooMany', { limit: LIMITS.maxExtras });
  } else {
    extras.forEach((extra, index) => {
      const code = extraErrorCode(extra, term);
      if (code) report('extras', code, { index });
    });
  }
}

/**
 * First problem of one extra payment, if any.
 * @param {ExtraInput} extra extra payment
 * @param {number} term loan term
 * @returns {string|null} 'amount' | 'month' | 'every' | 'end', or null when valid
 */
function extraErrorCode(extra, term) {
  if (!isNumberIn(extra?.amount, 0.01, LIMITS.maxAmount)) return 'amount';
  if (!isIntegerIn(extra.month, 1, term)) return 'month';
  if (!isIntegerIn(extra.every ?? 0, 0, term)) return 'every';
  if (extra.end != null && !isIntegerIn(extra.end, extra.month, term)) return 'end';
  return null;
}
