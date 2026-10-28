import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import { readItem, writeItem } from '../src/storage.js';

/** The runtime's own localStorage property, if any, put back after every test. */
const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

/**
 * Replaces globalThis.localStorage for one test.
 * @param {PropertyDescriptor} descriptor value or getter to install
 */
function installStorage(descriptor) {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, ...descriptor });
}

/**
 * In-memory stand-in for the Storage interface.
 * @returns {{items: Map<string, string>, getItem: Function, setItem: Function}} storage and its items
 */
function memoryStorage() {
  const items = new Map();
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
  };
}

describe('storage', () => {
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  });

  test('stores and reads strings under the app prefix', () => {
    const storage = memoryStorage();
    installStorage({ value: storage });
    assert.equal(writeItem('lang', 'tr'), true);
    assert.deepEqual([...storage.items], [['loan-calculator:lang', 'tr']]);
    assert.equal(readItem('lang'), 'tr');
  });

  test('a missing key reads as null', () => {
    installStorage({ value: memoryStorage() });
    assert.equal(readItem('lang'), null);
  });

  test('without localStorage nothing is remembered and nothing throws', () => {
    installStorage({ value: undefined });
    assert.equal(readItem('lang'), null);
    assert.equal(writeItem('lang', 'tr'), false);
  });

  test('storage calls that throw (blocked storage, full quota) are swallowed', () => {
    installStorage({
      value: {
        getItem() { throw new Error('SecurityError'); },
        setItem() { throw new Error('QuotaExceededError'); },
      },
    });
    assert.equal(readItem('lang'), null);
    assert.equal(writeItem('lang', 'tr'), false);
  });

  test('even reaching localStorage may throw, as with blocked site data', () => {
    installStorage({ get() { throw new Error('SecurityError'); } });
    assert.equal(readItem('lang'), null);
    assert.equal(writeItem('lang', 'tr'), false);
  });
});
