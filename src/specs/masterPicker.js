/** The sidebar's two tabs in a project: the master's articles to pick from, and the project's own tree. */

import { $, $$, hit } from '../core/dom.js';
import { newId } from '../core/ids.js';
import { copyArticles, subtree } from '../core/spec/model.js';
import { masterTreeHtml } from './templates.js';

/** @typedef {import('../core/spec/model.js').Article} Article */

/**
 * @typedef {object} MasterPickerDeps
 * @property {HTMLElement} root the specification workspace
 * @property {import('../core/commands.js').Commands} commands
 * @property {import('../ui/toast.js').Toast} toast
 * @property {() => Article[]} master the master's articles ([] when the project has none)
 * @property {() => Article[]} articles the project's articles
 * @property {(copies: Article[]) => void} add puts new articles into the project
 *
 * @param {MasterPickerDeps} deps
 */
export function createMasterPicker({ root, commands, toast, master, articles, add }) {
  const tabs = $('#specTabs', root),
    sides = { master: $('#masterSide', root), project: $('#projectSide', root) },
    tree = $('#masterTree', root),
    search = $('#masterSearch', root),
    button = $('#masterAdd', root);
  /** Master articles ticked to be added. */
  const ticked = new Set();

  /** Master ids the project already has copies of. */
  const present = () =>
    new Set(
      articles()
        .map((a) => a.sourceId)
        .filter(Boolean),
    );

  function draw() {
    tree.innerHTML = masterTreeHtml(master(), { filter: search.value, ticked, present: present() });
    button.disabled = !ticked.size;
    button.textContent = ticked.size ? `Add to project (${ticked.size})` : 'Add to project';
  }

  function show(/** @type {keyof typeof sides} */ side) {
    for (const [name, element] of Object.entries(sides)) element.hidden = name !== side;
    for (const tab of $$('[data-act="spec.side"]', tabs)) {
      const on = tab.dataset.arg === side;
      tab.classList.toggle('on', on);
      tab.setAttribute('aria-selected', String(on));
    }
    if (side === 'master') draw();
  }

  commands.register({
    'spec.side': (side) => show(side === 'master' ? 'master' : 'project'),
    'spec.addFromMaster'() {
      const copies = copyArticles(master(), ticked, newId, articles());
      ticked.clear();
      if (!copies.length) return;
      add(copies);
      show('project');
      toast(
        copies.length === 1 ? 'Added 1 article to the project.' : `Added ${copies.length} articles to the project.`,
      );
    },
  });

  /** The ids of an article's ancestors in the master, nearest first. */
  function ancestors(/** @type {string} */ id) {
    const byId = new Map(master().map((a) => [a.id, a]));
    const out = [];
    for (let at = byId.get(byId.get(id)?.parentId); at; at = byId.get(at.parentId)) out.push(at.id);
    return out;
  }

  // Ticking an article ticks everything under it, and the articles above it so that it keeps its place in
  // the outline; unticking unticks what is under it. What the project already has is left alone.
  tree.addEventListener('change', (e) => {
    const box = hit(e, 'input');
    if (!box) return;
    const has = present();
    const ids = [...subtree(master(), box.value), ...(box.checked ? ancestors(box.value) : [])];
    for (const id of ids.filter((i) => !has.has(i))) {
      if (box.checked) ticked.add(id);
      else ticked.delete(id);
    }
    draw();
  });
  search.addEventListener('input', draw);

  return {
    /** Shows the tabs only where there is a master to pick from, and starts on the project's tree. */
    reset(/** @type {boolean} */ available) {
      ticked.clear();
      search.value = '';
      tabs.hidden = !available;
      show('project');
    },
  };
}
