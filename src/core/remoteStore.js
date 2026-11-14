import { EMPTY_DOC, sanitize } from './html.js';
import { newId } from './ids.js';

const MAX_VERSIONS = 10;
const RETRY_MS = 5000;

/** @typedef {import('./storage.js').DocMeta} DocMeta */

/**
 * Document repository backed by the server. It offers the same synchronous interface as the browser
 * store by keeping a copy in memory: reads come from that copy (a document's content must be `load`ed
 * first) and writes are applied to it at once, then sent to the server in the background, one request
 * per document at a time, with later changes to the same document merged into one request.
 * @param {{ api: import('./api.js').Api, onConflict: (title: string) => void }} deps
 * @returns {import('./storage.js').DocumentStore}
 */
export function createRemoteStore({ api, onConflict }) {
  /** @type {Map<string, DocMeta>} */
  const metas = new Map();
  /** @type {Map<string, string>} */
  const contents = new Map();
  /** @type {Map<string, import('./storage.js').DocVersion[]>} */
  const versionLists = new Map();
  /** Changes not yet accepted by the server, per document. @type {Map<string, Record<string, any>>} */
  const unsent = new Map();
  /** Documents with a request under way. @type {Map<string, Promise<void>>} */
  const sending = new Map();
  /** Documents the server refused to overwrite; their changes stay in this browser only. */
  const conflicted = new Set();
  /** @type {Set<() => void>} */
  const listeners = new Set();
  let retryTimer = null;
  let unreachable = false; // the last request failed for a reason that may pass (offline, signed out)

  const pending = () => new Set([...unsent.keys(), ...sending.keys()]).size;
  const notify = () => listeners.forEach((listener) => listener());

  /** Queues `task` behind whatever is already being sent for this document. */
  function enqueue(/** @type {string} */ id, /** @type {() => Promise<void>} */ task) {
    const run = (sending.get(id) ?? Promise.resolve()).then(task).finally(() => {
      if (sending.get(id) === run) sending.delete(id);
      notify();
    });
    sending.set(id, run);
    notify();
  }

  function retryLater() {
    unreachable = true;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => [...unsent.keys()].forEach(flush), RETRY_MS);
  }

  /** Sends the accumulated changes of a document. On failure they are kept and tried again. */
  function flush(/** @type {string} */ id) {
    enqueue(id, async () => {
      const changes = unsent.get(id);
      const meta = metas.get(id);
      if (!changes || !meta || conflicted.has(id)) return;
      unsent.delete(id);
      try {
        const { rev, updated } = await api.post('docs/update', { id, rev: meta.rev, ...changes });
        Object.assign(meta, { rev, updated });
        unreachable = false;
      } catch (err) {
        if (/** @type {import('./api.js').ApiError} */ (err).code === 'conflict') {
          conflicted.add(id); // someone else saved first; nothing more is sent until it is reloaded
          unsent.delete(id);
          onConflict(meta.title);
          return;
        }
        unsent.set(id, { ...changes, ...unsent.get(id) }); // newer changes win over the ones that failed
        retryLater();
      }
    });
  }

  const meta = (/** @type {string} */ id) => metas.get(id);
  const canWrite = (/** @type {string} */ id) => !!meta(id) && meta(id).role !== 'view';

  /** Sends a one-off request for a document after its earlier requests. Failures are logged, not retried. */
  function post(/** @type {string} */ id, /** @type {string} */ route, /** @type {object} */ body) {
    enqueue(id, () =>
      api.post(route, body).then(
        () => {},
        (err) => console.error(route, err),
      ),
    );
  }

  return {
    remote: true,
    indexKey: '',
    index: () => [...metas.values()],
    meta,
    read: (id) => contents.get(id) ?? EMPTY_DOC,

    create({ title = 'Untitled document', html = EMPTY_DOC, snippet = '', page, styles } = {}) {
      const now = Date.now();
      /** @type {DocMeta} */
      const entry = {
        id: newId(),
        title,
        created: now,
        updated: now,
        snippet,
        rev: 1,
        role: 'owner',
        ...(page && { page }),
        ...(styles && { styles }),
      };
      metas.set(entry.id, entry);
      contents.set(entry.id, html);
      versionLists.set(entry.id, []);
      post(entry.id, 'docs/create', { id: entry.id, title, html, snippet, page, styles });
      return entry;
    },

    write(id, html, patch) {
      if (!canWrite(id)) return false;
      if (html != null) contents.set(id, html); // kept even when it cannot be saved, so it can still be downloaded
      if (conflicted.has(id)) return false;
      Object.assign(meta(id), patch, { updated: Date.now() });
      unsent.set(id, { ...unsent.get(id), ...patch, ...(html != null && { html }) });
      flush(id);
      return true;
    },

    duplicate(id) {
      const source = meta(id);
      if (!source) return null;
      const now = Date.now();
      /** @type {DocMeta} */
      const copy = {
        ...source,
        id: newId(),
        title: 'Copy of ' + source.title,
        created: now,
        updated: now,
        rev: 1,
        role: 'owner',
      };
      metas.set(copy.id, copy);
      post(id, 'docs/copy', { id, newId: copy.id }); // the server copies the content, which may not be loaded here
      return copy;
    },

    remove(id) {
      metas.delete(id);
      contents.delete(id);
      unsent.delete(id);
      post(id, 'docs/delete', { id });
    },

    versions: (id) => versionLists.get(id) ?? [],
    addVersion(id, html, snippet) {
      if (!canWrite(id)) return false;
      versionLists.set(id, [{ at: Date.now(), html, snippet }, ...(versionLists.get(id) ?? [])].slice(0, MAX_VERSIONS));
      post(id, 'versions/add', { id, html, snippet });
      return true;
    },

    /** Fetches the list of documents. */
    async refresh() {
      const { documents } = await api.get('docs/list');
      const local = new Map(metas);
      metas.clear();
      for (const doc of documents) {
        // A document with unsent changes keeps its local metadata, which is newer than the server's.
        metas.set(doc.id, unsent.has(doc.id) || sending.has(doc.id) ? (local.get(doc.id) ?? doc) : doc);
      }
      for (const [id, entry] of local) if (sending.has(id) && !metas.has(id)) metas.set(id, entry); // being created
    },

    /** Fetches a document's content and versions so the synchronous calls can serve it. */
    async load(id) {
      await sending.get(id); // let a creation or copy under way reach the server first
      if (unsent.has(id) && contents.has(id)) return true;
      try {
        const { document, html, versions } = await api.get(`docs/get&id=${encodeURIComponent(id)}`);
        metas.set(id, document);
        contents.set(id, sanitize(html)); // may have been written by someone else
        versionLists.set(
          id,
          versions.map((v) => ({ ...v, html: sanitize(v.html) })),
        );
        conflicted.delete(id);
        return true;
      } catch (err) {
        if (/** @type {import('./api.js').ApiError} */ (err).status === 404) metas.delete(id);
        return false;
      }
    },

    async loadAll() {
      for (const id of metas.keys()) if (!contents.has(id)) await this.load(id);
    },

    pending,
    syncState(id) {
      if (conflicted.has(id)) return 'conflict';
      if (!unsent.has(id) && !sending.has(id)) return 'saved';
      return unreachable ? 'retrying' : 'saving';
    },
    onStatus(listener) {
      listeners.add(listener);
    },

    shares: (id) => api.get(`shares/list&id=${encodeURIComponent(id)}`).then((data) => data.shares),
    share: (id, email, role) => api.post('shares/add', { id, email, role }),
    unshare: (id, userId) => api.post('shares/remove', { id, userId }),
  };
}
