import { hit, targetOf } from '../core/dom.js';
import { esc } from '../core/html.js';

/** Markup for a menu. Items: `'-'` (separator) or `{ label, act, arg?, key?, danger? }`. */
export const menuHtml = (items) =>
  items
    .map((it) =>
      it === '-'
        ? '<div class="sep"></div>'
        : `<button class="item ${it.danger ? 'danger' : ''}" data-act="${it.act}" ${it.arg != null ? `data-arg="${esc(it.arg)}"` : ''}>
       <span>${esc(it.label)}</span>${it.key ? `<kbd>${esc(it.key)}</kbd>` : ''}</button>`,
    )
    .join('');

/**
 * One shared floating panel used for menus and pickers, anchored to the element that opened it.
 * @typedef {ReturnType<typeof createPopover>} Popover
 * @param {HTMLElement} el
 */
export function createPopover(el) {
  const doc = el.ownerDocument;
  const view = doc.defaultView;
  /** @type {HTMLElement | null} */
  let owner = null;

  function close() {
    el.hidden = true;
    owner?.classList.remove('open');
    owner = null;
  }
  /** @param {HTMLElement} anchor @param {string} html @param {string} [className] */
  function open(anchor, html, className = '') {
    owner?.classList.remove('open');
    el.className = 'pop ' + className;
    el.innerHTML = html;
    el.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth,
      h = el.offsetHeight;
    const above = r.bottom + h + 6 > view.innerHeight && r.top - h - 4 > 0;
    el.style.left = Math.max(6, Math.min(r.left, view.innerWidth - w - 6)) + 'px';
    el.style.top = (above ? r.top - h - 4 : r.bottom + 4) + 'px';
    owner = anchor;
    anchor.classList.add('open');
  }

  doc.addEventListener('mousedown', (e) => {
    if (el.contains(targetOf(e))) {
      if (!hit(e, 'input, select')) e.preventDefault(); // keep the document selection
    } else if (!owner?.contains(targetOf(e))) close();
  });

  return {
    open,
    close,
    /** Opens for `anchor`, or closes if it is already open for it. */
    toggle(anchor, html, className) {
      owner === anchor ? close() : open(anchor, html, className);
    },
    contains: (node) => el.contains(node),
    get owner() {
      return owner;
    },
  };
}
