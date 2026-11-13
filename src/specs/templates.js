/** Markup for the specification workspace: the article tree, the article form and the bill of quantities. */

import { esc } from '../core/html.js';
import { evaluate } from '../core/spec/formula.js';
import { amountOf, differsFromSource, outline, quantityOf } from '../core/spec/model.js';
import { quantityRows, totalAmount } from '../core/spec/output.js';

const INDENT = 16; // pixels per level in the tree
const FORMATS = [
  ['bold', 'B', 'Bold'],
  ['italic', 'I', 'Italic'],
  ['underline', 'U', 'Underline'],
  ['insertUnorderedList', '•', 'Bulleted list'],
  ['insertOrderedList', '1.', 'Numbered list'],
];

/** A quantity or price for display; "—" when it cannot be computed. */
export const number = (/** @type {number} */ value, digits = 3) =>
  Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : '—';
export const money = (/** @type {number} */ value) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** @typedef {import('../core/spec/model.js').Article} Article */

/**
 * The article tree. `filter` keeps only articles whose number or title contains it.
 * @param {Article[]} articles
 * @param {{ selectedId: string | null, filter: string, sources: Map<string, Article> }} view
 */
export function treeHtml(articles, { selectedId, filter, sources }) {
  const needle = filter.trim().toLowerCase();
  const rows = outline(articles)
    .filter(({ article }) => !needle || `${article.number} ${article.title}`.toLowerCase().includes(needle))
    .map(({ article, depth }) => {
      const changed = differsFromSource(article, sources.get(article.sourceId));
      const current = article.id === selectedId ? ' aria-current="true"' : '';
      return `<button class="tree-item" data-act="spec.select" data-arg="${article.id}"${current} style="padding-left: ${8 + (needle ? 0 : depth) * INDENT}px">
        <span class="tree-number">${esc(article.number)}</span><span class="tree-title">${esc(article.title) || '<i>Untitled</i>'}</span>
        ${changed ? '<span class="tree-flag" title="Differs from the master specification">●</span>' : ''}</button>`;
    });
  if (rows.length) return rows.join('');
  return `<p class="spec-empty">${needle ? 'No article matches.' : 'No articles yet. Add the first one.'}</p>`;
}

function lineRow(
  /** @type {import('../core/spec/model.js').Line} */ line,
  /** @type {number} */ index,
  /** @type {string} */ off,
) {
  return `<tr><td><input data-line="${index}" data-part="text" value="${esc(line.text)}" aria-label="Description"${off}></td>
    <td><input data-line="${index}" data-part="formula" value="${esc(line.formula)}" aria-label="Formula" placeholder="e.g. 2 * 3,5"${off}></td>
    <td class="num" data-result="${index}">${number(evaluate(line.formula))}</td>
    <td><button class="icon-btn sm" data-act="spec.removeLine" data-arg="${index}" title="Remove line" aria-label="Remove line"${off}>×</button></td></tr>`;
}

/** The measurement table body, on its own so it can be redrawn when a line is added or removed. */
export const linesHtml = (/** @type {Article} */ article, /** @type {boolean} */ editable) =>
  article.lines.map((line, i) => lineRow(line, i, editable ? '' : ' disabled')).join('') ||
  '<tr><td colspan="4" class="spec-empty">No measurement lines.</td></tr>';

/** Quantity, unit and amount of an article, as shown under its measurement lines. */
export function totalsText(/** @type {Article} */ article) {
  return { quantity: `${number(quantityOf(article))} ${article.unit}`.trim(), amount: money(amountOf(article)) };
}

/** The note that says a project article came from the master, and whether it still matches. */
export function sourceHtml(
  /** @type {Article} */ article,
  /** @type {Article | undefined} */ source,
  /** @type {boolean} */ editable,
) {
  if (!article.sourceId) return '';
  if (!source) return 'Taken from a master article that no longer exists.';
  if (!differsFromSource(article, source)) return 'Same as the master specification.';
  const reset = editable
    ? ' <button class="link-btn" data-act="spec.resetArticle">Reset to the master text</button>'
    : '';
  return `<b>Differs from the master specification.</b>${reset}`;
}

/**
 * The form for one article.
 * @param {Article} article
 * @param {{ editable: boolean, source: Article | undefined }} options
 */
export function articleHtml(article, { editable, source }) {
  const off = editable ? '' : ' disabled';
  const field = (/** @type {string} */ name, /** @type {string} */ label, /** @type {string} */ extra = '') =>
    `<label class="field-${name}">${label}<input data-field="${name}" value="${esc(String(article[name]))}"${extra}${off}></label>`;
  const totals = totalsText(article);
  return `<div class="article-fields">${field('number', 'Number')}${field('title', 'Title')}${field('unit', 'Unit', ' list="units" placeholder="m², st, …"')}</div>
    <p id="articleSource" class="article-source">${sourceHtml(article, source, editable)}</p>
    <div class="article-tools" ${editable ? '' : 'hidden'}>${FORMATS.map(([command, glyph, label]) => `<button class="tb" data-format="${command}" title="${label}" aria-label="${label}">${glyph}</button>`).join('')}</div>
    <div id="articleText" class="article-text" contenteditable="${editable}" role="textbox" aria-multiline="true" aria-label="Article text">${article.html}</div>
    <h3>Measurement</h3>
    <table class="lines"><thead><tr><th>Description</th><th>Formula</th><th class="num">Quantity</th><th></th></tr></thead>
      <tbody id="articleLines">${linesHtml(article, editable)}</tbody></table>
    <div class="article-totals">
      <button class="btn sm" data-act="spec.addLine"${off}>+ Line</button><span class="spacer"></span>
      <span>Quantity <b id="articleQuantity">${totals.quantity}</b></span>
      <label>Unit price<input data-field="price" type="number" min="0" step="0.01" value="${article.price || ''}"${off}></label>
      <span>Amount <b id="articleAmount">${totals.amount}</b></span>
    </div>
    <div class="article-actions" ${editable ? '' : 'hidden'}>
      <button class="btn sm" data-act="spec.addArticle" data-arg="child">+ Sub-article</button><span class="spacer"></span>
      <button class="btn sm danger-text" data-act="spec.deleteArticle">Delete article</button>
    </div>`;
}

/** The bill of quantities: every measured article with its quantity, price and amount. */
export function quantitiesHtml(/** @type {Article[]} */ articles) {
  const rows = quantityRows(articles);
  if (!rows.length)
    return '<p class="spec-empty">Give an article a unit to make it part of the bill of quantities.</p>';
  const body = rows.map(
    ({ article, quantity, amount }) => `<tr data-act="spec.select" data-arg="${article.id}" tabindex="0">
      <td>${esc(article.number)}</td><td>${esc(article.title)}</td><td>${esc(article.unit)}</td>
      <td class="num">${number(quantity)}</td><td class="num">${money(article.price || 0)}</td><td class="num">${money(amount)}</td></tr>`,
  );
  return `<div class="quantities-head"><h2>Bill of quantities</h2><button class="btn" data-act="spec.exportCsv">Download for Excel (.csv)</button></div>
    <table class="quantities"><thead><tr><th>Number</th><th>Article</th><th>Unit</th><th class="num">Quantity</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead>
    <tbody>${body.join('')}</tbody>
    <tfoot><tr><td colspan="5">Total</td><td class="num" id="quantitiesTotal">${money(totalAmount(rows))}</td></tr></tfoot></table>`;
}
