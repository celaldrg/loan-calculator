/**
 * Loan form: shows the inputs of the active offer, reports every edit as a
 * patch and puts validation messages next to the fields.
 */
import { bindAmountInput, reformatAmount, showAmount, skipGroupSeparator } from './amount-field.js';
import { CURRENCIES, LIMITS } from './calculator.js';
import { byId, h, icon } from './dom.js';
import { SYMBOLS, formatMoney, formatPercent, parseDecimal } from './format.js';
import { formatDuration, t } from './i18n.js';
import { effectiveAnnualRate, toMonthlyRate } from './loan.js';
import { toCents } from './money.js';
import { TERM_STOPS, decimalText, nearestStop } from './view-model.js';

/** Repeat intervals offered for extra payments, in months (0 = once). */
const EVERY_OPTIONS = Object.freeze([0, 1, 3, 6, 12]);

/** Radio groups of the form, by input name. */
const RADIO_FIELDS = Object.freeze(['rateBasis', 'method', 'extraStrategy']);

/** Field whose message box shows an error of each input field. */
const ERROR_BOXES = Object.freeze({
  amount: 'amount',
  currency: 'amount',
  rate: 'rate',
  rateBasis: 'rate',
  termMonths: 'term',
  taxRate: 'tax',
  fees: 'fees',
  graceMonths: 'grace',
  graceType: 'grace',
  extras: 'extras',
  extraStrategy: 'extras',
});

/** Inputs marked invalid for an error of each input field. */
const ERROR_INPUTS = Object.freeze({ amount: 'amount', rate: 'rate', termMonths: 'term', taxRate: 'tax', fees: 'fees', graceMonths: 'grace' });

/** Extra-payment input to mark for each extra error code. */
const EXTRA_ERROR_INPUTS = Object.freeze({ amount: '.extra-amount', month: '.extra-month', every: '.extra-every', end: '.extra-every' });

/**
 * @typedef {import('./calculator.js').LoanInputs} LoanInputs
 * @typedef {import('./calculator.js').CalcResult} CalcResult
 */

/**
 * Wires the loan form.
 * @param {(patch: Partial<LoanInputs>) => CalcResult} onChange applies an edit to the
 *   active offer and returns its new result
 * @returns {{fill: (inputs: LoanInputs, style: 'en'|'tr') => void, showStatus: (result: CalcResult) => void}}
 *   fill writes all values into the fields; showStatus updates errors and hints only
 */
export function createForm(onChange) {
  const el = {
    form: byId('loan-form'),
    amount: byId('amount'),
    currency: byId('currency'),
    rate: byId('rate'),
    rateHint: byId('rate-hint'),
    term: byId('term'),
    termSlider: byId('term-slider'),
    termHint: byId('term-hint'),
    tax: byId('tax'),
    fees: byId('fees'),
    feesSymbol: byId('fees-symbol'),
    grace: byId('grace'),
    graceType: byId('grace-type'),
    extrasList: byId('extras-list'),
    extrasEmpty: byId('extras-empty'),
    extraAdd: byId('extra-add'),
    strategy: byId('strategy'),
  };
  let style = 'en';
  /** @type {CalcResult} */
  let latest;
  /** @type {LoanInputs} */
  let current;

  const edit = (patch) => {
    latest = onChange(patch);
    current = latest.inputs;
  };

  el.currency.replaceChildren(...CURRENCIES.map((code) => h('option', { value: code, text: `${SYMBOLS[code]} ${code}` })));
  el.termSlider.max = String(TERM_STOPS.length - 1);
  el.term.max = String(LIMITS.maxTermMonths);
  bindFields();
  bindExtras();

  /**
   * Listens to every field outside the extra-payment list.
   */
  function bindFields() {
    el.form.addEventListener('submit', (event) => event.preventDefault());
    bindAmountInput(el.amount, () => style, (amount) => edit({ amount }));
    bindAmountInput(el.fees, () => style, (fees) => edit({ fees: el.fees.value.trim() === '' ? 0 : fees }));
    el.currency.addEventListener('change', () => edit({ currency: el.currency.value }));
    el.rate.addEventListener('input', () => edit({ rate: parseDecimal(el.rate.value) }));
    el.tax.addEventListener('input', () => edit({ taxRate: optionalNumber(el.tax.value, parseDecimal) }));
    el.grace.addEventListener('input', () => edit({ graceMonths: optionalNumber(el.grace.value, Number) }));
    el.graceType.addEventListener('change', () => edit({ graceType: el.graceType.value }));
    el.term.addEventListener('input', () => {
      const termMonths = el.term.valueAsNumber;
      if (Number.isFinite(termMonths)) el.termSlider.value = String(nearestStop(termMonths));
      edit({ termMonths });
    });
    el.termSlider.addEventListener('input', () => {
      const termMonths = TERM_STOPS[Number(el.termSlider.value)];
      el.term.value = String(termMonths);
      edit({ termMonths });
    });
    el.form.addEventListener('change', (event) => {
      const { name, value } = /** @type {HTMLInputElement} */ (event.target);
      if (RADIO_FIELDS.includes(name)) edit({ [name]: value });
    });
  }

  /**
   * Listens to the extra-payment list (rows are rebuilt, so events are delegated).
   */
  function bindExtras() {
    el.extraAdd.addEventListener('click', addExtra);
    el.extrasList.addEventListener('keydown', (event) => {
      if (event.target.classList.contains('extra-amount')) skipGroupSeparator(event, style);
    });
    el.extrasList.addEventListener('input', (event) => {
      const target = /** @type {HTMLInputElement} */ (event.target);
      const index = Number(target.dataset.index);
      if (target.classList.contains('extra-amount')) updateExtra(index, { amount: reformatAmount(target, style) });
      if (target.classList.contains('extra-month')) updateExtra(index, { month: target.valueAsNumber });
    });
    el.extrasList.addEventListener('change', (event) => {
      const target = /** @type {HTMLSelectElement} */ (event.target);
      if (target.classList.contains('extra-every')) updateExtra(Number(target.dataset.index), { every: Number(target.value) });
    });
    el.extrasList.addEventListener('click', (event) => {
      const button = event.target.closest('.extra-remove');
      if (button) removeExtra(Number(button.dataset.index));
    });
  }

  /**
   * Writes all values of an offer into the fields.
   * @param {LoanInputs} inputs values to show
   * @param {'en'|'tr'} nextStyle number style
   */
  function fill(inputs, nextStyle) {
    current = inputs;
    style = nextStyle;
    const radios = el.form.elements;
    showAmount(el.amount, inputs.amount, style);
    el.currency.value = inputs.currency;
    el.rate.value = decimalText(inputs.rate, style);
    radios.namedItem('rateBasis').value = inputs.rateBasis;
    el.term.value = Number.isFinite(inputs.termMonths) ? String(inputs.termMonths) : '';
    if (Number.isFinite(inputs.termMonths)) el.termSlider.value = String(nearestStop(inputs.termMonths));
    radios.namedItem('method').value = inputs.method;
    el.tax.value = decimalText(inputs.taxRate, style);
    showAmount(el.fees, inputs.fees, style);
    el.grace.value = Number.isFinite(inputs.graceMonths) ? String(inputs.graceMonths) : '';
    el.graceType.value = inputs.graceType;
    radios.namedItem('extraStrategy').value = inputs.extraStrategy;
    renderExtras();
  }

  /**
   * Updates messages, hints and limits after a calculation, leaving the
   * typed text alone.
   * @param {CalcResult} result result of the active offer
   */
  function showStatus(result) {
    const { inputs, errors } = result;
    const term = validTerm(inputs.termMonths);
    const symbol = SYMBOLS[inputs.currency] ?? '';
    showErrors(errors, inputs, term);
    el.rateHint.textContent = errors.some((error) => error.field === 'rate') ? '' : rateHint(inputs);
    el.termHint.textContent = Number.isInteger(inputs.termMonths) && inputs.termMonths > 0 ? formatDuration(term) : '';
    const stop = Number(el.termSlider.value);
    el.termSlider.setAttribute('aria-valuetext', formatDuration(TERM_STOPS[stop]));
    el.termSlider.style.setProperty('--fill', `${(stop / (TERM_STOPS.length - 1)) * 100}%`);
    el.grace.max = String(term - 1);
    el.graceType.disabled = !(inputs.graceMonths > 0);
    el.feesSymbol.textContent = symbol;
    el.extrasEmpty.hidden = inputs.extras.length > 0;
    el.strategy.hidden = inputs.extras.length === 0;
    el.extraAdd.disabled = inputs.extras.length >= LIMITS.maxExtras;
    for (const node of el.extrasList.querySelectorAll('.extra-month')) node.max = String(term);
    for (const node of el.extrasList.querySelectorAll('.extra-symbol')) node.textContent = symbol;
  }

  /**
   * Shows validation messages and marks the inputs they belong to.
   * @param {import('./calculator.js').InputError[]} errors validation errors
   * @param {LoanInputs} inputs current values
   * @param {number} term term used for month limits
   */
  function showErrors(errors, inputs, term) {
    for (const box of el.form.querySelectorAll('.error')) box.textContent = '';
    for (const input of el.form.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
    for (const error of errors) {
      if (error.field === 'extras' && error.index !== undefined) {
        showExtraError(error, term);
      } else if (ERROR_BOXES[error.field]) {
        byId(`${ERROR_BOXES[error.field]}-error`).textContent = errorText(error, inputs);
        if (ERROR_INPUTS[error.field]) byId(ERROR_INPUTS[error.field]).setAttribute('aria-invalid', 'true');
      }
    }
  }

  /**
   * Shows the message of one invalid extra payment inside its row.
   * @param {import('./calculator.js').InputError} error error with an index
   * @param {number} term term used for the month limit
   */
  function showExtraError(error, term) {
    const row = el.extrasList.children[error.index];
    if (!row) return;
    row.querySelector('.error').textContent = t(`error.extra.${error.code}`, { term });
    row.querySelector(EXTRA_ERROR_INPUTS[error.code])?.setAttribute('aria-invalid', 'true');
  }

  /**
   * Message text of a validation error.
   * @param {import('./calculator.js').InputError} error validation error
   * @param {LoanInputs} inputs current values (currency of money limits)
   * @returns {string} translated message
   */
  function errorText(error, inputs) {
    if (error.limit === undefined) return t(`error.${error.code}`);
    let limit = String(error.limit);
    if (error.field === 'amount' || error.field === 'fees') {
      limit = formatMoney(toCents(error.limit), inputs.currency, style);
    } else if (error.field === 'rate' || error.field === 'taxRate') {
      limit = formatPercent(error.limit / 100, style, 0);
    } else if (error.field === 'termMonths' || error.field === 'graceMonths') {
      limit = t('unit.month', { n: error.limit });
    }
    return t(`error.${error.code}`, { limit });
  }

  /**
   * Hint under the rate: the same rate per month or per year and the effective rate.
   * @param {LoanInputs} inputs current values
   * @returns {string} hint text, empty without a usable rate
   */
  function rateHint(inputs) {
    if (!Number.isFinite(inputs.rate)) return '';
    const monthly = toMonthlyRate(inputs.rate / 100, inputs.rateBasis);
    const effective = formatPercent(effectiveAnnualRate(monthly), style);
    return inputs.rateBasis === 'annual'
      ? t('hint.rate.annual', { monthly: formatPercent(monthly, style), effective })
      : t('hint.rate.monthly', { annual: formatPercent(monthly * 12, style), effective });
  }

  /**
   * Rebuilds the rows of the extra-payment list.
   */
  function renderExtras() {
    el.extrasList.replaceChildren(...current.extras.map((extra, index) => extraRow(extra, index)));
  }

  /**
   * Builds the editor row of one extra payment.
   * @param {import('./calculator.js').ExtraInput} extra extra payment
   * @param {number} index position in the list
   * @returns {HTMLLIElement} list item
   */
  function extraRow(extra, index) {
    const n = index + 1;
    const errorId = `extra-error-${index}`;
    const common = { 'data-index': index, 'aria-describedby': errorId };
    const amount = h('input', {
      ...common, type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false',
      className: 'extra-amount', 'aria-label': t('extras.amount', { n }),
    });
    showAmount(amount, extra.amount, style);
    const month = h('input', {
      ...common, type: 'number', inputmode: 'numeric', min: 1, step: 1,
      className: 'extra-month', 'aria-label': t('extras.monthAria', { n }),
    });
    month.value = Number.isFinite(extra.month) ? String(extra.month) : '';
    const every = h('select', { ...common, className: 'extra-every', 'aria-label': t('extras.every', { n }) }, ...everyOptions(extra.every));
    return h('li', { className: 'extra-row' },
      h('div', { className: 'affix-field extra-amount-field' },
        h('span', { className: 'affix extra-symbol', 'aria-hidden': 'true', text: SYMBOLS[current.currency] ?? '' }), amount),
      h('button', { type: 'button', className: 'icon-btn extra-remove', 'data-index': index, 'aria-label': t('extras.remove', { n }) }, icon('close')),
      h('div', { className: 'affix-field extra-month-field' }, h('span', { className: 'affix', 'aria-hidden': 'true', text: t('extras.month') }), month),
      every,
      h('p', { className: 'error', id: errorId, 'aria-live': 'polite' }));
  }

  /**
   * Options of the repeat select; an unusual interval from a shared link gets its own option.
   * @param {number} every current interval in months
   * @returns {HTMLOptionElement[]} options with the current one selected
   */
  function everyOptions(every) {
    const values = EVERY_OPTIONS.includes(every) || !Number.isInteger(every) ? EVERY_OPTIONS : [...EVERY_OPTIONS, every];
    return values.map((value) => h('option', {
      value,
      selected: value === every,
      text: EVERY_OPTIONS.includes(value) ? t(`every.${value}`) : t('every.other', { n: value }),
    }));
  }

  /**
   * Adds an extra payment of a tenth of the loan in month 6 (or the last month).
   */
  function addExtra() {
    const term = validTerm(current.termMonths);
    const amount = Number.isFinite(current.amount) ? Math.max(1, Math.round(current.amount / 1000) * 100) : 1000;
    edit({ extras: [...current.extras, { amount, month: Math.min(6, term), every: 0, end: null }] });
    renderExtras();
    showStatus(latest);
    el.extrasList.lastElementChild?.querySelector('.extra-amount').focus();
  }

  /**
   * Removes an extra payment and keeps the focus nearby.
   * @param {number} index position in the list
   */
  function removeExtra(index) {
    edit({ extras: current.extras.filter((_, position) => position !== index) });
    renderExtras();
    showStatus(latest);
    const next = el.extrasList.children[Math.min(index, current.extras.length - 1)];
    (next ? next.querySelector('.extra-remove') : el.extraAdd).focus();
  }

  /**
   * Changes one extra payment.
   * @param {number} index position in the list
   * @param {Partial<import('./calculator.js').ExtraInput>} patch changed fields
   */
  function updateExtra(index, patch) {
    edit({ extras: current.extras.map((extra, position) => (position === index ? { ...extra, ...patch } : extra)) });
  }

  return { fill, showStatus };
}

/**
 * Parses an optional field: empty means zero.
 * @param {string} text field text
 * @param {(text: string) => number} parse parser for non-empty text
 * @returns {number} the value (NaN when unreadable)
 */
function optionalNumber(text, parse) {
  return text.trim() === '' ? 0 : parse(text);
}

/**
 * The term if it is valid, otherwise the longest allowed term.
 * @param {number} months term from the form
 * @returns {number} usable term in months
 */
function validTerm(months) {
  return Number.isInteger(months) && months >= 1 && months <= LIMITS.maxTermMonths ? months : LIMITS.maxTermMonths;
}
