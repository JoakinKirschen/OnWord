/** Specifications: the data shapes and the pure operations on them. */

import { evaluate } from './formula.js';

/**
 * @typedef {{ text: string, formula: string }} Line a measurement line: what was measured and how much
 *
 * @typedef {object} Article
 * @property {string} id
 * @property {string | null} parentId the article it sits under, or null at the top level
 * @property {string} number free-form, e.g. "20.31.10"; siblings are shown in the order of their numbers
 * @property {string} title
 * @property {string} unit e.g. "m²", "st"; empty for articles that are only headings or text
 * @property {string} html the article text
 * @property {string | null} sourceId in a project: the master article it was taken from
 * @property {Line[]} lines
 * @property {number} price unit price
 * @property {boolean} [removed] in a project: taken out, but kept with its changes to be brought back
 *
 * @typedef {object} Spec
 * @property {string} id
 * @property {'master' | 'project'} kind a master is the reference text; a project is built from one
 * @property {string} title
 * @property {string | null} masterId for a project: the master its articles came from
 * @property {string} phase
 * @property {string} lot
 * @property {number} updated
 * @property {boolean} mine whether the current user may change it
 * @property {string} [owner] name of the owner, when it is someone else's
 *
 * @typedef {object} SpecStore every method is asynchronous; see localStore.js and remoteStore.js
 * @property {() => Promise<Spec[]>} list
 * @property {(id: string) => Promise<{ spec: Spec, articles: Article[] } | null>} get
 * @property {(spec: NewSpec) => Promise<Spec>} create
 * @property {(id: string, patch: Partial<Pick<Spec, 'title' | 'phase' | 'lot'>>) => Promise<void>} update
 * @property {(id: string) => Promise<void>} remove
 * @property {(specId: string, article: Article) => Promise<void>} saveArticle creates or replaces
 * @property {(specId: string, articleId: string) => Promise<void>} removeArticle with everything under it
 * @property {() => Promise<import('./prices.js').PriceRecord[]>} prices the price library: the priced articles
 *   of the user's own projects
 * @property {(specId: string) => Promise<import('./offers.js').Offer[]>} offers the contractors' offers for a project
 * @property {(specId: string, offer: import('./offers.js').Offer) => Promise<void>} saveOffer creates or replaces
 * @property {(specId: string, offerId: string) => Promise<void>} removeOffer
 * @property {(specId: string) => Promise<import('./reviews.js').SiteReview[]>} reviews a project's site reviews
 * @property {(specId: string, review: import('./reviews.js').SiteReview) => Promise<void>} saveReview creates or
 *   replaces; photos it no longer refers to are dropped
 * @property {(specId: string, reviewId: string) => Promise<void>} removeReview with its photos
 * @property {(specId: string, reviewId: string) => Promise<Record<string, string>>} photos a review's images
 *   (data URLs) by photo id
 * @property {(specId: string, reviewId: string, photo: { id: string, data: string }) => Promise<void>} savePhoto
 *
 * @typedef {{ kind: 'master' | 'project', title: string, masterId?: string | null, phase?: string, lot?: string,
 *   articleIds?: string[] }} NewSpec `articleIds`: the master articles a new project starts with
 */

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Orders article numbers the way people read them: "2" before "10", "20.4" before "20.31". */
export const compareNumbers = (/** @type {string} */ a, /** @type {string} */ b) => collator.compare(a, b);

/** @param {Partial<Article>} [fields] @returns {Omit<Article, 'id'>} */
export const blankArticle = (fields = {}) => ({
  parentId: null,
  number: '',
  title: '',
  unit: '',
  html: '<p><br></p>',
  sourceId: null,
  lines: [],
  price: 0,
  ...fields,
});

/** The articles directly under `parentId`, in number order. */
export function childrenOf(/** @type {Article[]} */ articles, /** @type {string | null} */ parentId) {
  return articles
    .filter((a) => (a.parentId ?? null) === parentId)
    .sort((a, b) => compareNumbers(a.number, b.number) || compareNumbers(a.title, b.title));
}

/**
 * Every article in reading order with its depth. Articles whose parent is missing are shown at the top
 * level rather than lost.
 * @param {Article[]} articles
 * @returns {{ article: Article, depth: number }[]}
 */
export function outline(articles) {
  const ids = new Set(articles.map((a) => a.id));
  const rooted = articles.map((a) => (a.parentId && !ids.has(a.parentId) ? { ...a, parentId: null } : a));
  const byId = new Map(articles.map((a) => [a.id, a]));
  /** @returns {{ article: Article, depth: number }[]} */
  const walk = (/** @type {string | null} */ parentId, /** @type {number} */ depth) =>
    childrenOf(rooted, parentId).flatMap((a) => [{ article: byId.get(a.id), depth }, ...walk(a.id, depth + 1)]);
  return walk(null, 0);
}

/** The ids of an article and everything under it. */
export function subtree(/** @type {Article[]} */ articles, /** @type {string} */ id) {
  const ids = new Set([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const a of articles) {
      if (a.parentId && ids.has(a.parentId) && !ids.has(a.id)) grew = ids.add(a.id).size > 0;
    }
  }
  return ids;
}

/** A number for a new article under `parentId`: one more than the last sibling's, or the first below the parent. */
export function suggestNumber(/** @type {Article[]} */ articles, /** @type {string | null} */ parentId) {
  const last = childrenOf(articles, parentId).at(-1)?.number;
  const tail = last?.match(/^(.*?)(\d+)$/);
  if (tail) return tail[1] + String(Number(tail[2]) + 1).padStart(tail[2].length, '0');
  const parent = articles.find((a) => a.id === parentId)?.number;
  return parent ? `${parent}.1` : '1';
}

/**
 * Copies the chosen articles of a master for use in a project. Each copy remembers its source, and hangs
 * under the copy of its nearest chosen ancestor so the structure survives gaps in the choice.
 * @param {Article[]} articles the master's articles
 * @param {Iterable<string>} chosenIds
 * @param {() => string} makeId
 * @param {Article[]} [existing] what the project already has: a master article copied before is not copied
 *   again, and new copies hang under the earlier copies of their ancestors
 * @returns {Article[]}
 */
export function copyArticles(articles, chosenIds, makeId, existing = []) {
  /** @type {Map<string, string>} master id → id of its copy */
  const earlier = new Map(existing.filter((a) => a.sourceId).map((a) => [a.sourceId, a.id]));
  const chosen = new Set([...chosenIds].filter((id) => !earlier.has(id)));
  const byId = new Map(articles.map((a) => [a.id, a]));
  const copies = new Map(earlier);
  for (const a of articles) if (chosen.has(a.id)) copies.set(a.id, makeId());
  const nearest = (/** @type {string | null} */ id) => {
    for (let at = byId.get(id); at; at = byId.get(at.parentId)) if (copies.has(at.id)) return copies.get(at.id);
    return null;
  };
  return articles
    .filter((a) => chosen.has(a.id))
    .map((a) => ({ ...a, id: copies.get(a.id), parentId: nearest(a.parentId), sourceId: a.id, lines: [] }));
}

/**
 * What removing articles (with everything under them) from a project does. Articles from the master, and
 * what the user added under one that goes as well, are kept with their changes so that ticking the master
 * article again brings them back; the rest are deleted.
 * @param {Article[]} articles the project's articles in use
 * @param {string[]} ids the articles the user chose to remove
 * @returns {{ gone: Set<string>, kept: Article[], deleted: string[] }} `gone`: every article that leaves
 *   the project; `deleted`: the tops of the parts that are deleted for good
 */
export function planRemoval(articles, ids) {
  const byId = new Map(articles.map((a) => [a.id, a]));
  const gone = new Set(ids.flatMap((id) => [...subtree(articles, id)]));
  // Kept: an article from the master, or one the user added under a master article that goes too, so that
  // it comes back with that article.
  const keep = (/** @type {Article | undefined} */ a) => {
    for (let at = a; at; at = byId.get(at.parentId)) if (at.sourceId) return gone.has(at.id);
    return false;
  };
  const kept = articles.filter((a) => gone.has(a.id) && keep(a));
  const lost = (/** @type {string | null} */ id) => gone.has(id) && !keep(byId.get(id));
  const deleted = articles.filter((a) => lost(a.id) && !lost(a.parentId));
  return { gone, kept, deleted: deleted.map((a) => a.id) };
}

/**
 * Brings master articles into a project. One the project removed before comes back as it was left, with
 * the articles the user added under it; the others are copied. Each hangs under the project's copy of
 * its nearest master ancestor.
 * @param {Article[]} master the master's articles
 * @param {Iterable<string>} chosenIds master ids
 * @param {() => string} makeId
 * @param {{ articles: Article[], removed: Article[] }} project the articles in use and those kept aside
 * @returns {{ restored: Article[], copies: Article[] }}
 */
export function bringIn(master, chosenIds, makeId, { articles, removed }) {
  const chosen = new Set(chosenIds);
  const revived = new Set(removed.filter((a) => a.sourceId && chosen.has(a.sourceId)).map((a) => a.id));
  // The user's own articles under a revived one come back with it.
  let grew = true;
  while (grew) {
    grew = false;
    for (const a of removed) {
      if (a.sourceId || revived.has(a.id) || !revived.has(a.parentId)) continue;
      revived.add(a.id);
      grew = true;
    }
  }
  const restored = removed.filter((a) => revived.has(a.id)).map((a) => ({ ...a, removed: false }));
  const copies = copyArticles(master, chosen, makeId, [...articles, ...restored]);
  const copyOf = new Map(
    [...articles, ...restored, ...copies].filter((a) => a.sourceId).map((a) => [a.sourceId, a.id]),
  );
  const byId = new Map(master.map((a) => [a.id, a]));
  for (const a of restored.filter((r) => r.sourceId)) {
    let parent = byId.get(byId.get(a.sourceId)?.parentId);
    while (parent && !copyOf.has(parent.id)) parent = byId.get(parent.parentId);
    a.parentId = parent ? copyOf.get(parent.id) : null;
  }
  return { restored, copies };
}

/** The measured quantity of an article: the sum of its lines. NaN when a line is not valid arithmetic. */
export const quantityOf = (/** @type {Pick<Article, 'lines'>} */ article) =>
  article.lines.reduce((sum, line) => sum + evaluate(line.formula), 0);

/** Quantity × unit price; 0 while the quantity cannot be computed. */
export function amountOf(/** @type {Article} */ article) {
  const quantity = quantityOf(article);
  return Number.isFinite(quantity) ? quantity * (article.price || 0) : 0;
}

/** Whether a project article no longer says what its master article says. */
export function differsFromSource(/** @type {Article} */ article, /** @type {Article | undefined} */ source) {
  return !!source && (article.html !== source.html || article.title !== source.title || article.unit !== source.unit);
}
