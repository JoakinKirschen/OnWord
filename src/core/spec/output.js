/** What a specification is turned into: a document, and a bill of quantities for a spreadsheet. */

import { esc } from '../html.js';
import { amountOf, outline, quantityOf } from './model.js';

const FIRST_HEADING = 2; // <h1> is the title of the document
const LAST_HEADING = 5;
const BOM = String.fromCharCode(0xfeff); // tells Excel the file is UTF-8
const SEPARATOR = ';'; // what Excel expects where the decimal sign is a comma
const COLUMNS = ['Number', 'Article', 'Unit', 'Quantity', 'Unit price', 'Amount'];

/**
 * A specification as document content: its articles in order, each under a heading of its level.
 * @param {import('./model.js').Spec} spec
 * @param {import('./model.js').Article[]} articles
 */
export function specToHtml(spec, articles) {
  const details = [spec.phase && `Phase: ${spec.phase}`, spec.lot && `Lot: ${spec.lot}`].filter(Boolean).join(' · ');
  const body = outline(articles).map(({ article, depth }) => {
    const level = Math.min(FIRST_HEADING + depth, LAST_HEADING);
    const heading = [article.number, article.title].filter(Boolean).join(' ');
    const text = article.html === '<p><br></p>' ? '' : article.html;
    return `<h${level}>${esc(heading)}</h${level}>${text}`;
  });
  return `<h1>${esc(spec.title)}</h1>${details ? `<p class="subtitle">${esc(details)}</p>` : ''}${body.join('')}`;
}

/** The rows of the bill of quantities: the articles that are measured, i.e. have a unit. */
export function quantityRows(/** @type {import('./model.js').Article[]} */ articles) {
  return outline(articles)
    .map(({ article }) => article)
    .filter((article) => article.unit)
    .map((article) => ({ article, quantity: quantityOf(article), amount: amountOf(article) }));
}

/** @param {ReturnType<typeof quantityRows>} rows */
export const totalAmount = (rows) => rows.reduce((sum, row) => sum + row.amount, 0);

/**
 * The bill of quantities as CSV that opens directly in Excel.
 * @param {import('./model.js').Article[]} articles
 */
export function quantitiesCsv(articles) {
  const number = (/** @type {number} */ value) => (Number.isFinite(value) ? String(value).replace('.', ',') : '');
  const cell = (/** @type {string} */ value) => (/[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const rows = quantityRows(articles);
  const lines = rows.map(({ article, quantity, amount }) =>
    [article.number, article.title, article.unit, number(quantity), number(article.price), number(amount)].map(cell),
  );
  lines.push(['', 'Total', '', '', '', number(totalAmount(rows))]);
  return BOM + [COLUMNS, ...lines].map((line) => line.join(SEPARATOR)).join('\r\n') + '\r\n';
}
