/** Filing a document under one of the user's projects, or under none: the "Move to project" dialog. */

import { $ } from '../core/dom.js';
import { esc } from '../core/html.js';

/**
 * @typedef {object} FilingDeps
 * @property {HTMLDialogElement} dialog
 * @property {import('../core/storage.js').DocumentStore} store
 * @property {import('../core/spec/directory.js').SpecDirectory} directory
 * @property {import('../core/commands.js').Commands} commands
 * @property {import('../ui/toast.js').Toast} toast
 * @property {() => void} refresh shows the documents again after one has moved
 *
 * @param {FilingDeps} deps
 */
export function initFiling({ dialog, store, directory, commands, toast, refresh }) {
  const form = $('form', dialog),
    select = $('#moveProject', dialog);
  /** The document being moved. */
  let docId = '';

  commands.register({
    async 'library.move'(id) {
      const entry = store.meta(id);
      if (!entry) return;
      try {
        await directory.refresh();
      } catch {
        return toast('The projects could not be loaded.');
      }
      const projects = directory.projects();
      if (!projects.length) return toast('There are no projects yet. Start one on the Projects page.');
      docId = id;
      $('#moveTitle', dialog).textContent = `Move “${entry.title}” to a project`;
      select.innerHTML =
        '<option value="">No project</option>' +
        projects.map((p) => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('');
      select.value = directory.title(entry.project) ? entry.project : '';
      dialog.showModal();
    },
  });

  form.addEventListener('submit', (e) => {
    if (e.submitter?.value !== 'ok') return;
    const project = select.value || null;
    if (!store.write(docId, null, { project })) return toast('This document could not be moved.');
    refresh();
    toast(project ? `Moved to ${directory.title(project)}.` : 'The document is no longer in a project.');
  });
}
