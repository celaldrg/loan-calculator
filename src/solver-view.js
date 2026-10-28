/**
 * Reverse solver: from an installment the borrower can pay, finds the
 * largest loan, the interest rate or the shortest term, and copies the
 * answer into the form on request.
 */
import { bindAmountInput, showAmount } from './amount-field.js';
import { reverseSolve } from './calculator.js';
import { byId } from './dom.js';
import { SYMBOLS, formatMoney, formatPercent } from './format.js';
import { formatDuration, getLanguage, t } from './i18n.js';
import { toCents } from './money.js';

/** Decimals a solved rate keeps when it goes into the form. */
const RATE_DECIMALS = 4;

/**
 * @typedef {import('./calculator.js').LoanInputs} LoanInputs
 * @typedef {{patch: Partial<LoanInputs>, text: string}} Answer
 */

/**
 * Wires the solver.
 * @param {(patch: Partial<LoanInputs>) => void} onApply called with the solved value
 *   when the user takes it over into the form
 * @returns {{show: (inputs: LoanInputs) => void, restyle: () => void, clear: () => void}}
 *   show solves against new form values; restyle rewrites the installment in the
 *   current number style; clear empties the solver
 */
export function createSolver(onApply) {
  const el = {
    form: byId('solver-form'),
    payment: byId('solver-payment'),
    symbol: byId('solver-symbol'),
    result: byId('solver-result'),
    apply: byId('solver-apply'),
  };
  let payment = NaN;
  /** @type {LoanInputs|null} */
  let inputs = null;
  /** @type {Partial<LoanInputs>|null} */
  let patch = null;

  bindAmountInput(el.payment, getLanguage, (value) => {
    payment = value;
    solve();
  });
  el.form.addEventListener('change', (event) => {
    if (event.target.name === 'solveFor') solve();
  });
  el.form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (patch) onApply(patch);
  });

  /**
   * Solves again for new form values.
   * @param {LoanInputs} nextInputs values of the offer being edited
   */
  function show(nextInputs) {
    inputs = nextInputs;
    el.symbol.textContent = SYMBOLS[inputs.currency] ?? '';
    solve();
  }

  /**
   * Rewrites the installment after a language (and number style) change.
   */
  function restyle() {
    showAmount(el.payment, payment, getLanguage());
    solve();
  }

  /**
   * Empties the installment field and goes back to solving for the amount.
   */
  function clear() {
    el.form.reset();
    payment = NaN;
    solve();
  }

  /**
   * Shows the answer for the chosen unknown.
   */
  function solve() {
    const target = el.form.elements.namedItem('solveFor').value;
    const ready = payment > 0 && inputs !== null;
    const answer = ready ? solution(inputs, target, payment) : null;
    patch = answer ? answer.patch : null;
    if (!ready) el.result.textContent = t('solver.prompt');
    else el.result.textContent = answer ? answer.text : t('solver.none');
    el.apply.hidden = patch === null;
  }

  return { show, restyle, clear };
}

/**
 * Solves for one unknown and describes the answer.
 * @param {LoanInputs} inputs form values
 * @param {'amount'|'rate'|'term'} target unknown to solve for
 * @param {number} payment installment in currency units
 * @returns {Answer|null} form patch and sentence, or null when there is no solution
 */
function solution(inputs, target, payment) {
  const value = reverseSolve(inputs, target, payment);
  if (value === null) return null;
  const style = getLanguage();
  if (target === 'amount') {
    const amount = formatMoney(toCents(value), inputs.currency, style);
    return { patch: { amount: value }, text: t('solver.result.amount', { value: amount }) };
  }
  if (target === 'term') {
    const months = t('unit.month', { n: value });
    const text = value >= 12 ? `${months} (${formatDuration(value)})` : months;
    return { patch: { termMonths: value }, text: t('solver.result.term', { value: text }) };
  }
  const rate = Number(value.toFixed(RATE_DECIMALS));
  const percent = formatPercent(rate / 100, style, decimalsFor(rate));
  return { patch: { rate }, text: t('solver.result.rate', { value: t(`solver.rate.${inputs.rateBasis}`, { rate: percent }) }) };
}

/**
 * Fewest decimals (2 to RATE_DECIMALS) that show a rounded rate exactly.
 * @param {number} rate rate in percent, already rounded to RATE_DECIMALS
 * @returns {number} decimals
 */
function decimalsFor(rate) {
  for (let decimals = 2; decimals < RATE_DECIMALS; decimals += 1) {
    if (Number(rate.toFixed(decimals)) === rate) return decimals;
  }
  return RATE_DECIMALS;
}
