import { readDocx } from '../core/docx/reader.js';
import { download } from '../core/download.js';
import { EMPTY_DOC, sanitize, textToHtml } from '../core/html.js';
import { createBackup, isBackup, restoreBackup } from './backup.js';

const SNIPPET_LENGTH = 500;
const extension = (/** @type {string} */ name) => name.split('.').pop().toLowerCase();
const plainText = (/** @type {string} */ html) =>
  new DOMParser().parseFromString(html, 'text/html').body.textContent.trim();

/**
 * Converts a file to document content, by extension. Unknown types are read as plain text.
 * @param {File} file
 * @returns {Promise<{ html: string, page?: import('../core/page.js').PageSetup }>}
 */
async function convert(file) {
  const type = extension(file.name);
  if (type === 'docx') return readDocx(await file.arrayBuffer());
  if (type === 'html' || type === 'htm') return { html: sanitize(await file.text()) };
  return { html: textToHtml(await file.text()) };
}

/**
 * @typedef {object} ImporterDeps
 * @property {HTMLInputElement} input the file picker
 * @property {import('../core/storage.js').DocumentStore} store
 * @property {import('../core/commands.js').Commands} commands
 * @property {import('../ui/toast.js').Toast} toast
 * @property {(hash: string) => void} navigate
 * @property {() => void} refresh re-renders the document list
 */

/**
 * Creates documents from files (.docx, .html, .txt, .md) and backs up / restores the whole library.
 * @param {ImporterDeps} deps
 */
export function initImporter({ input, store, commands, toast, navigate, refresh }) {
  async function restore(/** @type {File} */ file) {
    const data = JSON.parse(await file.text());
    if (!isBackup(data)) throw new Error('Not an OnWord backup');
    const count = restoreBackup(store, data);
    refresh();
    toast(`Restored ${count} document${count === 1 ? '' : 's'}.`);
  }

  async function importDocument(/** @type {File} */ file) {
    const { html, page } = await convert(file);
    const entry = store.create({
      title: file.name.replace(/\.[^.]+$/, '') || 'Imported document',
      html: html || EMPTY_DOC,
      snippet: plainText(html).slice(0, SNIPPET_LENGTH),
      page,
    });
    if (entry) navigate('#/d/' + entry.id);
  }

  commands.register({
    'library.import': () => input.click(),
    async 'library.backup'() {
      await store.loadAll(); // a server store only holds the documents opened so far
      const backup = createBackup(store);
      if (!backup.documents.length) return toast('There are no documents to back up.');
      const date = backup.exportedAt.slice(0, 10);
      download(`onword-backup-${date}.json`, JSON.stringify(backup), 'application/json');
    },
  });

  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    try {
      await (extension(file.name) === 'json' ? restore(file) : importDocument(file));
    } catch (err) {
      console.error(err);
      toast(`“${file.name}” could not be read.`);
    }
  });
}
