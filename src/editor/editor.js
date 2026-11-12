import { $ } from '../core/dom.js';
import { createEmitter } from '../core/events.js';
import { EMPTY_DOC } from '../core/html.js';
import { createSelection } from './selection.js';
import { createSession } from './session.js';
import { initClipboard } from './features/clipboard.js';
import { initExporter } from './features/exporter.js';
import { initFileCommands } from './features/fileCommands.js';
import { initFind } from './features/find.js';
import { initFormatting } from './features/formatting.js';
import { initImages } from './features/images.js';
import { initLinks } from './features/links.js';
import { initMenus } from './features/menus.js';
import { initShortcuts } from './features/shortcuts.js';
import { initTables } from './features/tables.js';
import { initToolbar } from './features/toolbar.js';
import { initView } from './features/view.js';

const FEATURES = [
  initFormatting, initToolbar, initMenus, initTables, initLinks, initImages,
  initClipboard, initFind, initExporter, initFileCommands, initView, initShortcuts,
];

/**
 * Composition root for the editor screen. Builds the shared context (`ctx`) and hands it to
 * every feature; features communicate only through `ctx.commands` and `ctx.events`.
 *
 * Events: 'open' (document loaded), 'input' (user typed, before save), 'change' (document
 * modified), 'selection' (caret moved / formatting changed), 'dismiss' (Escape pressed).
 */
export function createEditor({ root, store, commands, popover, toast, navigate }) {
  const doc = root.ownerDocument;
  const content = $('#editor', root);
  const scroller = $('#scroller', root);
  const events = createEmitter();
  const selection = createSelection(content);
  const session = createSession({ root, content, store, events });

  /** Run a browser editing command on the current selection and record the change. */
  function exec(command, value = null) {
    selection.restore();
    doc.execCommand('styleWithCSS', false, true);
    doc.execCommand(command, false, value);
    session.changed();
    events.emit('selection');
  }

  const ctx = {
    root, content, scroller, events, selection, session, store, commands, popover, toast, navigate,
    exec, changed: session.changed,
  };

  commands.register({ 'edit.exec': (command) => exec(command) });
  FEATURES.forEach((init) => init(ctx));

  content.addEventListener('input', () => {
    events.emit('input');
    if (!content.firstChild) content.innerHTML = EMPTY_DOC; // always keep a paragraph to type into
    session.changed();
  });
  doc.addEventListener('selectionchange', () => {
    if (selection.remember()) events.emit('selection');
  });
  // Clicking the toolbar or menu bar must not steal the document selection (form fields excepted).
  root.addEventListener('mousedown', (e) => {
    if (e.target.closest('.toolbar, .menubar') && !e.target.closest('select, input')) e.preventDefault();
  });
  try { doc.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* not supported */ }

  return {
    open(id) {
      if (!session.open(id)) return false;
      root.hidden = false;
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
