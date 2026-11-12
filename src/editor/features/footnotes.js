import { $, $$ } from '../../core/dom.js';

const REF = 'sup.fn-ref';
const LIST = 'ol.footnotes';
const newId = () => Math.random().toString(36).slice(2, 8);

/**
 * Footnotes: a numbered reference in the text and the note itself in a list at the end of the document.
 * A reference and its note are tied together by id (`fnref-x` / `fn-x`).
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initFootnotes(ctx) {
  const { content, selection, events, commands } = ctx;
  const doc = content.ownerDocument;
  const noteFor = (/** @type {Element} */ ref) =>
    content.querySelector(`#${CSS.escape(ref.id.replace('fnref-', 'fn-'))}`);

  /** Numbers the references and marks them as generated, which also makes one delete as a unit. */
  function number(/** @type {HTMLElement[]} */ refs) {
    refs.forEach((ref, i) => {
      if (ref.textContent !== String(i + 1)) ref.textContent = String(i + 1);
      ref.contentEditable = 'false';
    });
  }

  /** Renumbers references, puts notes in reference order and drops whichever half has lost its partner. */
  function sync() {
    const list = $(LIST, content);
    const pairs = $$(REF, content).map((ref) => ({ ref, note: list && noteFor(ref) }));
    if (!list && !pairs.length) return;
    for (const { ref, note } of pairs) if (!note) ref.remove();
    const kept = pairs.filter(({ note }) => note);
    number(kept.map(({ ref }) => ref));
    if (!list) return;
    const notes = kept.map(({ note }) => note);
    if (!notes.length) return list.remove();
    const inOrder = list.children.length === notes.length && notes.every((note, i) => list.children[i] === note);
    if (!inOrder) list.replaceChildren(...notes);
    if (list !== content.lastElementChild) content.append(list);
  }

  commands.register({
    'insert.footnote'() {
      selection.restore();
      const s = selection.current();
      if (!s || selection.closest(LIST)) return;
      const id = newId();
      const ref = doc.createElement('sup');
      ref.className = 'fn-ref';
      ref.id = 'fnref-' + id;
      const range = s.getRangeAt(0);
      range.collapse(false);
      range.insertNode(ref);

      const list = $(LIST, content) || content.appendChild(doc.createElement('ol'));
      list.className = 'footnotes';
      const note = doc.createElement('li');
      note.id = 'fn-' + id;
      note.innerHTML = '<br>';
      list.append(note);
      ctx.changed(); // sync() moves the note to its place in reference order
      selection.caretInto(note);
    },
  });

  events.on('change', sync);
  events.on('open', sync);
}
