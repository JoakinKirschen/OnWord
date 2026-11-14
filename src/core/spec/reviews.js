/** Site reviews: visits to a project's site, with observations, their photos and their follow-up. */

/** Status of an observation → its label. */
export const STATUSES = { ok: 'OK', remark: 'Remark', defect: 'Defect' };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LIMITS = { short: 200, long: 5000, observations: 500, photos: 50 };

/**
 * @typedef {{ id: string, caption: string }} PhotoRef a photo of an observation; its image is stored apart
 * @typedef {object} Observation
 * @property {string} id
 * @property {string} location where on site: floor, room, axis
 * @property {string | null} articleId the project article it concerns
 * @property {'ok' | 'remark' | 'defect'} status
 * @property {string} text
 * @property {PhotoRef[]} photos
 * @property {string} action what is to be done, and by whom
 * @property {string} due date (YYYY-MM-DD) or ''
 * @property {boolean} done
 * @property {number | null} from the review in which it was first noted, when it was carried over
 *
 * @typedef {object} SiteReview
 * @property {string} id
 * @property {number} number the reviews of a project are numbered 1, 2, 3…
 * @property {string} date YYYY-MM-DD
 * @property {string} attendees
 * @property {string} weather
 * @property {string} temperature
 * @property {string} notes
 * @property {Observation[]} observations
 * @property {number} updated
 */

/** Whether a string is a photo as the app stores them: a JPEG or PNG data URL, and nothing that could run. */
export const isPhotoData = (/** @type {any} */ value) =>
  typeof value === 'string' && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(value);

/** Whether an observation still needs something done: it is not OK and not marked done. */
export const isOpen = (/** @type {Observation} */ o) => o.status !== 'ok' && !o.done;

/** @returns {Observation} */
export const blankObservation = (/** @type {string} */ id) => ({
  id,
  location: '',
  articleId: null,
  status: 'remark',
  text: '',
  photos: [],
  action: '',
  due: '',
  done: false,
  from: null,
});

/**
 * The next review of a project: numbered after the others, with the open items of the latest one carried
 * over (without their photos, which stay with the review they were taken in).
 * @param {SiteReview[]} reviews the project's reviews so far
 * @param {() => string} makeId
 * @param {string} today YYYY-MM-DD
 * @returns {SiteReview}
 */
export function newReview(reviews, makeId, today) {
  const latest = reviews.reduce((last, r) => (!last || r.number > last.number ? r : last), null);
  const carried = (latest?.observations ?? [])
    .filter(isOpen)
    .map((o) => ({ ...o, id: makeId(), photos: [], from: o.from ?? latest.number }));
  return {
    id: makeId(),
    number: (latest?.number ?? 0) + 1,
    date: today,
    attendees: '',
    weather: '',
    temperature: '',
    notes: '',
    observations: carried,
    updated: Date.now(),
  };
}

/** The ids of every photo a review refers to. */
export const photoIds = (/** @type {SiteReview} */ review) =>
  new Set(review.observations.flatMap((o) => o.photos.map((p) => p.id)));

const text = (/** @type {any} */ value, /** @type {number} */ max) => String(value ?? '').slice(0, max);
const day = (/** @type {any} */ value) => (DATE.test(value) ? value : '');

/** Photo references from storage or the network. @returns {PhotoRef[]} */
const normalizePhotos = (/** @type {any} */ photos) =>
  (Array.isArray(photos) ? photos : [])
    .slice(0, LIMITS.photos)
    .map((p) => ({ id: text(p?.id, LIMITS.short), caption: text(p?.caption, LIMITS.short) }))
    .filter((p) => p.id);

/** An observation from storage or the network, reduced to its fields and their limits. @returns {Observation} */
function normalizeObservation(/** @type {any} */ o) {
  return {
    id: text(o?.id, LIMITS.short),
    location: text(o?.location, LIMITS.short),
    articleId: typeof o?.articleId === 'string' && o.articleId ? o.articleId : null,
    status: o?.status in STATUSES ? o.status : 'remark',
    text: text(o?.text, LIMITS.long),
    photos: normalizePhotos(o?.photos),
    action: text(o?.action, LIMITS.short),
    due: day(o?.due),
    done: o?.done === true,
    from: Number.isInteger(o?.from) ? o.from : null,
  };
}

/** A review from storage or the network, reduced to its fields and their limits. @returns {SiteReview} */
export function normalizeReview(/** @type {any} */ r) {
  return {
    id: text(r?.id, LIMITS.short),
    number: Number.isInteger(r?.number) && r.number > 0 ? r.number : 1,
    date: day(r?.date),
    attendees: text(r?.attendees, LIMITS.long),
    weather: text(r?.weather, LIMITS.short),
    temperature: text(r?.temperature, LIMITS.short),
    notes: text(r?.notes, LIMITS.long),
    observations: (Array.isArray(r?.observations) ? r.observations : [])
      .slice(0, LIMITS.observations)
      .map(normalizeObservation),
    updated: Number(r?.updated) || 0,
  };
}
