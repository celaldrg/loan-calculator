import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { calculate, defaultInputs, demoState } from '../src/calculator.js';
import { scheduleToCsv } from '../src/csv.js';
import { inputsFromQuery, inputsToQuery } from '../src/share.js';

/** Schedule of the default loan: 100,000 at 1 % a month over 12 months. */
const ROWS = calculate({}).rows;

describe('CSV export', () => {
  test('English style: commas between fields, decimal points, CRLF line ends', () => {
    const lines = scheduleToCsv(ROWS).split('\r\n');
    assert.equal(lines.length, 14, 'header, 12 rows and a final line break');
    assert.equal(lines[0], 'Month,Payment,Principal,Interest,Tax,Extra,Balance');
    assert.equal(lines[1], '1,8884.88,7884.88,1000.00,0.00,0.00,92115.12');
    assert.equal(lines[12], '12,8884.85,8796.88,87.97,0.00,0.00,0.00');
    assert.equal(lines[13], '');
  });

  test('Turkish style: semicolons between fields and decimal commas', () => {
    const lines = scheduleToCsv(ROWS, { style: 'tr' }).split('\r\n');
    assert.equal(lines[0], 'Month;Payment;Principal;Interest;Tax;Extra;Balance');
    assert.equal(lines[1], '1;8884,88;7884,88;1000,00;0,00;0,00;92115,12');
  });

  test('headers with the separator, quotes or line breaks are quoted', () => {
    const headers = ['Ay', 'Taksit; TL', 'Ana "para"', 'Faiz', 'Vergi', 'Ek', 'Kalan\nborç'];
    const [header] = scheduleToCsv(ROWS, { headers, style: 'tr' }).split('\r\n');
    assert.equal(header, 'Ay;"Taksit; TL";"Ana ""para""";Faiz;Vergi;Ek;"Kalan\nborç"');
  });

  test('capitalized interest shows as a negative principal part', () => {
    const { rows } = calculate({ graceMonths: 1, graceType: 'capitalized', taxRate: 10 });
    const [, first] = scheduleToCsv(rows).split('\r\n');
    assert.equal(first, '1,0.00,-1100.00,1000.00,100.00,0.00,101100.00');
  });

  test('extra payments have their own column', () => {
    const { rows } = calculate({ extras: [{ amount: 20_000, month: 3 }] });
    const lines = scheduleToCsv(rows).split('\r\n');
    assert.equal(lines.length, 12, 'header, 10 rows and a final line break');
    assert.equal(lines[3].split(',')[5], '20000.00');
  });
});

describe('share links', () => {
  test('the defaults encode to a short query', () => {
    assert.equal(inputsToQuery(defaultInputs()), 'a=100000&r=1&b=m&n=12&m=a&c=USD');
  });

  test('every field survives a round trip', () => {
    const inputs = {
      amount: 250_000.5,
      rate: 2.99,
      rateBasis: 'annual',
      termMonths: 36,
      method: 'equalPrincipal',
      taxRate: 15,
      fees: 1250.75,
      graceMonths: 3,
      graceType: 'capitalized',
      extras: [
        { amount: 5000, month: 3, every: 0, end: null },
        { amount: 100, month: 1, every: 1, end: null },
        { amount: 2000, month: 6, every: 12, end: 30 },
      ],
      extraStrategy: 'lowerPayment',
      currency: 'TRY',
    };
    const query = inputsToQuery(inputs);
    assert.equal(query, 'a=250000.5&r=2.99&b=y&n=36&m=p&c=TRY&t=15&f=1250.75&g=3&gt=c&x=5000-3_100-1-1_2000-6-12-30&s=p');
    assert.deepEqual(inputsFromQuery(query), inputs);
    assert.deepEqual(inputsFromQuery(`?${query}`), inputs);
    assert.deepEqual(inputsFromQuery(new URLSearchParams(query)), inputs);
  });

  test('a key prefix keeps a second offer apart in the same link', () => {
    const { inputs, compare } = demoState();
    const query = `${inputsToQuery(inputs)}&${inputsToQuery(compare, 'b')}`;
    assert.deepEqual(inputsFromQuery(query), inputs);
    assert.deepEqual(inputsFromQuery(query, 'b'), compare);
  });

  test('unreadable values fall back to the defaults', () => {
    const inputs = inputsFromQuery('a=abc&r=&b=weekly&n=1e999&m=zz&c=GBP&t=%25&f=-&gt=z&s=q&x=1-2-3-4-5_foo_10-2');
    assert.deepEqual(inputs, { ...defaultInputs(), extras: [{ amount: 10, month: 2, every: 0, end: null }] });
    assert.deepEqual(inputsFromQuery(''), defaultInputs());
  });

  test('range checks are left to validation', () => {
    const inputs = inputsFromQuery('a=-5&n=12.5');
    assert.equal(inputs.amount, -5);
    assert.equal(inputs.termMonths, 12.5);
    assert.equal(calculate(inputs).ok, false);
  });
});
