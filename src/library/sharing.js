import { $ } from '../core/dom.js';
import { esc } from '../core/html.js';

const ROLE_LABELS = { view: 'Can view', edit: 'Can edit' };

/**
 * Sharing a document with other accounts (server storage only).
 * @typedef {object} SharingDeps
 * @property {HTMLDialogElement} dialog
 * @property {import('../core/storage.js').DocumentStore} store
 * @property {import('../core/commands.js').Commands} commands
 * @property {import('../ui/toast.js').Toast} toast
 *
 * @param {SharingDeps} deps
 */
export function initSharing({ dialog, store, commands, toast }) {
  const form = $('form', dialog),
    list = $('#shareList', dialog),
    email = $('#shareEmail', dialog),
    role = $('#shareRole', dialog),
    message = $('#shareError', dialog);
  let docId = '';

  async function render() {
    const shares = await store.shares(docId);
    list.innerHTML = shares.length
      ? shares
          .map(
            (s) => `<li><span class="share-who">${esc(s.name)}<small>${esc(s.email)}</small></span>
              <span class="share-role">${ROLE_LABELS[s.role] ?? esc(s.role)}</span>
              <button class="btn sm" type="button" data-act="library.unshare" data-arg="${s.userId}">Remove</button></li>`,
          )
          .join('')
      : '<li class="share-empty">Only you can open this document.</li>';
  }

  /** Runs a sharing request and shows the outcome in the dialog. */
  async function attempt(/** @type {() => Promise<void>} */ request) {
    message.textContent = '';
    try {
      await request();
      await render();
    } catch (err) {
      message.textContent = /** @type {Error} */ (err).message || 'That did not work.';
    }
  }

  commands.register({
    async 'library.share'(id) {
      const entry = store.meta(id);
      if (!entry) return;
      if (entry.role !== 'owner') return toast('Only the owner can share this document.');
      docId = id;
      $('#shareTitle', dialog).textContent = `Share “${entry.title}”`;
      email.value = '';
      list.innerHTML = '';
      dialog.showModal();
      await attempt(async () => {});
    },
    'library.unshare': (userId) => attempt(() => store.unshare(docId, Number(userId))),
  });

  form.addEventListener('submit', (e) => {
    if (e.submitter?.value !== 'add') return; // the Done button closes the dialog as usual
    e.preventDefault();
    attempt(async () => {
      await store.share(docId, email.value.trim(), role.value);
      email.value = '';
    });
  });
}
