/** The price library in the workspace: prices from other projects beside an article, and the "Prices" view. */

import { esc } from '../core/html.js';
import { outline } from '../core/spec/model.js';
import { deviation, libraryKey, priceStats } from '../core/spec/prices.js';
import { money } from './templates.js';

const PERCENT = 100;
const NOTABLE = 0.2; // a price this far from the average is marked
const WHICH = ['average', 'latest', 'min', 'max'];

/** @typedef {import('../core/spec/model.js').Article} Article */

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
  /** The measured articles that have no price yet but do have prices in the library. */
  const fillable = () =>
    target.editable() ? target.articles().filter((a) => a.unit && !(a.price > 0) && statsOf(a)) : [];

  function row(/** @type {Article} */ article) {
    const stats = statsOf(article);
    const off = deviation(article.price, stats);
    const mark = off !== null && Math.abs(off) >= NOTABLE ? (off > 0 ? ' price-high' : ' price-low') : '';
    const cell = (/** @type {'min' | 'average' | 'max'} */ key) =>
      `<td class="num">${stats ? money(stats[key]) : ''}</td>`;
    return `<tr data-act="spec.select" data-arg="${article.id}" tabindex="0">
      <td>${esc(article.number)}</td><td>${esc(article.title)}</td><td>${esc(article.unit)}</td>
      <td class="num">${article.price > 0 ? money(article.price) : '—'}</td><td class="num">${stats?.projects ?? 0}</td>
      ${cell('min')}${cell('average')}${cell('max')}
      <td class="num${mark}">${off === null ? '' : `${off > 0 ? '+' : ''}${Math.round(off * PERCENT)} %`}</td></tr>`;
  }

  commands.register({
    /** Gives the selected article the average, latest, lowest or highest price from the library. */
    'spec.usePrice'(which) {
      const article = target.selected();
      const stats = article && statsOf(article);
      if (stats && target.editable() && WHICH.includes(which)) target.setPrices([[article, stats[which]]]);
    },
    /** Gives every measured article without a price the library's average. */
    'spec.fillPrices'() {
      const filled = fillable().map((a) => /** @type {[Article, number]} */ ([a, statsOf(a).average]));
      target.setPrices(filled);
      toast(`${filled.length} ${filled.length === 1 ? 'price' : 'prices'} filled in from the price library.`);
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

    /** The note under an article's unit price: what the same article costs in other projects. */
    noteHtml(/** @type {Article} */ article) {
      if (!article.unit) return '';
      const project = target.spec()?.kind === 'project';
      if (!libraryKey(target.spec(), article))
        return 'Not taken from a master article, so there are no prices from other projects.';
      const stats = statsOf(article);
      if (!stats) return project ? 'No prices from your other projects yet.' : 'No project has priced this yet.';
      const range = stats.min === stats.max ? money(stats.min) : `${money(stats.min)} – ${money(stats.max)}`;
      const from = `${stats.projects} ${stats.projects === 1 ? 'project' : 'projects'}`;
      const use = target.editable()
        ? ` <button class="link-btn" data-act="spec.usePrice" data-arg="average">Use average</button>
          <button class="link-btn" data-act="spec.usePrice" data-arg="latest">Use latest</button>`
        : '';
      return `<b>Price library</b> (${from}): ${range} · average ${money(stats.average)} · latest ${money(stats.latest)}${use}`;
    },

    /** The "Prices" view: every measured article's price beside the library's. */
    viewHtml() {
      const rows = outline(target.articles())
        .map(({ article }) => article)
        .filter((a) => a.unit);
      if (!rows.length) return '<p class="spec-empty">Give an article a unit to give it a price.</p>';
      const missing = fillable().length;
      const fill = missing
        ? `<button class="btn" data-act="spec.fillPrices">Fill in ${missing} missing ${missing === 1 ? 'price' : 'prices'}</button>`
        : '';
      const others = target.spec()?.kind === 'project' ? 'your other projects' : 'your projects';
      return `<div class="quantities-head"><h2>Price library</h2>${fill}</div>
        <p class="spec-hint">Unit prices given to the same master article in ${others}, for the same unit.</p>
        <table class="quantities"><thead><tr><th>Number</th><th>Article</th><th>Unit</th><th class="num">Unit price</th>
          <th class="num">Projects</th><th class="num">Lowest</th><th class="num">Average</th><th class="num">Highest</th>
          <th class="num">vs average</th></tr></thead>
        <tbody>${rows.map(row).join('')}</tbody></table>`;
    },
  };
}

/** @typedef {ReturnType<typeof createPriceLibrary>} PriceLibrary */
