/**
 * The sidebar's two tabs in a project: the master's articles, ticked where the project has them, to add
 * and remove articles; and the project's own tree.
 */

import { $, $$, hit } from '../core/dom.js';
import { subtree } from '../core/spec/model.js';
import { masterTreeHtml } from './templates.js';

/** @typedef {import('../core/spec/model.js').Article} Article */

/**
 * @typedef {object} MasterPickerDeps
 * @property {HTMLElement} root the specification workspace
 * @property {import('../core/commands.js').Commands} commands
 * @property {import('../ui/toast.js').Toast} toast
 * @property {() => Article[]} master the master's articles ([] when the project has none)
 * @property {() => Article[]} articles the project's articles in use
 * @property {(changes: { add: string[], remove: string[] }) => Promise<boolean>} apply adds master articles
 *   (by master id) and removes project articles (by project id); false when the user cancelled
 *
 * @param {MasterPickerDeps} deps
 */
export function createMasterPicker({ root, commands, toast, master, articles, apply }) {
  const tabs = $('#specTabs', root),
    sides = { master: $('#masterSide', root), project: $('#projectSide', root) },
    tree = $('#masterTree', root),
    search = $('#masterSearch', root),
    button = $('#masterApply', root);
  /** Master ids ticked: what the project should contain once the choice is applied. */
  let wanted = new Set();

  /** Master ids the project has copies of. */
  const present = () => new Set(articles().flatMap((a) => (a.sourceId ? [a.sourceId] : [])));
  const pending = () => {
    const has = present();
    return { add: [...wanted].filter((id) => !has.has(id)), remove: [...has].filter((id) => !wanted.has(id)) };
  };

  function draw() {
    tree.innerHTML = masterTreeHtml(master(), { filter: search.value, wanted, present: present() });
    const { add, remove } = pending();
    const words = [add.length && `add ${add.length}`, remove.length && `remove ${remove.length}`].filter(Boolean);
    button.disabled = !words.length;
    button.textContent = words.length ? `Apply: ${words.join(', ')}` : 'No changes';
  }

  function show(/** @type {keyof typeof sides} */ side) {
    for (const [name, element] of Object.entries(sides)) element.hidden = name !== side;
    for (const tab of $$('[data-act="spec.side"]', tabs)) {
      const on = tab.dataset.arg === side;
      tab.classList.toggle('on', on);
      tab.setAttribute('aria-selected', String(on));
    }
    if (side === 'master') {
      wanted = present();
      draw();
    }
  }

  /** The ids of an article's ancestors in the master. */
  function ancestors(/** @type {string} */ id) {
    const byId = new Map(master().map((a) => [a.id, a]));
    const out = [];
    for (let at = byId.get(byId.get(id)?.parentId); at; at = byId.get(at.parentId)) out.push(at.id);
    return out;
  }

  commands.register({
    'spec.side': (side) => show(side === 'master' ? 'master' : 'project'),
    async 'spec.applyMaster'() {
      const { add, remove } = pending();
      const ids = articles()
        .filter((a) => remove.includes(a.sourceId))
        .map((a) => a.id);
      if (!(await apply({ add, remove: ids }))) return;
      const done = [add.length && `${add.length} added`, ids.length && `${ids.length} removed`];
      toast(`Project updated: ${done.filter(Boolean).join(', ')}.`);
      show(add.length ? 'project' : 'master');
    },
  });

  // Ticking an article ticks everything under it and the articles above it, so that it keeps its place
  // in the outline; unticking unticks everything under it.
  tree.addEventListener('change', (e) => {
    const box = hit(e, 'input');
    if (!box) return;
    const ids = [...subtree(master(), box.value), ...(box.checked ? ancestors(box.value) : [])];
    for (const id of ids) {
      if (box.checked) wanted.add(id);
      else wanted.delete(id);
    }
    draw();
  });
  search.addEventListener('input', draw);

  return {
    /** Shows the tabs only where there is a master to pick from, and starts on the project's tree. */
    reset(/** @type {boolean} */ available) {
      search.value = '';
      tabs.hidden = !available;
      show('project');
    },
  };
}
