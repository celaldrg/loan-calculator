/**
 * The only place that touches localStorage. Every access is wrapped in
 * try/catch: private windows, blocked storage or a full quota must never
 * break the calculator, they only mean nothing is remembered.
 */

/** Prefix that keeps this app's keys apart from other pages on the same origin. */
const PREFIX = 'loan-calculator:';

/**
 * Reads a stored string.
 * @param {string} key key without the app prefix
 * @returns {string|null} the stored value, or null when missing or unavailable
 */
export function readItem(key) {
  try {
    return globalThis.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

/**
 * Stores a string.
 * @param {string} key key without the app prefix
 * @param {string} value value to store
 * @returns {boolean} whether it was stored
 */
export function writeItem(key, value) {
  try {
    globalThis.localStorage.setItem(PREFIX + key, value);
    return true;
  } catch {
    return false;
  }
}

