const HEADING_KEYS = { Digit0: 'p', Digit1: 'h2', Digit2: 'h3', Digit3: 'h4' };
const SHIFT_KEYS = { KeyX: 'strikeThrough', KeyL: 'justifyLeft', KeyE: 'justifyCenter', KeyR: 'justifyRight', KeyJ: 'justifyFull', Digit7: 'insertOrderedList', Digit8: 'insertUnorderedList' };
const INDENT = ' '.repeat(4);

/** Keyboard handling: Tab behaviour inside the document and Ctrl/⌘ shortcuts. */
export function initShortcuts(ctx) {
  const { content, selection, session, events, commands, popover, toast } = ctx;

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
    const run = (fn) => {
      e.preventDefault();
      fn();
    };
    const key = e.key.toLowerCase();
    if (e.altKey) {
      if (HEADING_KEYS[e.code]) run(() => commands.run('format.block', HEADING_KEYS[e.code]));
    } else if (e.shiftKey) {
      if (SHIFT_KEYS[e.code]) run(() => ctx.exec(SHIFT_KEYS[e.code]));
    } else if (key === 's') {
      run(() => {
        session.saveNow({ force: true });
        toast('Saved.', 1200);
      });
    } else if (key === 'k') run(() => commands.run('link.edit'));
    else if (key === 'f' || key === 'h') run(() => commands.run('find.open'));
    else if (key === '\\') run(() => ctx.exec('removeFormat'));
  });
}
