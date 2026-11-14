import { $ } from '../core/dom.js';
import { newId } from '../core/ids.js';
import { blankArticle, suggestNumber } from '../core/spec/model.js';
import { createArticleChanges } from './articleChanges.js';
import { createArticleForm } from './articleForm.js';
import { initArticleImport } from './articleImport.js';
import { createHeader } from './header.js';
import { createMasterPicker } from './masterPicker.js';
import { createOffers } from './offers.js';
import { initOutputs } from './outputs.js';
import { createPriceLibrary } from './prices.js';
import { createProjectDocuments } from './projectDocuments.js';
import { createSaver } from './saver.js';
import { createSiteReviews } from './siteReviews.js';
import { createViews } from './views.js';
import { quantitiesHtml, treeHtml } from './templates.js';

/**
 * The workspace for one specification: article tree, article form, bill of quantities, prices, offers, site
 * reviews and documents.
 * @typedef {object} WorkspaceDeps
 * @property {HTMLElement} root
 * @property {import('../core/spec/model.js').SpecStore} specStore
 * @property {import('../core/storage.js').DocumentStore} documents a project's documents, and where "Create
 *   document" puts its result
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
    search = $('#articleSearch', root),
    state = $('#specState', root);
  /** @type {import('../core/spec/model.js').Spec | null} */
  let spec = null;
  /** The articles in use, and (in a project) those taken out but kept with their changes. */
  let /** @type {import('../core/spec/model.js').Article[]} */ articles = [],
    /** @type {import('../core/spec/model.js').Article[]} */ removed = [];
  /** Master articles by id, to tell whether a project article still matches. @type {Map<string, import('../core/spec/model.js').Article>} */
  let sources = new Map();
  let selectedId = null;
  const views = createViews({
    root,
    commands,
    panels: {
      articles: ['#articlePanel', null],
      quantities: ['#quantitiesPanel', () => quantitiesHtml(articles)],
      prices: ['#pricesPanel', () => library.viewHtml()],
      offers: ['#offersPanel', () => offers.viewHtml()],
      reviews: ['#reviewsPanel', () => siteReviews.viewHtml()],
      documents: ['#documentsPanel', () => projectDocuments.viewHtml(), (element) => projectDocuments.drawn(element)],
    },
  });

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
  const header = createHeader({ root, current: () => spec, changed });
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

  const redraw = () => views.show('reviews');
  const siteReviews = createSiteReviews({ specStore, commands, toast, navigate, target, redraw });
  const projectDocuments = createProjectDocuments({
    documents,
    commands,
    toast,
    navigate,
    target,
    redraw: () => views.show('documents'),
  });

  function drawTree() {
    tree.innerHTML = treeHtml(articles, { selectedId, filter: search.value, sources });
  }
  const form = createArticleForm({
    panel,
    commands,
    selected,
    editable,
    sourceOf: (article) => sources.get(article.sourceId),
    library,
    changed,
    drawTree,
  });
  const drawArticle = form.draw;
  initArticleImport({
    dialog: $('#importDlg', root),
    input: $('#articleInput', root),
    commands,
    toast,
    articles: () => articles,
    editable,
    add(imported) {
      articles.push(...imported);
      imported.forEach((article) => changed(article.id));
      select(imported[0].id);
      toast(`${imported.length} article${imported.length === 1 ? '' : 's'} imported.`);
    },
  });
  /** Gives articles a new unit price and redraws what shows it. */
  function setPrices(/** @type {[import('../core/spec/model.js').Article, number][]} */ prices) {
    for (const [article, price] of prices) {
      article.price = price;
      changed(article.id);
    }
    if (views.current() === 'articles') drawArticle();
    else views.show(views.current());
  }

  function select(/** @type {string | null} */ id) {
    selectedId = id;
    views.show('articles');
    drawTree();
    drawArticle();
  }

  commands.register({
    'spec.select': select,
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
    'spec.resetArticle'() {
      const article = selected();
      const source = sources.get(article?.sourceId);
      if (!source) return;
      Object.assign(article, { html: source.html, title: source.title, unit: source.unit });
      changed(article.id);
      select(article.id);
    },
  });

  search.addEventListener('input', drawTree);

  return {
    /** Loads and shows a specification. Resolves to false when it does not exist. */
    async open(/** @type {string} */ id, /** @type {string} */ shown = '') {
      const loaded = await specStore.get(id);
      if (!loaded) return false;
      spec = loaded.spec;
      articles = loaded.articles.filter((a) => !a.removed);
      removed = loaded.articles.filter((a) => a.removed);
      const [master] = await Promise.all([
        spec.masterId ? specStore.get(spec.masterId).catch(() => null) : null,
        library.load(),
        offers.load(),
        siteReviews.load(),
        projectDocuments.load(),
      ]);
      sources = new Map((master?.articles ?? []).map((a) => [a.id, a]));
      header.show(spec);
      state.textContent = '';
      search.value = '';
      picker.reset(spec.kind === 'project' && spec.mine && sources.size > 0);
      root.hidden = false;
      doc.title = spec.title + ' – OnWord';
      select(null);
      if (views.has(shown)) views.show(shown);
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
