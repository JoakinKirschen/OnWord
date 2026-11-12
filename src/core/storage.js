import { EMPTY_DOC } from './html.js';

const INDEX_KEY = 'onword:index';
const MAX_VERSIONS = 10;
const docKey = (/** @type {string} */ id) => 'onword:doc:' + id;
const versionsKey = (/** @type {string} */ id) => 'onword:versions:' + id;

/**
 * @typedef {import('./page.js').PageSetup} PageSetup
 * @typedef {{ id: string, title: string, created: number, updated: number, snippet: string, page?: PageSetup }} DocMeta
 * @typedef {{ at: number, html: string, snippet: string }} DocVersion
 * @typedef {ReturnType<typeof createDocumentStore>} DocumentStore
 */

/**
 * Document repository. The only module that knows how documents are persisted; swap the
 * implementation here (e.g. for a server) without touching features.
 * @param {{ storage: Storage, onQuotaExceeded: (operation: 'write' | 'create') => void }} deps
 */
export function createDocumentStore({ storage, onQuotaExceeded }) {
  /** @returns {any} */
  const readJson = (/** @type {string} */ key) => {
    try {
      return JSON.parse(storage.getItem(key)) || [];
    } catch {
      return [];
    }
  };
  /** @returns {DocMeta[]} */
  const index = () => readJson(INDEX_KEY);
  const saveIndex = (/** @type {DocMeta[]} */ ix) => storage.setItem(INDEX_KEY, JSON.stringify(ix));
  const meta = (/** @type {string} */ id) => index().find((d) => d.id === id);
  const read = (/** @type {string} */ id) => storage.getItem(docKey(id)) ?? EMPTY_DOC;

  /**
   * @param {{ title?: string, html?: string, snippet?: string, page?: PageSetup }} [options]
   * @returns {DocMeta | null} null when storage is full
   */
  function create({ title = 'Untitled document', html = EMPTY_DOC, snippet = '', page } = {}) {
    const now = Date.now();
    const id = now.toString(36) + Math.random().toString(36).slice(2, 8);
    /** @type {DocMeta} */
    const entry = { id, title, created: now, updated: now, snippet, ...(page && { page }) };
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

  /**
   * Writes content (pass null to keep it) and merges `patch` into the metadata. Returns success.
   * @param {string} id
   * @param {string | null} html
   * @param {Partial<DocMeta>} patch
   */
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

  function duplicate(/** @type {string} */ id) {
    const src = meta(id);
    if (!src) return null;
    return create({ title: 'Copy of ' + src.title, html: read(id), snippet: src.snippet, page: src.page });
  }

  function remove(/** @type {string} */ id) {
    storage.removeItem(docKey(id));
    storage.removeItem(versionsKey(id));
    saveIndex(index().filter((d) => d.id !== id));
  }

  /** Saved snapshots of a document, newest first. @returns {DocVersion[]} */
  const versions = (/** @type {string} */ id) => readJson(versionsKey(id));

  /**
   * Stores a snapshot, keeping the newest MAX_VERSIONS. Versions are expendable: when storage is
   * full the oldest are dropped rather than reporting an error. Returns whether it was stored.
   * @param {string} id
   * @param {string} html
   * @param {string} snippet
   */
  function addVersion(id, html, snippet) {
    let list = [{ at: Date.now(), html, snippet }, ...versions(id)].slice(0, MAX_VERSIONS);
    while (list.length) {
      try {
        storage.setItem(versionsKey(id), JSON.stringify(list));
        return true;
      } catch {
        list = list.slice(0, Math.floor(list.length / 2));
      }
    }
    return false;
  }

  return { indexKey: INDEX_KEY, index, meta, read, create, write, duplicate, remove, versions, addVersion };
}
