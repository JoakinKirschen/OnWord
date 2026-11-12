import { $ } from '../../core/dom.js';

const PX_PER_INCH = 96;
/** id → [label, CSS page-size name, width px, height px] in portrait. */
const SIZES = {
  letter: ['Letter (8.5 × 11 in)', 'letter', 816, 1056],
  a4: ['A4 (210 × 297 mm)', 'A4', 794, 1123],
  legal: ['Legal (8.5 × 14 in)', 'legal', 816, 1344],
};
/** id → [label, margin px]. */
const MARGINS = {
  normal: ['Normal (1 in)', 96],
  moderate: ['Moderate (0.75 in)', 72],
  narrow: ['Narrow (0.5 in)', 48],
  wide: ['Wide (1.5 in)', 144],
};
const DEFAULTS = { size: 'letter', orientation: 'portrait', margin: 'normal' };

const options = (/** @type {Record<string, any[]>} */ map) =>
  Object.entries(map)
    .map(([id, [label]]) => `<option value="${id}">${label}</option>`)
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
  sizeSel.innerHTML = options(SIZES);
  marginSel.innerHTML = options(MARGINS);

  /** Fills in defaults and drops unknown values (metadata may come from an older version). */
  const normalize = (/** @type {Partial<import('../../core/storage.js').PageSetup>} */ page = {}) => ({
    size: page.size in SIZES ? page.size : DEFAULTS.size,
    orientation: page.orientation === 'landscape' ? 'landscape' : DEFAULTS.orientation,
    margin: page.margin in MARGINS ? page.margin : DEFAULTS.margin,
  });
  const current = () => normalize(session.meta()?.page);

  function apply(page) {
    const [, cssName, w, h] = SIZES[page.size];
    const [, margin] = MARGINS[page.margin];
    const landscape = page.orientation === 'landscape';
    paper.style.setProperty('--page-w', (landscape ? h : w) + 'px');
    paper.style.setProperty('--page-h', (landscape ? w : h) + 'px');
    paper.style.setProperty('--page-margin', margin + 'px');
    printStyle.textContent = `@page { size: ${cssName} ${page.orientation}; margin: ${margin / PX_PER_INCH}in; }`;
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
      const page = normalize({ size: sizeSel.value, orientation: orientationSel.value, margin: marginSel.value });
      store.write(session.id, null, { page });
      apply(page);
    }
    content.focus();
  });
  events.on('open', () => apply(current()));
}
