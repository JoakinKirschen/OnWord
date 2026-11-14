/** Document styles in both directions: the editor's style definitions ↔ word/styles.xml. */

import { resolveStyles, setStyle } from '../docStyles.js';
import { styleLook } from './paragraph.js';
import { STYLE, wordLine, XML_HEADER } from './parts.js';
import { decideAttr, isSet, SUBTITLE } from './styles.js';

const WML = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const TWIPS_PER_PT = 20;
const TOC_LEVELS = 5;
const AUTO_COLOR = '#000000';
const TO_WORD_ALIGN = { center: 'center', right: 'right', justify: 'both' };
/**
 * Document style → its Word style id, the tag the reader gives that style and, for headings, the outline level.
 * @type {Record<string, { word: string, tag: string, outline?: number }>}
 */
const WORD_STYLES = {
  title: { word: STYLE.h1, tag: 'h1' },
  subtitle: { word: STYLE.subtitle, tag: SUBTITLE },
  heading1: { word: STYLE.h2, tag: 'h2', outline: 0 },
  heading2: { word: STYLE.h3, tag: 'h3', outline: 1 },
  heading3: { word: STYLE.h4, tag: 'h4', outline: 2 },
  heading4: { word: STYLE.h5, tag: 'h5', outline: 3 },
  quote: { word: STYLE.quote, tag: 'blockquote' },
};
const QUOTE_BORDER = '<w:pBdr><w:left w:val="single" w:sz="18" w:space="10" w:color="C5C8D4"/></w:pBdr>';
const QUOTE_INDENT = '<w:ind w:left="280"/>';

/** @typedef {import('../docStyles.js').StyleDefinition} StyleDefinition */

const twips = (/** @type {number} */ pt) => Math.round(pt * TWIPS_PER_PT);
const size = (/** @type {number} */ pt) => `<w:sz w:val="${pt * 2}"/><w:szCs w:val="${pt * 2}"/>`;
const fonts = (/** @type {string} */ font) =>
  `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>`;
const toggle = (/** @type {string} */ name, /** @type {boolean} */ on) =>
  on ? `<w:${name}/>` : `<w:${name} w:val="0"/>`;
const spacing = (/** @type {Pick<StyleDefinition, 'before' | 'after' | 'lineHeight'>} */ s) =>
  `<w:spacing w:before="${twips(s.before)}" w:after="${twips(s.after)}" w:line="${wordLine(s.lineHeight)}" w:lineRule="auto"/>`;
const color = (/** @type {string} */ value) => `<w:color w:val="${value.slice(1).toUpperCase()}"/>`;

/** Run properties of a style, everything stated so nothing depends on what Word would inherit. */
const runXml = (/** @type {StyleDefinition} */ s, /** @type {StyleDefinition} */ normal) =>
  (s.font !== normal.font ? fonts(s.font) : '') +
  toggle('b', s.bold) +
  toggle('i', s.italic) +
  color(s.color) +
  size(s.size) +
  (s.underline ? '<w:u w:val="single"/>' : '');

const paragraphStyle = (/** @type {{ id: string, name: string, pPr?: string, rPr?: string, next?: string }} */ s) =>
  `<w:style w:type="paragraph" w:styleId="${s.id}"><w:name w:val="${s.name}"/><w:basedOn w:val="Normal"/>` +
  `<w:next w:val="${s.next || 'Normal'}"/><w:qFormat/><w:pPr>${s.pPr || ''}</w:pPr><w:rPr>${s.rPr || ''}</w:rPr></w:style>`;

/** A style of the editor's as a Word paragraph style. */
function wordStyle(/** @type {string} */ id, /** @type {Record<string, StyleDefinition>} */ looks) {
  const s = looks[id];
  const { word: wordId, outline } = WORD_STYLES[id];
  const heading = outline !== undefined;
  const jc = TO_WORD_ALIGN[s.align] ? `<w:jc w:val="${TO_WORD_ALIGN[s.align]}"/>` : '<w:jc w:val="left"/>';
  const pPr = [
    (heading || id === 'title') && '<w:keepNext/>',
    id === 'quote' && QUOTE_BORDER,
    spacing(s),
    id === 'quote' && QUOTE_INDENT,
    jc,
    heading && `<w:outlineLvl w:val="${outline}"/>`,
  ].filter(Boolean);
  return paragraphStyle({
    id: wordId,
    name: heading ? `heading ${outline + 1}` : wordId,
    next: id === 'quote' ? wordId : 'Normal',
    pPr: pPr.join(''),
    rPr: runXml(s, looks.normal),
  });
}

/** Styles for the entries of a table of contents, indented by level. */
function tocStyles() {
  return Array.from({ length: TOC_LEVELS }, (_, i) =>
    paragraphStyle({
      id: `TOC${i + 1}`,
      name: `toc ${i + 1}`,
      next: `TOC${i + 1}`,
      pPr: `<w:spacing w:after="60"/><w:ind w:left="${i * 280}"/>`,
    }),
  ).join('\n');
}

/**
 * word/styles.xml for a document's styles; without overrides it mirrors styles/document.css.
 * @param {import('../docStyles.js').StyleOverrides} [overrides]
 */
export function stylesXml(overrides) {
  const looks = resolveStyles(overrides);
  const normal = looks.normal;
  const normalRun =
    (normal.bold ? '<w:b/>' : '') +
    (normal.italic ? '<w:i/>' : '') +
    (normal.color !== AUTO_COLOR ? color(normal.color) : '') +
    (normal.underline ? '<w:u w:val="single"/>' : '');
  const normalJc = TO_WORD_ALIGN[normal.align] ? `<w:jc w:val="${TO_WORD_ALIGN[normal.align]}"/>` : '';
  return `${XML_HEADER}<w:styles xmlns:w="${WML}">
<w:docDefaults>
<w:rPrDefault><w:rPr>${fonts(normal.font)}${size(normal.size)}<w:lang w:val="en-US"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr>${spacing(normal)}</w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr>${normalJc}</w:pPr><w:rPr>${normalRun}</w:rPr></w:style>
${Object.keys(WORD_STYLES)
  .map((id) => wordStyle(id, looks))
  .join('\n')}
${paragraphStyle({ id: STYLE.code, name: 'Code', next: STYLE.code, pPr: `<w:shd w:val="clear" w:color="auto" w:fill="F3F4F7"/><w:spacing w:line="${wordLine(1.45)}" w:lineRule="auto"/>`, rPr: `${fonts('Courier New')}${size(10)}` })}
${paragraphStyle({ id: STYLE.footnote, name: 'footnote text', pPr: `<w:spacing w:after="0" w:line="${wordLine(1.1)}" w:lineRule="auto"/>`, rPr: size(9) })}
${tocStyles()}
</w:styles>`;
}

/**
 * The document styles a Word file defines for its title, subtitle, headings and quotes, as overrides of
 * the editor's. Normal text is not read here: plain paragraphs carry their differences inline.
 * @param {import('./styles.js').StyleSheet} sheet
 * @returns {import('../docStyles.js').StyleOverrides}
 */
export function readDocStyles(sheet) {
  let overrides = {};
  const defaults = sheet.defaults();
  for (const [id, { word, tag }] of Object.entries(WORD_STYLES)) {
    const wordId = sheet.idFor(tag, word);
    if (!wordId) continue;
    const own = sheet.paragraph(wordId);
    const pPr = [...defaults.pPr, ...own.pPr];
    const rPr = [...defaults.rPr, ...own.rPr];
    const value = decideAttr(rPr, 'color', 'val');
    const underline = decideAttr(rPr, 'u', 'val');
    overrides = setStyle(overrides, /** @type {import('../docStyles.js').StyleId} */ (id), {
      ...styleLook({ pPr, rPr }),
      color: /^[0-9a-f]{6}$/i.test(value ?? '') ? '#' + value : AUTO_COLOR,
      bold: isSet(rPr, 'b'),
      italic: isSet(rPr, 'i'),
      underline: !!underline && underline !== 'none',
    });
  }
  return overrides;
}
