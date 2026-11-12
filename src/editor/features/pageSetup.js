import { $ } from '../../core/dom.js';
import { PAGE_MARGINS, PAGE_SIZES, PX_PER_INCH, normalizePage, pageGeometry } from '../../core/page.js';

const options = (/** @type {Record<string, { label: string }>} */ map) =>
  Object.entries(map)
    .map(([id, { label }]) => `<option value="${id}">${label}</option>`)
    .join('');

/**
 * Per-document paper size, orientation and margins, for the screen and for printing.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initPageSetup(ctx) {
  const { root, content, session, store, events, commands } = ctx;
  const doc = root.ownerDocument;
  const paper = $('#paper', root),
    dialog = $('#pageDlg', root);
  const sizeSel = $('#pageSize', root),
    orientationSel = $('#pageOrientation', root),
    marginSel = $('#pageMargin', root);
  // @page rules cannot read custom properties, so the print geometry is written into a style element.
  const printStyle = root.appendChild(doc.createElement('style'));
  sizeSel.innerHTML = options(PAGE_SIZES);
  marginSel.innerHTML = options(PAGE_MARGINS);

  const current = () => normalizePage(session.meta()?.page);

  function apply(/** @type {import('../../core/page.js').PageSetup} */ page) {
    const { width, height, margin, css } = pageGeometry(page);
    paper.style.setProperty('--page-w', width + 'px');
    paper.style.setProperty('--page-h', height + 'px');
    paper.style.setProperty('--page-margin', margin + 'px');
    printStyle.textContent = `@page { size: ${css} ${page.orientation}; margin: ${margin / PX_PER_INCH}in; }`;
  }

  commands.register({
    'page.setup'() {
      const page = current();
      sizeSel.value = page.size;
      orientationSel.value = page.orientation;
      marginSel.value = page.margin;
      dialog.returnValue = '';
      dialog.showModal();
    },
  });

  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'ok') {
      const page = normalizePage({
        size: sizeSel.value,
        orientation: orientationSel.value,
        margin: marginSel.value,
      });
      store.write(session.id, null, { page });
      apply(page);
    }
    content.focus();
  });
  events.on('open', () => apply(current()));
}
