/** Paragraph-level formatting (alignment, spacing, indents, base font) in both directions: element ↔ <w:pPr>. */

import { cssPx } from '../units.js';
import { blockRunProperties } from './inline.js';
import { BODY, SINGLE_LINE, SINGLE_LINE_CSS, wordLine } from './parts.js';
import { decide, decideAttr, isSet } from './styles.js';
import { attr, kid } from './xml.js';

const TWIPS_PER_PX = 15;
const TWIPS_PER_PT = 20;
const WORD_DEFAULT_SIZE = 10; // pt, when neither the document defaults nor a style set one
const TO_WORD_ALIGN = { left: 'left', center: 'center', right: 'right', justify: 'both' };
const FROM_WORD_ALIGN = { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' };

/**
 * @typedef {{ style?: string, numbering?: string, indent?: number }} ParagraphOptions `indent` is extra
 *   left indent in twips. List items (`numbering`) get contextual spacing: no space between items, like a
 *   list in the editor, which has its space below the list as a whole.
 */

const twips = (/** @type {string} */ length) => Math.round(cssPx(length) * TWIPS_PER_PX);
const attrs = (/** @type {(string | false | 0)[]} */ list) => list.filter(Boolean).join(' ');

function lineXml(/** @type {string} */ lineHeight) {
  if (lineHeight.endsWith('pt'))
    return `w:line="${Math.round(parseFloat(lineHeight) * TWIPS_PER_PT)}" w:lineRule="exact"`;
  return Number(lineHeight) > 0 && `w:line="${wordLine(Number(lineHeight))}" w:lineRule="auto"`;
}

function spacingXml(/** @type {CSSStyleDeclaration} */ style) {
  const spacing = attrs([
    style.marginTop && `w:before="${twips(style.marginTop)}"`,
    style.marginBottom && `w:after="${twips(style.marginBottom)}"`,
    lineXml(style.lineHeight),
  ]);
  return spacing && `<w:spacing ${spacing}/>`;
}

function indentXml(/** @type {CSSStyleDeclaration} */ style, /** @type {number} */ extra) {
  const left = twips(style.marginLeft) + extra;
  const firstLine = twips(style.textIndent);
  const indent = attrs([
    left && `w:left="${left}"`,
    style.marginRight && `w:right="${twips(style.marginRight)}"`,
    firstLine > 0 && `w:firstLine="${firstLine}"`,
    firstLine < 0 && `w:hanging="${-firstLine}"`,
  ]);
  return indent && `<w:ind ${indent}/>`;
}

/**
 * A <w:p> with properties taken from `options` and from the element's own inline style.
 * @param {string} runs
 * @param {HTMLElement | null} [el]
 * @param {ParagraphOptions} [options]
 */
export function paragraphXml(runs, el = null, options = {}) {
  const style = el?.style;
  const parts = [
    options.style && `<w:pStyle w:val="${options.style}"/>`,
    options.numbering,
    style && spacingXml(style),
    // A list item's indent comes from its numbering level.
    style && !options.numbering
      ? indentXml(style, options.indent || 0)
      : options.indent && `<w:ind w:left="${options.indent}"/>`,
    options.numbering && '<w:contextualSpacing/>',
    TO_WORD_ALIGN[style?.textAlign] && `<w:jc w:val="${TO_WORD_ALIGN[style.textAlign]}"/>`,
    el && blockRunProperties(el), // the paragraph mark, which also sets the height of an empty paragraph
  ].filter(Boolean);
  return `<w:p>${parts.length ? `<w:pPr>${parts.join('')}</w:pPr>` : ''}${runs}</w:p>`;
}

const twipsOf = (/** @type {string | null} */ value) => Number(value) || 0;
const pt = (/** @type {number} */ twipsValue) => +(twipsValue / TWIPS_PER_PT).toFixed(2);
const px = (/** @type {number} */ twipsValue) => Math.round(twipsValue / TWIPS_PER_PX) + 'px';

/** @typedef {import('./styles.js').Chain} Chain */
/**
 * @typedef {'p' | 'li' | 'direct'} ParagraphKind `p` and `li` are compared with the editor's look of
 *   that element, so only differences are written; `direct` (headings and other styled blocks, whose look
 *   is the editor's) states only what the paragraph sets itself
 * @typedef {{ size: number, font: string | null }} BaseFont the paragraph's own text size (pt) and font
 */

/** CSS declarations for the indents, decided attribute by attribute. */
function indentCss(/** @type {Chain} */ pPr) {
  const side = (/** @type {string} */ a, /** @type {string} */ b) =>
    twipsOf(decideAttr(pPr, 'ind', a) ?? decideAttr(pPr, 'ind', b));
  // First-line and hanging indents exclude each other; whichever level set one of them decides.
  const first = pPr.findLast((el) => ['firstLine', 'hanging'].some((a) => attr(decide([el], 'ind'), a) != null));
  const ind = decide(first ? [first] : [], 'ind');
  const firstLine = twipsOf(attr(ind, 'firstLine')) - twipsOf(attr(ind, 'hanging'));
  const left = side('left', 'start');
  const right = side('right', 'end');
  return [
    left && `margin-left: ${px(left)}`,
    right && `margin-right: ${px(right)}`,
    firstLine && `text-indent: ${px(firstLine)}`,
  ];
}

/** The CSS line-height for the decided line spacing: a multiple, or points for an exact height. */
function lineHeightOf(/** @type {Chain} */ pPr) {
  const spacing = kid(
    pPr.findLast((el) => attr(kid(el, 'spacing'), 'line') != null),
    'spacing',
  );
  if (!spacing) return null;
  const line = twipsOf(attr(spacing, 'line'));
  if ((attr(spacing, 'lineRule') ?? 'auto') !== 'auto') return pt(line) + 'pt';
  return +((line / SINGLE_LINE) * SINGLE_LINE_CSS).toFixed(2);
}

/** Space before and after in pt, or null where nothing needs saying. */
function spaceOf(/** @type {Chain} */ pPr, /** @type {ParagraphKind} */ kind) {
  const before = decideAttr(pPr, 'spacing', 'before');
  const after = decideAttr(pPr, 'spacing', 'after');
  if (kind === 'direct') {
    return { top: before == null ? null : pt(twipsOf(before)), bottom: after == null ? null : pt(twipsOf(after)) };
  }
  // Contextual spacing drops the space between paragraphs of one style: the items of a list.
  if (kind === 'li' && isSet(pPr, 'contextualSpacing')) return { top: null, bottom: null };
  const differs = (/** @type {number} */ value, /** @type {number} */ editor) => (value === editor ? null : value);
  return {
    top: differs(pt(twipsOf(before)), 0),
    bottom: differs(pt(twipsOf(after)), kind === 'li' ? 0 : BODY.after),
  };
}

/** The size and font the paragraph's text starts from. @returns {BaseFont} */
function baseFont(/** @type {Chain} */ rPr) {
  return {
    size: Number(decideAttr(rPr, 'sz', 'val')) / 2 || WORD_DEFAULT_SIZE,
    font: decideAttr(rPr, 'rFonts', 'ascii'),
  };
}

/**
 * The ` style="…"` attribute for a paragraph (or '' when it has nothing to say), and the font its text
 * starts from, which runs need not repeat.
 * @param {import('./styles.js').TextChains} chains every level the paragraph inherits from, its own last;
 *   `rPr` ends with the paragraph mark's properties
 * @param {ParagraphKind} kind
 * @returns {{ attr: string, base?: BaseFont }}
 */
export function readParagraph({ pPr, rPr }, kind) {
  const align = FROM_WORD_ALIGN[attr(decide(pPr, 'jc'), 'val')];
  const base = kind === 'direct' ? undefined : baseFont(rPr);
  // Word's single spacing applies when nothing sets the line height.
  const lineHeight = lineHeightOf(pPr) ?? (kind === 'direct' ? BODY.lineHeight : SINGLE_LINE_CSS);
  const { top, bottom } = spaceOf(pPr, kind);
  const css = [
    align && `text-align: ${align}`,
    lineHeight !== BODY.lineHeight && `line-height: ${lineHeight}`,
    ...(kind === 'li' ? [] : indentCss(pPr)),
    top != null && `margin-top: ${top}pt`,
    bottom != null && `margin-bottom: ${bottom}pt`,
    base && base.size !== BODY.size && `font-size: ${base.size}pt`,
    base?.font && base.font !== BODY.font && `font-family: ${base.font.replace(/[;"<>]/g, '')}`,
  ].filter(Boolean);
  return { attr: css.length ? ` style="${css.join('; ')};"` : '', base };
}
