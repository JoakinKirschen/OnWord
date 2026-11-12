import { $ } from '../../core/dom.js';
import { countDocument, countPages, countText } from '../metrics.js';

const ROWS = [
  ['Words', 'words'],
  ['Characters (no spaces)', 'charactersNoSpaces'],
  ['Characters (with spaces)', 'characters'],
];
const format = (/** @type {number | undefined} */ n) => (n == null ? '' : n.toLocaleString());

/**
 * Word count dialog: statistics for the document and, when text is selected, for the selection.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initWordCount(ctx) {
  const { root, content, selection, commands } = ctx;
  const dialog = $('#wordCountDlg', root),
    table = $('#wordCountTable', root);

  commands.register({
    'view.wordCount'() {
      const s = selection.current();
      const picked = s && !s.isCollapsed ? countText(s.toString()) : null;
      const whole = countDocument(content);
      const row = (/** @type {string} */ label, /** @type {number} */ all, /** @type {number} */ part = undefined) =>
        `<tr><th>${label}</th><td>${format(all)}</td>${picked ? `<td>${format(part)}</td>` : ''}</tr>`;
      table.innerHTML =
        (picked ? '<thead><tr><th></th><th>Document</th><th>Selection</th></tr></thead>' : '') +
        row('Pages', countPages(content)) +
        ROWS.map(([label, key]) => row(label, whole[key], picked?.[key])).join('') +
        row('Paragraphs', whole.paragraphs);
      dialog.showModal();
    },
  });
}
