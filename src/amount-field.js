/**
 * Money inputs with live thousands separators: the text is re-formatted as
 * the user types and the caret stays next to the same digit.
 */
import { formatAmountInput, parseNumber, separators } from './format.js';
import { amountText } from './view-model.js';

/**
 * Re-formats a money input in place and reads its value.
 * @param {HTMLInputElement} input money input
 * @param {'en'|'tr'} style number style
 * @returns {number} the amount, or NaN when the field is empty or unreadable
 */
export function reformatAmount(input, style) {
  const caret = input.selectionStart ?? input.value.length;
  const formatted = formatAmountInput(input.value, caret, style);
  if (formatted.text !== input.value) {
    input.value = formatted.text;
    input.setSelectionRange(formatted.caret, formatted.caret);
  }
  return parseNumber(formatted.text, style);
}

/**
 * Lets Backspace and Delete step over a group separator instead of getting
 * stuck on it (live formatting would put it straight back).
 * @param {KeyboardEvent} event keydown event of a money input
 * @param {'en'|'tr'} style number style
 */
export function skipGroupSeparator(event, style) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  const { selectionStart: start, selectionEnd: end, value } = input;
  if (start === null || start !== end) return;
  const { group } = separators(style);
  if (event.key === 'Backspace' && value[start - 1] === group) input.setSelectionRange(start - 1, start - 1);
  if (event.key === 'Delete' && value[start] === group) input.setSelectionRange(start + 1, start + 1);
}

/**
 * Shows an amount in a money input.
 * @param {HTMLInputElement} input money input
 * @param {number} value amount in currency units (NaN leaves the field empty)
 * @param {'en'|'tr'} style number style
 */
export function showAmount(input, value, style) {
  input.value = amountText(value, style);
}

/**
 * Wires live formatting to a money input.
 * @param {HTMLInputElement} input money input
 * @param {() => 'en'|'tr'} getStyle current number style
 * @param {(value: number) => void} onValue called with the amount after every edit
 */
export function bindAmountInput(input, getStyle, onValue) {
  input.addEventListener('keydown', (event) => skipGroupSeparator(event, getStyle()));
  input.addEventListener('input', () => onValue(reformatAmount(input, getStyle())));
}
