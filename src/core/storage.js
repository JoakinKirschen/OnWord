import { EMPTY_DOC } from './html.js';

const INDEX_KEY = 'onword:index';
const docKey = (id) => 'onword:doc:' + id;

/**
 * Document repository. The only module that knows how documents are persisted; swap the
 * implementation here (e.g. for a server) without touching features.
 * `onQuotaExceeded(operation)` is called with 'write' or 'create' when storage is full.
 */
export function createDocumentStore({ storage, onQuotaExceeded }) {
  const index = () => {
    try { return JSON.parse(storage.getItem(INDEX_KEY)) || []; } catch { return []; }
  };
  const saveIndex = (ix) => storage.setItem(INDEX_KEY, JSON.stringify(ix));
  const meta = (id) => index().find((d) => d.id === id);
  const read = (id) => storage.getItem(docKey(id)) ?? EMPTY_DOC;

  function create(title = 'Untitled document', html = EMPTY_DOC, snippet = '') {
    const now = Date.now();
    const entry = { id: now.toString(36) + Math.random().toString(36).slice(2, 8), title, created: now, updated: now, snippet };
    try {
      storage.setItem(docKey(entry.id), html);
      saveIndex([...index(), entry]);
      return entry;
    } catch (err) {
      console.error(err);
      storage.removeItem(docKey(entry.id));
      onQuotaExceeded('create');
      return null;
    }
  }

  /** Writes content (pass null to keep it) and merges `patch` into the metadata. Returns success. */
  function write(id, html, patch) {
    try {
      if (html != null) storage.setItem(docKey(id), html);
      const ix = index();
      const entry = ix.find((d) => d.id === id);
      if (entry) Object.assign(entry, patch, { updated: Date.now() });
      saveIndex(ix);
      return true;
    } catch (err) {
      console.error(err);
      onQuotaExceeded('write');
      return false;
    }
  }

  function duplicate(id) {
    const src = meta(id);
    return src ? create('Copy of ' + src.title, read(id), src.snippet) : null;
  }

  function remove(id) {
    storage.removeItem(docKey(id));
    saveIndex(index().filter((d) => d.id !== id));
  }

  return { indexKey: INDEX_KEY, index, meta, read, create, write, duplicate, remove };
}
