import { $ } from '../core/dom.js';
import { esc } from '../core/html.js';
import { documentCard } from '../ui/documentCard.js';
import { initNewProject } from './newProject.js';

/** How many of the latest documents the Projects page shows. */
const RECENT = 8;
const date = (/** @type {number} */ ms) =>
  new Date(ms).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
const plural = (/** @type {number} */ n, /** @type {string} */ word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** @typedef {import('../core/spec/model.js').Spec} Spec */

/**
 * The Projects page, which is the home screen (the projects and the latest documents), and the Masters page.
 * @typedef {object} SpecListDeps
 * @property {HTMLElement} projectsRoot
 * @property {HTMLElement} mastersRoot
 * @property {HTMLDialogElement} dialog the "new project" dialog
 * @property {import('../core/spec/model.js').SpecStore} specStore
 * @property {import('../core/storage.js').DocumentStore} documents
 * @property {import('../core/spec/directory.js').SpecDirectory} directory
 * @property {import('../core/commands.js').Commands} commands
 * @property {import('../ui/toast.js').Toast} toast
 * @property {(hash: string) => void} navigate
 *
 * @param {SpecListDeps} deps
 */
export function createSpecList(deps) {
  const { projectsRoot, mastersRoot, specStore, documents, directory, commands, toast, navigate } = deps;
  const doc = projectsRoot.ownerDocument;
  const projectList = $('#projectList', projectsRoot),
    masterList = $('#masterList', mastersRoot),
    recent = $('#recentList', projectsRoot),
    recentEmpty = $('#recentEmpty', projectsRoot);
  const filedUnder = (/** @type {string} */ id) => documents.index().filter((d) => !d.template && d.project === id);
  const newest = (/** @type {{ updated: number }} */ a, /** @type {{ updated: number }} */ b) => b.updated - a.updated;
  initNewProject({ dialog: deps.dialog, specStore, specs: directory.specs, commands, navigate });

  function details(/** @type {Spec} */ spec) {
    const master = directory.specs().find((s) => s.id === spec.masterId)?.title;
    return [
      spec.phase && `Phase ${spec.phase}`,
      spec.lot && `Lot ${spec.lot}`,
      master && `from ${master}`,
      !spec.mine && `by ${spec.owner}`,
    ].filter(Boolean);
  }

  const projectCard = (/** @type {Spec} */ spec) =>
    `<div class="project-card"><a href="#/s/${spec.id}"><b>${esc(spec.title)}</b>
      <small>${esc(details(spec).join(' · '))}</small>
      <span class="project-facts">${plural(filedUnder(spec.id).length, 'document')} · changed ${date(spec.updated)}</span></a>
      <button class="btn sm danger-text" data-act="spec.remove" data-arg="${spec.id}">Delete</button></div>`;

  function masterRow(/** @type {Spec} */ spec) {
    const remove = spec.mine
      ? `<button class="btn sm danger-text" data-act="spec.remove" data-arg="${spec.id}">Delete</button>`
      : '<span class="spec-badge">read only</span>';
    return `<div class="spec-row"><a href="#/s/${spec.id}"><b>${esc(spec.title)}</b>
      <small>${esc([...details(spec), `changed ${date(spec.updated)}`].join(' · '))}</small></a>${remove}</div>`;
  }

  function render() {
    const specs = [...directory.specs()].sort(newest);
    projectList.innerHTML =
      specs
        .filter((s) => s.kind === 'project')
        .map(projectCard)
        .join('') ||
      `<p class="spec-empty">No projects yet. A project keeps its articles, bill of quantities, offers, site
        reviews and documents together.</p>`;
    masterList.innerHTML =
      specs
        .filter((s) => s.kind === 'master')
        .map(masterRow)
        .join('') || '<p class="spec-empty">No master specifications yet.</p>';
    const latest = documents
      .index()
      .filter((d) => !d.template)
      .sort(newest)
      .slice(0, RECENT);
    recent.replaceChildren(...latest.map((d) => documentCard(doc, d, directory.title(d.project))));
    recentEmpty.hidden = latest.length > 0;
  }

  async function refresh() {
    render();
    // A server store may have changed elsewhere meanwhile: other devices, documents shared with you.
    const [listed] = await Promise.allSettled([directory.refresh(), documents.refresh()]);
    if (listed.status === 'rejected') toast('The specifications could not be loaded.');
    render();
  }

  commands.register({
    async 'spec.newMaster'() {
      const title = prompt('Name of the master specification')?.trim();
      if (!title) return;
      const spec = await specStore.create({ kind: 'master', title });
      navigate('#/s/' + spec.id);
    },
    /** Deletes a specification. A project's documents stay, in no project. */
    async 'spec.remove'(id) {
      const spec = directory.specs().find((s) => s.id === id);
      const filed = filedUnder(id);
      const kept = filed.length ? ` Its ${plural(filed.length, 'document')} will stay, in no project.` : '';
      if (!spec || !confirm(`Delete “${spec.title}” and all its articles?${kept} This can’t be undone.`)) return;
      await specStore.remove(id);
      for (const d of filed) documents.write(d.id, null, { project: null });
      refresh();
    },
  });

  return {
    /** Shows the Projects page or the Masters page. */
    show(/** @type {'projects' | 'masters'} */ page) {
      projectsRoot.hidden = page !== 'projects';
      mastersRoot.hidden = page !== 'masters';
      doc.title = page === 'masters' ? 'Master specifications – OnWord' : 'OnWord';
      refresh();
    },
    hide() {
      projectsRoot.hidden = true;
      mastersRoot.hidden = true;
      recent.replaceChildren(); // drawn afresh when the page is shown again; meanwhile they would go stale
    },
  };
}
