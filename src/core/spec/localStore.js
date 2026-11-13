import { newId } from '../ids.js';
import { copyArticles, subtree } from './model.js';
import { collectPrices } from './prices.js';

const KEY = 'onword:specs';

/**
 * Specifications kept in the browser, for when the site runs without its server part.
 * @param {{ storage: Storage }} deps
 * @returns {import('./model.js').SpecStore}
 */
export function createLocalSpecStore({ storage }) {
  /** @returns {{ specs: import('./model.js').Spec[], articles: Record<string, import('./model.js').Article[]> }} */
  function read() {
    try {
      return { specs: [], articles: {}, ...JSON.parse(storage.getItem(KEY)) };
    } catch {
      return { specs: [], articles: {} };
    }
  }
  /** Applies `change` to the stored data. @template T @param {(data: ReturnType<typeof read>) => T} change */
  function update(change) {
    const data = read();
    const result = change(data);
    storage.setItem(KEY, JSON.stringify(data));
    return result;
  }
  const touch = (/** @type {ReturnType<typeof read>} */ data, /** @type {string} */ id) => {
    const spec = data.specs.find((s) => s.id === id);
    if (spec) spec.updated = Date.now();
  };

  return {
    list: async () => read().specs,
    async get(id) {
      const { specs, articles } = read();
      const spec = specs.find((s) => s.id === id);
      return spec ? { spec, articles: articles[id] ?? [] } : null;
    },
    create: async ({ kind, title, masterId = null, phase = '', lot = '', articleIds = [] }) =>
      update((data) => {
        /** @type {import('./model.js').Spec} */
        const spec = { id: newId(), kind, title, masterId, phase, lot, updated: Date.now(), mine: true };
        data.specs.push(spec);
        data.articles[spec.id] = copyArticles(data.articles[masterId] ?? [], articleIds, newId);
        return spec;
      }),
    update: async (id, patch) =>
      update((data) => {
        Object.assign(data.specs.find((s) => s.id === id) ?? {}, patch);
        touch(data, id);
      }),
    remove: async (id) =>
      update((data) => {
        data.specs = data.specs.filter((s) => s.id !== id);
        delete data.articles[id];
      }),
    saveArticle: async (specId, article) =>
      update((data) => {
        const list = (data.articles[specId] ??= []);
        const index = list.findIndex((a) => a.id === article.id);
        if (index < 0) list.push(article);
        else list[index] = article;
        touch(data, specId);
      }),
    removeArticle: async (specId, articleId) =>
      update((data) => {
        const list = data.articles[specId] ?? [];
        const gone = subtree(list, articleId);
        data.articles[specId] = list.filter((a) => !gone.has(a.id));
        touch(data, specId);
      }),
    async prices() {
      const { specs, articles } = read();
      return collectPrices(specs, articles);
    },
  };
}
