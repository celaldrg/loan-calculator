import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { defaultInputs, demoState } from '../src/calculator.js';
import { createOffers, startingOffers } from '../src/offers.js';

describe('startingOffers', () => {
  test('?demo starts with the two demo offers', () => {
    const { inputs, compare } = demoState();
    assert.deepEqual(startingOffers('?demo'), { a: inputs, b: compare });
    assert.deepEqual(startingOffers('?demo&a=5000'), { a: inputs, b: compare }, 'the demo wins over a link');
  });

  test('without inputs in the address it starts with the defaults', () => {
    assert.deepEqual(startingOffers(''), { a: {}, b: null });
    assert.deepEqual(startingOffers('?lang=tr'), { a: {}, b: null });
  });

  test('a shared link brings back one or two offers', () => {
    const one = startingOffers('?a=50000&r=2&b=m&n=24&m=a&c=TRY');
    assert.deepEqual(one, { a: { ...defaultInputs(), amount: 50_000, rate: 2, termMonths: 24, currency: 'TRY' }, b: null });
    const two = startingOffers('?a=50000&ba=60000&bn=36');
    assert.equal(two.a.amount, 50_000);
    assert.deepEqual(two.b, { ...defaultInputs(), amount: 60_000, termMonths: 36 });
  });
});

describe('createOffers', () => {
  test('starts with one offer of default inputs', () => {
    const offers = createOffers();
    assert.equal(offers.activeKey(), 'a');
    assert.equal(offers.isComparing(), false);
    assert.equal(offers.comparison(), null);
    assert.deepEqual(offers.current().inputs, defaultInputs());
    assert.equal(offers.query(), 'a=100000&r=1&b=m&n=12&m=a&c=USD');
  });

  test('a starting offer B turns comparing on, with offer A in the form', () => {
    const { inputs, compare } = demoState();
    const offers = createOffers({ a: inputs, b: compare });
    assert.equal(offers.isComparing(), true);
    assert.equal(offers.activeKey(), 'a');
    assert.equal(offers.comparison().cheaperByCost, 'a');
  });

  test('update edits only the offer in the form', () => {
    const offers = createOffers();
    offers.setComparing(true);
    const result = offers.update({ amount: 60_000 });
    assert.equal(result, offers.current());
    assert.equal(result.inputs.amount, 60_000);
    assert.equal(offers.comparison().a.inputs.amount, 100_000);
  });

  test('a new currency applies to both offers', () => {
    const offers = createOffers();
    offers.setComparing(true);
    offers.update({ currency: 'TRY' });
    const { a, b } = offers.comparison();
    assert.equal(a.inputs.currency, 'TRY');
    assert.equal(b.inputs.currency, 'TRY');
  });

  test('offer B can be selected only while comparing', () => {
    const offers = createOffers();
    assert.equal(offers.select('b').inputs.amount, 100_000);
    assert.equal(offers.activeKey(), 'a');
    offers.setComparing(true);
    offers.select('a');
    assert.equal(offers.activeKey(), 'a');
    offers.select('b');
    assert.equal(offers.activeKey(), 'b');
  });

  test('comparing starts offer B as a copy of A and keeps it when turned off and on', () => {
    const offers = createOffers({ a: { amount: 40_000 }, b: null });
    const copy = offers.setComparing(true);
    assert.equal(offers.activeKey(), 'b');
    assert.equal(copy.inputs.amount, 40_000);
    offers.update({ termMonths: 24 });
    assert.equal(offers.setComparing(false).inputs.termMonths, 12, 'back to offer A');
    assert.equal(offers.comparison(), null);
    assert.equal(offers.setComparing(true).inputs.termMonths, 24, 'offer B is kept');
  });

  test('the query carries both offers while comparing', () => {
    const offers = createOffers({ a: { amount: 40_000 }, b: null });
    offers.setComparing(true);
    offers.update({ rate: 2 });
    const query = offers.query();
    assert.deepEqual(startingOffers(`?${query}`), {
      a: { ...defaultInputs(), amount: 40_000 },
      b: { ...defaultInputs(), amount: 40_000, rate: 2 },
    });
    offers.setComparing(false);
    assert.equal(offers.query(), 'a=40000&r=1&b=m&n=12&m=a&c=USD', 'no offer B once comparing is off');
  });

  test('no query while an offer is invalid', () => {
    const offers = createOffers();
    offers.setComparing(true);
    offers.update({ amount: 0 });
    assert.equal(offers.query(), null);
    offers.update({ amount: 1000 });
    assert.notEqual(offers.query(), null);
  });

  test('reset goes back to one offer with the defaults', () => {
    const { inputs, compare } = demoState();
    const offers = createOffers({ a: inputs, b: compare });
    offers.select('b');
    const result = offers.reset();
    assert.deepEqual(result.inputs, defaultInputs());
    assert.equal(offers.activeKey(), 'a');
    assert.equal(offers.isComparing(), false);
    assert.equal(offers.comparison(), null);
    assert.deepEqual(offers.setComparing(true).inputs, defaultInputs(), 'a new offer B copies the reset offer A');
  });
});
