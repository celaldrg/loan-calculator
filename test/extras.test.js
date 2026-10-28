import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { annuityPayment, buildSchedule, sumRows, summarizeSchedule } from '../src/loan.js';
import { roundCents } from '../src/money.js';

/** 12,000.00 without interest over 12 months: 1,000.00 a month, in cents. */
const FREE = Object.freeze({ principal: 1_200_000, monthlyRate: 0, termMonths: 12 });

/** 100,000.00 at 1 % per month over 12 months, in cents. */
const LOAN = Object.freeze({ principal: 10_000_000, monthlyRate: 0.01, termMonths: 12 });

/** The 8,884.88 installment of LOAN, in cents. */
const INSTALLMENT = 888_488;

/**
 * Asserts that a schedule repays the loan exactly: the running balance
 * matches every row, no extra overpays and the balance ends at 0.00.
 * @param {import('../src/loan.js').ScheduleRow[]} rows schedule
 * @param {number} principal loan amount in cents
 */
function assertRepaid(rows, principal) {
  let balance = principal;
  for (const row of rows) {
    balance -= row.principal;
    assert.ok(row.extra >= 0 && row.extra <= balance, `month ${row.month}: extra fits the balance`);
    balance -= row.extra;
    assert.equal(row.balance, balance, `month ${row.month}: balance`);
  }
  const totals = sumRows(rows);
  assert.equal(totals.principal + totals.extra, principal, 'principal and extras add up to the loan');
  assert.equal(balance, 0, 'balance ends at exactly 0.00');
}

/**
 * Months in which an extra payment was made.
 * @param {import('../src/loan.js').ScheduleRow[]} rows schedule
 * @returns {number[]} month numbers
 */
function extraMonths(rows) {
  return rows.filter((row) => row.extra > 0).map((row) => row.month);
}

describe('extra payments that shorten the term', () => {
  test('a one-off extra keeps the installment and ends the loan early', () => {
    const rows = buildSchedule({ ...FREE, extras: [{ amount: 300_000, month: 2 }] });
    assertRepaid(rows, FREE.principal);
    assert.equal(rows.length, 9);
    assert.deepEqual(rows.map((row) => row.payment), new Array(9).fill(100_000));
    assert.deepEqual(extraMonths(rows), [2]);
  });

  test('with interest the term matches the closed-form number of installments', () => {
    const rows = buildSchedule({ ...LOAN, extras: [{ amount: 2_000_000, month: 3 }] });
    assertRepaid(rows, LOAN.principal);
    const { monthlyRate } = LOAN;
    const balance = rows[2].balance;
    const remaining = Math.ceil(-Math.log(1 - (balance * monthlyRate) / INSTALLMENT) / Math.log(1 + monthlyRate));
    assert.equal(rows.length, 3 + remaining);
    assert.equal(rows.length, 10);
    for (const row of rows.slice(0, -1)) assert.equal(row.payment, INSTALLMENT);
    assert.ok(rows[rows.length - 1].payment <= INSTALLMENT, 'the last installment pays off the rest');
    const early = summarizeSchedule(rows);
    assert.equal(early.totalExtra, 2_000_000);
    assert.ok(early.totalInterest < summarizeSchedule(buildSchedule(LOAN)).totalInterest);
  });

  test('a recurring monthly extra repays an interest-free loan twice as fast', () => {
    const rows = buildSchedule({ ...FREE, extras: [{ amount: 100_000, month: 1, every: 1 }] });
    assertRepaid(rows, FREE.principal);
    assert.equal(rows.length, 6);
    assert.deepEqual(extraMonths(rows), [1, 2, 3, 4, 5, 6]);
  });

  test('a yearly extra is paid every twelve months from its first month', () => {
    const loan = { principal: 3_600_000, monthlyRate: 0, termMonths: 36 };
    const rows = buildSchedule({ ...loan, extras: [{ amount: 200_000, month: 6, every: 12 }] });
    assertRepaid(rows, loan.principal);
    assert.deepEqual(extraMonths(rows), [6, 18, 30]);
    assert.equal(rows.length, 30);
  });

  test('a recurring extra stops after its end month', () => {
    const rows = buildSchedule({ ...FREE, extras: [{ amount: 100_000, month: 1, every: 1, end: 2 }] });
    assertRepaid(rows, FREE.principal);
    assert.deepEqual(extraMonths(rows), [1, 2]);
    assert.equal(rows.length, 10);
  });

  test('extras in the same month add up', () => {
    const rows = buildSchedule({ ...FREE, extras: [{ amount: 100_000, month: 2 }, { amount: 200_000, month: 2 }] });
    assertRepaid(rows, FREE.principal);
    assert.equal(rows[1].extra, 300_000);
    assert.equal(rows.length, 9);
  });

  test('with equal principal the principal part stays and the loan ends early', () => {
    const rows = buildSchedule({ ...LOAN, method: 'equalPrincipal', extras: [{ amount: 3_000_000, month: 3 }] });
    assertRepaid(rows, LOAN.principal);
    assert.equal(rows.length, 9);
    for (const row of rows.slice(0, -1)) assert.equal(row.principal, 833_333);
  });
});

describe('extra payments that lower the installment', () => {
  test('the term stays and the installment is recomputed from the new balance', () => {
    const rows = buildSchedule({ ...FREE, extras: [{ amount: 300_000, month: 2 }], extraStrategy: 'lowerPayment' });
    assertRepaid(rows, FREE.principal);
    assert.equal(rows.length, 12);
    assert.deepEqual(rows.map((row) => row.payment), [100_000, 100_000, ...new Array(10).fill(70_000)]);
  });

  test('with interest the new installment amortizes the balance over the remaining months', () => {
    const rows = buildSchedule({ ...LOAN, extras: [{ amount: 2_000_000, month: 3 }], extraStrategy: 'lowerPayment' });
    assertRepaid(rows, LOAN.principal);
    assert.equal(rows.length, 12);
    const level = roundCents(annuityPayment(rows[2].balance, LOAN.monthlyRate, 9));
    assert.equal(level, 655_007);
    for (const row of rows.slice(3, -1)) assert.equal(row.payment, level);
    assert.ok(Math.abs(rows[11].payment - level) < 10, 'the last installment only absorbs rounding');
  });

  test('each recurring extra lowers the installment again', () => {
    const rows = buildSchedule({
      ...LOAN,
      extras: [{ amount: 100_000, month: 1, every: 1 }],
      extraStrategy: 'lowerPayment',
    });
    assertRepaid(rows, LOAN.principal);
    assert.equal(rows.length, 12);
    for (let k = 1; k < rows.length; k += 1) assert.ok(rows[k].payment < rows[k - 1].payment, `month ${k + 1}`);
  });
});

describe('limits of extra payments', () => {
  test('an extra larger than the balance is capped and ends the loan', () => {
    const rows = buildSchedule({ ...LOAN, extras: [{ amount: 50_000_000, month: 4 }] });
    assertRepaid(rows, LOAN.principal);
    assert.equal(rows.length, 4);
    assert.equal(rows[3].extra, rows[2].balance - rows[3].principal);
  });

  test('an extra in the final month has nothing left to pay', () => {
    const rows = buildSchedule({ ...LOAN, extras: [{ amount: 100_000, month: 12 }] });
    assert.equal(rows[11].extra, 0);
    assert.deepEqual(rows, buildSchedule(LOAN));
  });

  test('extras after the loan is repaid are ignored', () => {
    const rows = buildSchedule({ ...FREE, extras: [{ amount: 300_000, month: 2 }, { amount: 50_000, month: 11 }] });
    assertRepaid(rows, FREE.principal);
    assert.equal(rows.length, 9);
    assert.equal(sumRows(rows).extra, 300_000);
  });

  test('an extra during an interest-only grace period lowers the first installment', () => {
    const rows = buildSchedule({ ...LOAN, graceMonths: 2, extras: [{ amount: 2_000_000, month: 1 }] });
    assertRepaid(rows, LOAN.principal);
    assert.equal(rows.length, 12);
    assert.equal(rows[1].payment, 80_000, 'interest on the lower balance');
    assert.equal(rows[2].payment, roundCents(annuityPayment(8_000_000, LOAN.monthlyRate, 10)));
  });

  test('invalid extras are rejected', () => {
    const extras = [
      { amount: 0, month: 1 },
      { amount: 1.5, month: 1 },
      { amount: 100, month: 0 },
      { amount: 100, month: 1, every: -1 },
      { amount: 100, month: 5, every: 1, end: 4 },
    ];
    for (const extra of extras) {
      assert.throws(() => buildSchedule({ ...LOAN, extras: [extra] }), RangeError, JSON.stringify(extra));
    }
    assert.throws(() => buildSchedule({ ...LOAN, extras: 'none' }), RangeError);
  });
});
