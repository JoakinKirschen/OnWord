/**
 * Application entry point and composition root: the only place where services are created
 * and wired together, and the only module that looks elements up in the whole document.
 */
import { createAccount } from './account/account.js';
import { createApi } from './core/api.js';
import { createCommands } from './core/commands.js';
import { $, hit } from './core/dom.js';
import { createPreferences } from './core/preferences.js';
import { createRemoteStore } from './core/remoteStore.js';
import { createLocalSpecStore } from './core/spec/localStore.js';
import { createRemoteSpecStore } from './core/spec/remoteStore.js';
import { createDocumentStore } from './core/storage.js';
import { createEditor } from './editor/editor.js';
import { initImporter } from './library/importer.js';
import { createLibrary } from './library/library.js';
import { initSharing } from './library/sharing.js';
import { createSpecList } from './specs/list.js';
import { createWorkspace } from './specs/workspace.js';
import { createPopover } from './ui/popover.js';
import { createTheme } from './ui/theme.js';
import { createToast } from './ui/toast.js';

const API_URL = 'api/index.php';
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
commands.register({ 'app.theme': theme.toggle });

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
 */
function startApp(store, specStore, user) {
  const shared = { store, commands, popover, toast, navigate };
  const library = createLibrary({ root: $('#home', document), ...shared });
  const editor = createEditor({ root: $('#editorView', document), prefs, ...shared });
  initImporter({ input: $('#importInput', document), ...shared, refresh: library.render });
  initSharing({ dialog: $('#shareDlg', document), store, commands, toast });
  const specDeps = { specStore, commands, toast, navigate };
  const specList = createSpecList({ root: $('#specsHome', document), dialog: $('#projectDlg', document), ...specDeps });
  const workspace = createWorkspace({ root: $('#specView', document), documents: store, ...specDeps });
  let navigation = 0;

  /**
   * Shows the screen named by the URL hash: `#/d/<id>` a document, `#/s/<id>` a specification,
   * `#/specs` the list of specifications, anything else the library.
   */
  async function route() {
    const turn = ++navigation;
    popover.close();
    editor.close();
    await workspace.hide();
    const [, kind, id] = location.hash.match(/^#\/([ds])\/([\w-]+)$/) ?? [];
    // A server store has to fetch the content before it can be shown.
    const found = kind === 'd' ? (await store.load(id)) && editor.open(id) : kind === 's' && (await workspace.open(id));
    if (turn !== navigation) return; // the user has moved on meanwhile
    const specs = kind === 's' || location.hash.startsWith('#/specs');
    if (kind && !found) history.replaceState(null, '', specs ? '#/specs' : '#/');
    if (found || specs) library.hide();
    else library.show();
    if (specs && !found) specList.show();
    else specList.hide();
  }

  commands.register({
    async 'account.signOut'() {
      if ((store.pending() || workspace.pending()) && !confirm('Some changes are not saved yet. Sign out anyway?'))
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
    if (store.pending() || workspace.pending()) e.preventDefault(); // asks before leaving with unsaved work
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

/** Documents live on the server: the store is filled from it before anything is shown. */
async function startOnServer(/** @type {import('./core/api.js').User} */ user) {
  const store = createRemoteStore({
    api,
    onConflict: (title) => toast(`“${title}” was changed somewhere else. Reload the page to see that version.`, 9000),
  });
  await store.refresh();
  startApp(store, createRemoteSpecStore({ api }), user);
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
  if (session.user) return startOnServer(session.user);
  createAccount({
    root: $('#account', document),
    api,
    registration: session.registration,
    onSignedIn: startOnServer,
  }).show();
}

start();
