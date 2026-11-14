/** The dialog that starts a project, from a master specification and the articles chosen from it. */

import { $, $$, hit } from '../core/dom.js';
import { esc } from '../core/html.js';
import { outline, subtree } from '../core/spec/model.js';

const INDENT = 18;

/**
 * @typedef {object} NewProjectDeps
 * @property {HTMLDialogElement} dialog
 * @property {import('../core/spec/model.js').SpecStore} specStore
 * @property {() => import('../core/spec/model.js').Spec[]} specs the specifications listed, to choose a master from
 * @property {import('../core/commands.js').Commands} commands
 * @property {(hash: string) => void} navigate
 *
 * @param {NewProjectDeps} deps
 */
export function initNewProject({ dialog, specStore, specs, commands, navigate }) {
  const form = $('form', dialog),
    masterSelect = $('#projectMaster', dialog),
    picker = $('#projectArticles', dialog);
  /** The articles of the master chosen in the dialog. @type {import('../core/spec/model.js').Article[]} */
  let offered = [];

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
    async 'spec.newProject'() {
      const masters = specs().filter((s) => s.kind === 'master');
      masterSelect.innerHTML =
        '<option value="">No master (start empty)</option>' +
        masters.map((m) => `<option value="${m.id}">${esc(m.title)}</option>`).join('');
      form.reset();
      masterSelect.value = masters[0]?.id ?? '';
      await offerArticles();
      dialog.showModal();
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
}
