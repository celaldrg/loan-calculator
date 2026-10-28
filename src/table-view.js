/**
 * Payment schedule grouped by loan year: every year is a row with its totals
 * that opens to show its months. Also saves the schedule as a CSV file.
 */
import { scheduleToCsv } from './csv.js';
import { byId, h, icon } from './dom.js';
import { formatMoney } from './format.js';
import { getLanguage, t } from './i18n.js';
import { downloadText } from './io.js';

/** Money columns after the month: row field and title key, in CSV order. */
const COLUMNS = Object.freeze([
  ['payment', 'table.payment'],
  ['principal', 'table.principal'],
  ['interest', 'table.interest'],
  ['tax', 'table.tax'],
  ['extra', 'table.extra'],
  ['balance', 'table.balance'],
]);

/** Byte order mark that lets spreadsheet apps read the file as UTF-8 (currency symbols, Turkish letters). */
const BOM = '\uFEFF';

/** Columns hidden while they are zero everywhere, with the summary total that tells. */
const OPTIONAL = Object.freeze({ tax: 'totalTax', extra: 'totalExtra' });

/**
 * Wires the schedule card.
 * @returns {{show: (result: import('./calculator.js').CalcResult) => void, reset: () => void}}
 *   show renders a result; reset closes every year but the first
 */
export function createTable() {
  const el = {
    table: byId('schedule'),
    scroll: byId('schedule-scroll'),
    empty: byId('table-empty'),
    toggle: byId('table-toggle'),
    csv: byId('table-csv'),
  };
  const open = new Set([1]);
  /** @type {import('./calculator.js').CalcResult|null} */
  let result = null;

  el.toggle.addEventListener('click', toggleAll);
  el.csv.addEventListener('click', saveCsv);
  el.table.addEventListener('click', (event) => {
    const button = event.target.closest('.year-toggle');
    if (button) toggleYear(button);
  });

  /**
   * Renders the schedule of a result, or the empty state for invalid inputs.
   * @param {import('./calculator.js').CalcResult} next result of the offer being edited
   */
  function show(next) {
    result = next;
    el.empty.hidden = result.ok;
    el.scroll.hidden = !result.ok;
    el.csv.disabled = !result.ok;
    el.toggle.hidden = !result.ok || result.years.length < 2;
    if (!result.ok) return;
    for (const [column, total] of Object.entries(OPTIONAL)) {
      el.table.classList.toggle(`hide-${column}`, result.summary[total] === 0);
    }
    render();
  }

  /**
   * Rebuilds all year groups.
   */
  function render() {
    const money = moneyFormatter();
    el.table.replaceChildren(el.table.tHead, ...result.years.map((year) => yearBody(year, money)));
    labelToggleAll();
  }

  /**
   * Builds the row group of one year: its totals row and, when open, its months.
   * @param {import('./loan.js').YearGroup} year year group
   * @param {(cents: number) => string} money money formatter
   * @returns {HTMLTableSectionElement} tbody
   */
  function yearBody(year, money) {
    const expanded = open.has(year.year);
    const id = `schedule-year-${year.year}`;
    const toggle = h('button', {
      type: 'button',
      className: 'year-toggle',
      'data-year': year.year,
      'aria-expanded': String(expanded),
      'aria-controls': id,
    }, icon('chevron'), t('table.year', { n: year.year }));
    const totals = h('tr', { className: 'year-row' },
      h('th', { scope: 'rowgroup' }, toggle),
      ...COLUMNS.map(([field]) => h('td', {
        className: `c-${field}`,
        text: money(field === 'balance' ? year.balance : year.totals[field]),
      })));
    const months = expanded ? year.rows.map((row) => monthRow(row, money)) : [];
    return h('tbody', { id, className: expanded ? 'year open' : 'year' }, totals, ...months);
  }

  /**
   * Opens or closes one year in place, so the focus stays on its button.
   * @param {HTMLButtonElement} button the year's toggle
   */
  function toggleYear(button) {
    const number = Number(button.dataset.year);
    const body = button.closest('tbody');
    const expanded = !open.has(number);
    if (expanded) open.add(number);
    else open.delete(number);
    button.setAttribute('aria-expanded', String(expanded));
    body.classList.toggle('open', expanded);
    if (expanded) {
      const money = moneyFormatter();
      body.append(...result.years[number - 1].rows.map((row) => monthRow(row, money)));
    } else {
      body.replaceChildren(body.rows[0]);
    }
    labelToggleAll();
  }

  /**
   * Opens every year, or closes them all when they are all open.
   */
  function toggleAll() {
    const numbers = result.years.map((year) => year.year);
    const allOpen = numbers.every((number) => open.has(number));
    open.clear();
    if (!allOpen) numbers.forEach((number) => open.add(number));
    render();
  }

  /**
   * Names the expand/collapse button after what it will do.
   */
  function labelToggleAll() {
    const allOpen = result.years.every((year) => open.has(year.year));
    el.toggle.textContent = t(allOpen ? 'table.collapseAll' : 'table.expandAll');
  }

  /**
   * Saves the whole schedule as CSV, with a byte order mark so spreadsheet
   * programs read the translated column titles as UTF-8.
   */
  function saveCsv() {
    if (!result?.ok) return;
    const headers = [t('table.month'), ...COLUMNS.map(([, key]) => t(key))];
    const csv = scheduleToCsv(result.rows, { headers, style: getLanguage() });
    downloadText(t('table.file'), `${BOM}${csv}`, 'text/csv;charset=utf-8');
  }

  /**
   * Money formatter in the current currency and number style.
   * @returns {(cents: number) => string} formatter
   */
  function moneyFormatter() {
    const { currency } = result.inputs;
    const style = getLanguage();
    return (cents) => formatMoney(cents, currency, style);
  }

  /**
   * Closes every year but the first (for a new calculation).
   */
  function reset() {
    open.clear();
    open.add(1);
  }

  return { show, reset };
}

/**
 * Builds the row of one month.
 * @param {import('./loan.js').ScheduleRow} row schedule row
 * @param {(cents: number) => string} money money formatter
 * @returns {HTMLTableRowElement} table row
 */
function monthRow(row, money) {
  return h('tr', { className: row.grace ? 'month-row grace' : 'month-row' },
    h('th', { scope: 'row' }, String(row.month), row.grace ? h('span', { className: 'tag', text: t('table.grace') }) : null),
    ...COLUMNS.map(([field]) => h('td', { className: `c-${field}`, text: money(row[field]) })));
}
