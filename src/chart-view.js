/**
 * Principal vs interest chart on a canvas: stacked bars per month (one per
 * year for long loans) and the remaining balance as a line on its own axis.
 * Mouse, touch and the arrow keys pick a bar and show its details.
 */
import { byId, h } from './dom.js';
import { formatMoney } from './format.js';
import { getLanguage, t } from './i18n.js';
import { chartBars, formatAxis, niceScale } from './view-model.js';

/** Bar parts from the axis up; each is painted with the CSS color --chart-<part>. */
const STACK = Object.freeze(['principal', 'extra', 'interest', 'tax']);

/** Parts listed in the details box, in this order. */
const TIP_PARTS = Object.freeze(['principal', 'extra', 'interest', 'tax', 'capitalized']);

/** Parts that are always listed, even when zero. */
const ALWAYS = Object.freeze(['principal', 'interest', 'balance']);

/** Grid intervals on both value axes. */
const INTERVALS = 4;

/** Space above and below the plot and between the axis labels and the plot, in CSS pixels. */
const INSET = Object.freeze({ top: 10, bottom: 22, gap: 6 });

/** Narrowest distance between two x-axis labels, in CSS pixels. */
const LABEL_SPACING = 28;

/** Label every n-th bar, picking the first n from these that leaves room. */
const LABEL_STEPS = Object.freeze({ month: [1, 2, 3, 6, 12], year: [1, 2, 5, 10, 20] });

/** Widest bar, and the share of its slot a bar takes. */
const BAR = Object.freeze({ max: 36, share: 0.7 });

/**
 * Wires the chart card.
 * @returns {{show: (result: import('./calculator.js').CalcResult) => void}} show draws a result
 */
export function createChart() {
  const el = {
    wrap: byId('chart-wrap'),
    canvas: byId('chart'),
    tip: byId('chart-tip'),
    empty: byId('chart-empty'),
    unit: byId('chart-unit'),
    legend: byId('chart-legend'),
  };
  const ctx = el.canvas.getContext('2d');
  /** @type {{unit: 'month'|'year', bars: import('./view-model.js').ChartBar[], startBalance: number, currency: string}|null} */
  let data = null;
  let geometry = null;
  let selected = -1;

  bindPointer();
  bindKeys();
  new ResizeObserver(() => draw()).observe(el.wrap);

  /**
   * Draws the schedule of a result, or the empty state for invalid inputs.
   * @param {import('./calculator.js').CalcResult} result result of the offer being edited
   */
  function show(result) {
    el.empty.hidden = result.ok;
    el.wrap.hidden = !result.ok;
    el.legend.hidden = !result.ok;
    if (!result.ok) {
      data = null;
      geometry = null;
      selected = -1;
      return;
    }
    data = { ...chartBars(result.rows), currency: result.inputs.currency };
    selected = Math.min(selected, data.bars.length - 1);
    const monthly = data.unit === 'month';
    el.unit.textContent = t(monthly ? 'chart.perMonth' : 'chart.perYear');
    el.canvas.setAttribute('aria-label', t(monthly ? 'chart.aria.month' : 'chart.aria.year'));
    for (const item of el.legend.querySelectorAll('[data-part]')) item.hidden = !isUsed(item.dataset.part);
    draw();
    showTip();
  }

  /**
   * Picks a bar and shows its details.
   * @param {number} index bar index, or -1 to clear the selection
   */
  function select(index) {
    if (!data || index === selected) return;
    selected = index;
    draw();
    showTip();
  }

  /**
   * Whether any bar has some of a part (the legend hides unused parts).
   * @param {string} part bar field, or 'balance'
   * @returns {boolean} true when the part shows up in the chart
   */
  function isUsed(part) {
    return ALWAYS.includes(part) || data.bars.some((bar) => bar[part] > 0);
  }

  /**
   * Picks bars with the mouse (hover) or a finger (tap and drag sideways).
   */
  function bindPointer() {
    const pick = (event) => {
      if (!data || !geometry) return;
      const x = event.clientX - el.canvas.getBoundingClientRect().left;
      const index = Math.floor((x - geometry.plot.x) / geometry.slot);
      select(Math.min(data.bars.length - 1, Math.max(0, index)));
    };
    el.canvas.addEventListener('pointerdown', pick);
    el.canvas.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'mouse' || event.buttons > 0) pick(event);
    });
    el.canvas.addEventListener('pointerleave', (event) => {
      if (event.pointerType === 'mouse' && document.activeElement !== el.canvas) select(-1);
    });
    el.canvas.addEventListener('blur', () => select(-1));
  }

  /**
   * Arrow keys step through the bars, Home and End jump, Escape clears.
   */
  function bindKeys() {
    el.canvas.addEventListener('keydown', (event) => {
      if (!data) return;
      const last = data.bars.length - 1;
      const moves = {
        ArrowRight: () => Math.min(last, selected + 1),
        ArrowLeft: () => (selected < 0 ? last : Math.max(0, selected - 1)),
        Home: () => 0,
        End: () => last,
        Escape: () => -1,
      };
      if (!moves[event.key]) return;
      event.preventDefault();
      select(moves[event.key]());
    });
  }

  /**
   * Redraws the canvas at the device pixel ratio.
   */
  function draw() {
    const width = el.canvas.clientWidth;
    const height = el.canvas.clientHeight;
    if (!data || width === 0 || height === 0) return;
    const ratio = window.devicePixelRatio || 1;
    el.canvas.width = Math.round(width * ratio);
    el.canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const css = getComputedStyle(el.canvas);
    const color = (name) => css.getPropertyValue(`--${name}`).trim();
    ctx.font = `11px ${css.fontFamily}`;
    geometry = measure(width, height);
    drawGrid(color);
    drawBars(color);
    drawBalance(color);
    drawLabels(color);
    if (selected >= 0 && !el.tip.hidden) placeTip();
  }

  /**
   * Works out the scales and the plot box; the side insets fit the axis labels.
   * @param {number} width canvas width in CSS pixels
   * @param {number} height canvas height in CSS pixels
   * @returns {object} plot box, slot and bar width, scales and labels
   */
  function measure(width, height) {
    const style = getLanguage();
    const tallest = Math.max(...data.bars.map((bar) => Math.max(bar.paid, bar.capitalized)));
    const highest = Math.max(data.startBalance, ...data.bars.map((bar) => bar.balance));
    const pay = niceScale(tallest / 100, INTERVALS);
    const balance = niceScale(highest / 100, INTERVALS);
    const tickLabels = (scale) => Array.from({ length: INTERVALS + 1 }, (_, i) => formatAxis(i * scale.step, style));
    const payLabels = tickLabels(pay);
    const balanceLabels = tickLabels(balance);
    const widest = (labels) => Math.max(...labels.map((label) => ctx.measureText(label).width));
    const left = Math.ceil(widest(payLabels)) + INSET.gap * 2;
    const right = Math.ceil(widest(balanceLabels)) + INSET.gap * 2;
    const plot = { x: left, y: INSET.top, w: width - left - right, h: height - INSET.top - INSET.bottom };
    const slot = plot.w / data.bars.length;
    return { plot, slot, bar: Math.min(BAR.max, slot * BAR.share), pay, balance, payLabels, balanceLabels };
  }

  /**
   * Vertical position of an amount on an axis.
   * @param {number} cents amount in cents
   * @param {{top: number}} scale axis scale in currency units
   * @returns {number} y in CSS pixels
   */
  function yOf(cents, scale) {
    const { plot } = geometry;
    return plot.y + plot.h * (1 - cents / 100 / scale.top);
  }

  /**
   * Horizontal centre of a bar.
   * @param {number} index bar index
   * @returns {number} x in CSS pixels
   */
  function centerOf(index) {
    return geometry.plot.x + geometry.slot * (index + 0.5);
  }

  /**
   * Horizontal grid lines and the band behind the selected bar.
   * @param {(name: string) => string} color reads a CSS color token
   */
  function drawGrid(color) {
    const { plot, slot } = geometry;
    if (selected >= 0) {
      ctx.fillStyle = color('chart-highlight');
      ctx.fillRect(plot.x + slot * selected, plot.y, slot, plot.h);
    }
    ctx.strokeStyle = color('chart-grid');
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= INTERVALS; i += 1) {
      const y = Math.round(plot.y + (plot.h * i) / INTERVALS) + 0.5;
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
    }
    ctx.stroke();
  }

  /**
   * Stacked bars; capitalized grace months get a dashed outline instead.
   * @param {(name: string) => string} color reads a CSS color token
   */
  function drawBars(color) {
    const { bar: width, pay } = geometry;
    data.bars.forEach((bar, index) => {
      const x = centerOf(index) - width / 2;
      let base = 0;
      for (const part of STACK) {
        if (bar[part] <= 0) continue;
        const top = yOf(base + bar[part], pay);
        ctx.fillStyle = color(`chart-${part}`);
        ctx.fillRect(x, top, width, yOf(base, pay) - top);
        base += bar[part];
      }
      if (bar.capitalized > 0) {
        const top = yOf(bar.capitalized, pay);
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = color('chart-capitalized');
        ctx.strokeRect(x + 0.5, top + 0.5, width - 1, yOf(0, pay) - top - 1);
        ctx.setLineDash([]);
      }
    });
  }

  /**
   * Remaining balance as a line from the opening balance, with a dot on the selected bar.
   * @param {(name: string) => string} color reads a CSS color token
   */
  function drawBalance(color) {
    const { plot, balance } = geometry;
    ctx.strokeStyle = color('chart-balance');
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(plot.x, yOf(data.startBalance, balance));
    data.bars.forEach((bar, index) => ctx.lineTo(centerOf(index), yOf(bar.balance, balance)));
    ctx.stroke();
    if (selected < 0) return;
    ctx.beginPath();
    ctx.arc(centerOf(selected), yOf(data.bars[selected].balance, balance), 4, 0, Math.PI * 2);
    ctx.fillStyle = color('chart-balance');
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color('surface');
    ctx.stroke();
  }

  /**
   * Axis labels: installments on the left, balance on the right, bar numbers below.
   * @param {(name: string) => string} color reads a CSS color token
   */
  function drawLabels(color) {
    const { plot, slot, payLabels, balanceLabels } = geometry;
    ctx.fillStyle = color('muted');
    ctx.textBaseline = 'middle';
    payLabels.forEach((label, i) => {
      const y = plot.y + plot.h * (1 - i / INTERVALS);
      ctx.textAlign = 'right';
      ctx.fillText(label, plot.x - INSET.gap, y);
      ctx.textAlign = 'left';
      ctx.fillText(balanceLabels[i], plot.x + plot.w + INSET.gap, y);
    });
    const steps = LABEL_STEPS[data.unit];
    const every = steps.find((step) => step * slot >= LABEL_SPACING) ?? steps[steps.length - 1];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    data.bars.forEach((bar, index) => {
      if ((index + 1) % every === 0) ctx.fillText(String(bar.label), centerOf(index), plot.y + plot.h + INSET.gap);
    });
  }

  /**
   * Fills the details box of the selected bar and puts it beside the bar.
   */
  function showTip() {
    el.tip.hidden = selected < 0 || !data;
    if (el.tip.hidden) return;
    const bar = data.bars[selected];
    const monthly = data.unit === 'month';
    const money = (cents) => formatMoney(cents, data.currency, getLanguage());
    const parts = TIP_PARTS.filter((part) => bar[part] > 0 || ALWAYS.includes(part));
    el.tip.replaceChildren(
      h('p', { className: 'tip-title', text: t(monthly ? 'tip.month' : 'tip.year', { n: bar.label }) }),
      h('dl', {},
        ...parts.map((part) => tipRow(part, t(`legend.${part}`), money(bar[part]))),
        tipRow('total', t(monthly ? 'tip.installment' : 'tip.installments'), money(bar.principal + bar.interest + bar.tax)),
        tipRow('balance', t('legend.balance'), money(bar.balance))));
    placeTip();
  }

  /**
   * Puts the details box beside the selected bar, on the side with room; on
   * narrow charts it keeps to the edge away from the bar.
   */
  function placeTip() {
    const width = el.tip.offsetWidth;
    const total = el.canvas.clientWidth;
    const x = centerOf(selected);
    const reach = geometry.slot / 2 + INSET.gap;
    let left = x < total / 2 ? Math.max(0, total - width) : 0;
    if (x + reach + width <= total) left = x + reach;
    else if (x - reach - width >= 0) left = x - reach - width;
    el.tip.style.left = `${left}px`;
  }

  return { show };
}

/**
 * One line of the details box.
 * @param {string} kind part name, 'total' or 'balance' (decides the swatch)
 * @param {string} label translated label
 * @param {string} value formatted amount
 * @returns {HTMLElement} row element
 */
function tipRow(kind, label, value) {
  return h('div', { className: `tip-row tip-${kind}` },
    h('dt', {}, h('span', { className: `swatch swatch-${kind}`, 'aria-hidden': 'true' }), label),
    h('dd', { text: value }));
}
