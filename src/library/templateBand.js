/** The templates band on the library screen: starting documents from templates and managing the user's own. */

import { hit } from '../core/dom.js';
import { TEMPLATES, fromTemplate, loadTemplates, templateChoices } from '../core/templates.js';
import { menuHtml } from '../ui/popover.js';
import { drawPreviews, tilesHtml } from '../ui/templateTiles.js';

const NEW_TITLE = 'Untitled template';
const PLUS_ICON = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';

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
  function render() {
    const choices = templateChoices(store);
    root.innerHTML =
      tilesHtml(
        choices.map((t) => ({ ...t, menu: t.id !== 'blank' })),
        'library.new',
      ) +
      `<button class="template template-new" data-act="library.newTemplate"><span class="template-page">${PLUS_ICON}</span><span class="template-name">New template</span></button>`;
    drawPreviews(
      root,
      choices.map((t) => t.html),
    );
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
      const fields = await fromTemplate(store, templateId);
      if (fields) open(fields);
      else toast('This template could not be opened.');
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
      toast(`“${source.title}” is now also a template, on the Documents page.`);
    },
  });

  return {
    render,
    /** A server store has the templates' content only once loaded; loads it for the previews. */
    async loadPreviews() {
      if (!store.remote) return;
      await loadTemplates(store);
      render();
    },
  };
}
