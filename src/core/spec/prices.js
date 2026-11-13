/** The price library: unit prices of the same master article across projects, and what is derived from them. */

/**
 * @typedef {object} PriceRecord a unit price that a project gave an article taken from a master
 * @property {string} sourceId the master article
 * @property {string} specId the project
 * @property {string} project the project's title
 * @property {string} unit the unit the price is for
 * @property {number} price
 * @property {number} updated when the project last changed
 *
 * @typedef {object} PriceStats
 * @property {number} count how many prices
 * @property {number} projects how many projects they come from
 * @property {number} min
 * @property {number} max
 * @property {number} average
 * @property {number} latest the price of the most recently changed project
 */

const CENTS = 100;

/** A price rounded to cents, as it is stored and shown. */
export const roundPrice = (/** @type {number} */ value) => Math.round(value * CENTS) / CENTS;

/** Units match regardless of case and surrounding space: "M2" and "m2 " are the same unit. */
const sameUnit = (/** @type {string} */ a, /** @type {string} */ b) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Which master article an article's prices are filed under: in a master the article itself, in a project
 * the master article it was taken from. Null for a project article that was not taken from a master.
 * @param {import('./model.js').Spec} spec
 * @param {import('./model.js').Article} article
 */
export const libraryKey = (spec, article) => (spec.kind === 'master' ? article.id : article.sourceId);

/**
 * Every priced article of every project that was taken from a master. The server answers the same with
 * one query; this is the version for specifications kept in the browser.
 * @param {import('./model.js').Spec[]} specs
 * @param {Record<string, import('./model.js').Article[]>} articlesBySpec
 * @returns {PriceRecord[]}
 */
export function collectPrices(specs, articlesBySpec) {
  return specs
    .filter((spec) => spec.kind === 'project')
    .flatMap((spec) =>
      (articlesBySpec[spec.id] ?? [])
        .filter((a) => a.sourceId && a.price > 0)
        .map((a) => ({
          sourceId: a.sourceId,
          specId: spec.id,
          project: spec.title,
          unit: a.unit,
          price: a.price,
          updated: spec.updated,
        })),
    );
}

/**
 * The statistics of the prices filed under `key` for `unit`; prices for another unit are not comparable
 * and are left out. Null when there are none.
 * @param {PriceRecord[]} records
 * @param {string | null} key
 * @param {string} unit
 * @returns {PriceStats | null}
 */
export function priceStats(records, key, unit) {
  const matching = records.filter((r) => key && r.sourceId === key && sameUnit(r.unit, unit));
  if (!matching.length) return null;
  const prices = matching.map((r) => r.price);
  const newest = matching.reduce((a, b) => (b.updated > a.updated ? b : a));
  return {
    count: prices.length,
    projects: new Set(matching.map((r) => r.specId)).size,
    min: Math.min(...prices),
    max: Math.max(...prices),
    average: roundPrice(prices.reduce((sum, p) => sum + p, 0) / prices.length),
    latest: newest.price,
  };
}

/** How far `price` lies from the average, as a fraction (0.1 is 10 % above); null without both. */
export function deviation(/** @type {number} */ price, /** @type {PriceStats | null} */ stats) {
  return price > 0 && stats?.average ? price / stats.average - 1 : null;
}
