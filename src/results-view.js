/**
 * Results card and the summary bar that follows the form on phones:
 * headline installment, totals, rates and what extra payments save.
 */
import { calculate } from './calculator.js';
import { byId } from './dom.js';
import { formatMoney, formatPercent } from './format.js';
import { formatDuration, getLanguage, t } from './i18n.js';
import { cappedRate, extraSavings, headlineKey } from './view-model.js';

/** Shown for a rate that cannot be computed. */
const NO_VALUE = '–';

/**
 * Wires the results card.
 * @returns {{show: (result: import('./calculator.js').CalcResult, offerLabel: string) => void}}
 *   show renders a result; offerLabel names the offer while two are compared (else empty)
 */
export function createResults() {
  const el = {
    offer: byId('results-offer'),
    invalid: byId('results-invalid'),
    body: byId('results-body'),
    label: byId('headline-label'),
    value: byId('headline-value'),
    count: byId('headline-count'),
    totalPayment: byId('total-payment'),
    totalInterest: byId('total-interest'),
    totalTax: byId('total-tax'),
    totalCost: byId('total-cost'),
    fees: byId('total-fees'),
    effective: byId('effective-rate'),
    costRate: byId('cost-rate'),
    saved: byId('results-saved'),
    bar: byId('summary-bar'),
    barInstallment: byId('bar-installment'),
    barTotal: byId('bar-total'),
  };

  /**
   * Renders a result.
   * @param {import('./calculator.js').CalcResult} result result of the offer being edited
   * @param {string} offerLabel offer name while comparing, otherwise empty
   */
  function show(result, offerLabel) {
    el.offer.textContent = offerLabel;
    el.offer.hidden = offerLabel === '';
    el.invalid.hidden = result.ok;
    el.body.hidden = !result.ok;
    el.bar.hidden = !result.ok;
    if (!result.ok) return;
    const style = getLanguage();
    const { inputs, summary } = result;
    const money = (cents) => formatMoney(cents, inputs.currency, style);
    el.label.textContent = t(headlineKey(inputs));
    el.value.textContent = money(summary.installment);
    const installments = result.rows.filter((row) => !row.grace).length;
    el.count.textContent = t('results.count', { n: installments, last: money(summary.lastPayment) });
    el.totalPayment.textContent = money(summary.totalPayment);
    el.totalInterest.textContent = money(summary.totalInterest);
    el.totalTax.textContent = money(summary.totalTax);
    el.totalCost.textContent = money(summary.totalCost);
    el.fees.textContent = summary.fees > 0 ? t('results.withFees', { fees: money(summary.fees) }) : t('results.noFees');
    el.effective.textContent = formatPercent(summary.effectiveAnnualRate, style);
    el.costRate.textContent = rateText(summary.annualCostRate, style);
    el.barInstallment.textContent = money(summary.installment);
    el.barTotal.textContent = money(summary.totalPayment);
    showSavings(result, money);
  }

  /**
   * Tells how much the extra payments save, compared with the same loan without them.
   * @param {import('./calculator.js').CalcResult} result valid result
   * @param {(cents: number) => string} money money formatter
   */
  function showSavings(result, money) {
    const baseline = result.inputs.extras.length > 0 ? calculate({ ...result.inputs, extras: [] }) : null;
    const savings = extraSavings(result, baseline);
    el.saved.hidden = !savings || savings.amount <= 0;
    if (el.saved.hidden) return;
    const amount = money(savings.amount);
    el.saved.textContent = savings.months > 0
      ? t('results.saved', { amount, duration: formatDuration(savings.months) })
      : t('results.savedAmount', { amount });
  }

  return { show };
}

/**
 * Formats a cost rate, capping absurd values.
 * @param {number|null} rate annual rate as a fraction, or null when unknown
 * @param {'en'|'tr'} style number style
 * @returns {string} e.g. "19.56%" or "over 10,000.00%"
 */
export function rateText(rate, style) {
  if (rate === null) return NO_VALUE;
  const { value, over } = cappedRate(rate);
  const text = formatPercent(value, style);
  return over ? t('results.over', { value: text }) : text;
}
