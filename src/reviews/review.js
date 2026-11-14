/** The site review screen: a project's visit and its observations, laid out for a phone or tablet on site. */

import { $, hit } from '../core/dom.js';
import { newId } from '../core/ids.js';
import { reviewToHtml } from '../core/spec/reviewOutput.js';
import { blankObservation } from '../core/spec/reviews.js';
import { reportPhoto, shrinkPhoto } from './photos.js';
import { observationHtml, reviewHtml } from './templates.js';

const SAVE_DELAY_MS = 600;
const SNIPPET_LENGTH = 500;

/**
 * @typedef {object} ReviewScreenDeps
 * @property {HTMLElement} root
 * @property {import('../core/spec/model.js').SpecStore} specStore
 * @property {import('../core/storage.js').DocumentStore} documents where "Create report" puts its result
 * @property {import('../core/commands.js').Commands} commands
 * @property {import('../ui/toast.js').Toast} toast
 * @property {(hash: string) => void} navigate
 *
 * @param {ReviewScreenDeps} deps
 */
export function createReviewScreen({ root, specStore, documents, commands, toast, navigate }) {
  const body = $('#reviewBody', root),
    state = $('#reviewState', root),
    input = $('#photoInput', root);
  /** @type {{ spec: import('../core/spec/model.js').Spec, review: import('../core/spec/reviews.js').SiteReview, articles: import('../core/spec/model.js').Article[] } | null} */
  let open = null;
  /** Images of the review's photos by id. @type {Map<string, string>} */
  let images = new Map();
  let timer = null;
  let unsaved = false;
  /** The observation the photo picker adds to. */
  let photoFor = '';

  const context = () => ({ articles: open.articles, images });
  const observation = (/** @type {string} */ id) => open?.review.observations.find((o) => o.id === id);
  const draw = () => (body.innerHTML = reviewHtml(open.review, context()));

  async function save() {
    clearTimeout(timer);
    if (!open || !unsaved) return;
    unsaved = false;
    const { spec, review } = open;
    try {
      await specStore.saveReview(spec.id, { ...review, updated: Date.now() });
      if (!unsaved) state.textContent = 'Saved';
    } catch (err) {
      unsaved = true;
      state.textContent = 'Not saved';
      toast(/** @type {Error} */ (err).message || 'The site review could not be saved.');
    }
  }
  function changed() {
    unsaved = true;
    state.textContent = 'Saving…';
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY_MS);
  }

  /** Stores photos picked for an observation; each shows at once and is sent on its own. */
  async function addPhotos(/** @type {File[]} */ files) {
    const target = observation(photoFor);
    if (!target) return;
    for (const file of files) {
      const id = newId();
      try {
        images.set(id, await shrinkPhoto(file));
        target.photos.push({ id, caption: '' });
        draw();
        // The image is stored before the review refers to it, so the review never points at nothing.
        await specStore.savePhoto(open.spec.id, open.review.id, { id, data: images.get(id) });
        changed();
      } catch (err) {
        target.photos = target.photos.filter((p) => p.id !== id);
        draw();
        toast(/** @type {Error} */ (err).message || `“${file.name}” could not be added.`);
      }
    }
  }

  /** Splits a "observation:other" argument. */
  const pair = (/** @type {string} */ arg) => /** @type {[string, string]} */ (String(arg).split(':'));

  commands.register({
    'site.addObservation'() {
      const o = blankObservation(newId());
      open.review.observations.push(o);
      draw();
      changed();
      $(`[data-obs="${o.id}"] [data-o="location"]`, body).focus();
    },
    'site.removeObservation'(id) {
      const o = observation(id);
      const what = o?.location ? `“${o.location}”` : 'this observation';
      if (!o || !confirm(`Remove ${what}${o.photos.length ? ` and its ${o.photos.length} photos` : ''}?`)) return;
      open.review.observations = open.review.observations.filter((x) => x !== o);
      draw();
      changed();
    },
    'site.status'(arg) {
      const [id, status] = pair(arg);
      const o = observation(id);
      if (!o) return;
      o.status = /** @type {import('../core/spec/reviews.js').Observation['status']} */ (status);
      $(`[data-obs="${id}"]`, body).outerHTML = observationHtml(o, open.review.observations.indexOf(o), context());
      changed();
    },
    'site.photo'(id) {
      photoFor = id;
      input.value = '';
      input.click();
    },
    'site.removePhoto'(arg) {
      const [id, photoId] = pair(arg);
      const o = observation(id);
      if (!o || !confirm('Remove this photo?')) return;
      o.photos = o.photos.filter((p) => p.id !== photoId);
      draw();
      changed();
    },
    /** Turns the review into an ordinary document, from where it can be printed or exported. */
    async 'site.report'() {
      await save();
      toast('Making the report…');
      const { spec, review, articles } = open;
      const photos = new Map();
      for (const [id, image] of images) photos.set(id, await reportPhoto(image));
      const html = reviewToHtml(spec, review, { articles, photos });
      const text = new DOMParser().parseFromString(html, 'text/html').body.textContent;
      const title = `Site review ${review.number} – ${spec.title}`;
      const created = documents.create({ title, html, snippet: text.slice(0, SNIPPET_LENGTH) });
      if (created) navigate('#/d/' + created.id);
    },
  });

  body.addEventListener('input', (e) => {
    const element = hit(e, 'input, textarea, select');
    if (!element || !open) return;
    const card = element.closest('[data-obs]');
    const o = card && observation(card.dataset.obs);
    if (element.dataset.field) open.review[element.dataset.field] = element.value;
    else if (element.dataset.caption) {
      const photo = o?.photos.find((p) => p.id === element.dataset.caption);
      if (photo) photo.caption = element.value;
    } else if (o && element.dataset.o === 'done') o.done = element.checked;
    else if (o && element.dataset.o === 'articleId') o.articleId = element.value || null;
    else if (o && element.dataset.o) o[element.dataset.o] = element.value;
    changed();
  });
  input.addEventListener('change', () => addPhotos([...input.files]));

  return {
    /** Loads and shows a site review of a project. Resolves to false when either does not exist. */
    async open(/** @type {string} */ specId, /** @type {string} */ reviewId) {
      const project = await specStore.get(specId).catch(() => null);
      const review = project && (await specStore.reviews(specId)).find((r) => r.id === reviewId);
      if (!review) return false;
      open = { spec: project.spec, review, articles: project.articles.filter((a) => !a.removed) };
      images = new Map();
      unsaved = false;
      state.textContent = '';
      $('#reviewTitle', root).textContent = `Site review ${review.number}`;
      $('#reviewProject', root).textContent = project.spec.title;
      $('#reviewBack', root).href = `#/s/${specId}/reviews`;
      draw();
      root.hidden = false;
      root.ownerDocument.title = `Site review ${review.number} – OnWord`;
      images = new Map(Object.entries(await specStore.photos(specId, reviewId)));
      if (images.size) draw();
      return true;
    },
    /** Hides the screen, saving first. */
    async hide() {
      root.hidden = true;
      await save();
      open = null;
    },
    /** Whether changes are still waiting to be saved. */
    pending: () => unsaved,
  };
}
