/** The "Offers" view of a project: the contractors' prices side by side, per article and in total. */

import { esc } from '../core/html.js';
import { amountOf, outline } from '../core/spec/model.js';
import { compareOffers } from '../core/spec/offers.js';
import { initOfferImport } from './offerImport.js';
import { money, number } from './templates.js';

const date = (/** @type {number} */ ms) => new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short' });

/** @typedef {import('../core/spec/offers.js').Offer} Offer */
/** @typedef {import('../core/spec/model.js').Article} Article */

/** The lines of an offer that matched no article, so nothing is lost without the user seeing it. */
function unmatchedHtml(/** @type {Offer} */ offer) {
  if (!offer.unmatched.length) return '';
  const rows = offer.unmatched.map(
    (line) => `<tr><td>${esc(line.number)}</td><td>${esc(line.title)}</td><td>${esc(line.unit)}</td>
      <td class="num">${number(line.quantity)}</td><td class="num">${money(line.price)}</td></tr>`,
  );
  return `<details class="offer-unmatched"><summary>${esc(offer.contractor)}: ${offer.unmatched.length} lines not matched to an article</summary>
    <table class="lines"><tbody>${rows.join('')}</tbody></table></details>`;
}

/**
 * @typedef {object} OffersDeps
 * @property {import('../core/spec/model.js').SpecStore} specStore
 * @property {import('../core/commands.js').Commands} commands
 * @property {import('../ui/toast.js').Toast} toast
 * @property {import('./prices.js').PriceTarget} target
 * @property {HTMLDialogElement} dialog the import dialog
 * @property {HTMLInputElement} input the file chooser
 * @property {import('../core/spec/aiReader.js').AiReader | null} aiReader
 * @property {() => Promise<void>} save
 *
 * @param {OffersDeps} deps
 */
export function createOffers({ specStore, commands, toast, target, dialog, input, aiReader, save }) {
  /** @type {Offer[]} */
  let offers = [];

  initOfferImport({
    dialog,
    input,
    aiReader,
    commands,
    toast,
    save,
    spec: target.spec,
    articles: target.articles,
    async onImport(offer) {
      try {
        await specStore.saveOffer(target.spec().id, offer);
      } catch (err) {
        return toast(/** @type {Error} */ (err).message || 'The offer could not be saved.');
      }
      offers.push(offer);
      commands.run('spec.view', 'offers');
      toast(`Offer of ${offer.contractor} imported: ${Object.keys(offer.prices).length} prices.`);
    },
  });

  function cellHtml(
    /** @type {ReturnType<typeof compareOffers>['rows'][number]['cells'][number]} */ cell,
    /** @type {number | null} */ lowest,
  ) {
    if (!cell) return '<td class="num offer-missing">—</td>';
    const low = cell.price === lowest ? ' offer-low' : '';
    const quantity =
      cell.theirQuantity === null
        ? ''
        : ` <span class="offer-qty" title="Quantity in the offer: ${number(cell.theirQuantity)}">≠</span>`;
    return `<td class="num${low}" title="Amount ${money(cell.amount)}">${money(cell.price)}${quantity}</td>`;
  }

  function tableHtml() {
    const measured = outline(target.articles())
      .map(({ article }) => article)
      .filter((a) => a.unit);
    const { rows, totals, lowestTotal } = compareOffers(measured, offers);
    const heads = offers.map(
      (offer) => `<th class="num offer-head"><b>${esc(offer.contractor)}</b><small>${date(offer.date)}</small>
        <span><button class="link-btn" data-act="spec.useOffer" data-arg="${offer.id}">Use prices</button>
        <button class="icon-btn sm" data-act="spec.removeOffer" data-arg="${offer.id}" title="Remove this offer" aria-label="Remove the offer of ${esc(offer.contractor)}">×</button></span></th>`,
    );
    const body = rows.map(
      ({ article, quantity, cells, lowest }) => `<tr data-act="spec.select" data-arg="${article.id}" tabindex="0">
        <td>${esc(article.number)}</td><td>${esc(article.title)}</td><td>${esc(article.unit)}</td>
        <td class="num">${number(quantity)}</td><td class="num">${article.price > 0 ? money(article.price) : '—'}</td>
        ${cells.map((cell) => cellHtml(cell, lowest)).join('')}</tr>`,
    );
    const own = measured.reduce((sum, article) => sum + amountOf(article), 0);
    const foot = totals.map(({ amount, missing }) => {
      const low = amount === lowestTotal ? ' offer-low' : '';
      const note = missing ? `<small>${missing} missing</small>` : '';
      return `<td class="num${low}">${money(amount)}${note}</td>`;
    });
    return `<table class="quantities offers"><thead><tr><th>Number</th><th>Article</th><th>Unit</th>
        <th class="num">Quantity</th><th class="num">Own price</th>${heads.join('')}</tr></thead>
      <tbody>${body.join('')}</tbody>
      <tfoot><tr><td colspan="4">Total for the project’s quantities</td><td class="num">${money(own)}</td>${foot.join('')}</tr></tfoot></table>
      ${offers.map(unmatchedHtml).join('')}`;
  }

  commands.register({
    /** Takes a contractor's unit prices over as the project's own, e.g. once the work is awarded. */
    'spec.useOffer'(id) {
      const offer = offers.find((o) => o.id === id);
      if (!offer || !target.editable()) return;
      const chosen = target.articles().filter((a) => offer.prices[a.id]);
      if (!confirm(`Replace the unit price of ${chosen.length} articles with the prices of ${offer.contractor}?`))
        return;
      target.setPrices(chosen.map((a) => [a, offer.prices[a.id].price]));
      commands.run('spec.view', 'offers');
    },
    async 'spec.removeOffer'(id) {
      const offer = offers.find((o) => o.id === id);
      if (!offer || !confirm(`Remove the offer of ${offer.contractor}?`)) return;
      try {
        await specStore.removeOffer(target.spec().id, id);
      } catch {
        return toast('The offer could not be removed.');
      }
      offers = offers.filter((o) => o.id !== id);
      commands.run('spec.view', 'offers');
    },
  });

  return {
    /** Fetches the offers of the open project; a master has none. */
    async load() {
      const spec = target.spec();
      offers = [];
      if (spec?.kind !== 'project') return;
      try {
        offers = await specStore.offers(spec.id);
      } catch {
        toast('The offers could not be loaded.');
      }
    },

    viewHtml() {
      const head = `<div class="quantities-head"><h2>Offers</h2>
        <button class="btn" data-act="spec.importOffer"${target.editable() ? '' : ' disabled'}>Import offer…</button></div>
        <p class="spec-hint">The bills of quantities that contractors filled in, side by side. Amounts use the
          project’s own quantities; ≠ marks a line where the contractor priced a different quantity, and the
          lowest price of each line is marked.</p>`;
      if (!offers.length)
        return `${head}<p class="spec-empty">No offers yet. Import a bill of quantities a contractor filled in:
          an Excel workbook (.xlsx) or a CSV file${aiReader ? ', or a PDF, which the AI reader reads' : ''}.</p>`;
      return head + tableHtml();
    },
  };
}
