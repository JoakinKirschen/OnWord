/** Markup for the site review screen: the visit's details and one card per observation. */

import { esc } from '../core/html.js';
import { outline } from '../core/spec/model.js';
import { isPhotoData, STATUSES } from '../core/spec/reviews.js';

/** @typedef {import('../core/spec/reviews.js').Observation} Observation */

const field = (/** @type {string} */ value) => `value="${esc(value)}"`;

/** The visit: date, weather, attendees and general notes. */
export function visitHtml(/** @type {import('../core/spec/reviews.js').SiteReview} */ review) {
  return `<section class="review-card">
    <h2>Visit</h2>
    <div class="review-grid">
      <label>Date<input type="date" data-field="date" ${field(review.date)}></label>
      <label>Weather<input data-field="weather" list="weatherOptions" maxlength="200" placeholder="Sunny, rain…" ${field(review.weather)}></label>
      <label>Temperature<input data-field="temperature" maxlength="200" placeholder="e.g. 12 °C" ${field(review.temperature)}></label>
    </div>
    <label>Attendees<textarea data-field="attendees" rows="2" maxlength="5000" placeholder="Who was there">${esc(review.attendees)}</textarea></label>
    <label>General notes<textarea data-field="notes" rows="3" maxlength="5000">${esc(review.notes)}</textarea></label>
  </section>`;
}

function articleOptions(
  /** @type {import('../core/spec/model.js').Article[]} */ articles,
  /** @type {string | null} */ selected,
) {
  const options = outline(articles).map(
    ({ article }) =>
      `<option value="${article.id}"${article.id === selected ? ' selected' : ''}>${esc([article.number, article.title].filter(Boolean).join(' '))}</option>`,
  );
  return `<option value="">No article</option>${options.join('')}`;
}

function photosHtml(/** @type {Observation} */ o, /** @type {Map<string, string>} */ images) {
  const photos = o.photos.map((p) => {
    const image = images.get(p.id);
    const picture = isPhotoData(image)
      ? `<img src="${image}" alt="${esc(p.caption)}">`
      : '<span class="photo-missing">Loading…</span>';
    return `<figure class="photo">${picture}
      <input data-caption="${p.id}" maxlength="200" placeholder="Caption" aria-label="Caption" ${field(p.caption)}>
      <button class="photo-remove" data-act="site.removePhoto" data-arg="${o.id}:${p.id}" title="Remove photo" aria-label="Remove photo">×</button></figure>`;
  });
  return `<div class="photos">${photos.join('')}
    <button class="photo-add" data-act="site.photo" data-arg="${o.id}"><span aria-hidden="true">+</span>Photo</button></div>`;
}

/**
 * One observation as a card.
 * @param {Observation} o
 * @param {number} index
 * @param {{ articles: import('../core/spec/model.js').Article[], images: Map<string, string> }} context
 */
export function observationHtml(o, index, { articles, images }) {
  const statuses = Object.entries(STATUSES).map(
    ([status, label]) =>
      `<button class="status-${status}${o.status === status ? ' on' : ''}" data-act="site.status" data-arg="${o.id}:${status}" aria-pressed="${o.status === status}">${label}</button>`,
  );
  return `<article class="obs status-${o.status}" data-obs="${o.id}">
    <div class="obs-head"><span class="obs-number">${index + 1}</span>
      <input data-o="location" maxlength="200" placeholder="Location (floor, room, axis)" aria-label="Location" ${field(o.location)}>
      <button class="icon-btn" data-act="site.removeObservation" data-arg="${o.id}" title="Remove observation" aria-label="Remove observation">×</button></div>
    ${o.from ? `<p class="obs-from">Carried over from site review ${o.from}</p>` : ''}
    <div class="status-group" role="group" aria-label="Status">${statuses.join('')}</div>
    <label>Description<textarea data-o="text" rows="3" maxlength="5000">${esc(o.text)}</textarea></label>
    ${photosHtml(o, images)}
    <label>Article<select data-o="articleId">${articleOptions(articles, o.articleId)}</select></label>
    <div class="review-grid">
      <label>Action, by whom<input data-o="action" maxlength="200" ${field(o.action)}></label>
      <label>Due<input type="date" data-o="due" ${field(o.due)}></label>
      <label class="check"><input type="checkbox" data-o="done"${o.done ? ' checked' : ''}> Done</label>
    </div>
  </article>`;
}

/** The whole screen body. */
export function reviewHtml(
  /** @type {import('../core/spec/reviews.js').SiteReview} */ review,
  /** @type {{ articles: import('../core/spec/model.js').Article[], images: Map<string, string> }} */ context,
) {
  const cards = review.observations.map((o, i) => observationHtml(o, i, context)).join('');
  return `${visitHtml(review)}
    <h2 class="review-section">Observations <span class="count">${review.observations.length}</span></h2>
    ${cards || '<p class="spec-empty">No observations yet. Add one with “+ Observation”.</p>'}`;
}
