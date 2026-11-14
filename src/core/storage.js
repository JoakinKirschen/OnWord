import { EMPTY_DOC } from './html.js';

const INDEX_KEY = 'onword:index';
const MAX_VERSIONS = 10;
const docKey = (/** @type {string} */ id) => 'onword:doc:' + id;
const versionsKey = (/** @type {string} */ id) => 'onword:versions:' + id;

/**
 * @typedef {import('./page.js').PageSetup} PageSetup
 * @typedef {import('./docStyles.js').StyleOverrides} StyleOverrides
 * @typedef {object} DocMeta
 * @property {string} id
 * @property {string} title
 * @property {number} created
 * @property {number} updated
 * @property {string} snippet
 * @property {PageSetup} [page]
 * @property {StyleOverrides} [styles] what the document changes about its paragraph styles
 * @property {boolean} [template] a template that new documents start from, listed apart from documents
 * @property {string | null} [project] the project (a project specification's id) the document is filed under
 * @property {number} [rev] server stores only: the revision the local copy is based on
 * @property {'owner' | 'edit' | 'view'} [role] server stores only: what the signed-in user may do
 * @property {string} [owner] server stores only: name of the owner
 * @typedef {{ userId: number, name: string, email: string, role: string }} Share
 * @typedef {'saved' | 'saving' | 'retrying' | 'conflict'} SyncState
 * @typedef {{ at: number, html: string, snippet: string }} DocVersion
 * @typedef {{ title?: string, html?: string, snippet?: string, page?: PageSetup, styles?: StyleOverrides,
 *   template?: boolean, project?: string | null }} NewDocument
 * @typedef {{ title?: string, template?: boolean }} CopyOptions what the copy is called (else "Copy of …")
 *   and whether it is a template (else what the original is). A copy stays in the original's project, unless
 *   it is a template: templates belong to no project.
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
   * @param {NewDocument} [options]
   * @returns {DocMeta | null} null when storage is full
   */
  function create({
    title = 'Untitled document',
    html = EMPTY_DOC,
    snippet = '',
    page,
    styles,
    template,
    project,
  } = {}) {
    const now = Date.now();
    const id = now.toString(36) + Math.random().toString(36).slice(2, 8);
    /** @type {DocMeta} */
    const entry = {
      id,
      title,
      created: now,
      updated: now,
      snippet,
      ...(page && { page }),
      ...(styles && { styles }),
      ...(template && { template }),
      ...(project && { project }),
    };
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

  /** @param {string} id @param {CopyOptions} [options] */
  function duplicate(id, { title, template } = {}) {
    const src = meta(id);
    if (!src) return null;
    const { snippet, page, styles } = src;
    const asTemplate = template ?? src.template;
    return create({
      title: title ?? 'Copy of ' + src.title,
      html: read(id),
      snippet,
      page,
      styles,
      template: asTemplate,
      project: asTemplate ? null : src.project,
    });
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

  return {
    /** Whether documents live on a server (and can therefore be shared). */
    remote: false,
    indexKey: INDEX_KEY,
    index,
    meta,
    read,
    create,
    write,
    duplicate,
    remove,
    versions,
    addVersion,
    // The rest of the interface matters for a server store; here everything is already at hand.
    /** Updates the list of documents from where they are kept. */
    refresh: async () => {},
    /** Makes a document's content available to `read`. Resolves to false if it does not exist. */
    load: async (/** @type {string} */ id) => !!meta(id),
    /** Makes every document's content available to `read`. */
    loadAll: async () => {},
    /** Number of documents with changes that are not stored yet. */
    pending: () => 0,
    /** @returns {SyncState} */
    syncState: (/** @type {string} */ _id) => 'saved',
    /** Calls `listener` whenever a sync state may have changed. */
    onStatus: (/** @type {() => void} */ _listener) => {},
    /** @returns {Promise<Share[]>} */
    shares: async (/** @type {string} */ _id) => [],
    /** @returns {Promise<void>} */
    share: async (/** @type {string} */ _id, /** @type {string} */ _email, /** @type {string} */ _role) => {},
    /** @returns {Promise<void>} */
    unshare: async (/** @type {string} */ _id, /** @type {number} */ _userId) => {},
  };
}
