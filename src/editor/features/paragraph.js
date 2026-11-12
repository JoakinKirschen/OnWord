import { $ } from '../../core/dom.js';
import { cssPx, pxToPt } from '../../core/units.js';
import { indentsOf, selectedBlocks, setIndents } from '../blocks.js';

const PX_PER_INCH = 96;
const INDENT_STEP = PX_PER_INCH / 2;
const inches = (/** @type {number} */ px) => String(+(px / PX_PER_INCH).toFixed(3));
const number = (/** @type {HTMLInputElement} */ input) => Math.max(0, Number(input.value) || 0);

/**
 * Paragraph formatting: the Paragraph dialog (alignment, indents, spacing) and indent/outdent.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initParagraph(ctx) {
  const { root, content, selection, commands } = ctx;
  const dialog = $('#paragraphDlg', root);
  const field = (/** @type {string} */ id) => $('#para' + id, root);
  const align = field('Align'),
    left = field('Left'),
    right = field('Right'),
    special = field('Special'),
    by = field('By'),
    line = field('Line'),
    before = field('Before'),
    after = field('After');
  /** @type {HTMLElement[]} */
  let blocks = [];

  /** Fills the dialog from a paragraph. A hanging indent is stored as a negative text-indent. */
  function show(/** @type {HTMLElement} */ block) {
    const indents = indentsOf(block);
    const { textAlign, lineHeight, marginTop, marginBottom } = block.style;
    align.value = textAlign === 'left' ? '' : textAlign;
    special.value = indents.firstLine > 0 ? 'first' : indents.firstLine < 0 ? 'hanging' : 'none';
    by.value = indents.firstLine ? inches(Math.abs(indents.firstLine)) : '';
    left.value = inches(indents.left + Math.min(indents.firstLine, 0));
    right.value = inches(indents.right);
    line.value = [...line.options].some((o) => o.value === lineHeight) ? lineHeight : '';
    before.value = marginTop ? String(Math.round(pxToPt(cssPx(marginTop)))) : '';
    after.value = marginBottom ? String(Math.round(pxToPt(cssPx(marginBottom)))) : '';
  }

  function apply(/** @type {HTMLElement} */ block) {
    const offset = special.value === 'none' ? 0 : number(by) * PX_PER_INCH;
    const hanging = special.value === 'hanging';
    setIndents(block, {
      left: number(left) * PX_PER_INCH + (hanging ? offset : 0),
      right: number(right) * PX_PER_INCH,
      firstLine: hanging ? -offset : offset,
    });
    block.style.textAlign = align.value;
    block.style.lineHeight = line.value;
    block.style.marginTop = before.value === '' ? '' : number(before) + 'pt';
    block.style.marginBottom = after.value === '' ? '' : number(after) + 'pt';
  }

  commands.register({
    'format.paragraph'() {
      selection.restore();
      blocks = selectedBlocks(ctx);
      if (!blocks.length) return;
      show(blocks[0]);
      dialog.returnValue = '';
      dialog.showModal();
    },
    /** Moves paragraphs half an inch in or out; list items change nesting level instead. */
    'format.indent'(direction) {
      selection.restore();
      const out = direction === 'out';
      if (selection.closest('li')) return ctx.exec(out ? 'outdent' : 'indent');
      for (const block of selectedBlocks(ctx)) {
        const indents = indentsOf(block);
        const min = Math.max(0, -indents.firstLine);
        setIndents(block, { ...indents, left: Math.max(min, indents.left + (out ? -INDENT_STEP : INDENT_STEP)) });
      }
      ctx.changed();
    },
  });

  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'ok') {
      blocks.forEach(apply);
      ctx.changed();
    }
    content.focus();
  });
}
