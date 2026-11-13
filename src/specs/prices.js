/** The price library in the workspace: prices from other projects beside an article, and the "Prices" view. */

import { $ } from '../core/dom.js';
import { esc } from '../core/html.js';
import { outline, quantityOf } from '../core/spec/model.js';
import { deviation, expectedPrice, libraryKey, perDoubling, priceStats, suggestedPrice } from '../core/spec/prices.js';
import { money, number } from './templates.js';

const PERCENT = 100;
const NOTABLE = 0.2; // a price this far from what the library suggests is marked
const WHICH = ['expected', 'average', 'latest'];

/** @typedef {import('../core/spec/model.js').Article} Article */
/** @typedef {import('../core/spec/prices.js').PriceStats} PriceStats */

const percent = (/** @type {number} */ fraction) => `${Math.round(Math.abs(fraction) * PERCENT)} %`;
/** A deviation as "+12 %" or "−8 %". */
function signedPercent(/** @type {number} */ fraction) {
  const rounded = Math.round(fraction * PERCENT);
  if (rounded > 0) return `+${rounded} %`;
  return rounded < 0 ? `−${-rounded} %` : '0 %';
}
const plural = (/** @type {number} */ count, /** @type {string} */ word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** How the price moves with the quantity, in words. */
function trendText(/** @type {import('../core/spec/prices.js').PriceCurve} */ curve) {
  const change = perDoubling(curve);
  return `${percent(change)} ${change < 0 ? 'lower' : 'higher'} per doubling of the quantity`;
}

/** The prices behind the statistics, each with the quantity it was given for. */
function recordsHtml(/** @type {PriceStats} */ stats) {
  const rows = stats.records.map(
    (
      r,
    ) => `<tr><td>${esc(r.project)}</td><td class="num">${r.quantity > 0 ? number(r.quantity) : '—'} ${esc(r.unit)}</td>
      <td class="num">${money(r.price)}</td></tr>`,
  );
  return `<details id="priceRecords"><summary>Show the ${plural(stats.count, 'price')}</summary>
    <table class="lines"><thead><tr><th>Project</th><th class="num">Quantity</th><th class="num">Unit price</th></tr></thead>
    <tbody>${rows.join('')}</tbody></table></details>`;
}

/**
 * @typedef {object} PriceTarget the open specification, as the workspace holds it
 * @property {() => import('../core/spec/model.js').Spec | null} spec
 * @property {() => Article[]} articles
 * @property {() => Article | undefined} selected
 * @property {() => boolean} editable
 * @property {(prices: [Article, number][]) => void} setPrices gives articles a new unit price
 *
 * @typedef {object} PriceLibraryDeps
 * @property {import('../core/spec/model.js').SpecStore} specStore
 * @property {import('../core/commands.js').Commands} commands
 * @property {import('../ui/toast.js').Toast} toast
 * @property {PriceTarget} target
 *
 * @param {PriceLibraryDeps} deps
 */
export function createPriceLibrary({ specStore, commands, toast, target }) {
  /** The prices of every project except the open one. @type {import('../core/spec/prices.js').PriceRecord[]} */
  let records = [];

  const statsOf = (/** @type {Article} */ article) =>
    priceStats(records, libraryKey(target.spec(), article), article.unit);
  const suggestionFor = (/** @type {Article} */ article) => suggestedPrice(statsOf(article), quantityOf(article));
  /** The measured articles that have no price yet but for which the library suggests one. */
  const fillable = () =>
    target.editable() ? target.articles().filter((a) => a.unit && !(a.price > 0) && suggestionFor(a) !== null) : [];
  const use = (/** @type {string} */ which, /** @type {string} */ label) =>
    target.editable() ? ` <button class="link-btn" data-act="spec.usePrice" data-arg="${which}">${label}</button>` : '';

  /** What the library expects for this article's quantity, and how prices move with the quantity. */
  function expectedHtml(/** @type {Article} */ article, /** @type {PriceStats} */ stats) {
    if (!stats.curve) return 'Too few measured prices yet to relate the price to the quantity.';
    const quantity = quantityOf(article);
    const expected = expectedPrice(stats, quantity);
    if (!expected)
      return `Prices are ${trendText(stats.curve)}. Measure this article to see the price for its quantity.`;
    const outside = expected.outside ? ' (beyond the quantities priced so far)' : '';
    return `Expected for ${number(quantity)} ${esc(article.unit)}: <b>${money(expected.price)}</b>${outside}
      · ${trendText(stats.curve)}${use('expected', 'Use expected price')}`;
  }

  /** The note under an article's unit price: what the same article cost in other projects, and for how much. */
  function noteHtml(/** @type {Article} */ article) {
    if (!article.unit) return '';
    if (!libraryKey(target.spec(), article))
      return 'Not taken from a master article, so there are no prices from other projects.';
    const stats = statsOf(article);
    const project = target.spec()?.kind === 'project';
    if (!stats) return project ? 'No prices from your other projects yet.' : 'No project has priced this yet.';
    const range = stats.min === stats.max ? money(stats.min) : `${money(stats.min)} – ${money(stats.max)}`;
    return `<p><b>Price library</b> (${plural(stats.projects, 'project')}): ${range} · average ${money(stats.average)}
        · latest ${money(stats.latest)}${use('average', 'Use average')}${use('latest', 'Use latest')}</p>
      <p>${expectedHtml(article, stats)}</p>${recordsHtml(stats)}`;
  }

  function row(/** @type {Article} */ article) {
    const stats = statsOf(article);
    const quantity = quantityOf(article);
    const expected = expectedPrice(stats, quantity);
    const off = deviation(article.price, suggestedPrice(stats, quantity));
    const mark = off !== null && Math.abs(off) >= NOTABLE ? (off > 0 ? ' price-high' : ' price-low') : '';
    const range = !stats
      ? ''
      : stats.min === stats.max
        ? money(stats.min)
        : `${money(stats.min)} – ${money(stats.max)}`;
    return `<tr data-act="spec.select" data-arg="${article.id}" tabindex="0">
      <td>${esc(article.number)}</td><td>${esc(article.title)}</td><td>${esc(article.unit)}</td>
      <td class="num">${number(quantity)}</td><td class="num">${article.price > 0 ? money(article.price) : '—'}</td>
      <td class="num">${stats?.projects ?? 0}</td><td class="num">${range}</td>
      <td class="num">${stats ? money(stats.average) : ''}</td><td class="num">${expected ? money(expected.price) : ''}</td>
      <td class="num${mark}">${off === null ? '' : signedPercent(off)}</td></tr>`;
  }

  commands.register({
    /** Gives the selected article the expected, average or latest price from the library. */
    'spec.usePrice'(which) {
      const article = target.selected();
      const stats = article && statsOf(article);
      if (!stats || !target.editable() || !WHICH.includes(which)) return;
      const price = which === 'expected' ? expectedPrice(stats, quantityOf(article))?.price : stats[which];
      if (price) target.setPrices([[article, price]]);
    },
    /** Gives every measured article without a price what the library suggests for its quantity. */
    'spec.fillPrices'() {
      const filled = fillable().map((a) => /** @type {[Article, number]} */ ([a, suggestionFor(a)]));
      target.setPrices(filled);
      toast(`${plural(filled.length, 'price')} filled in from the price library.`);
    },
  });

  return {
    /** Fetches the prices of the user's projects, leaving out the open one, which has its own. */
    async load() {
      const own = target.spec()?.id;
      try {
        records = (await specStore.prices()).filter((r) => r.specId !== own);
      } catch {
        records = [];
        toast('The price library could not be loaded.');
      }
    },

    noteHtml,

    /** Redraws the note after the article changed (its quantity, its unit), keeping the price list open. */
    drawNote(/** @type {HTMLElement} */ container, /** @type {Article} */ article) {
      const open = $('#priceRecords', container)?.open;
      container.innerHTML = noteHtml(article);
      if (open) $('#priceRecords', container).open = true;
    },

    /** The "Prices" view: every measured article's price beside the library's. */
    viewHtml() {
      const rows = outline(target.articles())
        .map(({ article }) => article)
        .filter((a) => a.unit);
      if (!rows.length) return '<p class="spec-empty">Give an article a unit to give it a price.</p>';
      const missing = fillable().length;
      const fill = missing
        ? `<button class="btn" data-act="spec.fillPrices">Fill in ${plural(missing, 'missing price')}</button>`
        : '';
      const others = target.spec()?.kind === 'project' ? 'your other projects' : 'your projects';
      return `<div class="quantities-head"><h2>Price library</h2>${fill}</div>
        <p class="spec-hint">Unit prices given to the same master article in ${others}, for the same unit.
          Larger quantities usually get lower prices, so “Expected” is what those prices suggest for this
          quantity; the comparison uses it where there is one, and the average otherwise.</p>
        <table class="quantities"><thead><tr><th>Number</th><th>Article</th><th>Unit</th><th class="num">Quantity</th>
          <th class="num">Unit price</th><th class="num">Projects</th><th class="num">Range</th><th class="num">Average</th>
          <th class="num">Expected</th><th class="num">vs library</th></tr></thead>
        <tbody>${rows.map(row).join('')}</tbody></table>`;
    },
  };
}

/** @typedef {ReturnType<typeof createPriceLibrary>} PriceLibrary */
