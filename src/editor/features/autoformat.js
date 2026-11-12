const NBSP = /\u00a0/g;
/** Text typed at the start of a paragraph, followed by a space → what it turns into. */
const BLOCK_MARKERS = { '#': 'h1', '##': 'h2', '###': 'h3', '####': 'h4', '>': 'blockquote' };
const LIST_MARKERS = { '-': 'insertUnorderedList', '*': 'insertUnorderedList', '1.': 'insertOrderedList' };

/**
 * Markdown-style shortcuts while typing: "# " for headings, "- " and "1. " for lists, "> " for quotes.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initAutoformat(ctx) {
  const { content, selection, events, commands } = ctx;

  events.on('input', (/** @type {InputEvent} */ e) => {
    if (e?.inputType !== 'insertText' || e.data !== ' ') return;
    const s = selection.current();
    const paragraph = selection.closest('p');
    if (!s?.isCollapsed || !paragraph || selection.closest('li, td, th, blockquote')) return;

    const typed = content.ownerDocument.createRange();
    typed.setStart(paragraph, 0);
    typed.setEnd(s.anchorNode, s.anchorOffset);
    const marker = typed.toString().replace(NBSP, ' ').slice(0, -1);
    if (!(marker in BLOCK_MARKERS) && !(marker in LIST_MARKERS)) return;

    typed.deleteContents();
    if (!paragraph.textContent && !paragraph.querySelector('br')) paragraph.innerHTML = '<br>'; // keep the line editable
    if (!paragraph.textContent) selection.caretInto(paragraph);
    if (marker in BLOCK_MARKERS) commands.run('format.block', BLOCK_MARKERS[marker]);
    else ctx.exec(LIST_MARKERS[marker]);
  });
}
