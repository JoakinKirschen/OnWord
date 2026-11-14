/** Tiles that start a document from a template, each showing a miniature of the template's first page. */

import { esc } from '../core/html.js';
import { MORE_ICON } from './popover.js';

/**
 * The tiles' markup. Each runs `act` with the template's id; `menu` adds an options button, which carries
 * the id in `data-template` for the screen to handle. The miniatures are filled in by `drawPreviews`.
 * @param {{ id: string, name: string, menu?: boolean }[]} tiles
 * @param {string} act
 */
export const tilesHtml = (tiles, act) =>
  tiles
    .map(
      ({ id, name, menu }) => `<div class="template-item">
    <button class="template" data-act="${act}" data-arg="${esc(id)}" title="New document from this template">
      <span class="template-page"></span><span class="template-name">${esc(name)}</span></button>
    ${menu ? `<button class="icon-btn sm template-more" data-template="${esc(id)}" aria-label="Template options" title="Options">${MORE_ICON}</button>` : ''}
  </div>`,
    )
    .join('');

/**
 * Puts each template's content in its tile, in the order of the tiles, without ids that could clash with
 * those of an open document.
 * @param {Element} root the element the tiles are in
 * @param {string[]} htmls
 */
export function drawPreviews(root, htmls) {
  const pages = root.querySelectorAll('.template-item .template-page');
  htmls.forEach((html, i) => {
    pages[i].innerHTML = html;
    pages[i].querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  });
}
