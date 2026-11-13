import { sanitize } from '../html.js';
import { newId } from '../ids.js';
import { quantityOf } from './model.js';

/**
 * Specifications kept on the server. Masters are readable by every account; only their owner changes them.
 * @param {{ api: import('../api.js').Api }} deps
 * @returns {import('./model.js').SpecStore}
 */
export function createRemoteSpecStore({ api }) {
  const id = (/** @type {string} */ value) => encodeURIComponent(value);

  return {
    list: () => api.get('specs/list').then((data) => data.specs),
    async get(specId) {
      try {
        const { spec, articles } = await api.get(`specs/get&id=${id(specId)}`);
        // Article text may have been written by another account.
        return { spec, articles: articles.map((a) => ({ ...a, html: sanitize(a.html) })) };
      } catch (err) {
        if (/** @type {import('../api.js').ApiError} */ (err).status === 404) return null;
        throw err;
      }
    },
    create: (spec) => api.post('specs/create', { ...spec, id: newId() }).then((data) => data.spec),
    update: (specId, patch) => api.post('specs/update', { id: specId, ...patch }),
    remove: (specId) => api.post('specs/delete', { id: specId }),
    saveArticle: (specId, article) => api.post('articles/save', { specId, article }),
    removeArticle: (specId, articleId) => api.post('articles/delete', { specId, id: articleId }),
    prices: () =>
      api
        .get('prices/list')
        .then((data) => data.prices.map(({ lines, ...record }) => ({ ...record, quantity: quantityOf({ lines }) }))),
  };
}
