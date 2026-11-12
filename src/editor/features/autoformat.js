const NBSP = new RegExp(String.fromCharCode(0xa0), 'g'); // Chrome types a trailing space as a non-breaking one
/** Text typed at the start of a paragraph, followed by a space → the command (and argument) it runs. */
const MARKERS = {
  '#': ['format.block', 'h1'],
  '##': ['format.block', 'h2'],
  '###': ['format.block', 'h3'],
  '####': ['format.block', 'h4'],
  '#####': ['format.block', 'h5'],
  '>': ['format.block', 'blockquote'],
  '-': ['edit.exec', 'insertUnorderedList'],
  '*': ['edit.exec', 'insertUnorderedList'],
  '1.': ['edit.exec', 'insertOrderedList'],
  '[]': ['format.checklist'],
};

/**
 * Markdown-style shortcuts while typing: "# " for headings, "- " and "1. " for lists, "[] " for
 * checklists, "> " for quotes.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initAutoformat(ctx) {
  const { content, selection, events, commands } = ctx;

  /** The paragraph being typed in, if a marker could apply there. */
  function plainParagraph() {
    const s = selection.current();
    const paragraph = selection.closest('p');
    if (!s?.isCollapsed || !paragraph || selection.closest('li, td, th, blockquote')) return null;
    return paragraph;
  }

  events.on('input', (/** @type {InputEvent} */ e) => {
    if (e?.inputType !== 'insertText' || e.data !== ' ') return;
    const paragraph = plainParagraph();
    if (!paragraph) return;

    const { anchorNode, anchorOffset } = selection.current();
    const typed = content.ownerDocument.createRange();
    typed.setStart(paragraph, 0);
    typed.setEnd(anchorNode, anchorOffset);
    const action = MARKERS[typed.toString().replace(NBSP, ' ').slice(0, -1)];
    if (!action) return;

    typed.deleteContents();
    if (!paragraph.textContent) {
      paragraph.innerHTML = '<br>'; // keep the emptied line editable
      selection.caretInto(paragraph);
    }
    commands.run(action[0], action[1]);
  });
}
