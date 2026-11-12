/** Footnotes, comments and the table of contents: the package parts they need, in both directions. */

import { esc } from '../html.js';
import { NAMESPACES, STYLE, XML_HEADER } from './parts.js';
import { all, attr, kids } from './xml.js';

const SUPERSCRIPT = '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>';
const TOC_FIELD = ' TOC \\o "1-5" \\h \\z \\u ';
const fieldChar = (/** @type {string} */ type) => `<w:r><w:fldChar w:fldCharType="${type}"/></w:r>`;

/** `w:author` / `w:date` attributes for a comment or tracked change, taken from the element's data. */
export function authorship(/** @type {HTMLElement} */ el) {
  const date = new Date(el.dataset.date ?? '');
  const stamp = Number.isNaN(date.getTime()) ? '' : ` w:date="${date.toISOString().slice(0, 19)}Z"`;
  return `w:author="${esc(el.dataset.author || 'Author')}"${stamp}`;
}

/** The run that stands for footnote `number` in the text. */
export const footnoteReferenceXml = (/** @type {number} */ number) =>
  `<w:r>${SUPERSCRIPT}<w:footnoteReference w:id="${number}"/></w:r>`;

/**
 * word/footnotes.xml. Ids -1 and 0 are the separators Word expects; notes are numbered from 1.
 * @param {string[]} notes the runs of each note, in order
 */
export function footnotesXml(notes) {
  const separator = (/** @type {number} */ id, /** @type {string} */ type) =>
    `<w:footnote w:type="${type}" w:id="${id}"><w:p><w:r><w:${type}/></w:r></w:p></w:footnote>`;
  const items = notes.map(
    (runs, i) =>
      `<w:footnote w:id="${i + 1}"><w:p><w:pPr><w:pStyle w:val="${STYLE.footnote}"/></w:pPr><w:r>${SUPERSCRIPT}<w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r>${runs}</w:p></w:footnote>`,
  );
  return `${XML_HEADER}<w:footnotes ${NAMESPACES}>${separator(-1, 'separator')}${separator(0, 'continuationSeparator')}${items.join('')}</w:footnotes>`;
}

/**
 * word/comments.xml
 * @param {{ text: string, authorship: string }[]} comments in id order, starting at 0
 */
export function commentsXml(comments) {
  const items = comments.map(
    (c, id) =>
      `<w:comment w:id="${id}" ${c.authorship}><w:p><w:r><w:t xml:space="preserve">${esc(c.text)}</w:t></w:r></w:p></w:comment>`,
  );
  return `${XML_HEADER}<w:comments ${NAMESPACES}>${items.join('')}</w:comments>`;
}

/**
 * A table of contents as a TOC field, so Word can update it, holding the current entries as its result.
 * @param {HTMLElement} el the `div.toc`
 * @param {number} tabStop position of the page-number column, in twips
 */
export function tocXml(el, tabStop) {
  const entries = [...el.querySelectorAll('p[class^="toc-"]:not(.toc-empty)')];
  const tabs = `<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${tabStop}"/></w:tabs>`;
  const paragraphs = entries.map((entry, i) => {
    const page = entry.querySelector('.toc-page')?.textContent ?? '';
    const title = entry.textContent.slice(0, entry.textContent.length - page.length);
    const start =
      i === 0
        ? fieldChar('begin') +
          `<w:r><w:instrText xml:space="preserve">${TOC_FIELD}</w:instrText></w:r>` +
          fieldChar('separate')
        : '';
    const end = i === entries.length - 1 ? fieldChar('end') : '';
    const level = entry.className.match(/toc-(\d)/)[1];
    return `<w:p><w:pPr><w:pStyle w:val="TOC${level}"/>${tabs}</w:pPr>${start}<w:r><w:t xml:space="preserve">${esc(title)}</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>${esc(page)}</w:t></w:r>${end}</w:p>`;
  });
  return paragraphs.join('');
}

/** Comments of an imported file, by id. @returns {Map<string, { text: string, author: string, date: string }>} */
export function readComments(/** @type {Document | null} */ doc) {
  const comments = new Map();
  for (const comment of all(doc, 'comment')) {
    const text = kids(comment, 'p').map((p) =>
      all(p, 't')
        .map((t) => t.textContent)
        .join(''),
    );
    comments.set(attr(comment, 'id'), {
      text: text.join('\n').trim(),
      author: attr(comment, 'author') ?? '',
      date: attr(comment, 'date') ?? '',
    });
  }
  return comments;
}

/** The paragraphs of each real footnote (separators have a type), by id. @returns {Map<string, Element[]>} */
export function readFootnotes(/** @type {Document | null} */ doc) {
  const notes = new Map();
  for (const note of all(doc, 'footnote')) {
    if (!attr(note, 'type') || attr(note, 'type') === 'normal') notes.set(attr(note, 'id'), kids(note, 'p'));
  }
  return notes;
}
