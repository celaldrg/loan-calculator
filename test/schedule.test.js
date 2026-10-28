import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { formatMoney } from '../src/format.js';
import {
  annuityFactor,
  annuityPayment,
  buildSchedule,
  effectiveAnnualRate,
  groupByYear,
  sumRows,
  summarizeSchedule,
  toMonthlyRate,
} from '../src/loan.js';
import { fromCents, roundCents, toCents } from '../src/money.js';

/** 100,000.00 at 1 % per month over 12 months, in cents. */
const LOAN = Object.freeze({ principal: 10_000_000, monthlyRate: 0.01, termMonths: 12 });

/**
 * Asserts the bookkeeping identities every schedule must satisfy.
 * @param {import('../src/loan.js').ScheduleRow[]} rows schedule
 * @param {{principal: number, monthlyRate: number, taxRate?: number}} loan loan parameters
 */
function assertConsistent(rows, { principal, monthlyRate, taxRate = 0 }) {
  let balance = principal;
  for (const row of rows) {
    for (const key of ['payment', 'principal', 'interest', 'tax', 'extra', 'balance']) {
      assert.ok(Number.isInteger(row[key]), `month ${row.month}: ${key} is whole cents`);
    }
    assert.equal(row.interest, roundCents(balance * monthlyRate), `month ${row.month}: interest`);
    assert.equal(row.tax, roundCents(row.interest * taxRate), `month ${row.month}: tax`);
    assert.equal(row.payment, row.principal + row.interest + row.tax, `month ${row.month}: payment`);
    balance -= row.principal + row.extra;
    assert.equal(row.balance, balance, `month ${row.month}: balance`);
    assert.ok(row.balance >= 0, `month ${row.month}: balance never negative`);
  }
  const totals = sumRows(rows);
  assert.equal(totals.principal + totals.extra, principal, 'principal parts add up to the loan');
  assert.equal(rows[rows.length - 1].balance, 0, 'balance ends at exactly 0.00');
}

/**
 * Changes of the level installment, the last installment left out.
 * @param {import('../src/loan.js').ScheduleRow[]} rows schedule
 * @returns {{month: number, step: number}[]} month and size in cents of each change
 */
function levelChanges(rows) {
  const changes = [];
  for (let k = 1; k < rows.length - 1; k += 1) {
    const step = rows[k].payment - rows[k - 1].payment;
    if (step !== 0) changes.push({ month: rows[k].month, step });
  }
  return changes;
}

/**
 * How far the last installment is from the installment before it.
 * @param {import('../src/loan.js').ScheduleRow[]} rows schedule with at least two rows
 * @returns {number} relative difference (0.01 = 1 %)
 */
function lastDrift(rows) {
  const level = rows[rows.length - 2].payment;
  return Math.abs(rows[rows.length - 1].payment - level) / level;
}

describe('money helpers', () => {
  test('roundCents rounds halves away from zero and ignores float noise', () => {
    assert.equal(roundCents(1234.5), 1235);
    assert.equal(roundCents(1234.4999999999998), 1235);
    assert.equal(roundCents(1234.49), 1234);
    assert.equal(roundCents(-2.5), -3);
    assert.ok(Object.is(roundCents(-0.4), 0), 'no negative zero');
  });

  test('roundCents does not push large values just below a half over it', () => {
    assert.equal(roundCents(5_821_298_498.49998), 5_821_298_498);
    assert.equal(roundCents(5_821_298_498.5), 5_821_298_499);
    assert.equal(roundCents(99_999_999_999.4999), 99_999_999_999);
  });

  test('toCents and fromCents convert between units and cents', () => {
    assert.equal(toCents(0.1 + 0.2), 30);
    assert.equal(toCents(100000.555), 10000056);
    assert.equal(toCents(8884.88), 888488);
    assert.equal(fromCents(888488), 8884.88);
  });
});

describe('equal installments (annuity)', () => {
  test('100,000 at 1 % per month over 12 months is 8,884.88 per month', () => {
    const rows = buildSchedule(LOAN);
    assert.equal(rows.length, 12);
    for (const row of rows.slice(0, 11)) assert.equal(row.payment, 888488);
    assert.equal(formatMoney(rows[0].payment, 'USD', 'en'), '$8,884.88');
    assert.equal(formatMoney(rows[0].payment, 'TRY', 'tr'), '₺8.884,88');
    assert.equal(summarizeSchedule(rows).installment, 888488);
    assert.equal(roundCents(annuityPayment(LOAN.principal, 0.01, 12)), 888488);
  });

  test('the schedule is cent-exact and the last installment absorbs rounding', () => {
    const rows = buildSchedule(LOAN);
    assertConsistent(rows, LOAN);
    assert.deepEqual(rows[0], {
      month: 1, payment: 888488, principal: 788488, interest: 100000, tax: 0, extra: 0, balance: 9211512, grace: false,
    });
    assert.equal(rows[11].payment, 888485);
    assert.equal(rows[11].principal, rows[10].balance);
    const summary = summarizeSchedule(rows);
    assert.equal(summary.totalPrincipal, 10_000_000);
    assert.equal(summary.totalInterest, 661853);
    assert.equal(summary.totalPayment, 10_661_853);
  });

  test('an annual nominal rate of 12 % equals 1 % per month', () => {
    assert.equal(toMonthlyRate(0.12, 'annual'), 0.01);
    assert.equal(toMonthlyRate(0.015, 'monthly'), 0.015);
    const annual = buildSchedule({ ...LOAN, monthlyRate: toMonthlyRate(0.12, 'annual') });
    assert.deepEqual(annual, buildSchedule(LOAN));
  });

  test('the effective annual rate compounds the monthly rate', () => {
    assert.ok(Math.abs(effectiveAnnualRate(0.01) - 0.12682503013196977) < 1e-15);
    assert.ok(Math.abs(effectiveAnnualRate(0.03) - (1.03 ** 12 - 1)) < 1e-14);
    assert.equal(effectiveAnnualRate(0), 0);
  });
});

describe('equal principal', () => {
  const EQUAL = { principal: 12_000_000, monthlyRate: 0.01, termMonths: 12, method: 'equalPrincipal' };

  test('principal parts are equal and interest falls linearly', () => {
    const rows = buildSchedule(EQUAL);
    assertConsistent(rows, EQUAL);
    rows.forEach((row, index) => {
      assert.equal(row.principal, 1_000_000);
      assert.equal(row.interest, (12 - index) * 10_000);
    });
    assert.equal(rows[0].payment, 1_120_000);
    assert.equal(rows[11].payment, 1_010_000);
  });

  test('totals: interest = rate x loan x (n + 1) / 2', () => {
    const summary = summarizeSchedule(buildSchedule(EQUAL));
    assert.equal(summary.totalInterest, 780_000);
    assert.equal(summary.totalPayment, 12_780_000);
    assert.equal(summary.installment, 1_120_000);
    assert.equal(summary.lastPayment, 1_010_000);
  });

  test('the last installment absorbs the rounding of the principal part', () => {
    const rows = buildSchedule({ principal: 100_000, monthlyRate: 0, termMonths: 3, method: 'equalPrincipal' });
    assert.deepEqual(rows.map((row) => row.principal), [33333, 33333, 33334]);
  });
});

describe('tax on interest', () => {
  test('every installment carries exactly interest x tax rate on top of the interest', () => {
    const taxed = { ...LOAN, taxRate: 0.3 };
    const rows = buildSchedule(taxed);
    assertConsistent(rows, taxed);
    assert.equal(rows[0].interest, 100_000);
    assert.equal(rows[0].tax, 30_000);
    for (const row of rows) {
      assert.equal(row.tax, roundCents(row.interest * 0.3));
      assert.equal(row.payment - row.principal - row.interest, row.tax);
    }
    // The level installment is the annuity at the gross rate 1 % x 1.3.
    assert.equal(rows[0].payment, roundCents(annuityPayment(LOAN.principal, 0.013, 12)));
    assert.equal(rows[0].payment, 905417);
  });

  test('with equal principal the tax adds exactly interest x tax rate to each installment', () => {
    const base = { principal: 12_345_678, monthlyRate: 0.0275, termMonths: 24, method: 'equalPrincipal' };
    const plain = buildSchedule(base);
    const taxed = buildSchedule({ ...base, taxRate: 0.15 });
    assert.equal(taxed.length, plain.length);
    taxed.forEach((row, index) => {
      assert.equal(row.principal, plain[index].principal);
      assert.equal(row.interest, plain[index].interest);
      assert.equal(row.payment - plain[index].payment, roundCents(plain[index].interest * 0.15));
    });
    assert.equal(summarizeSchedule(taxed).totalTax, sumRows(taxed).tax);
    assert.ok(summarizeSchedule(taxed).totalTax > 0);
  });

  test('a zero tax rate adds nothing', () => {
    const rows = buildSchedule({ ...LOAN, taxRate: 0 });
    assert.ok(rows.every((row) => row.tax === 0));
  });
});

describe('zero-interest loans', () => {
  test('annuity: the loan is split into equal parts without interest', () => {
    const rows = buildSchedule({ principal: 1_200_000, monthlyRate: 0, termMonths: 12 });
    assert.ok(rows.every((row) => row.payment === 100_000 && row.interest === 0 && row.tax === 0));
    assert.equal(summarizeSchedule(rows).totalInterest, 0);
    assert.equal(annuityFactor(0, 12), 1 / 12);
  });

  test('annuity: rounding goes to the last installment', () => {
    const rows = buildSchedule({ principal: 100_000, monthlyRate: 0, termMonths: 3, taxRate: 0.3 });
    assert.deepEqual(rows.map((row) => row.payment), [33333, 33333, 33334]);
    assert.equal(rows[2].balance, 0);
  });
});

describe('grace period', () => {
  test('interest-only months pay interest and tax, then the loan amortizes', () => {
    const loan = { ...LOAN, taxRate: 0.1, graceMonths: 3 };
    const rows = buildSchedule(loan);
    assertConsistent(rows, loan);
    assert.equal(rows.length, 12);
    for (const row of rows.slice(0, 3)) {
      assert.equal(row.grace, true);
      assert.equal(row.principal, 0);
      assert.equal(row.payment, 110_000);
      assert.equal(row.balance, LOAN.principal);
    }
    assert.equal(rows[3].grace, false);
    assert.equal(rows[3].payment, roundCents(annuityPayment(LOAN.principal, 0.011, 9)));
    assert.equal(summarizeSchedule(rows).installment, rows[3].payment);
  });

  test('capitalized months pay nothing and add interest plus tax to the balance', () => {
    const loan = { ...LOAN, taxRate: 0.1, graceMonths: 2, graceType: 'capitalized' };
    const rows = buildSchedule(loan);
    assertConsistent(rows, loan);
    assert.deepEqual(rows[0], {
      month: 1, payment: 0, principal: -110_000, interest: 100_000, tax: 10_000, extra: 0, balance: 10_110_000, grace: true,
    });
    assert.equal(rows[1].interest, 101_100);
    assert.equal(rows[1].balance, 10_110_000 + 101_100 + 10_110);
    assert.equal(rows[2].payment, roundCents(annuityPayment(rows[1].balance, 0.011, 10)));
  });

  test('equal principal after an interest-only grace splits the loan over the remaining months', () => {
    const rows = buildSchedule({ ...LOAN, method: 'equalPrincipal', graceMonths: 2 });
    assert.ok(rows.slice(2).every((row) => row.principal === 1_000_000));
  });
});

describe('rounding drift', () => {
  test('a 30-year loan at 5 % per month is corrected instead of ending in a balloon', () => {
    const loan = { principal: 10_000_000, monthlyRate: 0.05, termMonths: 360 };
    const rows = buildSchedule(loan);
    assertConsistent(rows, loan);
    assert.equal(rows.length, 360);
    const { installment, lastPayment } = summarizeSchedule(rows);
    assert.ok(Math.abs(lastPayment - installment) <= installment * 0.01, 'last installment within 1 %');
    const regular = rows.slice(0, -1).map((row) => row.payment);
    assert.ok(Math.max(...regular) - Math.min(...regular) <= 1, 'the level moves by one cent at most');
  });

  test('fragile loans end within 1 % of the level after a few one-cent corrections', () => {
    const loans = [
      { principal: 100_000_000, monthlyRate: 0.03, termMonths: 360 },
      { principal: 100_000_000, monthlyRate: 0.05, termMonths: 600 },
      { principal: 100_000, monthlyRate: 0.005, termMonths: 360 },
    ];
    for (const loan of loans) {
      const rows = buildSchedule(loan);
      const name = JSON.stringify(loan);
      assertConsistent(rows, loan);
      assert.ok(lastDrift(rows) <= 0.01, `${name}: last installment within 1 %`);
      const changes = levelChanges(rows);
      assert.ok(changes.length > 0 && changes.length <= 10, `${name}: ${changes.length} corrections`);
      assert.ok(changes.every(({ step }) => Math.abs(step) === 1), `${name}: one cent at a time`);
    }
  });

  test('long loans that never become fragile still end within 2 % of the level', () => {
    const loans = [
      { principal: 2_500_000, monthlyRate: 0.01, termMonths: 360, taxRate: 0.15 },
      { principal: 25_000_000, monthlyRate: 0.02, termMonths: 360, taxRate: 0.3 },
      { principal: 1_000_000, monthlyRate: 0.005, termMonths: 360 },
    ];
    for (const loan of loans) assert.ok(lastDrift(buildSchedule(loan)) <= 0.02, JSON.stringify(loan));
    let worst = 0;
    for (const amount of [10_000, 50_000, 100_000, 250_000, 500_000]) {
      for (const annual of [0.06, 0.12, 0.18, 0.24, 0.3, 0.36, 0.42, 0.48]) {
        for (const termMonths of [120, 180, 240, 300, 360]) {
          for (const taxRate of [0, 0.15, 0.3]) {
            const rows = buildSchedule({ principal: amount * 100, monthlyRate: annual / 12, termMonths, taxRate });
            worst = Math.max(worst, lastDrift(rows));
          }
        }
      }
    }
    assert.ok(worst <= 0.02, `worst last-installment drift ${worst}`);
  });

  test('a mild drift stays in the last installment instead of moving the level', () => {
    // 1,000 at 1 % per month over 5 years: 22.24 a month and a last installment of 22.62 (1.7 % drift).
    const rows = buildSchedule({ principal: 100_000, monthlyRate: 0.01, termMonths: 60 });
    assert.deepEqual(levelChanges(rows), []);
    assert.equal(rows[0].payment, 2224);
    assert.equal(rows[59].payment, 2262);
  });

  test('long, expensive loans: one-cent corrections, never month to month, last installment in line', () => {
    let corrected = 0;
    for (const amount of [1_000, 25_000, 1_000_000]) {
      for (const monthlyRate of [0.005, 0.015, 0.03, 0.05, 0.1, 0.2]) {
        for (const termMonths of [120, 240, 360, 600]) {
          for (const taxRate of [0, 0.3]) {
            const loan = { principal: amount * 100, monthlyRate, termMonths, taxRate };
            const rows = buildSchedule(loan);
            const name = JSON.stringify(loan);
            assertConsistent(rows, loan);
            const changes = levelChanges(rows);
            assert.ok(changes.every(({ step }) => Math.abs(step) === 1), `${name}: one-cent steps`);
            assert.ok(changes.every((change, k) => k === 0 || change.month - changes[k - 1].month > 1), `${name}: no flips`);
            assert.ok(lastDrift(rows) <= (changes.length > 0 ? 0.01 : 0.02), `${name}: last installment in line`);
            if (changes.length > 0) corrected += 1;
          }
        }
      }
    }
    assert.ok(corrected > 50, `${corrected} of the 144 loans needed corrections`);
  });

  test('realistic loans keep a single level installment', () => {
    const loans = [
      { principal: 200_000_000, monthlyRate: 0.03, termMonths: 120 },
      { principal: 100_000_000, monthlyRate: 0.01, termMonths: 360 },
      { principal: 50_000_000, monthlyRate: 0.0425, termMonths: 36, taxRate: 0.3 },
    ];
    for (const loan of loans) {
      const rows = buildSchedule(loan);
      assertConsistent(rows, loan);
      assert.equal(new Set(rows.slice(0, -1).map((row) => row.payment)).size, 1);
    }
  });
});

describe('summaries and grouping', () => {
  test('summarizeSchedule adds fees to the total cost', () => {
    const summary = summarizeSchedule(buildSchedule(LOAN), 150_000);
    assert.equal(summary.fees, 150_000);
    assert.equal(summary.totalCost, summary.totalPayment + 150_000);
    assert.equal(summary.months, 12);
    assert.equal(summary.totalExtra, 0);
  });

  test('groupByYear splits the schedule into loan years with subtotals', () => {
    const rows = buildSchedule({ ...LOAN, termMonths: 30 });
    const years = groupByYear(rows);
    assert.deepEqual(years.map((year) => year.rows.length), [12, 12, 6]);
    assert.deepEqual(years.map((year) => year.year), [1, 2, 3]);
    assert.equal(years[0].balance, rows[11].balance);
    assert.equal(years[2].balance, 0);
    const interest = years.reduce((sum, year) => sum + year.totals.interest, 0);
    assert.equal(interest, sumRows(rows).interest);
  });
});

describe('parameter checks', () => {
  const cases = [
    ['zero principal', { principal: 0 }],
    ['fractional cents', { principal: 100.5 }],
    ['negative rate', { monthlyRate: -0.01 }],
    ['zero term', { termMonths: 0 }],
    ['term above 600 months', { termMonths: 601 }],
    ['unknown method', { method: 'balloon' }],
    ['tax above 100 %', { taxRate: 1.5 }],
    ['grace as long as the term', { graceMonths: 12 }],
    ['unknown grace type', { graceType: 'none' }],
    ['unknown extra strategy', { extraStrategy: 'both' }],
    ['extras not a list', { extras: 'none' }],
    ['extra without amount', { extras: [{ month: 1 }] }],
    ['extra ending before it starts', { extras: [{ amount: 100, month: 5, every: 1, end: 4 }] }],
  ];
  for (const [name, patch] of cases) {
    test(`rejects ${name}`, () => {
      assert.throws(() => buildSchedule({ ...LOAN, ...patch }), RangeError);
    });
  }
});

describe('bookkeeping holds across a grid of loans', () => {
  const principals = [100, 123_456, 10_000_000, 987_654_321];
  const rates = [0, 0.0001, 0.0125, 0.045];
  const terms = [1, 7, 60, 360];
  const taxes = [0, 0.3];
  const methods = ['annuity', 'equalPrincipal'];
  const graces = [
    { graceMonths: 0 },
    { graceMonths: 3, graceType: 'interestOnly' },
    { graceMonths: 3, graceType: 'capitalized' },
  ];

  test('768 schedules repay exactly, never overpay and never exceed the term', () => {
    let checked = 0;
    for (const principal of principals) {
      for (const monthlyRate of rates) {
        for (const termMonths of terms) {
          for (const taxRate of taxes) {
            for (const method of methods) {
              for (const grace of graces) {
                const loan = { principal, monthlyRate, termMonths, taxRate, method, ...grace };
                if (grace.graceMonths >= termMonths) loan.graceMonths = termMonths - 1;
                const rows = buildSchedule(loan);
                assertConsistent(rows, loan);
                assert.ok(rows.length <= termMonths);
                assert.ok(rows.every((row) => row.grace || row.principal >= 0));
                checked += 1;
              }
            }
          }
        }
      }
    }
    assert.equal(checked, 768);
  });
});
