/** A site review as an ordinary document: the report that is printed, sent or exported. */

import { esc } from '../html.js';
import { isOpen, STATUSES } from './reviews.js';

const PHOTO_WIDTH = '48%'; // two photos side by side on the page

/** A date as people read it, e.g. "14 Nov 2026"; '' stays ''. */
const readable = (/** @type {string} */ date) =>
  date ? new Date(date + 'T12:00:00').toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/** "2.1 Tiles" for the article an observation concerns, or ''. */
function articleName(
  /** @type {string | null} */ id,
  /** @type {Map<string, import('./model.js').Article>} */ articles,
) {
  const article = id && articles.get(id);
  return article ? [article.number, article.title].filter(Boolean).join(' ') : '';
}

/** The follow-up line of an observation, or ''. */
function followUp(/** @type {import('./reviews.js').Observation} */ o) {
  const parts = [o.action && `Action: ${esc(o.action)}`, o.due && `due ${esc(readable(o.due))}`, o.done && 'done'];
  return parts.filter(Boolean).join(' — ');
}

function observationHtml(
  /** @type {import('./reviews.js').Observation} */ o,
  /** @type {number} */ index,
  /** @type {{ articles: Map<string, import('./model.js').Article>, photos: Map<string, string> }} */ context,
) {
  const heading = [`${index + 1}.`, esc(o.location) || 'Observation', `— ${STATUSES[o.status]}`].join(' ');
  const article = articleName(o.articleId, context.articles);
  const photos = o.photos
    .filter((p) => context.photos.has(p.id))
    .map(
      (p) =>
        `<img src="${context.photos.get(p.id)}" alt="${esc(p.caption)}" style="width: ${PHOTO_WIDTH}; height: auto;"> `,
    );
  const captions = o.photos.map((p) => p.caption).filter(Boolean);
  return [
    `<h3>${heading}</h3>`,
    article && `<p><i>Article ${esc(article)}</i></p>`,
    o.from && `<p><i>Noted earlier, in site review ${o.from}</i></p>`,
    o.text && `<p>${esc(o.text).replaceAll('\n', '<br>')}</p>`,
    photos.length && `<p>${photos.join('')}</p>`,
    captions.length && `<p><i>${captions.map(esc).join(' · ')}</i></p>`,
    followUp(o) && `<p><b>${followUp(o)}</b></p>`,
  ]
    .filter(Boolean)
    .join('');
}

/** The table of what is still to be done. */
function openItemsHtml(/** @type {import('./reviews.js').Observation[]} */ observations) {
  const open = observations.map((o, i) => ({ o, i })).filter(({ o }) => isOpen(o));
  if (!open.length) return '<p>No open items.</p>';
  const rows = open.map(
    ({ o, i }) =>
      `<tr><td>${i + 1}</td><td>${esc(o.location)}</td><td>${STATUSES[o.status]}</td><td>${esc(o.action)}</td><td>${esc(readable(o.due))}</td></tr>`,
  );
  return `<table style="width: 100%;"><tbody><tr><td><b>#</b></td><td><b>Location</b></td><td><b>Status</b></td><td><b>Action</b></td><td><b>Due</b></td></tr>${rows.join('')}</tbody></table>`;
}

/**
 * @param {import('./model.js').Spec} spec the project
 * @param {import('./reviews.js').SiteReview} review
 * @param {{ articles: import('./model.js').Article[], photos: Map<string, string> }} context the project's
 *   articles, and the images of the review's photos by id
 */
export function reviewToHtml(spec, review, { articles, photos }) {
  const byId = new Map(articles.map((a) => [a.id, a]));
  const details = [
    ['Date', readable(review.date)],
    ['Attendees', review.attendees],
    ['Weather', [review.weather, review.temperature].filter(Boolean).join(', ')],
  ].filter(([, value]) => value);
  const table = details.length
    ? `<table style="width: 100%;"><tbody>${details.map(([label, value]) => `<tr><td><b>${label}</b></td><td>${esc(value).replaceAll('\n', '<br>')}</td></tr>`).join('')}</tbody></table>`
    : '';
  return [
    `<h1>Site review ${review.number}</h1>`,
    `<p class="subtitle">${esc(spec.title)}${review.date ? ' — ' + esc(readable(review.date)) : ''}</p>`,
    table,
    review.notes && `<p>${esc(review.notes).replaceAll('\n', '<br>')}</p>`,
    '<h2>Observations</h2>',
    review.observations.map((o, i) => observationHtml(o, i, { articles: byId, photos })).join('') ||
      '<p>No observations.</p>',
    '<h2>Open items</h2>',
    openItemsHtml(review.observations),
  ]
    .filter(Boolean)
    .join('');
}
