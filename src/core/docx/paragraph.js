/** Paragraph-level formatting (alignment, spacing, indents) in both directions: element ↔ <w:pPr>. */

import { cssPx } from '../units.js';
import { attr, kid, val } from './xml.js';

const TWIPS_PER_PX = 15;
const TWIPS_PER_PT = 20;
const SINGLE_LINE = 240; // w:spacing line units for line-height 1
const DEFAULT_LINE_HEIGHT = 1.5; // styles/document.css; not worth repeating on every imported paragraph
const TO_WORD_ALIGN = { left: 'left', center: 'center', right: 'right', justify: 'both' };
const FROM_WORD_ALIGN = { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' };

/** @typedef {{ style?: string, numbering?: string, indent?: number }} ParagraphOptions `indent` is extra left indent in twips */

const twips = (/** @type {string} */ length) => Math.round(cssPx(length) * TWIPS_PER_PX);
const attrs = (/** @type {(string | false | 0)[]} */ list) => list.filter(Boolean).join(' ');

function spacingXml(/** @type {CSSStyleDeclaration} */ style) {
  const lineHeight = Number(style.lineHeight);
  const spacing = attrs([
    style.marginTop && `w:before="${twips(style.marginTop)}"`,
    style.marginBottom && `w:after="${twips(style.marginBottom)}"`,
    lineHeight && `w:line="${Math.round(lineHeight * SINGLE_LINE)}" w:lineRule="auto"`,
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
    TO_WORD_ALIGN[style?.textAlign] && `<w:jc w:val="${TO_WORD_ALIGN[style.textAlign]}"/>`,
  ].filter(Boolean);
  return `<w:p>${parts.length ? `<w:pPr>${parts.join('')}</w:pPr>` : ''}${runs}</w:p>`;
}

const number = (/** @type {Element | undefined} */ el, /** @type {string} */ name) => Number(attr(el, name)) || 0;

/** CSS declarations for a <w:ind>. */
function indentCss(/** @type {Element | undefined} */ ind) {
  const px = (/** @type {number} */ value) => Math.round(value / TWIPS_PER_PX) + 'px';
  const left = number(ind, 'left') || number(ind, 'start');
  const right = number(ind, 'right') || number(ind, 'end');
  const firstLine = number(ind, 'firstLine') - number(ind, 'hanging');
  return [
    left && `margin-left: ${px(left)}`,
    right && `margin-right: ${px(right)}`,
    firstLine && `text-indent: ${px(firstLine)}`,
  ];
}

/** CSS declarations for the before/after space of a <w:spacing>. */
function spaceCss(/** @type {Element | undefined} */ spacing) {
  const pt = (/** @type {string} */ name) => +(number(spacing, name) / TWIPS_PER_PT).toFixed(1) + 'pt';
  return [
    attr(spacing, 'before') != null && `margin-top: ${pt('before')}`,
    attr(spacing, 'after') != null && `margin-bottom: ${pt('after')}`,
  ];
}

function lineHeightOf(/** @type {Element | undefined} */ spacing) {
  if ((attr(spacing, 'lineRule') ?? 'auto') !== 'auto') return 0; // exact heights have no CSS multiplier
  const lineHeight = +(number(spacing, 'line') / SINGLE_LINE).toFixed(2);
  return lineHeight === DEFAULT_LINE_HEIGHT ? 0 : lineHeight;
}

/**
 * A ` style="…"` attribute for a paragraph's <w:pPr>, or '' when it has nothing to say.
 * @param {Element | undefined} pPr
 * @param {{ indents?: boolean }} [options] list items pass `indents: false`
 */
export function paragraphStyleAttr(pPr, { indents = true } = {}) {
  const spacing = kid(pPr, 'spacing');
  const align = FROM_WORD_ALIGN[val(pPr, 'jc')];
  const lineHeight = lineHeightOf(spacing);
  const css = [
    align && `text-align: ${align}`,
    lineHeight && `line-height: ${lineHeight}`,
    ...(indents ? indentCss(kid(pPr, 'ind')) : []),
    ...spaceCss(spacing),
  ].filter(Boolean);
  return css.length ? ` style="${css.join('; ')};"` : '';
}
