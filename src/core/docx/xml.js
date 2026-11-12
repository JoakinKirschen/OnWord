/** Helpers for reading WordprocessingML, where every element and attribute lives in the `w:` namespace. */

const WML = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const OFF_VALUES = ['0', 'false', 'none', 'off'];

/** @param {Uint8Array | undefined} bytes @returns {Document | null} */
export function parseXml(bytes) {
  if (!bytes) return null;
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml');
  return doc.querySelector('parsererror') ? null : doc;
}

/** Child elements with the given local name (any namespace prefix). */
export const kids = (/** @type {Element | null | undefined} */ el, /** @type {string} */ name) =>
  el ? [...el.children].filter((child) => child.localName === name) : [];

/** First child element with the given local name. */
export const kid = (/** @type {Element | null | undefined} */ el, /** @type {string} */ name) => kids(el, name)[0];

/** Descendant elements with the given local name. */
export const all = (/** @type {Element | Document | null | undefined} */ el, /** @type {string} */ name) =>
  el ? [...el.getElementsByTagName('*')].filter((node) => node.localName === name) : [];

/** A `w:`-namespaced attribute, e.g. `attr(el, 'val')`. */
export const attr = (/** @type {Element | null | undefined} */ el, /** @type {string} */ name) =>
  el ? (el.getAttributeNS(WML, name) ?? el.getAttribute('w:' + name)) : null;

/** `w:val` of a child element, e.g. `val(pPr, 'jc')` → "center". */
export const val = (/** @type {Element | null | undefined} */ el, /** @type {string} */ name) =>
  attr(kid(el, name), 'val');

/** Whether a toggle property such as `<w:b/>` is present and not switched off. */
export function isOn(/** @type {Element | null | undefined} */ el, /** @type {string} */ name) {
  const child = kid(el, name);
  return !!child && !OFF_VALUES.includes(attr(child, 'val') ?? '');
}
