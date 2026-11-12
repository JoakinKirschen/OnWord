/** Backup of every document as one JSON file, and restoring from such a file. */

import { sanitize } from '../core/html.js';
import { normalizePage } from '../core/page.js';

const FORMAT = 'onword-backup';
const VERSION = 1;
const MAX_TITLE = 120;

/**
 * @typedef {{ title: string, snippet: string, page?: import('../core/page.js').PageSetup, html: string }} BackupDocument
 * @typedef {{ format: string, version: number, exportedAt: string, documents: BackupDocument[] }} Backup
 */

/** @param {import('../core/storage.js').DocumentStore} store @returns {Backup} */
export function createBackup(store) {
  const documents = store
    .index()
    .map(({ id, title, snippet, page }) => ({ title, snippet, page, html: store.read(id) }));
  return { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), documents };
}

/** Whether parsed JSON looks like a backup file. */
export const isBackup = (/** @type {any} */ data) => data?.format === FORMAT && Array.isArray(data.documents);

/**
 * Adds every document of a backup as a new document (existing ones are never overwritten).
 * @param {import('../core/storage.js').DocumentStore} store
 * @param {Backup} backup
 * @returns {number} how many documents were restored
 */
export function restoreBackup(store, backup) {
  let restored = 0;
  for (const doc of backup.documents) {
    if (typeof doc?.html !== 'string') continue;
    const created = store.create({
      title: String(doc.title || 'Untitled document').slice(0, MAX_TITLE),
      html: sanitize(doc.html),
      snippet: String(doc.snippet || ''),
      page: doc.page && normalizePage(doc.page),
    });
    if (!created) break; // storage is full; the store has already reported it
    restored++;
  }
  return restored;
}
