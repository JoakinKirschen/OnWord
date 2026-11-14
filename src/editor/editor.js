import { $, hit } from '../core/dom.js';
import { createEmitter } from '../core/events.js';
import { EMPTY_DOC } from '../core/html.js';
import { createSelection } from './selection.js';
import { createSession } from './session.js';
import { initAutoformat } from './features/autoformat.js';
import { initChecklist } from './features/checklist.js';
import { initClipboard } from './features/clipboard.js';
import { initComments } from './features/comments.js';
import { initFootnotes } from './features/footnotes.js';
import { initTableMerge } from './features/tableMerge.js';
import { initToc } from './features/toc.js';
import { initTrackChanges } from './features/trackChanges.js';
import { initExporter } from './features/exporter.js';
import { initFileCommands } from './features/fileCommands.js';
import { initFind } from './features/find.js';
import { initFormatPainter } from './features/formatPainter.js';
import { initHeaderFooter } from './features/headerFooter.js';
import { initPagination } from './features/pagination.js';
import { initParagraph } from './features/paragraph.js';
import { initRuler } from './features/ruler.js';
import { initSymbols } from './features/symbols.js';
import { initTextCase } from './features/textCase.js';
import { initWordCount } from './features/wordCount.js';
import { initFormatting } from './features/formatting.js';
import { initHistory } from './features/history.js';
import { initImages } from './features/images.js';
import { initLinks } from './features/links.js';
import { initListStyles } from './features/listStyles.js';
import { initMenus } from './features/menus.js';
import { initOutline } from './features/outline.js';
import { initPageSetup } from './features/pageSetup.js';
import { initShortcuts } from './features/shortcuts.js';
import { initStyles } from './features/styles.js';
import { initTables } from './features/tables.js';
import { initToolbar } from './features/toolbar.js';
import { initView } from './features/view.js';

/** Browser commands that move the text but should leave the caret where it was. */
const KEEPS_CARET = ['insertOrderedList', 'insertUnorderedList'];

const FEATURES = [
  initFormatting,
  initStyles,
  initParagraph,
  initToolbar,
  initMenus,
  initTables,
  initTableMerge,
  initLinks,
  initImages,
  initClipboard,
  initAutoformat,
  initChecklist,
  initListStyles,
  initFootnotes,
  initComments,
  initTrackChanges,
  initTextCase,
  initSymbols,
  initFormatPainter,
  initFind,
  initExporter,
  initFileCommands,
  initView,
  initOutline,
  initHistory,
  initRuler,
  initHeaderFooter,
  initWordCount,
  initToc,
  initPagination,
  // Last of the layout features: it emits 'layout' on open, which the ones above listen for.
  initPageSetup,
  initShortcuts,
];

/**
 * Composition root for the editor screen. Builds the shared context (`ctx`) and hands it to
 * every feature; features communicate only through `ctx.commands` and `ctx.events`.
 *
 * Events: 'open' (document loaded), 'input' (user typed, before save; payload: the InputEvent), 'change' (document
 * modified), 'selection' (caret moved / formatting changed), 'dismiss' (Escape pressed), 'layout' (page
 * geometry, zoom or the document's styles changed), 'pages' (the document was re-paginated; follows every 'change' and 'layout').
 *
 * @typedef {object} EditorDeps
 * @property {HTMLElement} root
 * @property {import('../core/storage.js').DocumentStore} store
 * @property {import('../core/preferences.js').Preferences} prefs
 * @property {import('../core/commands.js').Commands} commands
 * @property {import('../ui/popover.js').Popover} popover
 * @property {import('../ui/toast.js').Toast} toast
 * @property {(hash: string) => void} navigate
 *
 * @typedef {object} EditorServices
 * @property {HTMLElement} content the editable document body
 * @property {HTMLElement} scroller the scrolling container around the page
 * @property {import('../core/events.js').Emitter} events
 * @property {import('./selection.js').EditorSelection} selection
 * @property {import('./session.js').Session} session
 * @property {(command: string, value?: string | null) => void} exec
 * @property {() => void} changed
 *
 * @typedef {EditorDeps & EditorServices} EditorContext
 *
 * @param {EditorDeps & { directory: import('../core/spec/directory.js').SpecDirectory }} deps `directory` names
 *   the project the open document is filed under
 */
export function createEditor({ root, store, prefs, commands, popover, toast, navigate, directory }) {
  const doc = root.ownerDocument;
  const content = $('#editor', root);
  const scroller = $('#scroller', root);
  const events = createEmitter();
  const selection = createSelection(content);
  const session = createSession({ root, content, store, events, directory });

  /** Run a browser editing command on the current selection and record the change. */
  function exec(command, value = null) {
    selection.restore();
    const caret = KEEPS_CARET.includes(command) ? selection.offsets() : null;
    doc.execCommand('styleWithCSS', false, 'true');
    doc.execCommand(command, false, value);
    // Chrome rebuilds the text in the new list item and leaves the caret at the start of the item.
    const item = caret && selection.closest('li');
    if (item) selection.restoreOffsets(caret, item);
    session.changed();
    events.emit('selection');
  }

  /** @type {EditorContext} */
  const ctx = {
    root,
    content,
    scroller,
    events,
    selection,
    session,
    store,
    prefs,
    commands,
    popover,
    toast,
    navigate,
    exec,
    changed: session.changed,
  };

  commands.register({ 'edit.exec': (command) => exec(command) });
  FEATURES.forEach((init) => init(ctx));

  content.addEventListener('input', (e) => {
    events.emit('input', e);
    if (!content.firstChild) content.innerHTML = EMPTY_DOC; // always keep a paragraph to type into
    session.changed();
  });
  doc.addEventListener('selectionchange', () => {
    if (selection.remember()) events.emit('selection');
  });
  // Clicking the toolbar or menu bar must not steal the document selection (form fields excepted).
  root.addEventListener('mousedown', (e) => {
    if (hit(e, '.toolbar, .menubar') && !hit(e, 'select, input')) e.preventDefault();
  });
  try {
    doc.execCommand('defaultParagraphSeparator', false, 'p');
  } catch {
    /* not supported */
  }

  return {
    open(id) {
      root.hidden = false; // before loading: features measure the page when the document opens
      if (!session.open(id)) {
        root.hidden = true;
        return false;
      }
      scroller.scrollTop = 0;
      content.focus();
      return true;
    },
    close() {
      session.close();
      root.hidden = true;
    },
    saveNow: () => session.saveNow(),
  };
}
