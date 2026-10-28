/**
 * Offer comparison card: offer A and offer B side by side, the better value
 * of each row marked, and a verdict on total cost and cost rate.
 */
import { byId, h } from './dom.js';
import { formatMoney } from './format.js';
import { getLanguage, t } from './i18n.js';
import { rateText } from './results-view.js';
import { comparisonRows } from './view-model.js';

/** Shown for a value of an invalid offer. */
const NO_VALUE = '–';

/**
 * Wires the comparison card.
 * @param {(key: 'a'|'b') => void} onSelect called when an offer's column header is clicked
 * @returns {{show: (comparison: import('./calculator.js').Comparison|null, activeKey: 'a'|'b') => void}}
 *   show renders the comparison, or hides the card for null
 */
export function createComparison(onSelect) {
  const el = {
    card: byId('compare-card'),
    body: byId('compare-body'),
    cost: byId('compare-cost'),
    rate: byId('compare-rate'),
    picks: [...byId('compare-card').querySelectorAll('.offer-pick')],
  };
  for (const button of el.picks) {
    button.addEventListener('click', () => onSelect(button.dataset.offer));
  }

  /**
   * Renders both offers.
   * @param {import('./calculator.js').Comparison|null} comparison result of compareOffers
   * @param {'a'|'b'} activeKey offer the form edits
   */
  function show(comparison, activeKey) {
    el.card.hidden = comparison === null;
    if (!comparison) return;
    for (const button of el.picks) button.setAttribute('aria-pressed', String(button.dataset.offer === activeKey));
    const style = getLanguage();
    const cellText = (value, kind, offer) => {
      if (value === null) return NO_VALUE;
      return kind === 'rate' ? rateText(value, style) : formatMoney(value, offer.inputs.currency, style);
    };
    el.body.replaceChildren(...comparisonRows(comparison).map((row) => h('tr', {},
      h('th', { scope: 'row', text: t(`compare.${row.key}`) }),
      h('td', { className: row.better === 'a' ? 'better' : null, text: cellText(row.a, row.kind, comparison.a) }),
      h('td', { className: row.better === 'b' ? 'better' : null, text: cellText(row.b, row.kind, comparison.b) }))));
    showVerdict(comparison, style);
  }

  /**
   * Says which offer is cheaper in total and which has the lower cost rate.
   * @param {import('./calculator.js').Comparison} comparison result of compareOffers
   * @param {'en'|'tr'} style number style
   */
  function showVerdict(comparison, style) {
    const { a, difference, cheaperByCost, cheaperByRate } = comparison;
    if (!difference) {
      el.cost.textContent = t('compare.invalid', { offer: t(a.ok ? 'offer.b' : 'offer.a') });
      el.rate.textContent = '';
    } else {
      const amount = formatMoney(Math.abs(difference.totalCost), a.inputs.currency, style);
      el.cost.textContent = cheaperByCost === 'tie'
        ? t('compare.tie')
        : t('compare.cheaper', { offer: t(`offer.${cheaperByCost}`), amount });
      el.rate.textContent = verdictOnRate(cheaperByRate);
    }
    el.rate.hidden = el.rate.textContent === '';
  }

  return { show };
}

/**
 * Verdict on the annual cost rates.
 * @param {'a'|'b'|'tie'|null} cheaper offer with the lower rate, or null when unknown
 * @returns {string} sentence, empty when a rate is unknown
 */
function verdictOnRate(cheaper) {
  if (cheaper === null) return '';
  return cheaper === 'tie' ? t('compare.rateTie') : t('compare.rate', { offer: t(`offer.${cheaper}`) });
}
