import { $, $$, hit } from '../core/dom.js';
import { esc } from '../core/html.js';
import { outline, subtree } from '../core/spec/model.js';

const INDENT = 18;
const date = (/** @type {number} */ ms) =>
  new Date(ms).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });

/**
 * The list of specifications, and the dialog that starts a project from a master.
 * @typedef {object} SpecListDeps
 * @property {HTMLElement} root
 * @property {HTMLDialogElement} dialog the "new project" dialog
 * @property {import('../core/spec/model.js').SpecStore} specStore
 * @property {import('../core/commands.js').Commands} commands
 * @property {import('../ui/toast.js').Toast} toast
 * @property {(hash: string) => void} navigate
 *
 * @param {SpecListDeps} deps
 */
export function createSpecList({ root, dialog, specStore, commands, toast, navigate }) {
  const lists = { project: $('#projectList', root), master: $('#masterList', root) };
  const form = $('form', dialog),
    masterSelect = $('#projectMaster', dialog),
    picker = $('#projectArticles', dialog);
  /** @type {import('../core/spec/model.js').Spec[]} */
  let specs = [];
  /** The articles of the master chosen in the dialog. @type {import('../core/spec/model.js').Article[]} */
  let offered = [];

  function row(/** @type {import('../core/spec/model.js').Spec} */ spec) {
    const master = specs.find((s) => s.id === spec.masterId)?.title;
    const details = [
      spec.phase && `Phase ${spec.phase}`,
      spec.lot && `Lot ${spec.lot}`,
      master && `from ${master}`,
      !spec.mine && `by ${spec.owner}`,
      `changed ${date(spec.updated)}`,
    ];
    const remove = spec.mine
      ? `<button class="btn sm danger-text" data-act="spec.remove" data-arg="${spec.id}">Delete</button>`
      : '<span class="spec-badge">read only</span>';
    return `<div class="spec-row"><a href="#/s/${spec.id}"><b>${esc(spec.title)}</b>
      <small>${esc(details.filter(Boolean).join(' · '))}</small></a>${remove}</div>`;
  }

  function render() {
    for (const kind of /** @type {const} */ (['project', 'master'])) {
      const html = specs
        .filter((s) => s.kind === kind)
        .map(row)
        .join('');
      lists[kind].innerHTML =
        html || `<p class="spec-empty">No ${kind === 'master' ? 'master specifications' : 'projects'} yet.</p>`;
    }
  }

  async function refresh() {
    try {
      specs = await specStore.list();
    } catch {
      toast('The specifications could not be loaded.');
    }
    render();
  }

  /** Fills the article picker with the articles of the chosen master, all ticked. */
  async function offerArticles() {
    offered = masterSelect.value ? ((await specStore.get(masterSelect.value))?.articles ?? []) : [];
    picker.innerHTML =
      outline(offered)
        .map(
          ({
            article,
            depth,
          }) => `<label style="padding-left: ${depth * INDENT}px"><input type="checkbox" value="${article.id}" checked>
            <span>${esc([article.number, article.title].filter(Boolean).join(' '))}</span></label>`,
        )
        .join('') || '<p class="spec-empty">This master has no articles to choose from.</p>';
  }

  commands.register({
    async 'spec.newMaster'() {
      const title = prompt('Name of the master specification')?.trim();
      if (!title) return;
      const spec = await specStore.create({ kind: 'master', title });
      navigate('#/s/' + spec.id);
    },
    async 'spec.newProject'() {
      const masters = specs.filter((s) => s.kind === 'master');
      masterSelect.innerHTML =
        '<option value="">No master (start empty)</option>' +
        masters.map((m) => `<option value="${m.id}">${esc(m.title)}</option>`).join('');
      masterSelect.value = masters[0]?.id ?? '';
      form.reset();
      masterSelect.value = masters[0]?.id ?? '';
      await offerArticles();
      dialog.showModal();
    },
    async 'spec.remove'(id) {
      const spec = specs.find((s) => s.id === id);
      if (!spec || !confirm(`Delete “${spec.title}” and all its articles? This can’t be undone.`)) return;
      await specStore.remove(id);
      refresh();
    },
  });

  masterSelect.addEventListener('change', offerArticles);
  // Ticking an article ticks everything under it, and the same for unticking.
  picker.addEventListener('change', (e) => {
    const box = hit(e, 'input');
    const below = subtree(offered, box.value);
    for (const other of $$('input', picker)) if (below.has(other.value)) other.checked = box.checked;
  });
  form.addEventListener('submit', async (e) => {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    const fields = Object.fromEntries(new FormData(form));
    const spec = await specStore.create({
      kind: 'project',
      title: String(fields.title).trim(),
      masterId: masterSelect.value || null,
      phase: String(fields.phase).trim(),
      lot: String(fields.lot).trim(),
      articleIds: $$('input:checked', picker).map((box) => box.value),
    });
    dialog.close();
    navigate('#/s/' + spec.id);
  });

  return {
    show() {
      root.hidden = false;
      root.ownerDocument.title = 'Specifications – OnWord';
      refresh();
    },
    hide() {
      root.hidden = true;
    },
  };
}
