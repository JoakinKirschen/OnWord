import { $ } from '../core/dom.js';
import { tidy } from './blocks.js';
import { countPages, countText, plural } from './metrics.js';

const UNTITLED = 'Untitled document';

/**
 * The open document: loading, autosave, title and word count.
 * @typedef {ReturnType<typeof createSession>} Session
 * @param {{ root: HTMLElement, content: HTMLElement, store: import('../core/storage.js').DocumentStore, events: import('../core/events.js').Emitter }} deps
 */
export function createSession({ root, content, store, events }) {
  const doc = root.ownerDocument;
  const titleEl = $('#title', root),
    saveStateEl = $('#saveState', root),
    countsEl = $('#counts', root);
  /** @type {string | null} */
  let id = null;
  let dirty = false;
  let timer = null;

  const title = () => titleEl.value.trim() || UNTITLED;

  function updateCounts() {
    const { words, characters } = countText(content.innerText);
    countsEl.textContent = [
      plural(countPages(content), 'page'),
      plural(words, 'word'),
      plural(characters, 'character'),
    ].join(' · ');
  }

  function saveNow({ force = false } = {}) {
    clearTimeout(timer);
    if (!id || !(dirty || force)) return;
    const ok = store.write(id, content.innerHTML, { title: title(), snippet: content.innerText.trim().slice(0, 500) });
    dirty = !ok;
    saveStateEl.textContent = ok ? 'Saved' : 'Not saved';
  }

  /** Call after any change to the document or its title. */
  function changed() {
    tidy(content);
    dirty = true;
    saveStateEl.textContent = 'Saving…';
    clearTimeout(timer);
    timer = setTimeout(saveNow, 500);
    updateCounts();
    events.emit('change');
  }

  function open(docId) {
    const entry = store.meta(docId);
    if (!entry) return false;
    id = docId;
    dirty = false;
    content.innerHTML = store.read(docId);
    titleEl.value = entry.title;
    doc.title = entry.title + ' – OnWord';
    saveStateEl.textContent = '';
    updateCounts();
    events.emit('open');
    return true;
  }

  function close() {
    saveNow();
    id = null;
  }

  /** Drop the open document without saving (used when it is being deleted). */
  function discard() {
    clearTimeout(timer);
    dirty = false;
    id = null;
  }

  titleEl.addEventListener('input', () => {
    doc.title = title() + ' – OnWord';
    changed();
  });
  titleEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      content.focus();
    }
  });
  titleEl.addEventListener('blur', () => {
    if (!titleEl.value.trim()) titleEl.value = UNTITLED;
  });

  events.on('layout', updateCounts);

  /** Stored metadata of the open document. */
  const meta = () => (id ? store.meta(id) : undefined);

  return {
    open,
    close,
    discard,
    saveNow,
    changed,
    title,
    meta,
    get id() {
      return id;
    },
  };
}
