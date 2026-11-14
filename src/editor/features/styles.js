/** Document styles: the Styles dialog, updating a style to match the selection, and the sheet applying them. */

import { $ } from '../../core/dom.js';
import {
  normalizeStyles,
  resolveStyles,
  setStyle,
  STYLE_IDS,
  STYLES,
  styleOf,
  stylesCss,
} from '../../core/docStyles.js';
import { esc } from '../../core/html.js';
import { cssPx, pxToPt } from '../../core/units.js';

const SCOPE = '#editor';
const BLOCKS = 'h1,h2,h3,h4,h5,p';
const BOLD_WEIGHT = 600;

/** `#rrggbb` for a computed `rgb()` colour. */
function hex(/** @type {string} */ rgb) {
  const [r, g, b] = (rgb.match(/\d+/g) ?? []).map(Number);
  return '#' + [r, g, b].map((n) => (n || 0).toString(16).padStart(2, '0')).join('');
}

/** A paragraph's own spacing in points, or undefined when its style decides. */
const ownPt = (/** @type {string} */ length) => (length ? +pxToPt(cssPx(length)).toFixed(1) : undefined);

/**
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initStyles(ctx) {
  const { root, content, session, store, selection, events, commands, toast } = ctx;
  const dialog = $('#stylesDlg', root);
  const field = (/** @type {string} */ name) => $('#style' + name, root);
  const picker = field('Id'),
    preview = field('Preview');
  /** @type {Record<string, HTMLInputElement>} */
  const fields = {
    font: field('Font'),
    size: field('Size'),
    color: field('Color'),
    align: field('Align'),
    before: field('Before'),
    after: field('After'),
    lineHeight: field('Line'),
    bold: field('Bold'),
    italic: field('Italic'),
    underline: field('Underline'),
  };
  const sheet = root.appendChild(root.ownerDocument.createElement('style'));
  sheet.dataset.print = 'styles';
  picker.innerHTML = STYLE_IDS.map((id) => `<option value="${id}">${esc(STYLES[id][0])}</option>`).join('');
  /** The styles being edited in the dialog, and the one it shows. */
  let draft = {};
  /** @type {import('../../core/docStyles.js').StyleId} */
  let shown = 'normal';

  const current = () => normalizeStyles(session.meta()?.styles);
  const render = () => (sheet.textContent = stylesCss(current(), SCOPE));

  function save(/** @type {import('../../core/docStyles.js').StyleOverrides} */ styles) {
    store.write(session.id, null, { styles });
    render();
    events.emit('layout'); // paragraphs change height: the pages are laid out again
  }

  /** The style of the paragraph holding the caret: a paragraph in a quote counts as the quote. */
  function styleAtCaret() {
    const block = selection.closest(BLOCKS);
    if (!block) return null;
    return block.closest('blockquote') && content.contains(block.closest('blockquote')) ? 'quote' : styleOf(block);
  }

  const read = () =>
    Object.fromEntries(
      Object.entries(fields).map(([key, input]) => [key, input.type === 'checkbox' ? input.checked : input.value]),
    );

  function showPreview() {
    const look = resolveStyles(setStyle(draft, shown, read()))[shown];
    Object.assign(preview.style, {
      fontFamily: look.font,
      fontSize: look.size + 'pt',
      color: look.color,
      fontWeight: look.bold ? '700' : '400',
      fontStyle: look.italic ? 'italic' : 'normal',
      textDecoration: look.underline ? 'underline' : 'none',
      textAlign: look.align,
      lineHeight: String(look.lineHeight),
    });
  }

  function show(/** @type {import('../../core/docStyles.js').StyleId} */ id) {
    shown = id;
    picker.value = id;
    const look = resolveStyles(draft)[id];
    for (const [key, input] of Object.entries(fields)) {
      if (input.type === 'checkbox') input.checked = look[key];
      else input.value = String(look[key]);
    }
    showPreview();
  }

  commands.register({
    /** Opens the Styles dialog on the style of the caret's paragraph, or on `id`. */
    'format.styles'(id) {
      selection.restore();
      draft = current();
      show(STYLE_IDS.includes(id) ? id : (styleAtCaret() ?? 'normal'));
      dialog.returnValue = '';
      dialog.showModal();
    },
    'format.styleReset'() {
      draft = normalizeStyles({ ...draft, [shown]: undefined });
      show(shown);
    },
    /** Word's "Update style to match selection": the caret's formatting becomes its style's. */
    'format.updateStyle'() {
      selection.restore();
      const id = styleAtCaret();
      const text = selection.anchorElement();
      if (!id || !text) return toast('Put the cursor in a paragraph or heading first.');
      const block = selection.closest(BLOCKS);
      const look = getComputedStyle(text);
      save(
        setStyle(current(), id, {
          ...resolveStyles(current())[id],
          font: look.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
          size: +pxToPt(parseFloat(look.fontSize)).toFixed(1),
          color: hex(look.color),
          bold: Number(look.fontWeight) >= BOLD_WEIGHT,
          italic: look.fontStyle === 'italic',
          underline: !!text.closest('u') || look.textDecorationLine.includes('underline'),
          // Paragraph formatting only where the paragraph has its own: the paged view adds space above some.
          ...(block.style.textAlign && { align: block.style.textAlign }),
          ...(block.style.lineHeight && { lineHeight: block.style.lineHeight }),
          ...(block.style.marginTop && { before: ownPt(block.style.marginTop) }),
          ...(block.style.marginBottom && { after: ownPt(block.style.marginBottom) }),
        }),
      );
      toast(`“${STYLES[id][0]}” now looks like the selected text.`);
    },
  });

  picker.addEventListener('change', () => {
    draft = setStyle(draft, shown, read());
    show(picker.value);
  });
  dialog.addEventListener('input', showPreview);
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'ok') save(setStyle(draft, shown, read()));
    content.focus();
  });
  events.on('open', render);
}
