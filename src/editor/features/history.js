import { $ } from '../../core/dom.js';
import { EMPTY_DOC, esc } from '../../core/html.js';

const AUTO_INTERVAL_MS = 5 * 60 * 1000;
const SNIPPET_LENGTH = 120;

const formatWhen = (/** @type {number} */ at) =>
  new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Version history: snapshots of the document that can be restored. A snapshot is taken of the
 * document as it was when opened (once it is edited), every few minutes while editing, and on request.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initHistory(ctx) {
  const { root, content, session, store, events, commands, toast } = ctx;
  const dialog = $('#historyDlg', root),
    listEl = $('#versionList', root);
  let baseline = null; // { html, snippet } as opened, until it has been stored or found unchanged
  let lastAutoAt = 0;

  const snippet = () => content.innerText.trim().slice(0, SNIPPET_LENGTH);

  /** Stores `html` unless it matches the newest version. */
  function snapshot(html, text) {
    if (!session.id || html === EMPTY_DOC || store.versions(session.id)[0]?.html === html) return false;
    return store.addVersion(session.id, html, text);
  }

  function render() {
    const versions = store.versions(session.id);
    listEl.innerHTML = versions.length
      ? versions
          .map(
            (v) => `<li><div class="version-info"><div class="version-date">${esc(formatWhen(v.at))}</div>
          <div class="version-snippet">${esc(v.snippet || 'Empty document')}</div></div>
          <button class="btn sm" type="button" data-act="history.restore" data-arg="${v.at}">Restore</button></li>`,
          )
          .join('')
      : '<li class="version-empty">No versions yet. They are saved automatically while you edit.</li>';
  }

  commands.register({
    'history.open'() {
      render();
      dialog.showModal();
    },
    'history.save'() {
      toast(snapshot(content.innerHTML, snippet()) ? 'Version saved.' : 'Nothing new to save.');
      render();
    },
    'history.restore'(at) {
      const version = store.versions(session.id).find((v) => v.at === Number(at));
      if (!version) return;
      snapshot(content.innerHTML, snippet()); // so the restore itself can be undone
      content.innerHTML = version.html;
      ctx.changed();
      dialog.close();
      toast('Version restored.');
    },
  });

  events.on('open', () => {
    baseline = { html: content.innerHTML, snippet: snippet() };
    lastAutoAt = Date.now();
  });
  events.on('change', () => {
    if (baseline) {
      snapshot(baseline.html, baseline.snippet);
      baseline = null;
    }
    if (Date.now() - lastAutoAt < AUTO_INTERVAL_MS) return;
    lastAutoAt = Date.now();
    snapshot(content.innerHTML, snippet());
  });
}
