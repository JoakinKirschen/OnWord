/** Document statistics: pages, words, characters, paragraphs. */

const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre';

/**
 * @typedef {{ words: number, characters: number, charactersNoSpaces: number, paragraphs: number }} TextCounts
 */

/** @param {string} text @returns {Omit<TextCounts, 'paragraphs'>} */
export function countText(text) {
  const flat = text.replace(/\n/g, '');
  return {
    words: (text.match(/\S+/g) || []).length,
    characters: flat.length,
    charactersNoSpaces: flat.replace(/\s/g, '').length,
  };
}

/** @param {HTMLElement} content @returns {TextCounts} */
export function countDocument(content) {
  const paragraphs = [...content.querySelectorAll(BLOCKS)].filter(
    (block) => block.textContent.trim() && !block.querySelector(BLOCKS),
  ).length;
  return { ...countText(content.innerText), paragraphs };
}

/**
 * Geometry of the paged view, read from the custom properties that page setup and pagination publish.
 * @param {HTMLElement} content
 * @returns {{ margin: number, body: number, pitch: number, pages: number }} `body`: text height of a page;
 *   `pitch`: distance from the top of one page to the top of the next
 */
export function pageLayout(content) {
  const style = getComputedStyle(content);
  const number = (/** @type {string} */ name) => parseFloat(style.getPropertyValue(name)) || 0;
  const margin = parseFloat(style.paddingTop) || 0;
  const body = number('--page-body-h');
  return { margin, body, pitch: body + 2 * margin + number('--page-gap'), pages: Math.max(1, number('--page-count')) };
}

/** Number of pages in the paged view. @param {HTMLElement} content */
export const countPages = (content) => pageLayout(content).pages;

/** The page a top-level block starts on (1-based). @param {HTMLElement} block @param {HTMLElement} content */
export function pageOf(block, content) {
  const { margin, pitch } = pageLayout(content);
  return pitch ? Math.floor((block.offsetTop - margin + 1) / pitch) + 1 : 1;
}

/** "1 page", "2 words" */
export const plural = (/** @type {number} */ n, /** @type {string} */ noun) =>
  `${n.toLocaleString()} ${noun}${n === 1 ? '' : 's'}`;
