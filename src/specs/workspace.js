import { $, $$, hit } from '../core/dom.js';
import { newId } from '../core/ids.js';
import { evaluate } from '../core/spec/formula.js';
import { blankArticle, suggestNumber } from '../core/spec/model.js';
import { initArticleText } from './articleText.js';
import { createArticleChanges } from './articleChanges.js';
import { createMasterPicker } from './masterPicker.js';
import { createOffers } from './offers.js';
import { initOutputs } from './outputs.js';
import { createPriceLibrary } from './prices.js';
import { createSaver } from './saver.js';
import { articleHtml, linesHtml, number, quantitiesHtml, sourceHtml, totalsText, treeHtml } from './templates.js';

const NOTHING = '<p class="spec-empty">Choose an article in the list, or add one.</p>';

/**
 * The workspace for one specification: article tree, article form, bill of quantities, prices and offers.
 * @typedef {object} WorkspaceDeps
 * @property {HTMLElement} root
 * @property {import('../core/spec/model.js').SpecStore} specStore
 * @property {import('../core/storage.js').DocumentStore} documents where "Create document" puts its result
 * @property {import('../core/commands.js').Commands} commands
 * @property {import('../ui/toast.js').Toast} toast
 * @property {(hash: string) => void} navigate
 * @property {import('../core/spec/aiReader.js').AiReader | null} aiReader reads offers the spreadsheet reader cannot
 *
 * @param {WorkspaceDeps} deps
 */
export function createWorkspace({ root, specStore, documents, commands, toast, navigate, aiReader }) {
  const doc = root.ownerDocument;
  const tree = $('#articleTree', root),
    panel = $('#articlePanel', root),
    quantities = $('#quantitiesPanel', root),
    pricesPanel = $('#pricesPanel', root),
    offersPanel = $('#offersPanel', root),
    search = $('#articleSearch', root),
    state = $('#specState', root);
  const inputs = { title: $('#specTitle', root), phase: $('#specPhase', root), lot: $('#specLot', root) };
  /** @type {import('../core/spec/model.js').Spec | null} */
  let spec = null;
  /** The articles in use, and (in a project) those taken out but kept with their changes. */
  let /** @type {import('../core/spec/model.js').Article[]} */ articles = [],
    /** @type {import('../core/spec/model.js').Article[]} */ removed = [];
  /** Master articles by id, to tell whether a project article still matches. @type {Map<string, import('../core/spec/model.js').Article>} */
  let sources = new Map();
  let selectedId = null;
  const views = { articles: panel, quantities, prices: pricesPanel, offers: offersPanel };

  const selected = () => articles.find((a) => a.id === selectedId);
  const editable = () => !!spec?.mine;
  const saver = createSaver({
    specStore,
    state,
    toast,
    current: () => ({ spec, articles: [...articles, ...removed] }),
  });
  initOutputs({ commands, documents, navigate, current: () => ({ spec, articles }) });
  const articleChanges = createArticleChanges({
    dialog: $('#removeDlg', root),
    saver,
    project: () => ({ articles, removed }),
    update: (project) => ({ articles, removed } = project),
  });
  const changed = saver.changed;
  const target = { spec: () => spec, articles: () => articles, selected, editable, setPrices };
  const library = createPriceLibrary({ specStore, commands, toast, target });
  const offers = createOffers({
    specStore,
    commands,
    toast,
    target,
    aiReader,
    dialog: $('#offerDlg', root),
    input: $('#offerInput', root),
    save: saver.save,
  });

  const picker = createMasterPicker({
    root,
    commands,
    toast,
    master: () => [...sources.values()],
    articles: () => articles,
    async apply({ add, remove }) {
      if (remove.length && !(await articleChanges.remove(remove))) return false;
      const added = articleChanges.bring([...sources.values()], add);
      select(added[0]?.id ?? (selected() ? selectedId : null));
      return true;
    },
  });

  function drawTree() {
    tree.innerHTML = treeHtml(articles, { selectedId, filter: search.value, sources });
  }
  function drawArticle() {
    const article = selected();
    panel.innerHTML = article
      ? articleHtml(article, {
          editable: editable(),
          source: sources.get(article.sourceId),
          library: library.noteHtml(article),
        })
      : NOTHING;
  }
  /** Refreshes what is computed from the article without touching the fields being typed in. */
  function drawDerived(/** @type {import('../core/spec/model.js').Article} */ article) {
    const totals = totalsText(article);
    $('#articleQuantity', panel).textContent = totals.quantity;
    $('#articleAmount', panel).textContent = totals.amount;
    $('#articleSource', panel).innerHTML = sourceHtml(article, sources.get(article.sourceId), editable());
    article.lines.forEach((line, i) => ($(`[data-result="${i}"]`, panel).textContent = number(evaluate(line.formula))));
    library.drawNote($('#articleLibrary', panel), article);
  }
  function show(/** @type {keyof typeof views} */ view) {
    for (const [name, element] of Object.entries(views)) element.hidden = name !== view;
    if (view === 'quantities') quantities.innerHTML = quantitiesHtml(articles);
    if (view === 'prices') pricesPanel.innerHTML = library.viewHtml();
    if (view === 'offers') offersPanel.innerHTML = offers.viewHtml();
    for (const tab of $$('[data-act="spec.view"]', root)) tab.classList.toggle('on', tab.dataset.arg === view);
  }
  /** Gives articles a new unit price and redraws what shows it. */
  function setPrices(/** @type {[import('../core/spec/model.js').Article, number][]} */ prices) {
    for (const [article, price] of prices) {
      article.price = price;
      changed(article.id);
    }
    const current = /** @type {keyof typeof views} */ (Object.keys(views).find((name) => !views[name].hidden));
    if (current === 'articles') drawArticle();
    else show(current);
  }

  function select(/** @type {string | null} */ id) {
    selectedId = id;
    show('articles');
    drawTree();
    drawArticle();
  }

  commands.register({
    'spec.select': select,
    'spec.view': (view) => show(Object.hasOwn(views, view) ? view : 'articles'),
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
      if (selected() && (await articleChanges.remove([selectedId]))) select(null);
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
  initArticleText(panel);
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
      spec = loaded.spec;
      articles = loaded.articles.filter((a) => !a.removed);
      removed = loaded.articles.filter((a) => a.removed);
      const [master] = await Promise.all([
        spec.masterId ? specStore.get(spec.masterId).catch(() => null) : null,
        library.load(),
        offers.load(),
      ]);
      sources = new Map((master?.articles ?? []).map((a) => [a.id, a]));
      for (const [name, input] of Object.entries(inputs)) {
        input.value = spec[name];
        input.disabled = !spec.mine;
      }
      $('#specKind', root).textContent = spec.kind === 'master' ? 'Master specification' : 'Project';
      $('#specProject', root).hidden = $('[data-arg="offers"]', root).hidden = spec.kind !== 'project';
      $('#specReadOnly', root).hidden = spec.mine;
      state.textContent = '';
      search.value = '';
      picker.reset(spec.kind === 'project' && spec.mine && sources.size > 0);
      root.hidden = false;
      doc.title = spec.title + ' – OnWord';
      select(null);
      return true;
    },
    /** Hides the workspace, saving first. */
    async hide() {
      root.hidden = true;
      await saver.save();
      spec = null;
    },
    /** Whether changes are still waiting to be saved. */
    pending: saver.pending,
  };
}
