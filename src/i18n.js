/**
 * English and Turkish UI strings and a tiny translator. Pure module: it only
 * remembers the current language; the UI modules update the DOM.
 */

/** Supported languages; English is the default. */
export const LANGUAGES = Object.freeze(['en', 'tr']);

/** English strings. An array holds the singular and plural form of {n}. */
const EN = {
  'app.title': 'Loan Calculator',
  'action.reset': 'Reset',
  'action.resetAria': 'Reset every field to the defaults',
  'lang.switch': 'TR',
  'lang.switchAria': 'TR – Switch to Turkish',

  'form.title': 'Loan details',
  'form.compare': 'Compare offers',
  'form.offers': 'Offer to edit',
  'offer.a': 'Offer A',
  'offer.b': 'Offer B',
  'field.amount': 'Loan amount',
  'field.currency': 'Currency',
  'field.rate': 'Interest rate',
  'field.rateBasis': 'Rate period',
  'basis.monthly': 'Monthly',
  'basis.annual': 'Annual',
  'hint.rate.monthly': '{annual} a year nominal · {effective} effective',
  'hint.rate.annual': '{monthly} a month · {effective} effective',
  'field.term': 'Term (months)',
  'field.termSlider': 'Term',
  'field.method': 'Repayment',
  'method.annuity': 'Equal installments',
  'method.equalPrincipal': 'Equal principal',
  'field.tax': 'Tax on interest',
  'field.fees': 'Upfront fees',
  'hint.taxFees': 'Tax is charged on the interest of every installment (0 if none). Fees are paid once and count in the cost rate.',
  'field.grace': 'Grace months',
  'field.graceType': 'During grace',
  'grace.interestOnly': 'Pay interest',
  'grace.capitalized': 'Add to balance',
  'extras.title': 'Extra payments',
  'extras.add': 'Add',
  'extras.addAria': 'Add an extra payment',
  'extras.empty': 'One-off or recurring extra payments pay the loan off sooner.',
  'extras.amount': 'Extra payment {n} amount',
  'extras.month': 'Month',
  'extras.monthAria': 'Extra payment {n} month',
  'extras.every': 'Extra payment {n} repeat',
  'extras.remove': 'Remove extra payment {n}',
  'every.0': 'Once',
  'every.1': 'Monthly',
  'every.3': 'Every 3 months',
  'every.6': 'Every 6 months',
  'every.12': 'Yearly',
  'every.other': 'Every {n} months',
  'extras.strategy': 'With extra payments',
  'strategy.shortenTerm': 'Shorter term',
  'strategy.lowerPayment': 'Lower installment',

  'solver.title': 'Work back from an installment',
  'solver.payment': 'Installment you can pay',
  'solver.target': 'Find the',
  'solver.amount': 'Amount',
  'solver.rate': 'Rate',
  'solver.term': 'Term',
  'solver.prompt': 'Enter an installment to start.',
  'solver.result.amount': 'Largest loan: {value}',
  'solver.result.rate': 'Interest rate: {value}',
  'solver.result.term': 'Shortest term: {value}',
  'solver.rate.monthly': '{rate} a month',
  'solver.rate.annual': '{rate} a year',
  'solver.none': 'Not possible with the other values.',
  'solver.apply': 'Use this',
  'solver.note': 'Assumes equal installments; the grace period and extra payments are left out.',

  'results.title': 'Results',
  'results.installment': 'Monthly installment',
  'results.firstInstallment': 'First installment',
  'results.afterGrace': 'Installment after grace',
  'results.firstAfterGrace': 'First installment after grace',
  'results.count': ['{n} installment · last {last}', '{n} installments · last {last}'],
  'results.totalPayment': 'Total payment',
  'results.totalInterest': 'Total interest',
  'results.totalTax': 'Total tax',
  'results.totalCost': 'Total cost',
  'results.withFees': 'incl. {fees} fees',
  'results.noFees': 'no fees',
  'results.effectiveRate': 'Effective annual rate',
  'results.costRate': 'Annual cost rate',
  'results.costRateSub': 'incl. fees and tax',
  'results.over': 'over {value}',
  'results.saved': 'Extra payments save {amount} in interest and tax and finish {duration} early.',
  'results.savedAmount': 'Extra payments save {amount} in interest and tax.',
  'results.invalid': 'Check the highlighted fields to see the results.',
  'results.share': 'Copy link',
  'bar.installment': 'Installment',
  'bar.total': 'Total',

  'toast.copied': 'Link copied',
  'toast.addressBar': 'Copy the link from the address bar',
  'toast.reset': 'Back to the defaults',
  'toast.fixFirst': 'Fix the highlighted fields first',

  'compare.title': 'Offer comparison',
  'compare.installment': 'Installment',
  'compare.totalPayment': 'Total payment',
  'compare.totalInterest': 'Total interest',
  'compare.fees': 'Fees',
  'compare.totalCost': 'Total cost',
  'compare.annualCostRate': 'Annual cost rate',
  'compare.cheaper': '{offer} is {amount} cheaper in total.',
  'compare.tie': 'Both offers cost the same in total.',
  'compare.rate': 'Lower annual cost rate: {offer}.',
  'compare.rateTie': 'Both have the same annual cost rate.',
  'compare.invalid': 'Fix {offer} to compare.',
  'compare.hint': 'Select an offer to edit it.',

  'chart.title': 'Principal vs interest',
  'chart.perMonth': 'per month',
  'chart.perYear': 'per year',
  'chart.aria.month': 'Stacked bars of principal and interest for each month, with the remaining balance as a line. Left and right arrow keys step through the months.',
  'chart.aria.year': 'Stacked bars of principal and interest for each year, with the remaining balance as a line. Left and right arrow keys step through the years.',
  'chart.empty': 'The chart appears once the inputs are valid.',
  'legend.principal': 'Principal',
  'legend.interest': 'Interest',
  'legend.tax': 'Tax',
  'legend.extra': 'Extra payment',
  'legend.balance': 'Balance',
  'legend.capitalized': 'Added to balance',
  'tip.month': 'Month {n}',
  'tip.year': 'Year {n}',
  'tip.installment': 'Installment',
  'tip.installments': 'Installments',

  'table.title': 'Payment schedule',
  'table.month': 'Month',
  'table.payment': 'Installment',
  'table.principal': 'Principal',
  'table.interest': 'Interest',
  'table.tax': 'Tax',
  'table.extra': 'Extra',
  'table.balance': 'Balance',
  'table.year': 'Year {n}',
  'table.grace': 'grace',
  'table.expandAll': 'Expand all',
  'table.collapseAll': 'Collapse all',
  'table.csv': 'Download CSV',
  'table.file': 'loan-schedule.csv',
  'table.region': 'Payment schedule, scrollable',
  'table.empty': 'The schedule appears once the inputs are valid.',

  'note.estimate': "Results are estimates. Your bank's figures can differ slightly because of rounding, day counts and fees.",
  'footer.source': 'MIT · Source on GitHub',

  'unit.year': ['{n} year', '{n} years'],
  'unit.month': ['{n} month', '{n} months'],

  'error.required': 'Enter a number.',
  'error.min': 'Must be at least {limit}.',
  'error.max': 'Must be at most {limit}.',
  'error.integer': 'Use whole months.',
  'error.invalid': 'Choose one of the options.',
  'error.exceedsAmount': 'Fees must be less than the loan amount.',
  'error.tooLarge': 'This grace period grows the balance too much.',
  'error.tooMany': 'At most {limit} extra payments.',
  'error.extra.amount': 'Enter an amount above zero.',
  'error.extra.month': 'Pick a month from 1 to {term}.',
  'error.extra.every': 'Choose how often it repeats.',
  'error.extra.end': 'The end month is outside the term.',
};

/** Turkish strings; Turkish does not inflect nouns after numbers. */
const TR = {
  'app.title': 'Kredi Hesaplayıcı',
  'action.reset': 'Sıfırla',
  'action.resetAria': 'Sıfırla: tüm alanları varsayılana döndür',
  'lang.switch': 'EN',
  'lang.switchAria': 'EN – İngilizceye geç',

  'form.title': 'Kredi bilgileri',
  'form.compare': 'Karşılaştır',
  'form.offers': 'Düzenlenen teklif',
  'offer.a': 'Teklif A',
  'offer.b': 'Teklif B',
  'field.amount': 'Kredi tutarı',
  'field.currency': 'Para birimi',
  'field.rate': 'Faiz oranı',
  'field.rateBasis': 'Faiz dönemi',
  'basis.monthly': 'Aylık',
  'basis.annual': 'Yıllık',
  'hint.rate.monthly': 'Yıllık nominal {annual} · efektif {effective}',
  'hint.rate.annual': 'Aylık {monthly} · efektif {effective}',
  'field.term': 'Vade (ay)',
  'field.termSlider': 'Vade',
  'field.method': 'Geri ödeme',
  'method.annuity': 'Eşit taksit',
  'method.equalPrincipal': 'Eşit anapara',
  'field.tax': 'Faiz vergisi',
  'field.fees': 'Peşin masraf',
  'hint.taxFees': 'Vergi her taksitteki faize uygulanır (yoksa 0). Masraflar bir kez ödenir ve maliyet oranına girer.',
  'field.grace': 'Ödemesiz ay',
  'field.graceType': 'Ödemesiz dönemde',
  'grace.interestOnly': 'Faiz ödenir',
  'grace.capitalized': 'Borca eklenir',
  'extras.title': 'Ek ödemeler',
  'extras.add': 'Ekle',
  'extras.addAria': 'Ek ödeme ekle',
  'extras.empty': 'Tek seferlik ya da düzenli ek ödemeler krediyi erken kapatır.',
  'extras.amount': '{n}. ek ödeme tutarı',
  'extras.month': 'Ay',
  'extras.monthAria': '{n}. ek ödeme ayı',
  'extras.every': '{n}. ek ödeme tekrarı',
  'extras.remove': '{n}. ek ödemeyi kaldır',
  'every.0': 'Bir kez',
  'every.1': 'Her ay',
  'every.3': '3 ayda bir',
  'every.6': '6 ayda bir',
  'every.12': 'Yılda bir',
  'every.other': '{n} ayda bir',
  'extras.strategy': 'Ek ödeme sonrası',
  'strategy.shortenTerm': 'Vade kısalsın',
  'strategy.lowerPayment': 'Taksit düşsün',

  'solver.title': 'Taksitten geriye hesapla',
  'solver.payment': 'Ödeyebileceğiniz taksit',
  'solver.target': 'Bulunacak',
  'solver.amount': 'Tutar',
  'solver.rate': 'Faiz',
  'solver.term': 'Vade',
  'solver.prompt': 'Başlamak için bir taksit girin.',
  'solver.result.amount': 'En yüksek kredi: {value}',
  'solver.result.rate': 'Faiz oranı: {value}',
  'solver.result.term': 'En kısa vade: {value}',
  'solver.rate.monthly': 'aylık {rate}',
  'solver.rate.annual': 'yıllık {rate}',
  'solver.none': 'Diğer değerlerle mümkün değil.',
  'solver.apply': 'Bunu kullan',
  'solver.note': 'Eşit taksit varsayılır; ödemesiz dönem ve ek ödemeler hesaba katılmaz.',

  'results.title': 'Sonuçlar',
  'results.installment': 'Aylık taksit',
  'results.firstInstallment': 'İlk taksit',
  'results.afterGrace': 'Ödemesiz dönem sonrası taksit',
  'results.firstAfterGrace': 'Ödemesiz dönem sonrası ilk taksit',
  'results.count': '{n} taksit · son taksit {last}',
  'results.totalPayment': 'Toplam geri ödeme',
  'results.totalInterest': 'Toplam faiz',
  'results.totalTax': 'Toplam vergi',
  'results.totalCost': 'Toplam maliyet',
  'results.withFees': '{fees} masraf dahil',
  'results.noFees': 'masrafsız',
  'results.effectiveRate': 'Efektif yıllık faiz',
  'results.costRate': 'Yıllık maliyet oranı',
  'results.costRateSub': 'masraf ve vergi dahil',
  'results.over': '{value} üstü',
  'results.saved': 'Ek ödemeler faiz ve vergide {amount} tasarruf sağlar, kredi {duration} erken biter.',
  'results.savedAmount': 'Ek ödemeler faiz ve vergide {amount} tasarruf sağlar.',
  'results.invalid': 'Sonuçlar için işaretli alanları kontrol edin.',
  'results.share': 'Bağlantıyı kopyala',
  'bar.installment': 'Taksit',
  'bar.total': 'Toplam',

  'toast.copied': 'Bağlantı kopyalandı',
  'toast.addressBar': 'Bağlantıyı adres çubuğundan kopyalayın',
  'toast.reset': 'Varsayılanlara dönüldü',
  'toast.fixFirst': 'Önce işaretli alanları düzeltin',

  'compare.title': 'Teklif karşılaştırması',
  'compare.installment': 'Taksit',
  'compare.totalPayment': 'Toplam geri ödeme',
  'compare.totalInterest': 'Toplam faiz',
  'compare.fees': 'Masraf',
  'compare.totalCost': 'Toplam maliyet',
  'compare.annualCostRate': 'Yıllık maliyet oranı',
  'compare.cheaper': '{offer} toplamda {amount} daha ucuz.',
  'compare.tie': 'İki teklifin toplam maliyeti aynı.',
  'compare.rate': 'Daha düşük yıllık maliyet oranı: {offer}.',
  'compare.rateTie': 'Yıllık maliyet oranları aynı.',
  'compare.invalid': 'Karşılaştırmak için {offer} bilgilerini düzeltin.',
  'compare.hint': 'Düzenlemek için bir teklif seçin.',

  'chart.title': 'Anapara ve faiz',
  'chart.perMonth': 'aylık',
  'chart.perYear': 'yıllık',
  'chart.aria.month': 'Her ayın anapara ve faizini gösteren yığılmış çubuklar; kalan borç çizgiyle gösterilir. Sol ve sağ ok tuşları aylar arasında gezinir.',
  'chart.aria.year': 'Her yılın anapara ve faizini gösteren yığılmış çubuklar; kalan borç çizgiyle gösterilir. Sol ve sağ ok tuşları yıllar arasında gezinir.',
  'chart.empty': 'Girdiler geçerli olunca grafik görünür.',
  'legend.principal': 'Anapara',
  'legend.interest': 'Faiz',
  'legend.tax': 'Vergi',
  'legend.extra': 'Ek ödeme',
  'legend.balance': 'Kalan borç',
  'legend.capitalized': 'Borca eklenen',
  'tip.month': '{n}. ay',
  'tip.year': '{n}. yıl',
  'tip.installment': 'Taksit',
  'tip.installments': 'Taksitler',

  'table.title': 'Ödeme planı',
  'table.month': 'Ay',
  'table.payment': 'Taksit',
  'table.principal': 'Anapara',
  'table.interest': 'Faiz',
  'table.tax': 'Vergi',
  'table.extra': 'Ek ödeme',
  'table.balance': 'Kalan borç',
  'table.year': '{n}. yıl',
  'table.grace': 'ödemesiz',
  'table.expandAll': 'Tümünü aç',
  'table.collapseAll': 'Tümünü kapat',
  'table.csv': 'CSV indir',
  'table.file': 'odeme-plani.csv',
  'table.region': 'Ödeme planı, kaydırılabilir',
  'table.empty': 'Girdiler geçerli olunca ödeme planı görünür.',

  'note.estimate': 'Sonuçlar tahminidir. Bankanızın rakamları yuvarlama, gün sayımı ve masraflar nedeniyle biraz farklı olabilir.',
  'footer.source': "MIT · Kaynak kodu GitHub'da",

  'unit.year': '{n} yıl',
  'unit.month': '{n} ay',

  'error.required': 'Bir sayı girin.',
  'error.min': 'En az {limit} olmalı.',
  'error.max': 'En fazla {limit} olabilir.',
  'error.integer': 'Tam ay girin.',
  'error.invalid': 'Seçeneklerden birini seçin.',
  'error.exceedsAmount': 'Masraf kredi tutarından az olmalı.',
  'error.tooLarge': 'Bu ödemesiz dönem borcu fazla büyütür.',
  'error.tooMany': 'En fazla {limit} ek ödeme.',
  'error.extra.amount': 'Sıfırdan büyük bir tutar girin.',
  'error.extra.month': '1 ile {term} arasında bir ay seçin.',
  'error.extra.every': 'Tekrar sıklığını seçin.',
  'error.extra.end': 'Bitiş ayı vadenin dışında.',
};

/** All strings by language. */
export const STRINGS = Object.freeze({ en: Object.freeze(EN), tr: Object.freeze(TR) });

let current = 'en';

/**
 * Switches the language used by t().
 * @param {string} lang 'en' or 'tr'; anything else falls back to English
 * @returns {'en'|'tr'} the language now in use
 */
export function setLanguage(lang) {
  current = LANGUAGES.includes(lang) ? lang : 'en';
  return current;
}

/**
 * The language t() uses; it doubles as the number style of format.js.
 * @returns {'en'|'tr'} current language
 */
export function getLanguage() {
  return current;
}

/**
 * Translates a key and fills in {placeholders}. A param named n also picks
 * the singular or plural form when the string has both.
 * @param {string} key string key, e.g. 'results.totalCost'
 * @param {Record<string, string|number>} [params] placeholder values
 * @returns {string} translated text (the key itself when unknown)
 */
export function t(key, params = {}) {
  const entry = STRINGS[current][key] ?? STRINGS.en[key];
  if (entry === undefined) return key;
  const template = Array.isArray(entry) ? entry[params.n === 1 ? 0 : 1] : entry;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

/**
 * Writes a number of months as years and months, e.g. "2 years 6 months".
 * @param {number} months whole months
 * @returns {string} duration in the current language
 */
export function formatDuration(months) {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [];
  if (years > 0) parts.push(t('unit.year', { n: years }));
  if (rest > 0 || years === 0) parts.push(t('unit.month', { n: rest }));
  return parts.join(' ');
}
