/** Taking articles out of the open specification and bringing master articles in. */

import { newId } from '../core/ids.js';
import { bringIn, outline, planRemoval, subtree } from '../core/spec/model.js';
import { createRemovalDialog } from './removal.js';

/**
 * @typedef {import('../core/spec/model.js').Article} Article
 * @typedef {{ articles: Article[], removed: Article[] }} ProjectArticles the articles in use, and those kept
 *   aside with their changes
 */

/**
 * @typedef {object} ArticleChangesDeps
 * @property {HTMLDialogElement} dialog the warning shown before articles are removed
 * @property {import('./saver.js').Saver} saver
 * @property {() => ProjectArticles} project the open specification's articles
 * @property {(project: ProjectArticles) => void} update replaces them
 *
 * @param {ArticleChangesDeps} deps
 */
export function createArticleChanges({ dialog, saver, project: current, update }) {
  const warning = createRemovalDialog(dialog);

  return {
    /**
     * Removes articles with everything under them, once the user has seen the warning. Resolves to false
     * when they cancelled.
     * @param {string[]} ids
     */
    async remove(ids) {
      const project = current();
      const plan = planRemoval(project.articles, ids);
      if (!plan.gone.size) return false;
      const kept = new Set(plan.kept.map((a) => a.id));
      const nested = (/** @type {string} */ id) =>
        ids.some((other) => other !== id && subtree(project.articles, other).has(id));
      const rows = outline(project.articles).filter(({ article }) => plan.gone.has(article.id));
      if (!(await warning.ask(rows, { chosen: ids.filter((id) => !nested(id)).length, kept }))) return false;

      plan.kept.forEach((article) => (article.removed = true));
      update({
        articles: project.articles.filter((a) => !plan.gone.has(a.id)),
        removed: [...project.removed, ...plan.kept],
      });
      plan.kept.forEach((article) => saver.changed(article.id));
      const deleted = new Set([...plan.gone].filter((id) => !kept.has(id)));
      for (const id of plan.deleted) await saver.remove(id, deleted);
      return true;
    },

    /**
     * Brings master articles into the project: kept ones as they were left, the others as new copies.
     * @param {Article[]} master
     * @param {string[]} ids master ids
     * @returns {Article[]} the articles that came in
     */
    bring(master, ids) {
      const project = current();
      const { restored, copies } = bringIn(master, ids, newId, project);
      const back = new Set(restored.map((a) => a.id));
      const added = [...restored, ...copies];
      update({ articles: [...project.articles, ...added], removed: project.removed.filter((a) => !back.has(a.id)) });
      added.forEach((a) => saver.changed(a.id));
      return added;
    },
  };
}
