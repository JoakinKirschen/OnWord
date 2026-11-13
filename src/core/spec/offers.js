/**
 * Offers: the bills of quantities that contractors fill in with their prices and send back. Reading the
 * lines from a spreadsheet, matching them to the project's articles, and comparing the offers.
 */

import { quantityOf } from './model.js';

/**
 * @typedef {object} OfferLine one priced line as read from a contractor's file
 * @property {string} number
 * @property {string} title
 * @property {string} unit
 * @property {number} quantity the contractor's quantity; NaN when the file has none
 * @property {number} price the unit price
 * @property {string} [articleId] the article it belongs to, when the reader already knows (the AI reader)
 *
 * @typedef {{ price: number, quantity: number }} OfferPrice
 *
 * @typedef {object} Offer one contractor's offer for a project
 * @property {string} id
 * @property {string} contractor
 * @property {number} date when it was imported
 * @property {Record<string, OfferPrice>} prices by article id
 * @property {OfferLine[]} unmatched priced lines that matched no article
 *
 * @typedef {'number' | 'title' | 'unit' | 'quantity' | 'price' | 'amount'} Field
 * @typedef {Partial<Record<Field, number>>} Columns the column index of each field found
 */

export const FIELDS = /** @type {Field[]} */ (['number', 'title', 'unit', 'quantity', 'price', 'amount']);
const HEADER_ROWS = 30; // how far down a sheet the column headings are looked for
const QUANTITY_TOLERANCE = 0.01; // a contractor's quantity this close to ours counts as the same

/** Headings in Dutch, French and English; tried in this order, so "unit price" is a price, not a unit. */
const HEADINGS = /** @type {[Field, RegExp][]} */ ([
  ['amount', /^(totaal|totaalprijs|totaal bedrag|bedrag|amount|total|prix total|montant)$/],
  ['price', /eenheidsprijs|unit ?price|prix unitaire|^(ep|pu|prijs|price|prix)$/],
  ['quantity', /hoeveelheid|quantit|^(hoev|qty|aantal|qt|vh)$/],
  ['unit', /maateenheid|^(eenheid|eh|ehd|me|unit|unite)$/],
  ['number', /^(nr|no|n°|nummer|number|post|postnr|art|artnr|artikelnr|artikel ?nr|code|ref|num)$/],
  ['title', /omschrijving|beschrijving|description|designation|libelle|^(artikel|article|titel|title)$/],
]);

/** Text compared case- and accent-insensitively, without dots and runs of space. */
const plain = (/** @type {unknown} */ value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** An article number compared without case, spaces and a trailing dot: "1.1." is "1.1", but not "11". */
const articleNumber = (/** @type {unknown} */ value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\.+$/, '');

/**
 * A number from a cell. Text may use a decimal comma ("12,50"), thousands separators ("1.234,56" or
 * "1,234.56") and a currency sign. A single dot is read as a decimal point. NaN when it is not a number.
 * @param {unknown} value
 */
export function parseAmount(value) {
  if (typeof value === 'number') return value;
  let text = String(value ?? '').replace(/[€$£\s\u00a0]/g, '');
  if (!text) return NaN;
  const comma = text.lastIndexOf(','),
    dot = text.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) text = comma > dot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  else if (comma >= 0) text = text.replace(/,/g, '.');
  else if ((text.match(/\./g) ?? []).length > 1) text = text.replace(/\./g, '');
  return /^-?\d*\.?\d+$/.test(text) ? Number(text) : NaN;
}

/** Which field a heading names, if any. */
export const headingField = (/** @type {unknown} */ heading) =>
  HEADINGS.find(([, pattern]) => pattern.test(plain(heading)))?.[0];

/** The fields that a row of headings names, by column. */
export function columnsOf(/** @type {import('../xlsx.js').Cell[]} */ row) {
  /** @type {Columns} */
  const columns = {};
  row.forEach((cell, i) => {
    const field = headingField(cell);
    if (field && columns[field] === undefined) columns[field] = i;
  });
  return columns;
}

/**
 * Finds the row of column headings: the one among the first rows that names the most fields, and at
 * least a price (or amount) and a number or title. Null when there is none.
 * @param {import('../xlsx.js').Cell[][]} rows
 * @returns {{ header: number, columns: Columns } | null}
 */
export function detectColumns(rows) {
  let best = null;
  rows.slice(0, HEADER_ROWS).forEach((row, header) => {
    const columns = columnsOf(row);
    const usable = (columns.price ?? columns.amount) !== undefined && (columns.number ?? columns.title) !== undefined;
    if (usable && (!best || Object.keys(columns).length > Object.keys(best.columns).length)) best = { header, columns };
  });
  return best;
}

/**
 * The priced lines below the headings. A line without a unit price but with an amount and a quantity gets
 * amount ÷ quantity. Lines without a price, and total lines, are left out.
 * @param {import('../xlsx.js').Cell[][]} rows
 * @param {{ header: number, columns: Columns }} layout
 * @returns {OfferLine[]}
 */
export function readLines(rows, { header, columns }) {
  const cell = (/** @type {import('../xlsx.js').Cell[]} */ row, /** @type {Field} */ field) =>
    columns[field] === undefined ? '' : (row[columns[field]] ?? '');
  return rows.slice(header + 1).flatMap((row) => {
    const number = String(cell(row, 'number')).trim();
    const title = String(cell(row, 'title')).trim();
    const quantity = parseAmount(cell(row, 'quantity'));
    let price = parseAmount(cell(row, 'price'));
    if (!(price > 0) && quantity > 0) price = parseAmount(cell(row, 'amount')) / quantity;
    if (!(price > 0) || (!number && !title) || (!number && /^(sub)?tota/.test(plain(title)))) return [];
    return [{ number, title, unit: String(cell(row, 'unit')).trim(), quantity, price: Math.round(price * 100) / 100 }];
  });
}

/**
 * Assigns lines to articles: by the id the reader gave, else by article number, else by a title that only
 * one article has. Each article takes the first line that matches it.
 * @param {OfferLine[]} lines
 * @param {import('./model.js').Article[]} articles
 * @returns {Pick<Offer, 'prices' | 'unmatched'>}
 */
export function matchLines(lines, articles) {
  const ids = new Set(articles.map((a) => a.id));
  const byNumber = new Map(articles.filter((a) => a.number).map((a) => [articleNumber(a.number), a.id]));
  const titles = articles.map((a) => plain(a.title));
  const byTitle = new Map(
    articles
      .filter((a, i) => a.title && titles.indexOf(titles[i]) === titles.lastIndexOf(titles[i]))
      .map((a) => [plain(a.title), a.id]),
  );
  /** @type {Record<string, OfferPrice>} */
  const prices = {};
  /** @type {OfferLine[]} */
  const unmatched = [];
  for (const line of lines) {
    const id = [
      line.articleId && ids.has(line.articleId) ? line.articleId : '',
      byNumber.get(articleNumber(line.number)),
      byTitle.get(plain(line.title)),
    ].find(Boolean);
    if (id && !prices[id]) prices[id] = { price: line.price, quantity: line.quantity };
    else unmatched.push(line);
  }
  return { prices, unmatched };
}

/**
 * The comparison of offers: per measured article each offer's price and amount for the project's own
 * quantity, which offer is cheapest, and per offer the total and how many prices it lacks.
 * @param {import('./model.js').Article[]} articles measured articles, in the order to show them
 * @param {Offer[]} offers
 */
export function compareOffers(articles, offers) {
  const rows = articles.map((article) => {
    const quantity = quantityOf(article);
    const cells = offers.map((offer) => {
      const quoted = offer.prices[article.id];
      if (!quoted) return null;
      const differs =
        Number.isFinite(quoted.quantity) &&
        quoted.quantity > 0 &&
        Number.isFinite(quantity) &&
        Math.abs(quoted.quantity - quantity) > QUANTITY_TOLERANCE * Math.max(quantity, 1);
      return {
        price: quoted.price,
        amount: Number.isFinite(quantity) ? quantity * quoted.price : 0,
        theirQuantity: differs ? quoted.quantity : null,
      };
    });
    const priced = cells.filter(Boolean).map((c) => c.price);
    return { article, quantity, cells, lowest: priced.length > 1 ? Math.min(...priced) : null };
  });
  const totals = offers.map((_, i) => ({
    amount: rows.reduce((sum, row) => sum + (row.cells[i]?.amount ?? 0), 0),
    missing: rows.filter((row) => !row.cells[i]).length,
  }));
  const complete = totals.filter((t) => !t.missing).map((t) => t.amount);
  return { rows, totals, lowestTotal: complete.length > 1 ? Math.min(...complete) : null };
}
