/** A document as a card: a miniature of its first page, its title, its project and when it was edited. */

/** @typedef {import('../core/storage.js').DocMeta} DocMeta */

/** Today's documents by their time, older ones by their date. */
export const editedDate = (/** @type {number} */ ts) => {
  const d = new Date(ts);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
};

/**
 * A link that opens the document. Someone else's document says whose it is instead of when it was edited.
 * @param {Document} doc
 * @param {DocMeta} d
 * @param {string | null} project the name of the project it is filed under
 */
export function documentCard(doc, d, project) {
  const a = doc.createElement('a');
  a.className = 'card';
  a.href = '#/d/' + d.id;
  a.innerHTML = `<div class="thumb"><div class="thumb-page"></div></div>
    <div class="card-meta"><div class="card-title"></div><div class="card-project" hidden></div><div class="card-date"></div></div>`;
  a.querySelector('.thumb-page').textContent = d.snippet || '';
  a.querySelector('.card-title').textContent = d.title;
  const projectEl = /** @type {HTMLElement} */ (a.querySelector('.card-project'));
  projectEl.hidden = !project;
  projectEl.textContent = project ?? '';
  const shared = d.role && d.role !== 'owner';
  const dateEl = a.querySelector('.card-date');
  dateEl.textContent = shared
    ? `Shared by ${d.owner}${d.role === 'view' ? ' · view only' : ''}`
    : 'Edited ' + editedDate(d.updated);
  dateEl.classList.toggle('card-shared', !!shared);
  return a;
}
