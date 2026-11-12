import { $ } from '../../core/dom.js';

const canHighlight = typeof Highlight !== 'undefined' && !!CSS.highlights;

/**
 * Find-and-replace panel. Matches are painted with the CSS Custom Highlight API (no DOM changes).
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initFind(ctx) {
  const { root, content, scroller, selection, events, commands, toast } = ctx;
  const doc = content.ownerDocument;
  const panel = $('#findPanel', root),
    findInput = $('#findInput', root),
    replaceInput = $('#replaceInput', root);
  const countEl = $('#findCount', root),
    caseBox = $('#findCase', root);
  let ranges = [];
  let index = -1;

  function paint(scroll = true) {
    const current = ranges[index];
    countEl.textContent = `${index + 1} of ${ranges.length}`;
    if (canHighlight) {
      CSS.highlights.set('ow-find', new Highlight(...ranges));
      if (current) CSS.highlights.set('ow-find-cur', new Highlight(current));
      else CSS.highlights.delete('ow-find-cur');
    }
    if (current && scroll) {
      const r = current.getBoundingClientRect(),
        box = scroller.getBoundingClientRect();
      if (r.top < box.top + 20 || r.bottom > box.bottom - 20) scroller.scrollTop += r.top - box.top - box.height / 3;
    }
  }

  /** Recomputes matches. `keep` preserves the current match position (used after edits). */
  function search(keep = false) {
    const query = findInput.value;
    ranges = [];
    if (query) {
      const exact = caseBox.checked,
        needle = exact ? query : query.toLowerCase();
      const walker = doc.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      for (let node; (node = walker.nextNode());) {
        const hay = exact ? node.data : node.data.toLowerCase();
        for (let p = hay.indexOf(needle); p !== -1; p = hay.indexOf(needle, p + needle.length)) {
          const r = doc.createRange();
          r.setStart(node, p);
          r.setEnd(node, p + query.length);
          ranges.push(r);
        }
      }
    }
    index = ranges.length ? Math.min(keep ? Math.max(index, 0) : 0, ranges.length - 1) : -1;
    paint(!keep);
  }

  function step(delta) {
    if (!ranges.length) return;
    index = (index + delta + ranges.length) % ranges.length;
    paint();
  }

  function replaceRange(range) {
    range.deleteContents();
    if (replaceInput.value) range.insertNode(doc.createTextNode(replaceInput.value));
  }
  function replaceOne() {
    if (!ranges[index]) return;
    replaceRange(ranges[index]);
    content.normalize();
    ctx.changed(); // re-runs the search via the 'change' event
  }
  function replaceAll() {
    const count = ranges.length;
    if (!count) return;
    for (let i = count - 1; i >= 0; i--) replaceRange(ranges[i]);
    content.normalize();
    ctx.changed();
    toast(`Replaced ${count} occurrence${count === 1 ? '' : 's'}.`);
  }

  function open() {
    panel.hidden = false;
    const s = selection.current();
    const picked = s && !s.isCollapsed ? s.toString() : '';
    if (picked && !picked.includes('\n')) findInput.value = picked;
    findInput.focus();
    findInput.select();
    search();
  }
  function close() {
    panel.hidden = true;
    ranges = [];
    index = -1;
    if (canHighlight) {
      CSS.highlights.delete('ow-find');
      CSS.highlights.delete('ow-find-cur');
    }
  }

  commands.register({
    'find.open': open,
    'find.close'() {
      close();
      content.focus();
    },
    'find.next': () => step(1),
    'find.prev': () => step(-1),
    'find.replace': replaceOne,
    'find.replaceAll': replaceAll,
  });

  findInput.addEventListener('input', () => search());
  caseBox.addEventListener('change', () => search());
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') commands.run('find.close');
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.target === replaceInput) replaceOne();
      else step(e.shiftKey ? -1 : 1);
    }
  });
  events.on('open', close);
  events.on('change', () => {
    if (!panel.hidden) search(true);
  });
}
