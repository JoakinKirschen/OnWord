import { $$, hit } from '../../core/dom.js';
import { esc } from '../../core/html.js';
import { insertBlock } from '../blocks.js';
import { pageOf } from '../metrics.js';

const HEADINGS = 'h1, h2, h3, h4, h5';
const TOC = 'div.toc';
const EMPTY = '<p class="toc-empty">Add headings to the document to fill the table of contents.</p>';

/**
 * Table of contents: a block listing the document's headings with their page numbers. It rebuilds itself
 * whenever the document changes, and clicking an entry goes to its heading.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initToc(ctx) {
  const { content, events, commands } = ctx;
  const headings = () => $$(HEADINGS, content).filter((h) => h.textContent.trim() && !h.closest(TOC));

  const entry = (/** @type {HTMLElement} */ h) =>
    `<p class="toc-${h.tagName[1]}">${esc(h.textContent.trim())}<span class="toc-page">${pageOf(h, content)}</span></p>`;

  /** Brings every table of contents up to date. Touches the DOM only when something differs. */
  function refresh() {
    const tocs = $$(TOC, content);
    if (!tocs.length) return;
    const html = headings().map(entry).join('') || EMPTY;
    for (const toc of tocs) {
      if (toc.innerHTML !== html) toc.innerHTML = html;
      toc.contentEditable = 'false'; // generated; the attribute is dropped by the sanitiser on import
    }
  }

  commands.register({
    'insert.toc'() {
      const toc = content.ownerDocument.createElement('div');
      toc.className = 'toc';
      insertBlock(ctx, toc, (node) => node.nextElementSibling);
    },
  });

  content.addEventListener('click', (e) => {
    const clicked = hit(e, `${TOC} > p`);
    if (!clicked) return;
    const index = [...clicked.parentElement.children].indexOf(clicked);
    headings()[index]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  // Page numbers are only known once the document has been paginated.
  events.on('pages', refresh);
}
