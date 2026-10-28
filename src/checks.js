/**
 * Argument guards for the low-level engine. They throw RangeError on
 * programmer mistakes; user input is validated (with friendly error codes)
 * in calculator.js before it ever reaches the engine.
 */

/**
 * Throws unless value is a finite number within [min, max].
 * @param {string} name parameter name used in the error message
 * @param {unknown} value value to check
 * @param {number} min inclusive lower bound
 * @param {number} max inclusive upper bound
 */
export function requireNumber(name, value, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be a number between ${min} and ${max}, got ${value}`);
  }
}

/**
 * Throws unless value is an integer within [min, max].
 * @param {string} name parameter name used in the error message
 * @param {unknown} value value to check
 * @param {number} min inclusive lower bound
 * @param {number} max inclusive upper bound
 */
export function requireInteger(name, value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer between ${min} and ${max}, got ${value}`);
  }
}

/**
 * Throws unless value is one of the allowed options.
 * @param {string} name parameter name used in the error message
 * @param {unknown} value value to check
 * @param {readonly string[]} options allowed values
 */
export function requireOneOf(name, value, options) {
  if (!options.includes(value)) {
    throw new RangeError(`${name} must be one of ${options.join(', ')}, got ${value}`);
  }
}
