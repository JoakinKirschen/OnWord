/**
 * The warning before articles are removed: it lists every article that goes, sub-articles included, and
 * says which are kept to be brought back from the master and which are deleted for good.
 */

import { $ } from '../core/dom.js';
import { esc } from '../core/html.js';

const INDENT = 16; // pixels per level in the list

const plural = (/** @type {number} */ n, /** @type {string} */ word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What the dialog says about the removal. */
function explanation(/** @type {number} */ total, /** @type {number} */ chosen, /** @type {number} */ kept) {
  const below = total - chosen;
  const parts = [
    below
      ? `The ${plural(below, 'sub-article')} under ${chosen === 1 ? 'it' : 'them'} ${below === 1 ? 'goes' : 'go'} as well.`
      : '',
    kept === total
      ? 'They come from the master specification and are kept with your changes (text, measurement lines and prices): tick them in the Master tab to bring them back as they are.'
      : kept
        ? `${plural(kept, 'article')} from the master ${kept === 1 ? 'is' : 'are'} kept with your changes, to bring back from the Master tab. The ones marked “deleted” are deleted for good, with their text, measurement lines and prices.`
        : 'They are deleted for good, with their text, measurement lines and prices. This can’t be undone.',
  ];
  return parts.filter(Boolean).join(' ');
}

/**
 * @typedef {ReturnType<typeof createRemovalDialog>} RemovalDialog
 * @param {HTMLDialogElement} dialog
 */
export function createRemovalDialog(dialog) {
  const title = $('#removeTitle', dialog),
    text = $('#removeText', dialog),
    list = $('#removeList', dialog);

  return {
    /**
     * Shows what will be removed and resolves to whether the user confirmed.
     * @param {{ article: import('../core/spec/model.js').Article, depth: number }[]} rows in outline order
     * @param {{ chosen: number, kept: Set<string> }} plan how many of the rows the user chose (the rest are
     *   under those), and which rows are kept rather than deleted
     */
    ask(rows, { chosen, kept }) {
      const top = Math.min(...rows.map((r) => r.depth));
      const someKept = kept.size > 0 && kept.size < rows.length;
      list.innerHTML = rows
        .map(({ article, depth }) => {
          const mark = someKept && !kept.has(article.id) ? ' <span class="remove-mark">deleted</span>' : '';
          return `<li style="padding-left: ${(depth - top) * INDENT}px"><span class="tree-number">${esc(article.number)}</span> ${esc(article.title) || '<i>Untitled</i>'}${mark}</li>`;
        })
        .join('');
      title.textContent = rows.length === 1 ? 'Remove this article?' : `Remove ${rows.length} articles?`;
      text.textContent = explanation(rows.length, chosen, kept.size);
      text.classList.toggle('dlg-warning', kept.size < rows.length); // only a deletion is a real warning
      dialog.returnValue = '';
      dialog.showModal();
      return new Promise((resolve) =>
        dialog.addEventListener('close', () => resolve(dialog.returnValue === 'remove'), { once: true }),
      );
    },
  };
}
