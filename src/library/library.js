import { $ } from '../core/dom.js';
import { menuHtml } from '../ui/popover.js';

const MORE_ICON =
  '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';

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

  function card(d) {
    const a = document.createElement('a');
    a.className = 'card';
    a.href = '#/d/' + d.id;
    a.innerHTML = `<div class="thumb"><div class="thumb-page"></div></div>
      <div class="card-meta"><div class="card-title"></div><div class="card-date"></div></div>
      <button class="icon-btn sm card-more" aria-label="Document options" title="Options">${MORE_ICON}</button>`;
    $('.thumb-page', a).textContent = d.snippet || '';
    $('.card-title', a).textContent = d.title;
    $('.card-date', a).textContent = 'Edited ' + formatDate(d.updated);
    $('.card-more', a).addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      popover.toggle(
        e.currentTarget,
        menuHtml([
          { label: 'Open', act: 'library.open', arg: d.id },
          { label: 'Rename', act: 'library.rename', arg: d.id },
          { label: 'Make a copy', act: 'library.copy', arg: d.id },
          '-',
          { label: 'Delete', act: 'library.delete', arg: d.id, danger: true },
        ]),
      );
    });
    return a;
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    const all = store.index().sort((a, b) => b.updated - a.updated);
    const docs = q ? all.filter((d) => (d.title + ' ' + (d.snippet || '')).toLowerCase().includes(q)) : all;
    grid.replaceChildren(...docs.map(card));
    empty.hidden = docs.length > 0;
    empty.textContent = all.length ? 'No documents match your search.' : 'No documents yet. Create one to get started.';
  }

  commands.register({
    'library.new'() {
      const entry = store.create();
      if (entry) navigate('#/d/' + entry.id);
    },
    'library.open'(id) {
      navigate('#/d/' + id);
    },
    'library.rename'(id) {
      const entry = store.meta(id);
      const title = entry && prompt('Rename document', entry.title);
      if (title?.trim()) {
        store.write(id, null, { title: title.trim().slice(0, 120) });
        render();
      }
    },
    'library.copy'(id) {
      if (store.duplicate(id)) {
        render();
        toast('Copy created.');
      }
    },
    'library.delete'(id) {
      const entry = store.meta(id);
      if (!entry || !confirm(`Delete “${entry.title}”? This can’t be undone.`)) return;
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
    },
    hide() {
      root.hidden = true;
    },
    get visible() {
      return !root.hidden;
    },
  };
}
