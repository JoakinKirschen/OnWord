/** Bullet and numbering styles: what a list's items are marked with (•, ○, ■, 1., a., A., i., I.). */

/** CSS list-style-type → whether it numbers the items. */
const TYPES = {
  disc: false,
  circle: false,
  square: false,
  decimal: true,
  'lower-alpha': true,
  'upper-alpha': true,
  'lower-roman': true,
  'upper-roman': true,
};

/** Replaces a list by one of the other kind, keeping its items, attributes and the caret. */
function swap(/** @type {HTMLElement} */ list, /** @type {string} */ tag) {
  const doc = list.ownerDocument;
  // Plain values, not a Range: a range collapses when the nodes it points into are moved.
  const { anchorNode, anchorOffset, focusNode, focusOffset } = doc.getSelection();
  const other = doc.createElement(tag);
  for (const { name, value } of list.attributes) other.setAttribute(name, value);
  other.append(...list.childNodes);
  list.replaceWith(other);
  if (anchorNode && other.contains(anchorNode))
    doc.getSelection().setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
}

/**
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initListStyles(ctx) {
  const { selection, commands, toast } = ctx;

  commands.register({
    /** Gives the caret's list a style, first turning the paragraphs into a list of the right kind. */
    'format.listStyle'(type) {
      if (!(type in TYPES)) return;
      selection.restore();
      const tag = TYPES[type] ? 'OL' : 'UL';
      if (selection.closest('ul.checklist')) return toast('A checklist is marked with boxes, not bullets.');
      const current = selection.closest('ul, ol');
      if (!current) ctx.exec(TYPES[type] ? 'insertOrderedList' : 'insertUnorderedList');
      // Chrome's list commands split and merge items when switching kinds, so the element is swapped.
      else if (current.tagName !== tag) swap(current, tag);
      const list = selection.closest(tag);
      if (!list) return;
      list.style.listStyleType = type;
      ctx.changed();
    },
  });
}
