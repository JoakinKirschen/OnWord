/** A project's documents: those filed under it, starting new ones from a template, and taking one out. */

import { esc } from '../core/html.js';
import { fromTemplate, loadTemplates, templateChoices } from '../core/templates.js';
import { drawPreviews, tilesHtml } from '../ui/templateTiles.js';

const date = (/** @type {number} */ ms) =>
  new Date(ms).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });

/**
 * @typedef {object} ProjectDocumentsDeps
 * @property {import('../core/storage.js').DocumentStore} documents
 * @property {import('../core/commands.js').Commands} commands
 * @property {import('../ui/toast.js').Toast} toast
 * @property {(hash: string) => void} navigate
 * @property {{ spec: () => import('../core/spec/model.js').Spec | null }} target the open specification
 * @property {() => void} redraw shows the list again after a change
 *
 * @param {ProjectDocumentsDeps} deps
 */
export function createProjectDocuments({ documents, commands, toast, navigate, target, redraw }) {
  /** The documents filed under the open project, latest first. */
  const filed = () =>
    documents
      .index()
      .filter((d) => !d.template && d.project && d.project === target.spec()?.id)
      .sort((a, b) => b.updated - a.updated);

  const row = (/** @type {import('../core/storage.js').DocMeta} */ d) =>
    `<li class="doc-row"><a href="#/d/${esc(d.id)}"><b>${esc(d.title)}</b><small>Edited ${date(d.updated)}</small></a>
      <button class="btn sm" data-act="spec.unfileDocument" data-arg="${esc(d.id)}"
        title="The document stays on the Documents page">Take out of project</button></li>`;

  commands.register({
    /** Starts a document in the open project from the template with this id, and opens it. */
    async 'spec.newDocument'(templateId) {
      const fields = await fromTemplate(documents, templateId);
      if (!fields) return toast('This template could not be opened.');
      const entry = documents.create({ ...fields, project: target.spec().id });
      if (entry) navigate('#/d/' + entry.id);
    },
    'spec.unfileDocument'(id) {
      const entry = documents.meta(id);
      if (!entry || !documents.write(id, null, { project: null })) return;
      toast(`“${entry.title}” is no longer in this project. It is still on the Documents page.`);
      redraw();
    },
  });

  return {
    /** Makes the content of the user's own templates available for their tiles; only a project shows them. */
    load: async () => {
      if (target.spec()?.kind === 'project') await loadTemplates(documents).catch(() => {});
    },
    viewHtml() {
      const list = filed().map(row);
      return `<div class="quantities-head"><h2>Documents</h2></div>
        <p class="spec-note">Letters, minutes, reports and the other documents of this project. “Create document”
        and site review reports are filed here too.</p>
        <section class="project-new" aria-label="New document in this project"><h3>New document</h3>
        <div class="templates">${tilesHtml(templateChoices(documents), 'spec.newDocument')}</div></section>
        ${list.length ? `<ul class="doc-list">${list.join('')}</ul>` : '<p class="spec-empty">No documents in this project yet.</p>'}`;
    },
    /** Fills in the templates' miniatures once the view is drawn. */
    drawn(/** @type {HTMLElement} */ panel) {
      drawPreviews(
        panel,
        templateChoices(documents).map((t) => t.html),
      );
    },
  };
}
