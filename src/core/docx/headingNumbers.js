/**
 * Word's automatic numbers in front of headings ("20.31 Betonklinkers"), for reading a document's outline,
 * such as a specification's articles. Without this, a numbered heading is read as a list item and loses
 * both its number and its level. The numbers are worked out as Word counts them and written into the
 * headings' text; every numbered paragraph is counted, headings or not, as they share counters.
 */

import { decide } from './styles.js';
import { all, attr, kid, kids, val } from './xml.js';

const WML = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const LEVELS = 9;
/** @type {[number, string][]} */
const ROMAN = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];
const ALPHABET = 26;

function roman(/** @type {number} */ n) {
  let rest = n;
  let out = '';
  for (const [value, digits] of ROMAN) {
    for (; rest >= value; rest -= value) out += digits;
  }
  return out;
}
const letters = (/** @type {number} */ n) =>
  String.fromCharCode(97 + ((n - 1) % ALPHABET)).repeat(Math.ceil(n / ALPHABET));
/** Word's number formats, as text. */
const FORMATS = {
  decimal: String,
  decimalZero: (/** @type {number} */ n) => String(n).padStart(2, '0'),
  lowerLetter: letters,
  upperLetter: (/** @type {number} */ n) => letters(n).toUpperCase(),
  lowerRoman: roman,
  upperRoman: (/** @type {number} */ n) => roman(n).toUpperCase(),
};

/**
 * Writes the numbers of numbered headings into their text and takes their numbering off.
 * @param {Element} body the document's body
 * @param {import('./styles.js').StyleSheet} sheet
 * @param {Document | null} numbering word/numbering.xml
 */
export function numberHeadings(body, sheet, numbering) {
  const label = createCounters(numbering);
  for (const p of all(body, 'p')) {
    const pPr = kid(p, 'pPr');
    const styleId = val(pPr, 'pStyle');
    const own = kid(pPr, 'numPr');
    const numPr = own ?? decide(sheet.paragraph(styleId).pPr, 'numPr');
    const numId = val(numPr, 'numId');
    if (!numId || numId === '0') continue;
    const text = label(numId, Number(val(numPr, 'ilvl')) || 0);
    if (!/^h\d$/.test(sheet.tag(styleId))) continue;
    if (own) pPr.removeChild(own);
    if (!text) continue;
    const doc = p.ownerDocument;
    const run = doc.createElementNS(WML, 'w:r');
    const t = run.appendChild(doc.createElementNS(WML, 'w:t'));
    t.setAttribute('xml:space', 'preserve');
    t.textContent = text + ' ';
    p.insertBefore(run, pPr ? pPr.nextSibling : p.firstChild);
  }
}

/** Counts numbered paragraphs as Word does; gives the text of each one's number. */
function createCounters(/** @type {Document | null} */ doc) {
  const abstracts = new Map();
  for (const abstract of all(doc, 'abstractNum')) {
    const levels = new Map(kids(abstract, 'lvl').map((lvl) => [Number(attr(lvl, 'ilvl')), lvl]));
    abstracts.set(attr(abstract, 'abstractNumId'), levels);
  }
  const nums = new Map(all(doc, 'num').map((num) => [attr(num, 'numId'), val(num, 'abstractNumId')]));
  /** Per abstract numbering, the count at each level; undefined where a level has not started. */
  const counts = new Map();

  return (/** @type {string} */ numId, /** @type {number} */ level) => {
    const abstractId = nums.get(numId);
    const levels = abstracts.get(abstractId);
    if (!levels?.has(level)) return '';
    const start = (/** @type {number} */ l) => Number(val(levels.get(l), 'start') ?? 1);
    if (!counts.has(abstractId)) counts.set(abstractId, Array(LEVELS).fill(undefined));
    const count = counts.get(abstractId);
    for (let l = 0; l < level; l++) count[l] ??= start(l); // a level that was skipped shows its start
    count[level] = count[level] === undefined ? start(level) : count[level] + 1;
    count.fill(undefined, level + 1);
    const lvl = levels.get(level);
    if (val(lvl, 'numFmt') === 'bullet' || val(lvl, 'numFmt') === 'none') return '';
    return (val(lvl, 'lvlText') ?? '').replace(/%(\d)/g, (_, n) => {
      const format = FORMATS[val(levels.get(n - 1), 'numFmt')] ?? String;
      return format(count[n - 1] ?? start(n - 1));
    });
  };
}
