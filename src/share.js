/**
 * Encodes loan inputs into a short URL query and back, so a calculation can
 * be shared as a link. Optional fields are written only when they are used,
 * and a key prefix lets a second offer live in the same URL.
 */
import { CURRENCIES, defaultInputs } from './calculator.js';

/** Query keys per input field. */
const KEYS = Object.freeze({
  amount: 'a',
  rate: 'r',
  rateBasis: 'b',
  termMonths: 'n',
  method: 'm',
  currency: 'c',
  taxRate: 't',
  fees: 'f',
  graceMonths: 'g',
  graceType: 'gt',
  extras: 'x',
  extraStrategy: 's',
});

/** Numeric input fields. */
const NUMBER_FIELDS = Object.freeze(['amount', 'rate', 'termMonths', 'taxRate', 'fees', 'graceMonths']);

/** Short codes of the choice fields. */
const CODES = Object.freeze({
  rateBasis: Object.freeze({ monthly: 'm', annual: 'y' }),
  method: Object.freeze({ annuity: 'a', equalPrincipal: 'p' }),
  graceType: Object.freeze({ interestOnly: 'i', capitalized: 'c' }),
  extraStrategy: Object.freeze({ shortenTerm: 't', lowerPayment: 'p' }),
});

/**
 * Encodes inputs as a URL query string (without the leading "?").
 * Extras look like "amount-month[-every[-end]]", joined by "_".
 * @param {import('./calculator.js').LoanInputs} inputs form values
 * @param {string} [prefix=''] key prefix, e.g. "b" for a second offer
 * @returns {string} query string such as "a=100000&r=1&b=m&n=12&m=a&c=USD"
 */
export function inputsToQuery(inputs, prefix = '') {
  const params = new URLSearchParams();
  const put = (field, value) => {
    if (value !== undefined) params.set(prefix + KEYS[field], String(value));
  };
  put('amount', inputs.amount);
  put('rate', inputs.rate);
  put('rateBasis', CODES.rateBasis[inputs.rateBasis]);
  put('termMonths', inputs.termMonths);
  put('method', CODES.method[inputs.method]);
  put('currency', inputs.currency);
  if (inputs.taxRate) put('taxRate', inputs.taxRate);
  if (inputs.fees) put('fees', inputs.fees);
  if (inputs.graceMonths) {
    put('graceMonths', inputs.graceMonths);
    put('graceType', CODES.graceType[inputs.graceType]);
  }
  if (inputs.extras.length > 0) {
    put('extras', inputs.extras.map(encodeExtra).join('_'));
    put('extraStrategy', CODES.extraStrategy[inputs.extraStrategy]);
  }
  return params.toString();
}

/**
 * Reads inputs back from a URL query. Missing or unreadable values fall back
 * to the defaults; range checks are left to validateInputs.
 * @param {string|URLSearchParams} query query string (with or without "?") or parsed params
 * @param {string} [prefix=''] key prefix used when encoding
 * @returns {import('./calculator.js').LoanInputs} form values
 */
export function inputsFromQuery(query, prefix = '') {
  const params = query instanceof URLSearchParams ? query : new URLSearchParams(query);
  const read = (field) => params.get(prefix + KEYS[field]);
  const inputs = defaultInputs();
  for (const field of NUMBER_FIELDS) {
    const value = toNumber(read(field));
    if (value !== null) inputs[field] = value;
  }
  for (const [field, codes] of Object.entries(CODES)) {
    const value = Object.keys(codes).find((option) => codes[option] === read(field));
    if (value !== undefined) inputs[field] = value;
  }
  const currency = read('currency');
  if (CURRENCIES.includes(currency)) inputs.currency = currency;
  const extras = read('extras');
  if (extras) inputs.extras = extras.split('_').map(decodeExtra).filter((extra) => extra !== null);
  return inputs;
}

/**
 * Whether a query holds encoded inputs: every encoded loan carries its amount.
 * @param {string|URLSearchParams} query query string (with or without "?") or parsed params
 * @param {string} [prefix=''] key prefix used when encoding
 * @returns {boolean} true when inputs with that prefix are present
 */
export function hasInputs(query, prefix = '') {
  const params = query instanceof URLSearchParams ? query : new URLSearchParams(query);
  return params.has(prefix + KEYS.amount);
}

/**
 * Encodes one extra payment.
 * @param {import('./calculator.js').ExtraInput} extra extra payment
 * @returns {string} "amount-month[-every[-end]]"
 */
function encodeExtra({ amount, month, every = 0, end = null }) {
  const parts = [amount, month];
  if (every > 0) {
    parts.push(every);
    if (end !== null) parts.push(end);
  }
  return parts.join('-');
}

/**
 * Decodes one extra payment.
 * @param {string} text "amount-month[-every[-end]]"
 * @returns {import('./calculator.js').ExtraInput|null} the extra payment, or null when unreadable
 */
function decodeExtra(text) {
  const parts = text.split('-').map(toNumber);
  if (parts.length < 2 || parts.length > 4 || parts.includes(null)) return null;
  const [amount, month, every = 0, end = null] = parts;
  return { amount, month, every, end };
}

/**
 * Parses a query value as a finite number.
 * @param {string|null} text query value
 * @returns {number|null} the number, or null when missing or not numeric
 */
function toNumber(text) {
  if (text === null || text.trim() === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}
