import { $ } from '../../core/dom.js';
import { paginate } from '../pagination.js';

const GAP = 20; // pixels of desk showing between two sheets
const LISTS = /^(UL|OL)$/;

/**
 * Paged view: lays the document out as separate sheets. Blocks that would cross the end of a page are
 * pushed to the next one by generated CSS rules, so nothing is written into the document itself.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initPagination(ctx) {
  const { root, content, events } = ctx;
  const sheet = $('#sheet', root),
    gaps = $('#pageGaps', root);
  const rules = root.appendChild(root.ownerDocument.createElement('style'));
  rules.dataset.print = 'pages';
  let running = false;

  /**
   * The units that move between pages: top-level blocks, and the items of top-level lists so that a long
   * list can continue on the next page. Each carries the CSS selector that addresses it.
   */
  function units() {
    return /** @type {HTMLElement[]} */ ([...content.children]).flatMap((el, i) => {
      const selector = `#editor > :nth-child(${i + 1})`;
      const forced = !!el.previousElementSibling?.matches('hr.page-break');
      if (!LISTS.test(el.tagName) || !el.children.length) return [{ el, selector, forced }];
      return /** @type {HTMLElement[]} */ ([...el.children]).map((item, j) => ({
        el: item,
        selector: `${selector} > :nth-child(${j + 1})`,
        forced: forced && j === 0,
      }));
    });
  }

  /** Units as they sit without any page gaps. Offsets ignore zoom, unlike client rects. */
  function measure() {
    let previousBottom = 0;
    return units().map(({ el, selector, forced }, i) => {
      const top = el.offsetTop;
      // Vertical margins collapse, so the space above a unit is whatever separates it from the previous one.
      const spaceAbove = i ? top - previousBottom : 0;
      previousBottom = top + el.offsetHeight;
      return { top, height: el.offsetHeight, forced, selector, spaceAbove };
    });
  }

  function layout() {
    if (running) return;
    running = true;
    rules.textContent = '';
    sheet.style.setProperty('--page-gap', GAP + 'px');
    const style = getComputedStyle(content);
    const margin = parseFloat(style.paddingTop);
    const body = parseFloat(style.getPropertyValue('--page-body-h'));
    const pitch = body + 2 * margin + GAP;
    const columns = sheet.classList.contains('multi-column'); // columns balance over one tall page
    const blocks = columns || !body ? [] : measure();
    const { breaks, pages } = paginate(blocks, { start: margin, body, pitch });

    // Screen only: when printing, the browser paginates and splits paragraphs itself.
    const css = breaks.map(
      ({ index, extra }) =>
        `${blocks[index].selector} { margin-top: ${blocks[index].spaceAbove + extra}px !important; }`,
    );
    rules.textContent = css.length ? `@media screen { ${css.join(' ')} }` : '';
    sheet.style.setProperty('--page-count', String(pages));
    sheet.style.setProperty('--paged-h', pages * pitch - GAP + 'px');
    gaps.innerHTML = Array.from(
      { length: pages - 1 },
      (_, p) => `<div class="page-gap" style="top: ${(p + 1) * pitch - GAP}px"></div>`,
    ).join('');
    running = false;
    events.emit('pages');
  }

  events.on('layout', layout);
  events.on('change', layout);
}
