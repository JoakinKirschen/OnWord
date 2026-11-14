/** A project's site reviews: the list in the workspace, starting a new one and deleting one. */

import { esc } from '../core/html.js';
import { newId } from '../core/ids.js';
import { isOpen, newReview } from '../core/spec/reviews.js';

/** Today in the user's own time zone, as YYYY-MM-DD. */
const today = () => new Date().toLocaleDateString('sv'); // Swedish writes dates as ISO does

/**
 * @typedef {object} SiteReviewsDeps
 * @property {import('../core/spec/model.js').SpecStore} specStore
 * @property {import('../core/commands.js').Commands} commands
 * @property {import('../ui/toast.js').Toast} toast
 * @property {(hash: string) => void} navigate
 * @property {{ spec: () => import('../core/spec/model.js').Spec | null }} target the open specification
 * @property {() => void} redraw shows the list again after a change
 *
 * @param {SiteReviewsDeps} deps
 */
export function createSiteReviews({ specStore, commands, toast, navigate, target, redraw }) {
  /** @type {import('../core/spec/reviews.js').SiteReview[]} */
  let reviews = [];

  function row(/** @type {import('../core/spec/reviews.js').SiteReview} */ review) {
    const open = review.observations.filter(isOpen).length;
    const defects = review.observations.filter((o) => o.status === 'defect').length;
    const facts = [
      `${review.observations.length} observation${review.observations.length === 1 ? '' : 's'}`,
      open && `${open} open`,
      defects && `${defects} defect${defects === 1 ? '' : 's'}`,
    ];
    return `<li class="review-row"><a href="#/r/${target.spec().id}/${review.id}"><b>Site review ${review.number}</b>
      <span>${esc(review.date)}</span><small>${facts.filter(Boolean).join(' · ')}</small></a>
      <button class="btn sm danger-text" data-act="spec.removeReview" data-arg="${review.id}">Delete</button></li>`;
  }

  commands.register({
    /** Starts the next review, with the open items of the latest one, and opens it. */
    async 'spec.newReview'() {
      const spec = target.spec();
      const review = newReview(reviews, newId, today());
      try {
        await specStore.saveReview(spec.id, review);
      } catch (err) {
        return toast(/** @type {Error} */ (err).message || 'The site review could not be created.');
      }
      navigate(`#/r/${spec.id}/${review.id}`);
    },
    async 'spec.removeReview'(id) {
      const review = reviews.find((r) => r.id === id);
      if (!review || !confirm(`Delete site review ${review.number} with its photos? This can’t be undone.`)) return;
      await specStore.removeReview(target.spec().id, id);
      reviews = reviews.filter((r) => r !== review);
      redraw();
    },
  });

  return {
    /** Fetches the reviews of the open specification (none for a master). */
    async load() {
      const spec = target.spec();
      reviews = spec?.kind === 'project' && spec.mine ? await specStore.reviews(spec.id).catch(() => []) : [];
    },
    viewHtml() {
      const list = [...reviews].sort((a, b) => b.number - a.number).map(row);
      return `<div class="quantities-head"><h2>Site reviews</h2>
        <button class="btn primary" data-act="spec.newReview">+ New site review</button></div>
        <p class="spec-note">Visits to the site, with observations and photos; made for a phone or tablet. A new
        review takes over the items the last one left open.</p>
        ${list.length ? `<ul class="review-list">${list.join('')}</ul>` : '<p class="spec-empty">No site reviews yet.</p>'}`;
    },
  };
}
