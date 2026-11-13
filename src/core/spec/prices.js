/**
 * The price library: unit prices of the same master article across projects, each with the quantity it was
 * given for, and what is derived from them. Larger quantities usually get lower unit prices, so the library
 * fits a curve through the prices and reads off what to expect for a given quantity.
 */

import { quantityOf } from './model.js';

/**
 * @typedef {object} PriceRecord a unit price that a project gave an article taken from a master
 * @property {string} sourceId the master article
 * @property {string} specId the project
 * @property {string} project the project's title
 * @property {string} unit the unit the price is for
 * @property {number} price
 * @property {number} quantity the measured quantity it was given for; 0 or NaN when not measured
 * @property {number} updated when the project last changed
 *
 * @typedef {object} PriceCurve unit price = factor × quantity ^ exponent, fitted through the measured prices
 * @property {number} factor
 * @property {number} exponent below 0 when larger quantities get lower prices
 * @property {number} lowQuantity the range of quantities the curve was fitted on
 * @property {number} highQuantity
 *
 * @typedef {object} PriceStats
 * @property {PriceRecord[]} records the prices themselves, largest quantity first
 * @property {number} count how many prices
 * @property {number} projects how many projects they come from
 * @property {number} min
 * @property {number} max
 * @property {number} average
 * @property {number} latest the price of the most recently changed project
 * @property {PriceCurve | null} curve null with fewer than two different measured quantities
 */

const CENTS = 100;

/** A price rounded to cents, as it is stored and shown. */
export const roundPrice = (/** @type {number} */ value) => Math.round(value * CENTS) / CENTS;

/** Units match regardless of case and surrounding space: "M2" and "m2 " are the same unit. */
const sameUnit = (/** @type {string} */ a, /** @type {string} */ b) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

const measured = (/** @type {number} */ quantity) => Number.isFinite(quantity) && quantity > 0;

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
          quantity: quantityOf(a),
          updated: spec.updated,
        })),
    );
}

/**
 * The power curve through the measured prices, by least squares on their logarithms: a straight line
 * there is a constant percentage change in price each time the quantity doubles.
 * @param {PriceRecord[]} records
 * @returns {PriceCurve | null}
 */
export function fitCurve(records) {
  const points = records.filter((r) => measured(r.quantity)).map((r) => [Math.log(r.quantity), Math.log(r.price)]);
  const xs = points.map(([x]) => x);
  if (new Set(xs).size < 2) return null;
  const meanX = xs.reduce((s, x) => s + x, 0) / points.length;
  const meanY = points.reduce((s, [, y]) => s + y, 0) / points.length;
  const spread = points.reduce((s, [x]) => s + (x - meanX) ** 2, 0);
  const exponent = points.reduce((s, [x, y]) => s + (x - meanX) * (y - meanY), 0) / spread;
  return {
    factor: Math.exp(meanY - exponent * meanX),
    exponent,
    lowQuantity: Math.exp(Math.min(...xs)),
    highQuantity: Math.exp(Math.max(...xs)),
  };
}

/** How much the price changes each time the quantity doubles, as a fraction (-0.1 is 10 % lower). */
export const perDoubling = (/** @type {PriceCurve} */ curve) => 2 ** curve.exponent - 1;

/**
 * The unit price to expect for `quantity`. Beyond the quantities the curve was fitted on it is held at the
 * nearest end rather than extrapolated, so one cheap large project cannot predict an absurd price.
 * @param {PriceStats | null} stats
 * @param {number} quantity
 * @returns {{ price: number, outside: boolean } | null} `outside`: the quantity lies beyond those seen
 */
export function expectedPrice(stats, quantity) {
  const curve = stats?.curve;
  if (!curve || !measured(quantity)) return null;
  const within = Math.min(Math.max(quantity, curve.lowQuantity), curve.highQuantity);
  return { price: roundPrice(curve.factor * within ** curve.exponent), outside: within !== quantity };
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
    records: [...matching].sort(
      (a, b) => (measured(b.quantity) ? b.quantity : 0) - (measured(a.quantity) ? a.quantity : 0),
    ),
    count: prices.length,
    projects: new Set(matching.map((r) => r.specId)).size,
    min: Math.min(...prices),
    max: Math.max(...prices),
    average: roundPrice(prices.reduce((sum, p) => sum + p, 0) / prices.length),
    latest: newest.price,
    curve: fitCurve(matching),
  };
}

/**
 * What the library suggests for an article with this quantity: the expected price where the curve gives
 * one, otherwise the average.
 * @param {PriceStats | null} stats
 * @param {number} quantity
 */
export const suggestedPrice = (stats, quantity) => expectedPrice(stats, quantity)?.price ?? stats?.average ?? null;

/** How far `price` lies from `reference`, as a fraction (0.1 is 10 % above); null without both. */
export function deviation(/** @type {number} */ price, /** @type {number | null} */ reference) {
  return price > 0 && reference ? price / reference - 1 : null;
}
