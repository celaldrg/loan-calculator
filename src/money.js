/**
 * Money helpers. The loan engine keeps every amount in integer cents
 * (minor currency units) so that schedules add up to the exact cent.
 */

/**
 * Relative nudge applied before rounding. It is far larger than binary
 * floating-point noise (~1e-16) and far smaller than a cent, so an exact
 * half such as 1234.5 is never seen as 1234.4999999999998.
 */
const ROUNDING_NUDGE = 1e-14;

/**
 * Rounds a fractional cent amount to whole cents, halves away from zero
 * (commercial rounding).
 * @param {number} value amount in cents, possibly fractional
 * @returns {number} integer cents
 */
export function roundCents(value) {
  const magnitude = Math.floor(Math.abs(value) * (1 + ROUNDING_NUDGE) + 0.5);
  return value < 0 && magnitude > 0 ? -magnitude : magnitude;
}

/**
 * Converts an amount in currency units (e.g. 1234.56) to integer cents.
 * @param {number} amount amount in currency units
 * @returns {number} integer cents
 */
export function toCents(amount) {
  return roundCents(amount * 100);
}

/**
 * Converts integer cents back to currency units.
 * @param {number} cents integer cents
 * @returns {number} amount in currency units
 */
export function fromCents(cents) {
  return cents / 100;
}
