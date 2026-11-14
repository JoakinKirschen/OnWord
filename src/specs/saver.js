/** Saves the changes to the open specification after a short pause, one request at a time. */

const SAVE_DELAY_MS = 500;

/**
 * @typedef {ReturnType<typeof createSaver>} Saver
 * @typedef {object} SaverDeps
 * @property {import('../core/spec/model.js').SpecStore} specStore
 * @property {HTMLElement} state the indicator that says "Saving…", "Saved" or "Not saved"
 * @property {import('../ui/toast.js').Toast} toast
 * @property {() => { spec: import('../core/spec/model.js').Spec | null,
 *   articles: import('../core/spec/model.js').Article[] }} current the open specification
 *
 * @param {SaverDeps} deps
 */
export function createSaver({ specStore, state, toast, current }) {
  /** What still has to reach the store: article ids, and whether the specification's own fields changed. */
  const unsaved = { articles: new Set(), spec: false };
  let timer = null;

  /** Writes everything unsaved to the store. */
  async function save() {
    clearTimeout(timer);
    const { spec, articles } = current();
    if (!spec) return;
    if (!unsaved.articles.size && !unsaved.spec) {
      // What was waiting may have been deleted meanwhile; an indicator that said "Saving…" must not stay so.
      if (state.textContent) state.textContent = 'Saved';
      return;
    }
    const ids = [...unsaved.articles];
    const fields = unsaved.spec && { title: spec.title, phase: spec.phase, lot: spec.lot };
    unsaved.articles.clear();
    unsaved.spec = false;
    try {
      if (fields) await specStore.update(spec.id, fields);
      for (const id of ids) {
        const article = articles.find((a) => a.id === id);
        if (article) await specStore.saveArticle(spec.id, article);
      }
      if (!unsaved.articles.size && !unsaved.spec) state.textContent = 'Saved';
    } catch (err) {
      ids.forEach((id) => unsaved.articles.add(id));
      unsaved.spec ||= !!fields;
      state.textContent = 'Not saved';
      toast(/** @type {Error} */ (err).message || 'The changes could not be saved.');
    }
  }

  return {
    save,
    /** Notes that an article (or, without an id, the specification's own fields) changed. */
    changed(/** @type {string} */ articleId = '') {
      if (articleId) unsaved.articles.add(articleId);
      else unsaved.spec = true;
      state.textContent = 'Saving…';
      clearTimeout(timer);
      timer = setTimeout(save, SAVE_DELAY_MS);
    },
    /** Deletes an article and what is under it from the store; `gone` are their ids, no longer to be saved. */
    async remove(/** @type {string} */ articleId, /** @type {Set<string>} */ gone) {
      gone.forEach((id) => unsaved.articles.delete(id));
      state.textContent = 'Saving…';
      try {
        await specStore.removeArticle(current().spec.id, articleId);
        await save();
      } catch {
        state.textContent = 'Not saved';
        toast('The article could not be deleted.');
      }
    },
    /** Whether changes are still waiting to be saved. */
    pending: () => unsaved.articles.size > 0 || unsaved.spec,
  };
}
