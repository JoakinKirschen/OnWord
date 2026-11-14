import { $ } from '../core/dom.js';
import { esc } from '../core/html.js';
import { documentCard } from '../ui/documentCard.js';
import { MORE_ICON, menuHtml } from '../ui/popover.js';
import { createTemplateBand } from './templateBand.js';

/** The filter's choices besides the projects themselves. */
const ALL = '';
const LOOSE = 'none';

/**
 * The Documents page: every document, with the templates to start new ones from.
 * @typedef {object} LibraryDeps
 * @property {HTMLElement} root
 * @property {import('../core/storage.js').DocumentStore} store
 * @property {import('../core/spec/directory.js').SpecDirectory} directory names the projects documents are filed under
 * @property {import('../core/commands.js').Commands} commands
 * @property {import('../ui/popover.js').Popover} popover
 * @property {import('../ui/toast.js').Toast} toast
 * @property {(hash: string) => void} navigate
 *
 * @param {LibraryDeps} deps
 */
export function createLibrary({ root, store, directory, commands, popover, toast, navigate }) {
  const grid = $('#grid', root),
    empty = $('#empty', root),
    search = $('#search', root),
    filter = $('#docFilter', root);
  const templates = createTemplateBand({ root: $('#templates', root), store, commands, popover, toast, navigate });

  function card(/** @type {import('../core/storage.js').DocMeta} */ d) {
    const a = documentCard(root.ownerDocument, d, directory.title(d.project));
    const shared = d.role && d.role !== 'owner';
    a.insertAdjacentHTML(
      'beforeend',
      `<button class="icon-btn sm card-more" aria-label="Document options" title="Options">${MORE_ICON}</button>`,
    );
    $('.card-more', a).addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      popover.toggle(
        e.currentTarget,
        menuHtml([
          { label: 'Open', act: 'library.open', arg: d.id },
          { label: 'Rename', act: 'library.rename', arg: d.id },
          { label: 'Make a copy', act: 'library.copy', arg: d.id },
          ...(shared ? [] : [{ label: 'Move to project…', act: 'library.move', arg: d.id }]),
          { label: 'Save as template', act: 'library.saveAsTemplate', arg: d.id },
          ...(store.remote && !shared ? [{ label: 'Share…', act: 'library.share', arg: d.id }] : []),
          '-',
          { label: shared ? 'Remove from my list' : 'Delete', act: 'library.delete', arg: d.id, danger: true },
        ]),
      );
    });
    return a;
  }

  /** The filter's choices: everything, what is in no project, and each project. */
  function drawFilter() {
    const projects = directory.projects();
    const chosen = filter.value;
    filter.innerHTML =
      `<option value="${ALL}">All documents</option><option value="${LOOSE}">Not in a project</option>` +
      projects.map((p) => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('');
    filter.value = chosen === LOOSE || projects.some((p) => p.id === chosen) ? chosen : ALL;
  }

  /** Whether a document passes the filter. A project nobody can name counts as none. */
  function shown(/** @type {import('../core/storage.js').DocMeta} */ d) {
    const project = directory.title(d.project) ? d.project : null;
    if (filter.value === ALL) return true;
    return filter.value === LOOSE ? !project : project === filter.value;
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    templates.render();
    drawFilter();
    const all = store
      .index()
      .filter((d) => !d.template)
      .sort((a, b) => b.updated - a.updated);
    const docs = all.filter((d) => shown(d) && (!q || (d.title + ' ' + (d.snippet || '')).toLowerCase().includes(q)));
    grid.replaceChildren(...docs.map(card));
    empty.hidden = docs.length > 0;
    empty.textContent = all.length ? 'No documents match.' : 'No documents yet. Start one from a template above.';
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
  filter.addEventListener('change', render);

  return {
    render,
    show() {
      root.hidden = false;
      root.ownerDocument.title = 'Documents – OnWord';
      render();
      // A server store may have changed since it was last read: other devices, documents shared with you.
      Promise.all([store.refresh(), directory.refresh().catch(() => [])]).then(
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
