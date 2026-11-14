/**
 * File-menu commands that act on the open document as a whole.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initFileCommands(ctx) {
  const { session, store, commands, navigate } = ctx;

  commands.register({
    'file.copy'() {
      session.saveNow();
      const copy = store.duplicate(session.id);
      if (copy) navigate('#/d/' + copy.id);
    },
    /** Keeps a copy of the open document as a template (see library.saveAsTemplate). */
    'file.saveAsTemplate'() {
      session.saveNow();
      commands.run('library.saveAsTemplate', session.id);
    },
    'file.delete'() {
      const id = session.id;
      if (!id || !confirm(`Delete “${session.title()}”? This can’t be undone.`)) return;
      session.discard();
      store.remove(id);
      navigate('#/');
    },
  });
}
