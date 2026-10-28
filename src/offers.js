/**
 * The offers the app works on: offer A always, offer B while two offers are
 * compared. Knows which one the form edits and turns both into a shareable
 * query. Pure: no DOM, no storage.
 */
import { compareOffers, createCalculator, demoState } from './calculator.js';
import { hasInputs, inputsFromQuery, inputsToQuery } from './share.js';

/** Key prefix of offer B in a shared link. */
const B_PREFIX = 'b';

/**
 * @typedef {import('./calculator.js').LoanInputs} LoanInputs
 * @typedef {import('./calculator.js').CalcResult} CalcResult
 * @typedef {'a'|'b'} OfferKey
 * @typedef {{a: Partial<LoanInputs>, b: Partial<LoanInputs>|null}} OfferInputs
 *   offer B is null when only one offer is used
 */

/**
 * @typedef {object} Offers
 * @property {() => CalcResult} current result of the offer being edited
 * @property {() => OfferKey} activeKey which offer the form edits
 * @property {() => boolean} isComparing whether offer B is in use
 * @property {(patch: Partial<LoanInputs>) => CalcResult} update edits the current offer;
 *   a new currency applies to both offers because it only changes the formatting
 * @property {(key: OfferKey) => CalcResult} select picks the offer to edit (B only while comparing)
 * @property {(on: boolean) => CalcResult} setComparing turns comparing on (offer B starts
 *   as a copy of A and is selected) or off (back to offer A)
 * @property {() => import('./calculator.js').Comparison|null} comparison both offers
 *   side by side, or null when not comparing
 * @property {() => string|null} query shareable query, or null while an offer is invalid
 * @property {() => CalcResult} reset back to one offer with the default inputs
 */

/**
 * Offers to start with: the ?demo showcase, the offers of a shared link, or the defaults.
 * @param {string} search location.search
 * @returns {OfferInputs} starting inputs
 */
export function startingOffers(search) {
  const params = new URLSearchParams(search);
  if (params.has('demo')) {
    const { inputs, compare } = demoState();
    return { a: inputs, b: compare };
  }
  if (!hasInputs(params)) return { a: {}, b: null };
  return {
    a: inputsFromQuery(params),
    b: hasInputs(params, B_PREFIX) ? inputsFromQuery(params, B_PREFIX) : null,
  };
}

/**
 * Creates the offer workspace.
 * @param {OfferInputs} [initial] starting inputs; an offer B turns comparing on
 * @returns {Offers} workspace handle
 */
export function createOffers(initial = { a: {}, b: null }) {
  const offers = { a: createCalculator(initial.a), b: initial.b ? createCalculator(initial.b) : null };
  let comparing = offers.b !== null;
  /** @type {OfferKey} */
  let active = 'a';
  const current = () => offers[active].getState();

  return {
    current,
    activeKey: () => active,
    isComparing: () => comparing,
    update(patch) {
      const result = offers[active].update(patch);
      const other = offers[active === 'a' ? 'b' : 'a'];
      if (patch.currency !== undefined && other) other.update({ currency: patch.currency });
      return result;
    },
    select(key) {
      if (key === 'a' || (key === 'b' && comparing)) active = key;
      return current();
    },
    setComparing(on) {
      comparing = on;
      if (on && !offers.b) offers.b = createCalculator(offers.a.getState().inputs);
      active = on ? 'b' : 'a';
      return current();
    },
    comparison() {
      return comparing ? compareOffers(offers.a.getState().inputs, offers.b.getState().inputs) : null;
    },
    query() {
      const a = offers.a.getState();
      const b = comparing ? offers.b.getState() : null;
      if (!a.ok || (b && !b.ok)) return null;
      return b ? `${inputsToQuery(a.inputs)}&${inputsToQuery(b.inputs, B_PREFIX)}` : inputsToQuery(a.inputs);
    },
    reset() {
      offers.a.reset();
      offers.b = null;
      comparing = false;
      active = 'a';
      return current();
    },
  };
}
