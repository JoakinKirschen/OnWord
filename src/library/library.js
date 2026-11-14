import { $ } from '../core/dom.js';
import { MORE_ICON, menuHtml } from '../ui/popover.js';
import { createTemplateBand } from './templateBand.js';

const formatDate = (ts) => {
  const d = new Date(ts);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
};

/**
 * The document list (home screen).
 * @typedef {object} LibraryDeps
 * @property {HTMLElement} root
 * @property {import('../core/storage.js').DocumentStore} store
 * @property {import('../core/commands.js').Commands} commands
 * @property {import('../ui/popover.js').Popover} popover
 * @property {import('../ui/toast.js').Toast} toast
 * @property {(hash: string) => void} navigate
 *
 * @param {LibraryDeps} deps
 */
export function createLibrary({ root, store, commands, popover, toast, navigate }) {
  const grid = $('#grid', root),
    empty = $('#empty', root),
    search = $('#search', root);
  const templates = createTemplateBand({ root: $('#templates', root), store, commands, popover, toast, navigate });

  function card(d) {
    const a = document.createElement('a');
    a.className = 'card';
    a.href = '#/d/' + d.id;
    a.innerHTML = `<div class="thumb"><div class="thumb-page"></div></div>
      <div class="card-meta"><div class="card-title"></div><div class="card-date"></div></div>
      <button class="icon-btn sm card-more" aria-label="Document options" title="Options">${MORE_ICON}</button>`;
    $('.thumb-page', a).textContent = d.snippet || '';
    $('.card-title', a).textContent = d.title;
    const shared = d.role && d.role !== 'owner';
    const dateEl = $('.card-date', a);
    dateEl.textContent = shared
      ? `Shared by ${d.owner}${d.role === 'view' ? ' · view only' : ''}`
      : 'Edited ' + formatDate(d.updated);
    dateEl.classList.toggle('card-shared', !!shared);
    $('.card-more', a).addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      popover.toggle(
        e.currentTarget,
        menuHtml([
          { label: 'Open', act: 'library.open', arg: d.id },
          { label: 'Rename', act: 'library.rename', arg: d.id },
          { label: 'Make a copy', act: 'library.copy', arg: d.id },
          { label: 'Save as template', act: 'library.saveAsTemplate', arg: d.id },
          ...(store.remote && !shared ? [{ label: 'Share…', act: 'library.share', arg: d.id }] : []),
          '-',
          { label: shared ? 'Remove from my list' : 'Delete', act: 'library.delete', arg: d.id, danger: true },
        ]),
      );
    });
    return a;
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    templates.render();
    const all = store
      .index()
      .filter((d) => !d.template)
      .sort((a, b) => b.updated - a.updated);
    const docs = q ? all.filter((d) => (d.title + ' ' + (d.snippet || '')).toLowerCase().includes(q)) : all;
    grid.replaceChildren(...docs.map(card));
    empty.hidden = docs.length > 0;
    empty.textContent = all.length ? 'No documents match your search.' : 'No documents yet. Create one to get started.';
  }

  commands.register({
    'library.open'(id) {
      navigate('#/d/' + id);
    },
    'library.rename'(id) {
      const entry = store.meta(id);
      const title = entry && prompt(entry.template ? 'Rename template' : 'Rename document', entry.title);
      if (!title?.trim()) return;
      if (!store.write(id, null, { title: title.trim().slice(0, 120) })) toast('You cannot rename this document.');
      render();
    },
    'library.copy'(id) {
      if (store.duplicate(id)) {
        render();
        toast('Copy created.');
      }
    },
    'library.delete'(id) {
      const entry = store.meta(id);
      const own = !entry?.role || entry.role === 'owner';
      const question = own
        ? `Delete “${entry?.title}”? This can’t be undone.`
        : `Remove “${entry?.title}” from your list?`;
      if (!entry || !confirm(question)) return;
      store.remove(id);
      render();
    },
  });

  search.addEventListener('input', render);

  return {
    render,
    show() {
      root.hidden = false;
      root.ownerDocument.title = 'OnWord';
      render();
      // A server store may have changed since it was last read: other devices, documents shared with you.
      store.refresh().then(
        () => {
          render();
          return templates.loadPreviews();
        },
        () => toast('The list of documents could not be updated.'),
      );
    },
    hide() {
      root.hidden = true;
    },
    get visible() {
      return !root.hidden;
    },
  };
}
