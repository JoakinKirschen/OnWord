/** List numbering in both directions: the editor's list styles (CSS list-style-type) ↔ word/numbering.xml. */

import { XML_HEADER } from './parts.js';
import { all, attr, kids, val } from './xml.js';

const WML = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const BULLET_NUM_ID = 1;
const LIST_LEVELS = 9;
const INDENT_PER_LEVEL = 720; // twips
/** CSS list-style-type → Word's numbering format and, for bullets, the character. */
export const LIST_TYPES = {
  disc: { format: 'bullet', text: '•' },
  circle: { format: 'bullet', text: '◦' },
  square: { format: 'bullet', text: '▪' },
  decimal: { format: 'decimal' },
  'lower-alpha': { format: 'lowerLetter' },
  'upper-alpha': { format: 'upperLetter' },
  'lower-roman': { format: 'lowerRoman' },
  'upper-roman': { format: 'upperRoman' },
};
/** Bullet characters Word files use, including Symbol's and Wingdings' private-use ones. */
const BULLET_TYPES = {
  '•': 'disc',
  '·': 'disc',
  '': 'disc',
  '◦': 'circle',
  '○': 'circle',
  o: 'circle',
  '▪': 'square',
  '■': 'square',
  '': 'square',
  '': 'square',
};
const NESTED_BULLETS = ['disc', 'circle', 'square'];

/** How a browser draws a list `level` deep when its style says nothing: bullets change, numbers do not. */
export const defaultListType = (/** @type {boolean} */ ordered, /** @type {number} */ level) =>
  ordered ? 'decimal' : NESTED_BULLETS[Math.min(level, NESTED_BULLETS.length - 1)];

/** @typedef {{ numId: number, type: string, ordered: boolean }} ListNumbering a list's numbering instance */

function abstractNum(/** @type {number} */ id, /** @type {(level: number) => string} */ typeOf) {
  const levels = Array.from({ length: LIST_LEVELS }, (_, level) => {
    const { format, text } = LIST_TYPES[typeOf(level)];
    const left = INDENT_PER_LEVEL * (level + 1);
    return (
      `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="${format}"/>` +
      `<w:lvlText w:val="${text ?? `%${level + 1}.`}"/><w:lvlJc w:val="left"/>` +
      `<w:pPr><w:ind w:left="${left}" w:hanging="360"/></w:pPr></w:lvl>`
    );
  });
  return `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${levels.join('')}</w:abstractNum>`;
}

/**
 * word/numbering.xml. Unstyled lists look as the browser draws them; a styled list uses its style at
 * every level it is written for. Every ordered list has its own instance, so that it restarts at 1.
 * @param {ListNumbering[]} lists the lists that need an instance other than the plain bullets'
 */
export function numbering(lists) {
  /** One abstract numbering per look: a list style, or the unstyled bullets or numbers. */
  const abstracts = new Map();
  const abstractFor = (/** @type {string} */ type, /** @type {boolean} */ ordered) => {
    const key = type || (ordered ? 'numbers' : 'bullets');
    if (!abstracts.has(key))
      abstracts.set(
        key,
        abstractNum(abstracts.size, (l) => type || defaultListType(ordered, l)),
      );
    return [...abstracts.keys()].indexOf(key); // ids are given in order of creation
  };
  const restart = Array.from(
    { length: LIST_LEVELS },
    (_, l) => `<w:lvlOverride w:ilvl="${l}"><w:startOverride w:val="1"/></w:lvlOverride>`,
  ).join('');
  const nums = [{ numId: BULLET_NUM_ID, type: '', ordered: false }, ...lists].map(
    ({ numId, type, ordered }) =>
      `<w:num w:numId="${numId}"><w:abstractNumId w:val="${abstractFor(type, ordered)}"/>${ordered ? restart : ''}</w:num>`,
  );
  return `${XML_HEADER}<w:numbering xmlns:w="${WML}">${[...abstracts.values()].join('')}
${nums.join('\n')}
</w:numbering>`;
}

/** The list style for a Word numbering level, or '' where it is what the browser draws anyway. */
function cssType(/** @type {Element} */ lvl, /** @type {number} */ level) {
  const format = val(lvl, 'numFmt') ?? 'bullet';
  const ordered = format !== 'bullet';
  const type = ordered
    ? Object.keys(LIST_TYPES).find((name) => LIST_TYPES[name].format === format)
    : BULLET_TYPES[(val(lvl, 'lvlText') ?? '').trim()];
  return { ordered, type: type && type !== defaultListType(ordered, level) ? type : '' };
}

/**
 * Reads word/numbering.xml: for a numbering instance and level, whether the list is ordered and the
 * list style it needs ('' for the browser's own).
 * @param {Document | null} doc
 * @returns {(numId: string, level: number) => { ordered: boolean, type: string }}
 */
export function readNumbering(doc) {
  const levels = new Map();
  for (const abstract of all(doc, 'abstractNum')) {
    const byLevel = new Map(kids(abstract, 'lvl').map((lvl) => [attr(lvl, 'ilvl'), lvl]));
    levels.set(attr(abstract, 'abstractNumId'), byLevel);
  }
  const nums = new Map(all(doc, 'num').map((num) => [attr(num, 'numId'), val(num, 'abstractNumId')]));
  return (numId, level) => {
    const lvl = levels.get(nums.get(numId))?.get(String(level));
    return lvl ? cssType(lvl, level) : { ordered: false, type: '' };
  };
}
