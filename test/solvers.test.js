import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { annuityPayment } from '../src/loan.js';
import { roundCents } from '../src/money.js';
import { costRate, findRoot, maxPrincipal, solveRate, solveTerm } from '../src/solvers.js';

/**
 * Seeded pseudo-random generator (mulberry32), so the random cases are the
 * same on every run.
 * @param {number} seed 32-bit seed
 * @returns {() => number} generator of numbers in [0, 1)
 */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draws a loan of 1,000 to 5,000,000 at 0.05 % to 6 % per month over 1 to
 * 360 months with 0 to 50 % tax on interest.
 * @param {() => number} random generator of numbers in [0, 1)
 * @returns {{principal: number, monthlyRate: number, termMonths: number, taxRate: number}}
 *   loan with the principal in cents
 */
function randomLoan(random) {
  return {
    principal: 100_000 + Math.floor(random() * 499_900_001),
    monthlyRate: 0.0005 + random() * 0.0595,
    termMonths: 1 + Math.floor(random() * 360),
    taxRate: random() * 0.5,
  };
}

describe('findRoot', () => {
  test('Newton steps find the square root of two', () => {
    const root = findRoot((x) => x * x - 2, (x) => 2 * x, 0, 2);
    assert.ok(Math.abs(root - Math.SQRT2) <= 1e-15);
  });

  test('bisection takes over where Newton would overshoot', () => {
    const root = findRoot(Math.atan, (x) => 1 / (1 + x * x), -10, 20, 5);
    assert.ok(Math.abs(root) < 1e-12);
  });

  test('a zero derivative does not stop the search', () => {
    const root = findRoot((x) => x ** 3 - 8, (x) => 3 * x * x, -5, 5, 0);
    assert.ok(Math.abs(root - 2) < 1e-12);
  });

  test('the bracket may be given in either order and an end may be the root', () => {
    assert.ok(Math.abs(findRoot((x) => x * x - 2, (x) => 2 * x, 2, 0) - Math.SQRT2) <= 1e-15);
    assert.equal(findRoot((x) => x, () => 1, 0, 1), 0);
  });

  test('returns NaN when the function does not change sign', () => {
    assert.ok(Number.isNaN(findRoot((x) => x * x + 1, (x) => 2 * x, -1, 1)));
  });
});

describe('solveRate', () => {
  test('recovers 1 % per month from the exact installment', () => {
    const payment = annuityPayment(10_000_000, 0.01, 12);
    assert.ok(Math.abs(solveRate({ principal: 10_000_000, payment, termMonths: 12 }) - 0.01) < 1e-12);
  });

  test('recovers the rate behind the quoted 8,884.88 within 1e-6', () => {
    const rate = solveRate({ principal: 10_000_000, payment: 888_488, termMonths: 12 });
    assert.ok(Math.abs(rate - 0.01) < 1e-6);
  });

  test('a single installment is principal plus interest', () => {
    const rate = solveRate({ principal: 1_000_000, payment: 1_050_000, termMonths: 1 });
    assert.ok(Math.abs(rate - 0.05) < 1e-12);
  });

  test('returns the rate before tax on interest', () => {
    const payment = annuityPayment(10_000_000, 0.01 * (1 + 0.15), 12);
    const rate = solveRate({ principal: 10_000_000, payment, termMonths: 12, taxRate: 0.15 });
    assert.ok(Math.abs(rate - 0.01) < 1e-12);
  });

  test('zero when the installments exactly repay the principal', () => {
    assert.equal(solveRate({ principal: 1_200_000, payment: 100_000, termMonths: 12 }), 0);
  });

  test('null when the installments do not even repay the principal', () => {
    assert.equal(solveRate({ principal: 1_200_000, payment: 90_000, termMonths: 12 }), null);
  });

  test('recovers the rate within 1e-6 for 300 seeded random loans', () => {
    const random = mulberry32(20261028);
    for (let k = 0; k < 300; k += 1) {
      const { principal, monthlyRate, termMonths, taxRate } = randomLoan(random);
      const payment = annuityPayment(principal, monthlyRate * (1 + taxRate), termMonths);
      const rate = solveRate({ principal, payment, termMonths, taxRate });
      assert.ok(Math.abs(rate - monthlyRate) < 1e-6, `case ${k}: ${monthlyRate} solved as ${rate}`);
      const quoted = roundCents(payment);
      const fromQuote = solveRate({ principal, payment: quoted, termMonths, taxRate });
      const requoted = roundCents(annuityPayment(principal, fromQuote * (1 + taxRate), termMonths));
      assert.equal(requoted, quoted, `case ${k}: the rate solved from the quote reproduces it`);
    }
  });

  test('rejects impossible arguments', () => {
    assert.throws(() => solveRate({ principal: 0, payment: 1, termMonths: 12 }), RangeError);
    assert.throws(() => solveRate({ principal: 1, payment: 1, termMonths: 0 }), RangeError);
    assert.throws(() => solveRate({ principal: 1, payment: 1, termMonths: 12, taxRate: 2 }), RangeError);
  });
});

describe('maxPrincipal', () => {
  test('the largest loan for 8,884.88 at 1 % over 12 months is 100,000.01', () => {
    assert.equal(maxPrincipal({ payment: 888_488, monthlyRate: 0.01, termMonths: 12 }), 10_000_001);
    assert.ok(annuityPayment(10_000_001, 0.01, 12) <= 888_488);
    assert.ok(annuityPayment(10_000_002, 0.01, 12) > 888_488);
  });

  test('without interest it is the installment times the term', () => {
    assert.equal(maxPrincipal({ payment: 100_000, monthlyRate: 0, termMonths: 12 }), 1_200_000);
  });

  test('tax on interest lowers the loan an installment can carry', () => {
    const grossRate = 0.01 * (1 + 0.15);
    const principal = maxPrincipal({ payment: 888_488, monthlyRate: 0.01, termMonths: 12, taxRate: 0.15 });
    assert.ok(principal < 10_000_001);
    assert.ok(annuityPayment(principal, grossRate, 12) <= 888_488);
    assert.ok(annuityPayment(principal + 1, grossRate, 12) > 888_488);
  });

  test('a zero installment carries no loan', () => {
    assert.equal(maxPrincipal({ payment: 0, monthlyRate: 0.01, termMonths: 12 }), 0);
  });
});

describe('solveTerm', () => {
  test('8,884.88 a month repays 100,000 at 1 % in 12 months', () => {
    assert.equal(solveTerm({ principal: 10_000_000, payment: 888_488, monthlyRate: 0.01 }), 12);
  });

  test('without interest the term is the loan divided by the payment, rounded up', () => {
    assert.equal(solveTerm({ principal: 1_200_000, payment: 110_000, monthlyRate: 0 }), 11);
  });

  test('null when the payment never gets ahead of the interest', () => {
    assert.equal(solveTerm({ principal: 10_000_000, payment: 100_000, monthlyRate: 0.01 }), null);
  });

  test('null when even maxMonths needs a larger payment', () => {
    assert.equal(solveTerm({ principal: 10_000_000, payment: 888_488, monthlyRate: 0.01, maxMonths: 6 }), null);
  });

  test('finds the shortest fitting term for 100 seeded random loans', () => {
    const random = mulberry32(7);
    for (let k = 0; k < 100; k += 1) {
      const { principal, monthlyRate, termMonths, taxRate } = randomLoan(random);
      const grossRate = monthlyRate * (1 + taxRate);
      const payment = roundCents(annuityPayment(principal, grossRate, termMonths));
      const fits = (months) => roundCents(annuityPayment(principal, grossRate, months)) <= payment;
      const months = solveTerm({ principal, payment, monthlyRate, taxRate });
      assert.ok(months <= termMonths && fits(months), `case ${k}: ${months} months fit`);
      assert.ok(months === 1 || !fits(months - 1), `case ${k}: ${months} months is the shortest`);
    }
  });
});

describe('costRate', () => {
  test('1,000 received and 1,100 repaid a month later costs 10 % a month', () => {
    assert.ok(Math.abs(costRate(1000, [1100]) - 0.1) < 1e-12);
  });

  test('repaying less than was received gives a negative rate', () => {
    assert.ok(Math.abs(costRate(1000, [900]) + 0.1) < 1e-12);
  });

  test('an exact annuity costs exactly its interest rate', () => {
    const payments = new Array(12).fill(annuityPayment(10_000_000, 0.01, 12));
    assert.ok(Math.abs(costRate(10_000_000, payments) - 0.01) < 1e-12);
  });

  test('fees raise the cost rate, which discounts the payments back to the money received', () => {
    const payments = new Array(12).fill(888_488);
    const rate = costRate(9_900_000, payments);
    assert.ok(rate > 0.01);
    const presentValue = payments.reduce((sum, amount, k) => sum + amount / (1 + rate) ** (k + 1), 0);
    assert.ok(Math.abs(presentValue - 9_900_000) < 1e-4);
  });

  test('months without a payment are discounted too', () => {
    assert.ok(Math.abs(costRate(1000, [0, 1210]) - 0.1) < 1e-12);
  });

  test('null without any payment', () => {
    assert.equal(costRate(1000, []), null);
    assert.equal(costRate(1000, [0, 0]), null);
  });
});
