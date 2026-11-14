/**
 * Application entry point and composition root: the only place where services are created
 * and wired together, and the only module that looks elements up in the whole document.
 */
import { createAccount } from './account/account.js';
import { createApi } from './core/api.js';
import { createCommands } from './core/commands.js';
import { $, $$, hit } from './core/dom.js';
import { createPreferences } from './core/preferences.js';
import { createRemoteStore } from './core/remoteStore.js';
import { createAiReader } from './core/spec/aiReader.js';
import { createSpecDirectory } from './core/spec/directory.js';
import { createLocalSpecStore } from './core/spec/localStore.js';
import { createRemoteSpecStore } from './core/spec/remoteStore.js';
import { createDocumentStore } from './core/storage.js';
import { createEditor } from './editor/editor.js';
import { initFiling } from './library/filing.js';
import { initImporter } from './library/importer.js';
import { createLibrary } from './library/library.js';
import { initSharing } from './library/sharing.js';
import { createReviewScreen } from './reviews/review.js';
import { createSpecList } from './specs/list.js';
import { createWorkspace } from './specs/workspace.js';
import { createPopover } from './ui/popover.js';
import { createLegal } from './legal/legal.js';
import { createTheme } from './ui/theme.js';
import { createToast } from './ui/toast.js';

const API_URL = 'api/index.php';
/** The pages of the home screen by their address; any other address is the Projects page. */
const HOME_PAGES = { '#/docs': 'documents', '#/masters': 'masters' };
const QUOTA_MESSAGES = {
  write: 'Browser storage is full — download this document to keep your changes.',
  create: 'Browser storage is full — delete some documents first.',
};

const toast = createToast($('#toast', document));
const popover = createPopover($('#pop', document));
const commands = createCommands();
const prefs = createPreferences(localStorage);
const theme = createTheme({ root: document.documentElement, prefs });
const api = createApi({ base: API_URL });
const navigate = (/** @type {string} */ hash) => {
  location.hash = hash;
};
const legal = createLegal({ root: $('#legal', document) });
commands.register({
  'app.theme': theme.toggle,
  /** Back from a page opened by a link; to the start when there is nothing to go back to. */
  'app.back': () => (history.length > 1 ? history.back() : navigate('#/')),
});
// The legal pages open over any screen, also before signing in, so they follow the hash on their own.
addEventListener('hashchange', () => legal.route(location.hash));
legal.route(location.hash);

// Any element with `data-act` (and optional `data-arg`) runs the command of that name.
document.addEventListener('click', (e) => {
  const trigger = hit(e, '[data-act]');
  if (!trigger) return;
  const { act, arg } = trigger.dataset;
  if (popover.contains(trigger)) popover.close();
  commands.run(act, arg);
});
addEventListener('resize', popover.close);

/**
 * Starts the screens on a pair of stores.
 * @param {import('./core/storage.js').DocumentStore} store
 * @param {import('./core/spec/model.js').SpecStore} specStore
 * @param {import('./core/api.js').User | null} user the signed-in user when everything lives on the server
 * @param {import('./core/spec/aiReader.js').AiReader | null} [aiReader] when the server has one set up
 */
function startApp(store, specStore, user, aiReader = null) {
  const home = $('#home', document);
  const directory = createSpecDirectory({ specStore });
  const shared = { store, commands, popover, toast, navigate };
  const library = createLibrary({ root: $('#documentsPage', home), directory, ...shared });
  const editor = createEditor({ root: $('#editorView', document), prefs, directory, ...shared });
  initImporter({ input: $('#importInput', document), ...shared, refresh: library.render });
  initSharing({ dialog: $('#shareDlg', document), store, commands, toast });
  initFiling({ dialog: $('#moveDlg', document), store, directory, commands, toast, refresh: library.render });
  const specDeps = { specStore, commands, toast, navigate };
  const specList = createSpecList({
    projectsRoot: $('#projectsPage', home),
    mastersRoot: $('#mastersPage', home),
    dialog: $('#projectDlg', document),
    documents: store,
    directory,
    ...specDeps,
  });
  const workspace = createWorkspace({ root: $('#specView', document), documents: store, aiReader, ...specDeps });
  const review = createReviewScreen({ root: $('#reviewView', document), documents: store, ...specDeps });
  let navigation = 0;

  /** Opens what a hash names; resolves to whether it exists. */
  function open(/** @type {string} */ kind, /** @type {string} */ id, /** @type {string} */ sub) {
    if (kind === 'd') return store.load(id).then((ok) => ok && editor.open(id));
    if (kind === 's') return workspace.open(id, sub);
    if (kind === 'r') return review.open(id, sub);
    return Promise.resolve(false);
  }

  /** Shows one page of the home screen, or (with null) none. */
  function showHome(/** @type {'projects' | 'documents' | 'masters' | null} */ page) {
    home.hidden = !page;
    for (const link of $$('.main-nav a', home)) {
      if (link.dataset.page === page) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    if (page === 'documents') library.show();
    else library.hide();
    if (page === 'projects' || page === 'masters') specList.show(page);
    else specList.hide();
  }

  /**
   * Shows the screen named by the URL hash: `#/d/<id>` a document, `#/s/<id>` a specification (and
   * `#/s/<id>/<view>` one of its views), `#/r/<project id>/<review id>` a site review, `#/docs` all
   * documents, `#/masters` the master specifications, anything else the projects (the home screen).
   */
  async function route() {
    if (legal.owns(location.hash)) return; // opens over the current screen, which stays as it is
    const turn = ++navigation;
    popover.close();
    editor.close();
    await Promise.all([workspace.hide(), review.hide()]);
    const [, kind, id, sub = ''] = location.hash.match(/^#\/([dsr])\/([\w-]+)(?:\/([\w-]+))?$/) ?? [];
    // A server store has to fetch the content before it can be shown.
    const found = await open(kind, id, sub);
    if (turn !== navigation) return; // the user has moved on meanwhile
    if (kind && !found) history.replaceState(null, '', kind === 'd' ? '#/docs' : '#/');
    showHome(found ? null : (HOME_PAGES[location.hash] ?? 'projects'));
  }

  commands.register({
    async 'account.signOut'() {
      if (
        (store.pending() || workspace.pending() || review.pending()) &&
        !confirm('Some changes are not saved yet. Sign out anyway?')
      )
        return;
      await api.post('auth/logout');
      location.replace(location.pathname);
    },
  });
  if (user) {
    $('#userName', document).textContent = user.name;
    $('#userChip', document).hidden = false;
  }

  addEventListener('hashchange', route);
  addEventListener('beforeunload', (e) => {
    editor.saveNow();
    workspace.hide();
    review.hide();
    if (store.pending() || workspace.pending() || review.pending()) e.preventDefault(); // asks before leaving with unsaved work
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) editor.saveNow();
  });
  // Another tab changed the document list (browser storage only).
  addEventListener('storage', (e) => {
    if (store.indexKey && e.key === store.indexKey && library.visible) library.render();
  });
  route();
}

/**
 * Documents live on the server: the store is filled from it before anything is shown.
 * @param {import('./core/api.js').User} user
 * @param {boolean} ai whether the server's AI reader is set up
 */
async function startOnServer(user, ai) {
  const store = createRemoteStore({
    api,
    onConflict: (title) => toast(`“${title}” was changed somewhere else. Reload the page to see that version.`, 9000),
  });
  await store.refresh();
  startApp(store, createRemoteSpecStore({ api }), user, ai ? createAiReader({ api }) : null);
}

/**
 * The site works in one of two ways. Uploaded with its server part (api/), people sign in and their
 * documents are stored there. Served as plain files, documents stay in the visitor's own browser.
 */
async function start() {
  let session;
  try {
    session = await api.session();
  } catch (err) {
    if (/** @type {import('./core/api.js').ApiError} */ (err).code === 'not_configured') {
      $('#setup', document).hidden = false;
      return;
    }
    const store = createDocumentStore({
      storage: localStorage,
      onQuotaExceeded: (op) => toast(QUOTA_MESSAGES[op], 6000),
    });
    return startApp(store, createLocalSpecStore({ storage: localStorage }), null);
  }
  const ai = !!session.ai;
  legal.setSite(session.site);
  if (session.user) return startOnServer(session.user, ai);
  createAccount({
    root: $('#account', document),
    api,
    session,
    onSignedIn: (/** @type {import('./core/api.js').User} */ user) => startOnServer(user, ai),
  }).show();
}

start();
