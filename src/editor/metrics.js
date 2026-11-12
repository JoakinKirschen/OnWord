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
 * Estimated number of printed pages: the content height divided by the printable height of a page.
 * Explicit page breaks and columns are not accounted for.
 * @param {HTMLElement} content
 */
export function countPages(content) {
  const style = getComputedStyle(content);
  const bodyHeight = parseFloat(style.getPropertyValue('--page-body-h')) || 0;
  const used = content.scrollHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  return bodyHeight ? Math.max(1, Math.ceil((used - 1) / bodyHeight)) : 1;
}

/** "1 page", "2 words" */
export const plural = (/** @type {number} */ n, /** @type {string} */ noun) =>
  `${n.toLocaleString()} ${noun}${n === 1 ? '' : 's'}`;
