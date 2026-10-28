/**
 * Reverse solvers for equal-installment loans (maximum loan, interest rate,
 * term) and the internal rate of return used for the cost rate. Pure
 * functions; amounts in cents, rates as monthly fractions.
 */
import { requireInteger, requireNumber } from './checks.js';
import { MAX_TERM_MONTHS, annuityFactor, annuityPayment } from './loan.js';
import { roundCents } from './money.js';

/** Iteration cap for the root finder; bisection alone needs about 60 steps. */
const MAX_ITERATIONS = 200;

/** Relative step size at which the root finder stops. */
const TOLERANCE = 1e-15;

/**
 * Finds a root of f inside [lo, hi] with Newton steps, falling back to a
 * bisection step whenever Newton would leave the current bracket or the
 * derivative is unusable. The bracket shrinks on every iteration, so the
 * search always converges.
 * @param {(x: number) => number} f continuous function
 * @param {(x: number) => number} df derivative of f
 * @param {number} lo one end of the bracket
 * @param {number} hi other end of the bracket
 * @param {number} [guess] starting point inside the bracket (default: midpoint)
 * @returns {number} the root, or NaN when f(lo) and f(hi) do not differ in sign
 */
export function findRoot(f, df, lo, hi, guess = (lo + hi) / 2) {
  const fLo = f(lo);
  const fHi = f(hi);
  if (fLo === 0) return lo;
  if (fHi === 0) return hi;
  if (!(Math.sign(fLo) * Math.sign(fHi) < 0)) return NaN;
  let below = fLo < 0 ? lo : hi;
  let above = fLo < 0 ? hi : lo;
  let x = isInside(guess, below, above) ? guess : (lo + hi) / 2;
  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const fx = f(x);
    if (fx === 0) return x;
    if (fx < 0) below = x;
    else above = x;
    const newton = x - fx / df(x);
    const next = isInside(newton, below, above) ? newton : (below + above) / 2;
    if (Math.abs(next - x) <= TOLERANCE * Math.max(1, Math.abs(next))) return next;
    x = next;
  }
  return x;
}

/**
 * Monthly interest rate of an equal-installment loan from its amount,
 * installment and term (Newton with bisection fallback).
 * @param {{principal: number, payment: number, termMonths: number, taxRate?: number}} loan
 *   principal and installment in the same unit (cents); taxRate as a fraction
 * @returns {number|null} monthly rate before tax, or null when the installments
 *   do not even repay the principal
 */
export function solveRate({ principal, payment, termMonths, taxRate = 0 }) {
  requireNumber('principal', principal, Number.MIN_VALUE, Infinity);
  requireNumber('payment', payment, Number.MIN_VALUE, Infinity);
  requireInteger('termMonths', termMonths, 1, MAX_TERM_MONTHS);
  requireNumber('taxRate', taxRate, 0, 1);
  const target = payment / principal;
  const gross = findRoot(
    (rate) => annuityFactor(rate, termMonths) - target,
    (rate) => annuityFactorSlope(rate, termMonths),
    0,
    target,
    initialRateGuess(target, termMonths),
  );
  return Number.isNaN(gross) ? null : gross / (1 + taxRate);
}

/**
 * Largest loan whose exact equal installment does not exceed a payment.
 * @param {{payment: number, monthlyRate: number, termMonths: number, taxRate?: number}} loan
 *   payment in cents, monthlyRate and taxRate as fractions
 * @returns {number} maximum principal in whole cents
 */
export function maxPrincipal({ payment, monthlyRate, termMonths, taxRate = 0 }) {
  requireNumber('payment', payment, 0, Infinity);
  requireNumber('monthlyRate', monthlyRate, 0, 1);
  requireInteger('termMonths', termMonths, 1, MAX_TERM_MONTHS);
  requireNumber('taxRate', taxRate, 0, 1);
  return Math.floor(payment / annuityFactor(monthlyRate * (1 + taxRate), termMonths));
}

/**
 * Shortest term whose equal installment, rounded to the cent, fits a payment.
 * @param {{principal: number, payment: number, monthlyRate: number, taxRate?: number,
 *   maxMonths?: number}} loan principal and payment in cents, rates as fractions
 * @returns {number|null} term in months, or null when even maxMonths needs a
 *   larger installment
 */
export function solveTerm({ principal, payment, monthlyRate, taxRate = 0, maxMonths = MAX_TERM_MONTHS }) {
  requireNumber('principal', principal, Number.MIN_VALUE, Infinity);
  requireNumber('payment', payment, 0, Infinity);
  requireNumber('monthlyRate', monthlyRate, 0, 1);
  requireNumber('taxRate', taxRate, 0, 1);
  requireInteger('maxMonths', maxMonths, 1, MAX_TERM_MONTHS);
  const grossRate = monthlyRate * (1 + taxRate);
  const fits = (months) => roundCents(annuityPayment(principal, grossRate, months)) <= payment;
  if (!fits(maxMonths)) return null;
  let lo = 1;
  let hi = maxMonths;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * Monthly cost rate (internal rate of return) of a loan from the borrower's
 * side: the rate at which the money received equals the present value of
 * every payment. It includes tax, fees, grace months and extra payments.
 * @param {number} received amount received at month 0 (principal minus fees), in cents
 * @param {number[]} payments total paid at the end of months 1..n, in cents
 * @returns {number|null} monthly rate, or null when no rate exists
 */
export function costRate(received, payments) {
  requireNumber('received', received, Number.MIN_VALUE, Infinity);
  if (!payments.some((amount) => amount > 0)) return null;
  const f = (rate) => presentValue(payments, rate) - received;
  const df = (rate) => presentValueSlope(payments, rate);
  const [lo, hi] = bracketCostRate(f);
  const rate = findRoot(f, df, lo, hi);
  return Number.isNaN(rate) ? null : rate;
}

/**
 * Derivative of the annuity factor with respect to the rate.
 * @param {number} rate periodic rate as a fraction
 * @param {number} months number of installments
 * @returns {number} slope of annuityFactor at rate
 */
function annuityFactorSlope(rate, months) {
  if (rate === 0) return (months + 1) / (2 * months);
  const discounted = -Math.expm1(-months * Math.log1p(rate));
  const derivative = months * Math.exp(-(months + 1) * Math.log1p(rate));
  return (discounted - rate * derivative) / (discounted * discounted);
}

/**
 * Starting guess for the rate solver: the installment-to-principal ratio
 * minus the straight repayment share, a good first-order estimate.
 * @param {number} target installment per unit of principal
 * @param {number} months number of installments
 * @returns {number} rate guess
 */
function initialRateGuess(target, months) {
  return Math.max(target - 1 / months, 0) * 2 * months / (months + 1);
}

/**
 * Finds an interval [lo, hi] in which the decreasing function f changes sign.
 * @param {(rate: number) => number} f present value of payments minus the amount received
 * @returns {[number, number]} bracket for the root finder
 */
function bracketCostRate(f) {
  if (f(0) <= 0) {
    let lo = -0.5;
    for (let i = 0; i < 60 && f(lo) < 0; i += 1) lo = (lo - 1) / 2;
    return [lo, 0];
  }
  let hi = 1;
  for (let i = 0; i < 60 && f(hi) > 0; i += 1) hi *= 2;
  return [0, hi];
}

/**
 * Present value of monthly payments at a monthly rate.
 * @param {number[]} payments payments at the end of months 1..n
 * @param {number} rate monthly rate as a fraction
 * @returns {number} present value at month 0
 */
function presentValue(payments, rate) {
  const discount = 1 / (1 + rate);
  let factor = 1;
  let total = 0;
  for (const amount of payments) {
    factor *= discount;
    total += amount * factor;
  }
  return total;
}

/**
 * Derivative of presentValue with respect to the rate.
 * @param {number[]} payments payments at the end of months 1..n
 * @param {number} rate monthly rate as a fraction
 * @returns {number} slope of the present value at rate
 */
function presentValueSlope(payments, rate) {
  const discount = 1 / (1 + rate);
  let factor = discount;
  let total = 0;
  payments.forEach((amount, index) => {
    factor *= discount;
    total -= (index + 1) * amount * factor;
  });
  return total;
}

/**
 * Whether x lies strictly between a and b.
 * @param {number} x value
 * @param {number} a one end
 * @param {number} b other end
 * @returns {boolean} true when x is inside the open interval
 */
function isInside(x, a, b) {
  return Number.isFinite(x) && x > Math.min(a, b) && x < Math.max(a, b);
}
