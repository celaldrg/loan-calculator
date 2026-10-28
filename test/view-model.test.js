import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { LIMITS, RATE_TIE, calculate, compareOffers, defaultInputs, demoState } from '../src/calculator.js';
import { STRINGS } from '../src/i18n.js';
import {
  MAX_MONTHLY_BARS,
  RATE_DISPLAY_CAP,
  TERM_STOPS,
  amountText,
  cappedRate,
  chartBars,
  comparisonRows,
  decimalText,
  extraSavings,
  formatAxis,
  headlineKey,
  nearestStop,
  niceScale,
} from '../src/view-model.js';

describe('term slider stops', () => {
  test('every month up to five years, then coarser steps up to the term limit', () => {
    assert.equal(TERM_STOPS.length, 100);
    assert.deepEqual(TERM_STOPS.slice(0, 3), [1, 2, 3]);
    assert.deepEqual(TERM_STOPS.slice(58, 62), [59, 60, 66, 72]);
    assert.ok(TERM_STOPS.includes(120) && TERM_STOPS.includes(132) && TERM_STOPS.includes(360));
    assert.equal(TERM_STOPS.at(-1), LIMITS.maxTermMonths);
    for (let i = 1; i < TERM_STOPS.length; i += 1) assert.ok(TERM_STOPS[i] > TERM_STOPS[i - 1]);
  });

  test('nearestStop snaps to the closest stop, ties to the shorter term', () => {
    assert.equal(TERM_STOPS[nearestStop(12)], 12);
    assert.equal(TERM_STOPS[nearestStop(64)], 66);
    assert.equal(TERM_STOPS[nearestStop(63)], 60, 'tie between 60 and 66');
    assert.equal(TERM_STOPS[nearestStop(125)], 120);
    assert.equal(nearestStop(0), 0);
    assert.equal(nearestStop(10_000), TERM_STOPS.length - 1);
  });
});

describe('chart axis', () => {
  test('niceScale picks a readable step that covers the maximum', () => {
    assert.deepEqual(niceScale(100), { step: 25, top: 100 });
    assert.deepEqual(niceScale(2200.32), { step: 600, top: 2400 });
    assert.deepEqual(niceScale(95_000), { step: 25_000, top: 100_000 });
    assert.deepEqual(niceScale(100, 5), { step: 20, top: 100 });
  });

  test('niceScale never cuts the maximum off and wastes less than half the height', () => {
    for (let max = 0.37; max < 1e10; max *= 1.07) {
      const { step, top } = niceScale(max);
      assert.ok(top >= max && top < max * 1.5, `max ${max} top ${top}`);
      assert.equal(top, step * 4);
    }
  });

  test('niceScale falls back to a unit scale without positive values', () => {
    for (const max of [0, -5, Number.NaN]) assert.deepEqual(niceScale(max), { step: 1, top: 4 });
  });

  test('formatAxis groups digits and shortens millions and billions', () => {
    assert.equal(formatAxis(0, 'en'), '0');
    assert.equal(formatAxis(2.5, 'en'), '2.5');
    assert.equal(formatAxis(24_000, 'en'), '24,000');
    assert.equal(formatAxis(40_000, 'tr'), '40.000');
    assert.equal(formatAxis(999_999, 'en'), '999,999');
    assert.equal(formatAxis(1_500_000, 'en'), '1.5M');
    assert.equal(formatAxis(1_250_000, 'en'), '1.25M');
    assert.equal(formatAxis(1_500_000, 'tr'), '1,5 Mn');
    assert.equal(formatAxis(2e9, 'tr'), '2 Mr');
  });
});

describe('chartBars', () => {
  test('one bar per month for short loans', () => {
    const { unit, bars, startBalance } = chartBars(calculate({}).rows);
    assert.equal(unit, 'month');
    assert.equal(bars.length, 12);
    assert.equal(startBalance, 10_000_000);
    assert.deepEqual(bars[0], {
      label: 1, principal: 788_488, interest: 100_000, tax: 0, extra: 0, capitalized: 0, paid: 888_488, balance: 9_211_512,
    });
    assert.equal(bars[11].balance, 0);
  });

  test('one bar per loan year above the monthly limit', () => {
    const monthly = chartBars(calculate({ termMonths: MAX_MONTHLY_BARS }).rows);
    assert.equal(monthly.unit, 'month');
    const { unit, bars, startBalance } = chartBars(calculate({ termMonths: 120 }).rows);
    assert.equal(unit, 'year');
    assert.deepEqual(bars.map((bar) => bar.label), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(bars.reduce((sum, bar) => sum + bar.principal, 0), startBalance);
    assert.equal(bars[9].balance, 0);
  });

  test('a year bar adds up the months of the year', () => {
    const [year] = chartBars(calculate({}).rows, 6).bars;
    assert.deepEqual(year, {
      label: 1, principal: 10_000_000, interest: 661_853, tax: 0, extra: 0, capitalized: 0, paid: 10_661_853, balance: 0,
    });
  });

  test('capitalized grace months pay nothing and grow the balance', () => {
    const { bars, startBalance } = chartBars(calculate({ graceMonths: 1, graceType: 'capitalized', taxRate: 10 }).rows);
    assert.equal(startBalance, 10_000_000, 'the opening balance is the loan amount');
    assert.deepEqual(bars[0], {
      label: 1, principal: 0, interest: 0, tax: 0, extra: 0, capitalized: 110_000, paid: 0, balance: 10_110_000,
    });
    assert.equal(bars[1].paid, bars[1].principal + bars[1].interest + bars[1].tax);
  });

  test('extra payments count as paid', () => {
    const { bars } = chartBars(calculate({ extras: [{ amount: 20_000, month: 3 }] }).rows);
    assert.equal(bars.length, 10);
    assert.equal(bars[2].extra, 2_000_000);
    assert.equal(bars[2].paid, bars[2].principal + bars[2].interest + bars[2].extra);
  });

  test('no rows, no bars', () => {
    assert.deepEqual(chartBars([]), { unit: 'month', bars: [], startBalance: 0 });
  });
});

describe('input texts', () => {
  test('amountText drops the decimals of whole amounts', () => {
    assert.equal(amountText(100_000, 'en'), '100,000');
    assert.equal(amountText(1234.5, 'tr'), '1.234,50');
    assert.equal(amountText(0.05, 'en'), '0.05');
    assert.equal(amountText(Number.NaN, 'en'), '');
    assert.equal(amountText(Infinity, 'tr'), '');
  });

  test('decimalText keeps short rates short in either style', () => {
    assert.equal(decimalText(2.99, 'en'), '2.99');
    assert.equal(decimalText(2.99, 'tr'), '2,99');
    assert.equal(decimalText(1, 'en'), '1');
    assert.equal(decimalText(0.1 + 0.2, 'en'), '0.3');
    assert.equal(decimalText(1.234567, 'tr'), '1,2346');
    assert.equal(decimalText(1.234567, 'en', 2), '1.23');
    assert.equal(decimalText(Number.NaN, 'en'), '');
  });

  test('cappedRate caps absurd cost rates', () => {
    assert.deepEqual(cappedRate(0.4174), { value: 0.4174, over: false });
    assert.deepEqual(cappedRate(RATE_DISPLAY_CAP), { value: RATE_DISPLAY_CAP, over: false });
    assert.deepEqual(cappedRate(250), { value: RATE_DISPLAY_CAP, over: true });
  });
});

describe('headlineKey', () => {
  const inputs = (patch) => ({ ...defaultInputs(), ...patch });
  const extra = [{ amount: 1000, month: 2 }];

  test('a level installment', () => {
    assert.equal(headlineKey(inputs({})), 'results.installment');
    assert.equal(headlineKey(inputs({ extras: extra, extraStrategy: 'shortenTerm' })), 'results.installment');
    assert.equal(headlineKey(inputs({ extraStrategy: 'lowerPayment' })), 'results.installment');
  });

  test('installments that change show the first one', () => {
    assert.equal(headlineKey(inputs({ method: 'equalPrincipal' })), 'results.firstInstallment');
    assert.equal(headlineKey(inputs({ extras: extra, extraStrategy: 'lowerPayment' })), 'results.firstInstallment');
  });

  test('a grace period moves the headline to the first paying month', () => {
    assert.equal(headlineKey(inputs({ graceMonths: 3 })), 'results.afterGrace');
    assert.equal(headlineKey(inputs({ graceMonths: 3, method: 'equalPrincipal' })), 'results.firstAfterGrace');
  });

  test('every headline has a label', () => {
    for (const key of ['results.installment', 'results.firstInstallment', 'results.afterGrace', 'results.firstAfterGrace']) {
      assert.ok(key in STRINGS.en && key in STRINGS.tr, key);
    }
  });
});

describe('extraSavings', () => {
  const extras = [{ amount: 20_000, month: 3 }];

  test('interest saved and months saved', () => {
    assert.deepEqual(extraSavings(calculate({ extras }), calculate({})), { amount: 170_574, months: 2 });
  });

  test('the tax on the saved interest is saved too', () => {
    const baseline = calculate({ taxRate: 15 });
    const result = calculate({ taxRate: 15, extras });
    const saved = extraSavings(result, baseline);
    assert.equal(saved.amount, 197_138);
    assert.equal(saved.amount, (baseline.summary.totalInterest - result.summary.totalInterest)
      + (baseline.summary.totalTax - result.summary.totalTax));
  });

  test('nothing to report without extras or without a valid baseline', () => {
    const base = calculate({});
    assert.equal(extraSavings(base, base), null);
    assert.equal(extraSavings(calculate({ extras }), null), null);
    assert.equal(extraSavings(calculate({ extras }), calculate({ amount: 0 })), null);
    assert.equal(extraSavings(calculate({ amount: 0, extras }), base), null);
  });
});

describe('comparisonRows', () => {
  test('the demo offers: B pays less interest, A costs less in total', () => {
    const { inputs, compare } = demoState();
    const rows = comparisonRows(compareOffers(inputs, compare));
    assert.deepEqual(rows.map((row) => [row.key, row.kind, row.better]), [
      ['installment', 'money', 'b'],
      ['totalPayment', 'money', 'b'],
      ['totalInterest', 'money', 'b'],
      ['fees', 'money', 'a'],
      ['totalCost', 'money', 'a'],
      ['annualCostRate', 'rate', 'a'],
    ]);
    assert.deepEqual([rows[0].a, rows[0].b], [220_032, 218_322]);
    assert.deepEqual([rows[4].a, rows[4].b], [2_664_384, 2_691_869]);
  });

  test('equal offers have no winner', () => {
    const { inputs } = demoState();
    const rows = comparisonRows(compareOffers(inputs, { ...inputs, currency: 'EUR' }));
    assert.ok(rows.every((row) => row.better === null));
  });

  test('an invalid offer shows no values and no winner', () => {
    const { inputs, compare } = demoState();
    const rows = comparisonRows(compareOffers(inputs, { ...compare, amount: 0 }));
    assert.ok(rows.every((row) => row.a !== null && row.b === null && row.better === null));
  });

  test('the rate marker agrees with compareOffers and uses its tie tolerance', () => {
    const rateMarker = (comparison) => comparisonRows(comparison).find((row) => row.key === 'annualCostRate').better;
    const { inputs, compare } = demoState();
    const pairs = [[inputs, compare], [{}, {}], [{ rate: 1.2 }, { rate: 1 }], [{}, { amount: 100_000.01 }]];
    for (const [first, second] of pairs) {
      const comparison = compareOffers(first, second);
      assert.equal(rateMarker(comparison) ?? 'tie', comparison.cheaperByRate, JSON.stringify([first, second]));
    }
    const base = calculate({});
    const offer = (annualCostRate) => ({ ...base, summary: { ...base.summary, annualCostRate } });
    assert.equal(rateMarker({ a: offer(0.1), b: offer(0.1 + RATE_TIE / 2) }), null, 'within RATE_TIE is a tie');
    assert.equal(rateMarker({ a: offer(0.1), b: offer(0.1 + RATE_TIE * 2) }), 'a', 'beyond RATE_TIE has a winner');
  });

  test('every row has a label', () => {
    const rows = comparisonRows(compareOffers({}, {}));
    for (const { key } of rows) assert.ok(`compare.${key}` in STRINGS.en, key);
  });
});
