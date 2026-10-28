import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  LIMITS,
  calculate,
  compareOffers,
  createCalculator,
  defaultInputs,
  demoState,
  reverseSolve,
  validateInputs,
} from '../src/calculator.js';
import { formatMoney, formatPercent } from '../src/format.js';

describe('calculate', () => {
  test('the defaults are 100,000 at 1 % a month over 12 months: 8,884.88 a month', () => {
    const result = calculate({});
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.inputs, defaultInputs());
    assert.equal(result.rows.length, 12);
    assert.equal(result.years.length, 1);
    const { summary } = result;
    assert.equal(summary.installment, 888_488);
    assert.equal(formatMoney(summary.installment, 'USD', 'en'), '$8,884.88');
    assert.equal(summary.totalInterest, 661_853);
    assert.equal(summary.totalCost, 10_661_853);
    assert.equal(summary.monthlyRate, 0.01);
    assert.equal(formatPercent(summary.effectiveAnnualRate, 'en'), '12.68%');
    assert.ok(Math.abs(summary.monthlyCostRate - 0.01) < 1e-6);
  });

  test('an annual nominal rate is divided by twelve', () => {
    const { params, summary } = calculate({ rate: 12, rateBasis: 'annual' });
    assert.ok(Math.abs(params.monthlyRate - 0.01) < 1e-15);
    assert.equal(summary.installment, 888_488);
    assert.ok(Math.abs(summary.effectiveAnnualRate - 0.12682503013196977) < 1e-12);
  });

  test('form values become cents and rate fractions', () => {
    const { params } = calculate({
      amount: 1234.56,
      rate: 2.5,
      taxRate: 15,
      fees: 99.99,
      extras: [{ amount: 100, month: 2, every: 1 }],
    });
    assert.equal(params.principal, 123_456);
    assert.equal(params.monthlyRate, 0.025);
    assert.equal(params.taxRate, 0.15);
    assert.equal(params.fees, 9_999);
    assert.deepEqual(params.extras, [{ amount: 10_000, month: 2, every: 1, end: 12 }]);
  });

  test('missing fields take the defaults', () => {
    const result = calculate({ amount: undefined, termMonths: 24 });
    assert.equal(result.inputs.amount, 100_000);
    assert.equal(result.summary.months, 24);
  });

  test('invalid inputs give errors and no schedule', () => {
    const result = calculate({ amount: 0 });
    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, [{ field: 'amount', code: 'min', limit: LIMITS.minAmount }]);
    assert.deepEqual([result.params, result.rows, result.summary, result.years], [null, [], null, []]);
  });
});

describe('validateInputs', () => {
  const cases = [
    ['a missing amount', { amount: NaN }, { field: 'amount', code: 'required' }],
    ['an amount given as text', { amount: '100' }, { field: 'amount', code: 'required' }],
    ['a zero amount', { amount: 0 }, { field: 'amount', code: 'min', limit: 1 }],
    ['an amount above one billion', { amount: 2e9 }, { field: 'amount', code: 'max', limit: 1e9 }],
    ['a negative rate', { rate: -1 }, { field: 'rate', code: 'min', limit: 0 }],
    ['a monthly rate above 20 %', { rate: 21 }, { field: 'rate', code: 'max', limit: 20 }],
    ['an annual rate above 240 %', { rate: 241, rateBasis: 'annual' }, { field: 'rate', code: 'max', limit: 240 }],
    ['an unknown rate basis', { rateBasis: 'weekly' }, { field: 'rateBasis', code: 'invalid' }],
    ['a fractional term', { termMonths: 12.5 }, { field: 'termMonths', code: 'integer' }],
    ['a zero term', { termMonths: 0 }, { field: 'termMonths', code: 'min', limit: 1 }],
    ['a term above 50 years', { termMonths: 601 }, { field: 'termMonths', code: 'max', limit: 600 }],
    ['an unknown method', { method: 'balloon' }, { field: 'method', code: 'invalid' }],
    ['a negative tax rate', { taxRate: -5 }, { field: 'taxRate', code: 'min', limit: 0 }],
    ['a tax rate above 100 %', { taxRate: 101 }, { field: 'taxRate', code: 'max', limit: 100 }],
    ['negative fees', { fees: -1 }, { field: 'fees', code: 'min', limit: 0 }],
    ['fees that eat the whole loan', { fees: 100_000 }, { field: 'fees', code: 'exceedsAmount' }],
    ['a grace period as long as the term', { graceMonths: 12 }, { field: 'graceMonths', code: 'max', limit: 11 }],
    ['a fractional grace period', { graceMonths: 1.5 }, { field: 'graceMonths', code: 'integer' }],
    ['an unknown grace type', { graceType: 'holiday' }, { field: 'graceType', code: 'invalid' }],
    ['an unknown extra strategy', { extraStrategy: 'skip' }, { field: 'extraStrategy', code: 'invalid' }],
    ['an unknown currency', { currency: 'GBP' }, { field: 'currency', code: 'invalid' }],
    ['extras that are not a list', { extras: 'none' }, { field: 'extras', code: 'invalid' }],
    ['more than 24 extras', { extras: new Array(25).fill({ amount: 1, month: 1 }) }, { field: 'extras', code: 'tooMany', limit: 24 }],
    ['an empty extra', { extras: [null] }, { field: 'extras', code: 'amount', index: 0 }],
    ['an extra of zero', { extras: [{ amount: 0, month: 1 }] }, { field: 'extras', code: 'amount', index: 0 }],
    ['an extra after the term', { extras: [{ amount: 10, month: 1 }, { amount: 10, month: 13 }] }, { field: 'extras', code: 'month', index: 1 }],
    ['an extra with a fractional interval', { extras: [{ amount: 10, month: 1, every: 1.5 }] }, { field: 'extras', code: 'every', index: 0 }],
    ['an extra that ends before it starts', { extras: [{ amount: 10, month: 5, every: 1, end: 4 }] }, { field: 'extras', code: 'end', index: 0 }],
    [
      'a capitalized grace period beyond the supported balance',
      { amount: 1e9, rate: 20, termMonths: 600, graceMonths: 13, graceType: 'capitalized' },
      { field: 'graceMonths', code: 'tooLarge' },
    ],
  ];
  for (const [name, inputs, error] of cases) {
    test(`rejects ${name}`, () => {
      const result = validateInputs(inputs);
      assert.deepEqual(result.errors, [error]);
      assert.equal(result.params, null);
    });
  }

  test('reports every problem at once', () => {
    const { errors } = validateInputs({ amount: 0, rate: -1, currency: 'GBP' });
    assert.deepEqual(errors.map((error) => error.field), ['amount', 'rate', 'currency']);
  });

  test('accepts the edges of every range', () => {
    const edges = {
      amount: 1e9,
      rate: 240,
      rateBasis: 'annual',
      termMonths: 600,
      taxRate: 100,
      fees: 999_999_999.99,
      graceMonths: 599,
      extras: new Array(24).fill({ amount: 1, month: 600 }),
    };
    assert.deepEqual(validateInputs(edges).errors, []);
    assert.equal(calculate(edges).ok, true);
  });
});

describe('cost rate', () => {
  test('without fees or tax it equals the effective annual rate', () => {
    const { summary } = calculate({ rate: 2.5, termMonths: 36 });
    assert.ok(Math.abs(summary.annualCostRate - summary.effectiveAnnualRate) < 1e-6);
  });

  test('fees raise it, and it discounts every payment back to the money received', () => {
    const { params, rows, summary } = calculate({ fees: 1000 });
    assert.ok(summary.annualCostRate > summary.effectiveAnnualRate);
    const discount = 1 + summary.monthlyCostRate;
    const presentValue = rows.reduce((sum, row) => sum + (row.payment + row.extra) / discount ** row.month, 0);
    assert.ok(Math.abs(presentValue - (params.principal - params.fees)) < 1e-4);
  });

  test('tax on interest is part of the cost', () => {
    const { summary } = calculate({ taxRate: 15 });
    assert.ok(Math.abs(summary.monthlyCostRate - 0.01 * 1.15) < 1e-6);
  });

  test('prepaying without a penalty leaves it unchanged', () => {
    for (const extraStrategy of ['shortenTerm', 'lowerPayment']) {
      const { summary } = calculate({ extras: [{ amount: 20_000, month: 3 }], extraStrategy });
      assert.ok(Math.abs(summary.monthlyCostRate - 0.01) < 1e-6, extraStrategy);
    }
  });
});

describe('compareOffers', () => {
  test('demo: the lower rate loses because of its higher fees', () => {
    const { inputs, compare } = demoState();
    const result = compareOffers(inputs, compare);
    assert.ok(result.b.summary.effectiveAnnualRate < result.a.summary.effectiveAnnualRate);
    assert.equal(result.cheaperByCost, 'a');
    assert.equal(result.cheaperByRate, 'a');
    assert.equal(result.difference.totalCost, 27_485);
    assert.equal(result.difference.totalCost, result.b.summary.totalCost - result.a.summary.totalCost);
    assert.equal(result.difference.totalInterest, -20_515);
    assert.equal(result.difference.totalPayment, -20_515);
    assert.ok(result.difference.annualCostRate > 0);
  });

  test('the cheaper second offer wins on both counts', () => {
    const result = compareOffers({ rate: 1.2 }, { rate: 1 });
    assert.equal(result.cheaperByCost, 'b');
    assert.equal(result.cheaperByRate, 'b');
    assert.ok(result.difference.totalCost < 0);
  });

  test('identical offers tie', () => {
    const result = compareOffers({}, {});
    assert.equal(result.cheaperByCost, 'tie');
    assert.equal(result.cheaperByRate, 'tie');
    assert.deepEqual(result.difference, { totalCost: 0, totalPayment: 0, totalInterest: 0, annualCostRate: 0 });
  });

  test('an invalid offer gives no verdict', () => {
    const result = compareOffers({}, { amount: 0 });
    assert.equal(result.a.ok, true);
    assert.equal(result.b.ok, false);
    assert.deepEqual([result.difference, result.cheaperByCost, result.cheaperByRate], [null, null, null]);
  });
});

describe('reverseSolve', () => {
  test('largest loan for 8,884.88 a month', () => {
    assert.equal(reverseSolve({}, 'amount', 8884.88), 100_000.01);
  });

  test('rate behind 8,884.88 a month, in the rate basis of the inputs', () => {
    assert.ok(Math.abs(reverseSolve({}, 'rate', 8884.88) - 1) < 1e-4);
    assert.ok(Math.abs(reverseSolve({ rateBasis: 'annual', rate: 12 }, 'rate', 8884.88) - 12) < 1e-3);
  });

  test('term for 8,884.88 a month', () => {
    assert.equal(reverseSolve({}, 'term', 8884.88), 12);
  });

  test('tax on interest is honoured', () => {
    const installment = calculate({ taxRate: 15 }).summary.installment / 100;
    assert.equal(reverseSolve({ taxRate: 15 }, 'term', installment), 12);
    assert.ok(Math.abs(reverseSolve({ taxRate: 15 }, 'rate', installment) - 1) < 1e-4);
  });

  test('only the fields a solve needs have to be valid', () => {
    assert.equal(reverseSolve({ amount: 0 }, 'amount', 8884.88), 100_000.01);
    assert.equal(reverseSolve({ termMonths: 0 }, 'term', 8884.88), 12);
    assert.equal(reverseSolve({ amount: 0 }, 'rate', 8884.88), null);
    assert.equal(reverseSolve({ rate: -1 }, 'term', 8884.88), null);
  });

  test('null for a payment that is not positive or can never repay the loan', () => {
    for (const payment of [0, -5, NaN]) assert.equal(reverseSolve({}, 'amount', payment), null);
    assert.equal(reverseSolve({}, 'term', 1000), null, 'only covers the interest');
    assert.equal(reverseSolve({}, 'rate', 8000), null, 'does not repay the principal');
  });

  test('an unknown target throws', () => {
    assert.throws(() => reverseSolve({}, 'fees', 1), RangeError);
  });
});

describe('createCalculator', () => {
  test('update merges a patch into the current inputs and recalculates', () => {
    const calculator = createCalculator();
    const first = calculator.getState();
    assert.equal(first.summary.installment, 888_488);
    const next = calculator.update({ termMonths: 24 });
    assert.equal(calculator.getState(), next);
    assert.equal(next.summary.months, 24);
    assert.equal(next.inputs.amount, 100_000);
    assert.equal(first.inputs.termMonths, 12, 'earlier states stay unchanged');
  });

  test('an invalid patch is kept so the form can show it, and a fix recovers', () => {
    const calculator = createCalculator({ amount: 50_000 });
    assert.equal(calculator.update({ amount: 0 }).ok, false);
    assert.equal(calculator.getState().errors[0].field, 'amount');
    assert.equal(calculator.update({ amount: 60_000 }).ok, true);
  });

  test('reset returns to the defaults', () => {
    const calculator = createCalculator(demoState().inputs);
    assert.deepEqual(calculator.reset().inputs, defaultInputs());
  });
});

describe('demoState', () => {
  test('is deterministic and returns fresh objects', () => {
    assert.deepEqual(demoState(), demoState());
    assert.notEqual(demoState().inputs, demoState().inputs);
  });

  test('is a valid 12-month loan with a second offer to compare', () => {
    const { inputs, compare } = demoState();
    const a = calculate(inputs);
    const b = calculate(compare);
    assert.ok(a.ok && b.ok);
    assert.equal(a.summary.months, 12);
    assert.equal(b.summary.months, 12);
    assert.equal(formatMoney(a.summary.installment, 'USD', 'en'), '$2,200.32');
  });
});
