import { hit } from '../../core/dom.js';

const LIST_CLASS = 'checklist';
const DONE_CLASS = 'checked';

/**
 * Checklists: a bulleted list whose items have a checkbox that toggles when clicked.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initChecklist(ctx) {
  const { content, selection, events, commands } = ctx;

  /**
   * Gives `item` a list of its own and returns that list. Chrome merges a new list into a
   * neighbouring one, which would otherwise turn the neighbour's items into checklist items too.
   */
  function isolate(/** @type {HTMLElement} */ item) {
    const list = item.parentElement;
    if (list.children.length === 1) return list;
    const { anchorNode, anchorOffset } = selection.current();
    const following = [...list.children].slice([...list.children].indexOf(item) + 1);
    const own = /** @type {HTMLElement} */ (list.cloneNode(false));
    list.after(own);
    own.append(item);
    if (following.length) {
      const rest = /** @type {HTMLElement} */ (list.cloneNode(false));
      own.after(rest);
      rest.append(...following);
    }
    if (!list.children.length) list.remove();
    content.ownerDocument.getSelection().collapse(anchorNode, anchorOffset); // moving the item dropped the caret
    return own;
  }

  commands.register({
    /** Turns the current paragraph or list into a checklist, or a checklist back into a plain list. */
    'format.checklist'() {
      selection.restore();
      const existing = selection.closest('ul');
      if (existing?.classList.contains(LIST_CLASS)) {
        existing.classList.remove(LIST_CLASS);
        for (const item of existing.children) item.classList.remove(DONE_CLASS);
      } else {
        if (!existing) ctx.exec('insertUnorderedList');
        const item = selection.closest('li');
        if (item) (existing || isolate(item)).classList.add(LIST_CLASS);
      }
      ctx.changed();
    },
  });

  // The checkbox is drawn in the gutter left of the item, so a click there is a click on the box.
  content.addEventListener('click', (e) => {
    const item = hit(e, `ul.${LIST_CLASS} > li`);
    if (!item || e.clientX >= item.getBoundingClientRect().left) return;
    item.classList.toggle(DONE_CLASS);
    ctx.changed();
  });

  // Pressing Enter in a ticked item makes Chrome copy its class to the new, empty item.
  events.on('input', (/** @type {InputEvent} */ e) => {
    if (e?.inputType !== 'insertParagraph') return;
    const item = selection.closest(`ul.${LIST_CLASS} > li.${DONE_CLASS}`);
    if (item && !item.textContent.trim()) item.classList.remove(DONE_CLASS);
  });
}
