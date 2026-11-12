const INDENT = String.fromCharCode(0xa0).repeat(4); // non-breaking spaces: ordinary ones would collapse

/** Ctrl/⌘ + key → [command, argument]. Keys are `KeyboardEvent.code`, which ignores the keyboard layout. */
const PLAIN = {
  KeyS: ['file.save'],
  KeyK: ['link.edit'],
  KeyF: ['find.open'],
  KeyH: ['find.open'],
  Backslash: ['edit.exec', 'removeFormat'],
  Enter: ['insert.pageBreak'],
};
const WITH_SHIFT = {
  KeyX: ['edit.exec', 'strikeThrough'],
  KeyL: ['edit.exec', 'justifyLeft'],
  KeyE: ['edit.exec', 'justifyCenter'],
  KeyR: ['edit.exec', 'justifyRight'],
  KeyJ: ['edit.exec', 'justifyFull'],
  Digit7: ['edit.exec', 'insertOrderedList'],
  Digit8: ['edit.exec', 'insertUnorderedList'],
  Digit9: ['format.checklist'],
};
const WITH_ALT = {
  Digit0: ['format.block', 'p'],
  Digit1: ['format.block', 'h2'],
  Digit2: ['format.block', 'h3'],
  Digit3: ['format.block', 'h4'],
  Digit4: ['format.block', 'h5'],
};

/**
 * Keyboard handling: Tab behaviour inside the document and Ctrl/⌘ shortcuts.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initShortcuts(ctx) {
  const { content, selection, session, events, commands, popover, toast } = ctx;

  commands.register({
    'file.save'() {
      session.saveNow({ force: true });
      toast('Saved.', 1200);
    },
  });

  content.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    if (commands.run('table.tab', e.shiftKey)) return;
    if (selection.closest('li')) ctx.exec(e.shiftKey ? 'outdent' : 'indent');
    else if (!e.shiftKey) ctx.exec('insertText', INDENT);
  });

  content.ownerDocument.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      popover.close();
      events.emit('dismiss');
      return;
    }
    if (!session.id || !(e.ctrlKey || e.metaKey)) return;
    const keys = e.altKey ? WITH_ALT : e.shiftKey ? WITH_SHIFT : PLAIN;
    const action = keys[e.code];
    if (!action) return;
    e.preventDefault();
    commands.run(action[0], action[1]);
  });
}
