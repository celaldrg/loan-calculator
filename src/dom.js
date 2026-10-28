/**
 * Small DOM helpers shared by the UI modules. Text always goes in through
 * textContent or attributes; nothing here parses HTML.
 */

/** SVG path data of the icons built in script. */
const ICONS = Object.freeze({
  close: 'M6 6l12 12M18 6 6 18',
  chevron: 'm9 6 6 6-6 6',
});

/**
 * Creates an element.
 * @param {string} tag tag name
 * @param {Record<string, unknown>} [props] `className`, `text` (textContent) or any
 *   attribute; null, undefined and false are skipped, true sets an empty attribute
 * @param {...(Node|string|null|false|undefined)} children child nodes or text
 * @returns {HTMLElement} the new element
 */
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'className') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) {
    if (child !== null && child !== undefined && child !== false) node.append(child);
  }
  return node;
}

/**
 * Builds a 24 x 24 stroke icon that inherits the text color.
 * @param {'close'|'chevron'} name icon name
 * @returns {SVGSVGElement} decorative icon (hidden from assistive technology)
 */
export function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icon icon-${name}`);
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

/**
 * Element by id.
 * @param {string} id element id
 * @returns {HTMLElement} the element
 */
export function byId(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node;
}

/**
 * Translates the static page: data-i18n sets the text, data-i18n-aria-label
 * the accessible name.
 * @param {ParentNode} root subtree to translate
 * @param {(key: string) => string} translate translator
 */
export function translateStatic(root, translate) {
  for (const node of root.querySelectorAll('[data-i18n]')) {
    node.textContent = translate(node.dataset.i18n);
  }
  for (const node of root.querySelectorAll('[data-i18n-aria-label]')) {
    node.setAttribute('aria-label', translate(node.dataset.i18nAriaLabel));
  }
}

/**
 * Creates a toast that shows short status messages for a moment.
 * @param {HTMLElement} node live region that holds the message
 * @returns {(message: string) => void} function that shows a message
 */
export function createToast(node) {
  let timer = 0;
  return (message) => {
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => node.classList.remove('show'), 2400);
  };
}
