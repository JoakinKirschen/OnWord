/**
 * Application entry point and composition root: the only place where services are created
 * and wired together, and the only module that looks elements up in the whole document.
 */
import { createCommands } from './core/commands.js';
import { $, hit } from './core/dom.js';
import { createPreferences } from './core/preferences.js';
import { createDocumentStore } from './core/storage.js';
import { createEditor } from './editor/editor.js';
import { initImporter } from './library/importer.js';
import { createLibrary } from './library/library.js';
import { createPopover } from './ui/popover.js';
import { createTheme } from './ui/theme.js';
import { createToast } from './ui/toast.js';

const QUOTA_MESSAGES = {
  write: 'Browser storage is full — download this document to keep your changes.',
  create: 'Browser storage is full — delete some documents first.',
};

const toast = createToast($('#toast', document));
const popover = createPopover($('#pop', document));
const commands = createCommands();
const prefs = createPreferences(localStorage);
const theme = createTheme({ root: document.documentElement, prefs });
const store = createDocumentStore({ storage: localStorage, onQuotaExceeded: (op) => toast(QUOTA_MESSAGES[op], 6000) });
const navigate = (hash) => {
  location.hash = hash;
};

const shared = { store, commands, popover, toast, navigate };
const library = createLibrary({ root: $('#home', document), ...shared });
const editor = createEditor({ root: $('#editorView', document), prefs, ...shared });
initImporter({ input: $('#importInput', document), store, commands, navigate });
commands.register({ 'app.theme': theme.toggle });

/** Shows the screen named by the URL hash: `#/d/<id>` opens a document, anything else the library. */
function route() {
  popover.close();
  editor.close();
  const match = location.hash.match(/^#\/d\/([\w-]+)$/);
  if (match && editor.open(match[1])) return library.hide();
  if (match) history.replaceState(null, '', '#/');
  library.show();
}

// Any element with `data-act` (and optional `data-arg`) runs the command of that name.
document.addEventListener('click', (e) => {
  const trigger = hit(e, '[data-act]');
  if (!trigger) return;
  const { act, arg } = trigger.dataset;
  if (popover.contains(trigger)) popover.close();
  commands.run(act, arg);
});

addEventListener('hashchange', route);
addEventListener('beforeunload', editor.saveNow);
addEventListener('resize', popover.close);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) editor.saveNow();
});
// Another tab changed the document list.
addEventListener('storage', (e) => {
  if (e.key === store.indexKey && library.visible) library.render();
});

route();
