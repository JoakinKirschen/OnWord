/** Word's style cascade: document defaults, then paragraph, character and table styles along their basedOn chains. */

import { all, attr, isOn, kid, val } from './xml.js';

const MAX_HEADING = 5;
export const TOC = 'toc'; // a tag value for the entries of a table of contents
export const SUBTITLE = 'p.subtitle'; // a tag value: tag plus class
const ON = ['1', 'true', 'on'];

/**
 * @typedef {Element[]} Chain property elements of one kind (pPr, rPr, tblPr…), most general first; the
 *   last one that sets a property decides it
 * @typedef {{ pPr: Chain, rPr: Chain }} TextChains properties a paragraph inherits for itself and its text
 * @typedef {ReturnType<typeof readStyleSheet>} StyleSheet
 */

/** The tag a paragraph style stands for, judged by its (language-independent) id and its name. */
function tagForStyle(/** @type {string} */ id, /** @type {string} */ name) {
  const key = `${id} ${name}`.toLowerCase();
  if (/\btoc\s*\d/.test(key)) return TOC;
  const heading = key.match(/heading\s*(\d)/);
  if (heading) return 'h' + Math.min(Number(heading[1]) + 1, MAX_HEADING); // the app's "Heading 1" is <h2>
  if (/subtitle/.test(key)) return SUBTITLE;
  if (/\btitle\b/.test(key)) return 'h1';
  if (/quote|block\s*text/.test(key)) return 'blockquote';
  if (/list\s*bullet/.test(key)) return 'ul'; // list styles carry their numbering in the style itself
  if (/list\s*number/.test(key)) return 'ol';
  if (/code|preformatted|source/.test(key)) return 'pre';
  return 'p';
}

/** The child element named `name` that decides a property: the one in the most specific level that has it. */
export const decide = (/** @type {Chain} */ chain, /** @type {string} */ name) =>
  kid(
    chain.findLast((el) => kid(el, name)),
    name,
  );

/**
 * An attribute of a child element, decided attribute by attribute: a style may set the space after a
 * paragraph and the paragraph itself only the space before.
 */
export const decideAttr = (/** @type {Chain} */ chain, /** @type {string} */ name, /** @type {string} */ attribute) =>
  attr(
    kid(
      chain.findLast((el) => attr(kid(el, name), attribute) != null),
      name,
    ),
    attribute,
  );

/** Whether a toggle property (bold, italic…) is on after the whole chain has had its say. */
export const isSet = (/** @type {Chain} */ chain, /** @type {string} */ name) =>
  isOn(
    chain.findLast((el) => kid(el, name)),
    name,
  );

const present = (/** @type {(Element | undefined)[]} */ list) => /** @type {Chain} */ (list.filter(Boolean));

/** @param {Document | null} doc word/styles.xml */
export function readStyleSheet(doc) {
  const byId = new Map(all(doc, 'style').map((style) => [attr(style, 'styleId'), style]));
  const fallback = (/** @type {string} */ type) =>
    all(doc, 'style').find((s) => attr(s, 'type') === type && ON.includes(attr(s, 'default') ?? ''));
  /** The style and the styles it is based on, most general first. */
  const lineage = (/** @type {string | null} */ id, /** @type {string} */ type) => {
    const out = [];
    let style = id ? byId.get(id) : fallback(type);
    while (style && attr(style, 'type') === type && !out.includes(style)) {
      out.unshift(style);
      style = byId.get(val(style, 'basedOn'));
    }
    return out;
  };
  const parts = (/** @type {Element[]} */ styles, /** @type {string} */ name) =>
    present(styles.map((style) => kid(style, name)));
  const defaults = kid(all(doc, 'docDefaults')[0], 'pPrDefault');
  const runDefaults = kid(all(doc, 'docDefaults')[0], 'rPrDefault');
  const tags = new Map();
  for (const [id, style] of byId) {
    if (attr(style, 'type') === 'paragraph') tags.set(id, tagForStyle(id, val(style, 'name') || ''));
  }
  return {
    /** The HTML tag a paragraph style becomes. */
    tag: (/** @type {string | null} */ id) => tags.get(id) || (id ? tagForStyle(id, '') : 'p'),
    /** What every paragraph starts from. @returns {TextChains} */
    defaults: () => ({ pPr: present([kid(defaults, 'pPr')]), rPr: present([kid(runDefaults, 'rPr')]) }),
    /** @returns {TextChains} */
    paragraph(/** @type {string | null} */ id) {
      const styles = lineage(id, 'paragraph');
      return { pPr: parts(styles, 'pPr'), rPr: parts(styles, 'rPr') };
    },
    character: (/** @type {string | null} */ id) => (id ? parts(lineage(id, 'character'), 'rPr') : []),
    /** A table style's own properties and what it gives the paragraphs inside the table. */
    table(/** @type {string | null} */ id) {
      const styles = lineage(id, 'table');
      return { tblPr: parts(styles, 'tblPr'), pPr: parts(styles, 'pPr'), rPr: parts(styles, 'rPr') };
    },
  };
}
