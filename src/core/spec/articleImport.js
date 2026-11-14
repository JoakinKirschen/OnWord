/**
 * Articles found in a Word document, for importing into a master specification. The document comes as
 * blocks: headings with their level and pieces of text. Every heading becomes an article that holds the
 * text up to the next heading. A document without headings is read by its numbered titles instead: short
 * paragraphs that start with a number ("20.31 Betonklinkers").
 */

import { blankArticle, suggestNumber } from './model.js';

/**
 * @typedef {import('./model.js').Article} Article
 * @typedef {{ level: number, text: string, html: string }} Block `level`: 1 for the highest headings, 0 for
 *   text; `text` has a line per paragraph or list item
 * @typedef {{ number: string, title: string, unit: string, html: string, level: number }} Draft
 */

const NUMBERED = /^(\d{1,4}(?:\.\d{1,4})*)\.?\s+(\S.*)$/;
const MAX_TITLE = 150; // longer numbered paragraphs are text, such as a numbered list of requirements
const UNIT_LINE = /^(?:meeteenheid|eenheid|unité de mesure|unite de mesure|unité|unit)\s*[:=]\s*(.+)$/i;
const MAX_UNIT = 30;
/** How units are written in specifications, and how the workspace writes them. */
const UNITS = {
  m2: 'm²',
  m3: 'm³',
  m1: 'm',
  lm: 'm',
  'st.': 'st',
  stuk: 'st',
  stuks: 'st',
  pc: 'st',
  pce: 'st',
  piece: 'st',
  pièce: 'st',
  pièces: 'st',
  uur: 'h',
  u: 'h',
};

/** A title's number and the rest: "20.31. Betonklinkers" → 20.31 and Betonklinkers. */
export function splitNumber(/** @type {string} */ text) {
  const match = NUMBERED.exec(text.trim());
  return match ? { number: match[1], title: match[2].trim() } : { number: '', title: text.trim() };
}

/** The unit named on a line of the text ("Meeteenheid: per m2" → m²), or ''. */
export function unitIn(/** @type {string} */ text) {
  for (const line of text.split('\n')) {
    const match = UNIT_LINE.exec(line.replace(/^[\s\-–•·*]+/, ''));
    if (!match) continue;
    const word = match[1]
      .trim()
      .replace(/^per\s+/i, '')
      .split(/[\s,;()]/)[0];
    return UNITS[word.toLowerCase()] ?? word.slice(0, MAX_UNIT);
  }
  return '';
}

/** Whether a paragraph of a document without headings is the title of an article. */
function isNumberedTitle(/** @type {Block} */ block) {
  const { number, title } = splitNumber(block.text);
  return !!number && !block.text.includes('\n') && title.length <= MAX_TITLE && !/[.:;,]$/.test(title);
}

/**
 * The articles a document's blocks describe, in order, with their outline level. Text before the first
 * heading (a title page, an introduction) belongs to no article and is left out.
 * @param {Block[]} blocks
 * @returns {Draft[]}
 */
export function draftArticles(blocks) {
  const headed = blocks.some((b) => b.level > 0)
    ? blocks
    : blocks.map((b) => (isNumberedTitle(b) ? { ...b, level: splitNumber(b.text).number.split('.').length } : b));
  /** @type {Draft[]} */
  const drafts = [];
  for (const block of headed) {
    if (block.level > 0) {
      if (block.text.trim()) drafts.push({ ...splitNumber(block.text), unit: '', html: '', level: block.level });
      continue;
    }
    const current = drafts.at(-1);
    if (!current) continue;
    current.html += block.html;
    current.unit ||= unitIn(block.text);
  }
  return drafts;
}

/** Index of the draft a draft goes under: by its number where it has one, else by its level; -1 for none. */
function parentOf(/** @type {Draft[]} */ drafts, /** @type {number} */ i) {
  const { number, level } = drafts[i];
  if (number) {
    for (let j = i - 1; j >= 0; j--) if (drafts[j].number && number.startsWith(drafts[j].number + '.')) return j;
  }
  for (let j = i - 1; j >= 0; j--) if (drafts[j].level < level) return j;
  return -1;
}

/**
 * The drafts as articles in a tree: a numbered one goes under the nearest article before it whose number
 * begins its own ("20.31" under "20"), any other under the nearest one of a higher level. Articles
 * without a number get the next free one where they are placed.
 * @param {Draft[]} drafts
 * @param {{ existing: Article[], newId: () => string }} options `existing`: the specification's articles
 * @returns {Article[]}
 */
export function toArticles(drafts, { existing, newId }) {
  /** @type {Article[]} */
  const made = [];
  drafts.forEach((draft, i) => {
    const parent = parentOf(drafts, i);
    const parentId = parent < 0 ? null : made[parent].id;
    const { number, title, unit, html } = draft;
    const article = { id: newId(), ...blankArticle({ parentId, number, title, unit, ...(html && { html }) }) };
    article.number ||= suggestNumber([...existing, ...made], parentId);
    made.push(article);
  });
  return made;
}

/**
 * The chosen ones of the articles read, each under its nearest chosen ancestor or, failing that, under the
 * article of the specification that has the number of its nearest ancestor (so that a document's new
 * articles join an earlier import of it); otherwise at the top.
 * @param {Article[]} found
 * @param {Set<string>} chosen ids
 * @param {Article[]} existing the specification's articles
 * @returns {Article[]}
 */
export function placeChosen(found, chosen, existing) {
  const byId = new Map(found.map((a) => [a.id, a]));
  const place = (/** @type {Article} */ article) => {
    for (let up = byId.get(article.parentId); up; up = byId.get(up.parentId)) {
      if (chosen.has(up.id)) return up.id;
      const same = up.number && existing.find((a) => a.number === up.number);
      if (same) return same.id;
    }
    return null;
  };
  return found.filter((a) => chosen.has(a.id)).map((a) => ({ ...a, parentId: place(a) }));
}
