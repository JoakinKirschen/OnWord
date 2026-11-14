/** The templates band on the library screen: starting documents from templates and managing the user's own. */

import { hit } from '../core/dom.js';
import { esc } from '../core/html.js';
import { MORE_ICON, menuHtml } from '../ui/popover.js';
import { TEMPLATES } from './templates.js';

const NEW_TITLE = 'Untitled template';
const PLUS_ICON = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';

/** @typedef {import('../core/storage.js').DocMeta} DocMeta */

const tile = (/** @type {string} */ id, /** @type {string} */ name, /** @type {boolean} */ menu) =>
  `<div class="template-item">
    <button class="template" data-act="library.new" data-arg="${esc(id)}" title="New document from this template">
      <span class="template-page"></span><span class="template-name">${esc(name)}</span></button>
    ${menu ? `<button class="icon-btn sm template-more" data-template="${esc(id)}" aria-label="Template options" title="Options">${MORE_ICON}</button>` : ''}
  </div>`;

/**
 * @typedef {object} TemplateBandDeps
 * @property {HTMLElement} root the element the templates are listed in
 * @property {import('../core/storage.js').DocumentStore} store
 * @property {import('../core/commands.js').Commands} commands
 * @property {import('../ui/popover.js').Popover} popover
 * @property {import('../ui/toast.js').Toast} toast
 * @property {(hash: string) => void} navigate
 *
 * @param {TemplateBandDeps} deps
 */
export function createTemplateBand({ root, store, commands, popover, toast, navigate }) {
  /** The user's own templates and those shared with them. @returns {DocMeta[]} */
  const own = () =>
    store
      .index()
      .filter((d) => d.template)
      .sort((a, b) => a.title.localeCompare(b.title));

  /** A miniature of the template's first page, without ids that could clash with the open document's. */
  function preview(/** @type {Element} */ page, /** @type {string} */ html) {
    page.innerHTML = html;
    page.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  }

  function render() {
    const templates = own();
    root.innerHTML = [
      ...TEMPLATES.map((t) => tile(t.id, t.name, t.id !== 'blank')),
      ...templates.map((t) => tile(t.id, t.title, true)),
      `<button class="template template-new" data-act="library.newTemplate"><span class="template-page">${PLUS_ICON}</span><span class="template-name">New template</span></button>`,
    ].join('');
    const pages = [...root.querySelectorAll('.template-item .template-page')];
    TEMPLATES.forEach((t, i) => preview(pages[i], t.html));
    templates.forEach((t, i) => preview(pages[TEMPLATES.length + i], store.read(t.id)));
  }

  /** The options of a template: built-in ones can only be used or copied, the user's own changed. */
  function menu(/** @type {string} */ id) {
    const builtIn = TEMPLATES.some((t) => t.id === id);
    const use = { label: 'New document', act: 'library.new', arg: id };
    if (builtIn) return [use, { label: 'Edit a copy', act: 'library.customise', arg: id }];
    const role = store.meta(id)?.role ?? 'owner';
    const shared = role !== 'owner';
    return [
      use,
      ...(role === 'view' ? [] : [{ label: 'Edit template', act: 'library.open', arg: id }]),
      ...(shared ? [] : [{ label: 'Rename', act: 'library.rename', arg: id }]),
      { label: 'Make a copy', act: 'library.copy', arg: id },
      ...(store.remote && !shared ? [{ label: 'Share…', act: 'library.share', arg: id }] : []),
      '-',
      { label: shared ? 'Remove from my list' : 'Delete template', act: 'library.delete', arg: id, danger: true },
    ];
  }

  root.addEventListener('click', (e) => {
    const more = hit(e, '.template-more');
    if (!more) return;
    e.stopPropagation();
    popover.toggle(more, menuHtml(menu(more.dataset.template)));
  });

  /** Creates a document (or a template) and opens it in the editor. */
  function open(/** @type {import('../core/storage.js').NewDocument | undefined} */ fields) {
    const entry = store.create(fields);
    if (entry) navigate('#/d/' + entry.id);
  }

  commands.register({
    /** Creates a document from the built-in or stored template with the given id (blank without one). */
    async 'library.new'(templateId) {
      const builtIn = TEMPLATES.find((t) => t.id === templateId);
      if (builtIn || !store.meta(templateId)?.template) {
        return open(builtIn && { title: builtIn.title, html: builtIn.html });
      }
      if (!(await store.load(templateId))) return toast('This template could not be opened.');
      const { title, snippet, page, styles } = store.meta(templateId);
      open({ title, html: store.read(templateId), snippet, page, styles });
    },
    'library.newTemplate'() {
      open({ title: NEW_TITLE, template: true });
    },
    /** Makes an editable template of a built-in one. */
    'library.customise'(templateId) {
      const builtIn = TEMPLATES.find((t) => t.id === templateId);
      if (builtIn) open({ title: builtIn.name, html: builtIn.html, template: true });
    },
    /** Keeps a copy of a document as a template; the document itself stays as it is. */
    'library.saveAsTemplate'(id) {
      const source = store.meta(id);
      if (!source || !store.duplicate(id, { title: source.title, template: true })) return;
      render();
      toast(`“${source.title}” is now also a template, on the home screen.`);
    },
  });

  return {
    render,
    /** A server store has the templates' content only once loaded; loads it for the previews. */
    async loadPreviews() {
      if (!store.remote) return;
      await Promise.all(own().map((t) => store.load(t.id)));
      render();
    },
  };
}
