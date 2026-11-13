import { $, $$, hit } from '../core/dom.js';
import { download } from '../core/download.js';
import { sanitize } from '../core/html.js';
import { newId } from '../core/ids.js';
import { evaluate } from '../core/spec/formula.js';
import { blankArticle, subtree, suggestNumber } from '../core/spec/model.js';
import { quantitiesCsv, specToHtml } from '../core/spec/output.js';
import { articleHtml, linesHtml, number, quantitiesHtml, sourceHtml, totalsText, treeHtml } from './templates.js';

const SAVE_DELAY_MS = 500;
const NOTHING = '<p class="spec-empty">Choose an article in the list, or add one.</p>';

/**
 * The workspace for one specification: article tree, article form and bill of quantities.
 * @typedef {object} WorkspaceDeps
 * @property {HTMLElement} root
 * @property {import('../core/spec/model.js').SpecStore} specStore
 * @property {import('../core/storage.js').DocumentStore} documents where "Create document" puts its result
 * @property {import('../core/commands.js').Commands} commands
 * @property {import('../ui/toast.js').Toast} toast
 * @property {(hash: string) => void} navigate
 *
 * @param {WorkspaceDeps} deps
 */
export function createWorkspace({ root, specStore, documents, commands, toast, navigate }) {
  const doc = root.ownerDocument;
  const tree = $('#articleTree', root),
    panel = $('#articlePanel', root),
    quantities = $('#quantitiesPanel', root),
    search = $('#articleSearch', root),
    state = $('#specState', root);
  const inputs = { title: $('#specTitle', root), phase: $('#specPhase', root), lot: $('#specLot', root) };
  /** @type {import('../core/spec/model.js').Spec | null} */
  let spec = null;
  /** @type {import('../core/spec/model.js').Article[]} */
  let articles = [];
  /** Master articles by id, to tell whether a project article still matches. @type {Map<string, import('../core/spec/model.js').Article>} */
  let sources = new Map();
  let selectedId = null;
  /** What still has to reach the store: article ids, and whether the specification's own fields changed. */
  const unsaved = { articles: new Set(), spec: false };
  let timer = null;

  const selected = () => articles.find((a) => a.id === selectedId);
  const editable = () => !!spec?.mine;

  function drawTree() {
    tree.innerHTML = treeHtml(articles, { selectedId, filter: search.value, sources });
  }
  function drawArticle() {
    const article = selected();
    panel.innerHTML = article
      ? articleHtml(article, { editable: editable(), source: sources.get(article.sourceId) })
      : NOTHING;
  }
  /** Refreshes what is computed from the article without touching the fields being typed in. */
  function drawDerived(/** @type {import('../core/spec/model.js').Article} */ article) {
    const totals = totalsText(article);
    $('#articleQuantity', panel).textContent = totals.quantity;
    $('#articleAmount', panel).textContent = totals.amount;
    $('#articleSource', panel).innerHTML = sourceHtml(article, sources.get(article.sourceId), editable());
    article.lines.forEach((line, i) => ($(`[data-result="${i}"]`, panel).textContent = number(evaluate(line.formula))));
  }
  function show(/** @type {'articles' | 'quantities'} */ view) {
    quantities.hidden = view !== 'quantities';
    panel.hidden = !quantities.hidden;
    if (!quantities.hidden) quantities.innerHTML = quantitiesHtml(articles);
    for (const tab of $$('[data-act="spec.view"]', root)) tab.classList.toggle('on', tab.dataset.arg === view);
  }

  /** Writes everything unsaved to the store, one request at a time. */
  async function save() {
    clearTimeout(timer);
    if (!spec) return;
    if (!unsaved.articles.size && !unsaved.spec) {
      // What was waiting may have been deleted meanwhile; an indicator that said "Saving…" must not stay so.
      if (state.textContent) state.textContent = 'Saved';
      return;
    }
    const ids = [...unsaved.articles];
    const fields = unsaved.spec && { title: spec.title, phase: spec.phase, lot: spec.lot };
    unsaved.articles.clear();
    unsaved.spec = false;
    try {
      if (fields) await specStore.update(spec.id, fields);
      for (const id of ids) {
        const article = articles.find((a) => a.id === id);
        if (article) await specStore.saveArticle(spec.id, article);
      }
      if (!unsaved.articles.size && !unsaved.spec) state.textContent = 'Saved';
    } catch (err) {
      ids.forEach((id) => unsaved.articles.add(id));
      unsaved.spec ||= !!fields;
      state.textContent = 'Not saved';
      toast(/** @type {Error} */ (err).message || 'The changes could not be saved.');
    }
  }
  function changed(/** @type {string} */ articleId = '') {
    if (articleId) unsaved.articles.add(articleId);
    else unsaved.spec = true;
    state.textContent = 'Saving…';
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY_MS);
  }

  function select(/** @type {string | null} */ id) {
    selectedId = id;
    show('articles');
    drawTree();
    drawArticle();
  }

  commands.register({
    'spec.select': select,
    'spec.view': (view) => show(view === 'quantities' ? 'quantities' : 'articles'),
    /** Adds an article at the top level, or with `where` "child" under the selected one. */
    'spec.addArticle'(where) {
      if (!editable()) return toast('Only the owner can change this specification.');
      const parentId = where === 'child' ? selectedId : (selected()?.parentId ?? null);
      const article = { id: newId(), ...blankArticle({ parentId, number: suggestNumber(articles, parentId) }) };
      articles.push(article);
      changed(article.id);
      select(article.id);
      $('[data-field="title"]', panel).focus();
    },
    async 'spec.deleteArticle'() {
      const article = selected();
      const count = article ? subtree(articles, article.id).size : 0;
      const what = count > 1 ? `this article and the ${count - 1} below it` : 'this article';
      if (!article || !confirm(`Delete ${what}?`)) return;
      const gone = subtree(articles, article.id);
      articles = articles.filter((a) => !gone.has(a.id));
      gone.forEach((id) => unsaved.articles.delete(id));
      select(null);
      state.textContent = 'Saving…';
      try {
        await specStore.removeArticle(spec.id, article.id);
        await save();
      } catch {
        state.textContent = 'Not saved';
        toast('The article could not be deleted.');
      }
    },
    'spec.addLine'() {
      const article = selected();
      article.lines.push({ text: '', formula: '' });
      $('#articleLines', panel).innerHTML = linesHtml(article, editable());
      changed(article.id);
      $(`[data-line="${article.lines.length - 1}"]`, panel).focus();
    },
    'spec.removeLine'(index) {
      const article = selected();
      article.lines.splice(Number(index), 1);
      $('#articleLines', panel).innerHTML = linesHtml(article, editable());
      drawDerived(article);
      changed(article.id);
    },
    'spec.resetArticle'() {
      const article = selected();
      const source = sources.get(article?.sourceId);
      if (!source) return;
      Object.assign(article, { html: source.html, title: source.title, unit: source.unit });
      changed(article.id);
      select(article.id);
    },
    'spec.exportCsv': () => download(`${spec.title} - quantities.csv`, quantitiesCsv(articles), 'text/csv'),
    /** Turns the specification into an ordinary document, from where it can be printed or exported. */
    'spec.compose'() {
      const html = specToHtml(spec, articles);
      const text = new DOMParser().parseFromString(html, 'text/html').body.textContent;
      const created = documents.create({ title: spec.title, html, snippet: text.slice(0, 500) });
      if (created) navigate('#/d/' + created.id);
    },
  });

  panel.addEventListener('input', (e) => {
    const article = selected();
    const input = hit(e, 'input');
    if (!article) return;
    if (input?.dataset.field) {
      const { field } = input.dataset;
      article[field] = field === 'price' ? Number(input.value) || 0 : input.value;
      if (field !== 'price') drawTree();
    } else if (input?.dataset.line) article.lines[Number(input.dataset.line)][input.dataset.part] = input.value;
    else if (hit(e, '#articleText')) {
      article.html = $('#articleText', panel).innerHTML;
      drawTree(); // the tree marks articles whose text differs from the master
    }
    drawDerived(article);
    changed(article.id);
  });
  // Formatting buttons act on the text selection, which a normal click would take away.
  panel.addEventListener('mousedown', (e) => {
    const button = hit(e, '[data-format]');
    if (!button) return;
    e.preventDefault();
    doc.execCommand(button.dataset.format);
  });
  panel.addEventListener('paste', (e) => {
    const html = hit(e, '#articleText') && e.clipboardData?.getData('text/html');
    if (!html) return;
    e.preventDefault();
    doc.execCommand('insertHTML', false, sanitize(html));
  });
  search.addEventListener('input', drawTree);
  for (const [name, input] of Object.entries(inputs)) {
    input.addEventListener('input', () => {
      spec[name] = input.value;
      changed();
    });
  }

  return {
    /** Loads and shows a specification. Resolves to false when it does not exist. */
    async open(/** @type {string} */ id) {
      const loaded = await specStore.get(id);
      if (!loaded) return false;
      ({ spec, articles } = loaded);
      const master = spec.masterId ? await specStore.get(spec.masterId).catch(() => null) : null;
      sources = new Map((master?.articles ?? []).map((a) => [a.id, a]));
      for (const [name, input] of Object.entries(inputs)) {
        input.value = spec[name];
        input.disabled = !spec.mine;
      }
      $('#specKind', root).textContent = spec.kind === 'master' ? 'Master specification' : 'Project';
      $('#specProject', root).hidden = spec.kind !== 'project';
      $('#specReadOnly', root).hidden = spec.mine;
      state.textContent = '';
      search.value = '';
      root.hidden = false;
      doc.title = spec.title + ' – OnWord';
      select(null);
      return true;
    },
    /** Hides the workspace, saving first. */
    async hide() {
      root.hidden = true;
      await save();
      spec = null;
    },
    /** Whether changes are still waiting to be saved. */
    pending: () => unsaved.articles.size > 0 || unsaved.spec,
  };
}
