/**
 * Entry point: connects the views to the offers and keeps the language and
 * the address bar in step with what is on screen.
 */
import { createChart } from './chart-view.js';
import { createComparison } from './compare-view.js';
import { byId, createToast, translateStatic } from './dom.js';
import { createForm } from './form-view.js';
import { LANGUAGES, getLanguage, setLanguage, t } from './i18n.js';
import { copyText, replaceUrl } from './io.js';
import { createOffers, startingOffers } from './offers.js';
import { createResults } from './results-view.js';
import { createSolver } from './solver-view.js';
import { readItem, writeItem } from './storage.js';
import { createTable } from './table-view.js';

/** Storage key of the chosen language. */
const LANG_KEY = 'lang';

/** Pause after the last edit before the address bar follows, in milliseconds. */
const URL_DELAY_MS = 400;

const params = new URLSearchParams(location.search);
const offers = createOffers(startingOffers(location.search));
const toast = createToast(byId('toast'));
const controls = {
  compare: byId('compare-toggle'),
  offerPicker: byId('offer-picker'),
  reset: byId('reset'),
  lang: byId('lang'),
  share: byId('share'),
};
const views = {
  form: createForm(edit),
  results: createResults(),
  comparison: createComparison(selectOffer),
  chart: createChart(),
  table: createTable(),
  solver: createSolver(applySolution),
};
let urlTimer = 0;

bindControls();
syncOfferControls();
applyLanguage(initialLanguage());

/**
 * Wires the header buttons, the compare switch, the offer picker and sharing.
 */
function bindControls() {
  controls.reset.addEventListener('click', resetAll);
  controls.lang.addEventListener('click', toggleLanguage);
  controls.share.addEventListener('click', share);
  controls.compare.addEventListener('change', () => setComparing(controls.compare.checked));
  controls.offerPicker.addEventListener('change', (event) => selectOffer(event.target.value));
}

/**
 * Language to start with: ?lang=tr|en (remembered), the saved choice, or English.
 * @returns {string} language code
 */
function initialLanguage() {
  const requested = params.get('lang');
  if (LANGUAGES.includes(requested)) {
    writeItem(LANG_KEY, requested);
    return requested;
  }
  return readItem(LANG_KEY) ?? 'en';
}

/**
 * Switches every visible string and the number style to a language.
 * @param {string} lang language code
 */
function applyLanguage(lang) {
  const language = setLanguage(lang);
  document.documentElement.lang = language;
  document.title = t('app.title');
  translateStatic(document.body, t);
  // A toast still on screen speaks the old language, so it goes.
  byId('toast').classList.remove('show');
  views.solver.restyle();
  refill();
}

/**
 * Toggles between English and Turkish and remembers the choice.
 */
function toggleLanguage() {
  const next = getLanguage() === 'en' ? 'tr' : 'en';
  writeItem(LANG_KEY, next);
  applyLanguage(next);
}

/**
 * Writes the active offer into the form, then renders everything.
 */
function refill() {
  views.form.fill(offers.current().inputs, getLanguage());
  render();
}

/**
 * Renders the result of the active offer in every view.
 */
function render() {
  const result = offers.current();
  const key = offers.activeKey();
  views.form.showStatus(result);
  views.results.show(result, offers.isComparing() ? t(`offer.${key}`) : '');
  views.comparison.show(offers.comparison(), key);
  views.chart.show(result);
  views.table.show(result);
  views.solver.show(result.inputs);
}

/**
 * Applies an edit from the form.
 * @param {Partial<import('./calculator.js').LoanInputs>} patch changed fields
 * @returns {import('./calculator.js').CalcResult} new result of the active offer
 */
function edit(patch) {
  const result = offers.update(patch);
  render();
  followInUrl();
  return result;
}

/**
 * Takes over a value found by the reverse solver.
 * @param {Partial<import('./calculator.js').LoanInputs>} patch solved field
 */
function applySolution(patch) {
  offers.update(patch);
  refill();
  followInUrl();
}

/**
 * Switches the form to another offer.
 * @param {'a'|'b'} key offer to edit
 */
function selectOffer(key) {
  offers.select(key);
  syncOfferControls();
  refill();
}

/**
 * Turns the comparison of two offers on or off.
 * @param {boolean} on whether to compare
 */
function setComparing(on) {
  offers.setComparing(on);
  syncOfferControls();
  refill();
  followInUrl();
}

/**
 * Shows the compare switch and the offer picker as the offers stand.
 */
function syncOfferControls() {
  const comparing = offers.isComparing();
  controls.compare.checked = comparing;
  controls.offerPicker.hidden = !comparing;
  controls.offerPicker.elements.namedItem('offer').value = offers.activeKey();
}

/**
 * Goes back to one offer with the default values and a clean address.
 */
function resetAll() {
  clearTimeout(urlTimer);
  offers.reset();
  views.table.reset();
  views.solver.clear();
  syncOfferControls();
  refill();
  replaceUrl(location.pathname);
  toast(t('toast.reset'));
}

/**
 * Lets the address bar follow the inputs shortly after the last edit, so a
 * reload or a bookmark keeps them.
 */
function followInUrl() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    const query = offers.query();
    if (query !== null) replaceUrl(`?${query}`);
  }, URL_DELAY_MS);
}

/**
 * Copies a link to the current offers.
 */
async function share() {
  const query = offers.query();
  if (query === null) {
    toast(t('toast.fixFirst'));
    return;
  }
  clearTimeout(urlTimer);
  replaceUrl(`?${query}`);
  const copied = await copyText(`${location.origin}${location.pathname}?${query}`);
  toast(t(copied ? 'toast.copied' : 'toast.addressBar'));
}
