/** Converts inline document content (text, formatting, links, images) to WordprocessingML runs. */

import { esc } from '../html.js';
import { authorship, footnoteReferenceXml } from './notes.js';

const EMU_PER_PX = 9525;
const PX_TO_PT = 0.75;
const LINK_COLOR = '1A55C9';
const FALLBACK_IMAGE = { width: 300, height: 200 };
const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif' };
const BLOCK_TAGS = /^(UL|OL|TABLE)$/;

/**
 * @typedef {{ bold?: boolean, italic?: boolean, underline?: boolean, strike?: boolean, color?: string,
 *   highlight?: string, size?: number, font?: string, vertical?: 'superscript' | 'subscript', preserve?: boolean, deleted?: boolean }} Format
 * @typedef {{ addLink: (url: string) => string, addImage: (bytes: Uint8Array, extension: string) => string,
 *   maxImageWidth: number, footnote: (referenceId: string) => number | undefined,
 *   addComment: (text: string, authorship: string) => number, nextId: () => number }} Package
 *   `footnote` gives the number of the note a reference points to; `nextId` numbers tracked changes
 */

/** Any CSS colour the editor produces (rgb(), #rgb, #rrggbb) → RRGGBB, or undefined. */
export function hexColor(/** @type {string} */ css) {
  const rgb = css.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
  if (rgb) {
    if (rgb[4] === '0') return undefined; // fully transparent
    return rgb
      .slice(1, 4)
      .map((n) => Number(n).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }
  const hex = css.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!hex) return undefined;
  return (hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex).toUpperCase();
}

function fontSize(/** @type {string} */ css) {
  const value = parseFloat(css);
  if (!value) return undefined;
  return css.endsWith('px') ? value * PX_TO_PT : value;
}

/** Formatting implied by an element's tag. */
const TAG_FORMAT = {
  B: { bold: true },
  STRONG: { bold: true },
  I: { italic: true },
  EM: { italic: true },
  U: { underline: true },
  S: { strike: true },
  STRIKE: { strike: true },
  DEL: { deleted: true },
  SUP: { vertical: 'superscript' },
  SUB: { vertical: 'subscript' },
  A: { color: LINK_COLOR, underline: true },
};

/** Formatting set by an element's inline style (how the editor stores most formatting). */
function styleFormat(/** @type {CSSStyleDeclaration} */ style) {
  /** @type {Format} */
  const format = {};
  const decoration = style.textDecorationLine || style.textDecoration;
  if (style.fontWeight) format.bold = style.fontWeight === 'bold' || Number(style.fontWeight) >= 600;
  if (style.fontStyle) format.italic = style.fontStyle === 'italic';
  if (decoration.includes('underline')) format.underline = true;
  if (decoration.includes('line-through')) format.strike = true;
  if (style.color && hexColor(style.color)) format.color = hexColor(style.color);
  if (style.backgroundColor) format.highlight = hexColor(style.backgroundColor);
  if (style.fontSize && fontSize(style.fontSize)) format.size = fontSize(style.fontSize);
  if (style.fontFamily) format.font = style.fontFamily.split(',')[0].replace(/["']/g, '').trim();
  if (style.verticalAlign === 'super') format.vertical = 'superscript';
  if (style.verticalAlign === 'sub') format.vertical = 'subscript';
  return format;
}

/** @param {HTMLElement} el @param {Format} inherited @returns {Format} */
const formatOf = (el, inherited) => ({ ...inherited, ...TAG_FORMAT[el.tagName], ...styleFormat(el.style) });

/** Run properties, in the order the schema requires. */
function runProperties(/** @type {Format} */ f) {
  const font = f.font ? esc(f.font) : '';
  const parts = [
    font && `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>`,
    f.bold && '<w:b/>',
    f.italic && '<w:i/>',
    f.strike && '<w:strike/>',
    f.color && `<w:color w:val="${f.color}"/>`,
    f.size && `<w:sz w:val="${Math.round(f.size * 2)}"/><w:szCs w:val="${Math.round(f.size * 2)}"/>`,
    f.underline && '<w:u w:val="single"/>',
    f.highlight && `<w:shd w:val="clear" w:color="auto" w:fill="${f.highlight}"/>`,
    f.vertical && `<w:vertAlign w:val="${f.vertical}"/>`,
  ].filter(Boolean);
  return parts.length ? `<w:rPr>${parts.join('')}</w:rPr>` : '';
}

const run = (/** @type {string} */ content, /** @type {Format} */ format) =>
  `<w:r>${runProperties(format)}${content}</w:r>`;

/** A text run. Line breaks become <w:br/>; other whitespace collapses as in HTML unless `preserve`. */
export function textRun(/** @type {string} */ text, /** @type {Format} */ format = {}) {
  const value = format.preserve ? text : text.replace(/[ \t\r\n]+/g, ' ');
  if (!value) return '';
  const tag = format.deleted ? 'w:delText' : 'w:t'; // text of a tracked deletion
  const content = value
    .split('\n')
    .map((line) => (line ? `<${tag} xml:space="preserve">${esc(line)}</${tag}>` : ''))
    .join('<w:br/>');
  return run(content, format);
}

function imageRun(/** @type {HTMLImageElement} */ img, /** @type {Package} */ pkg) {
  const data = (img.getAttribute('src') || '').match(/^data:(image\/[a-z]+);base64,(.+)$/);
  const extension = data && IMAGE_TYPES[data[1]];
  if (!extension) return textRun(img.alt ? `[${img.alt}]` : ''); // remote or unsupported images cannot be embedded
  const bytes = Uint8Array.from(atob(data[2]), (c) => c.charCodeAt(0));
  const natural = { width: img.width || img.naturalWidth, height: img.height || img.naturalHeight };
  const { width, height } = natural.width && natural.height ? natural : FALLBACK_IMAGE;
  const scale = Math.min(1, pkg.maxImageWidth / width);
  const cx = Math.round(width * scale * EMU_PER_PX);
  const cy = Math.round(height * scale * EMU_PER_PX);
  const id = pkg.addImage(bytes, extension);
  const n = id.replace(/\D/g, '');
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}" descr="${esc(img.alt)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${n}" name="Picture ${n}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

/** Wraps the runs of a link, tracked change or comment in the element that marks it. */
function wrapRuns(/** @type {HTMLElement} */ el, /** @type {string} */ runs, /** @type {Package} */ pkg) {
  if (!runs) return '';
  const tag = el.tagName.toLowerCase();
  if (tag === 'a' && el.getAttribute('href'))
    return `<w:hyperlink r:id="${pkg.addLink(el.getAttribute('href'))}">${runs}</w:hyperlink>`;
  if (tag === 'ins' || tag === 'del') return `<w:${tag} w:id="${pkg.nextId()}" ${authorship(el)}>${runs}</w:${tag}>`;
  if (el.matches('span.comment')) {
    const id = pkg.addComment(el.title, authorship(el));
    return `<w:commentRangeStart w:id="${id}"/>${runs}<w:commentRangeEnd w:id="${id}"/><w:r><w:commentReference w:id="${id}"/></w:r>`;
  }
  return runs;
}

/**
 * Runs for a node and its descendants. Nested lists and tables are skipped; the block writer handles them.
 * @param {Node} node
 * @param {Format} format formatting inherited from ancestors
 * @param {Package} pkg
 * @returns {string}
 */
export function inlineRuns(node, format, pkg) {
  if (node.nodeType === 3) return textRun(node.nodeValue, format);
  if (node.nodeType !== 1) return '';
  const el = /** @type {HTMLElement} */ (node);
  if (el.tagName === 'BR') return el.nextSibling ? run('<w:br/>', format) : ''; // a trailing <br> is only a placeholder
  if (el.tagName === 'IMG') return imageRun(/** @type {HTMLImageElement} */ (el), pkg);
  if (BLOCK_TAGS.test(el.tagName)) return '';
  if (el.matches('sup.fn-ref')) {
    const number = pkg.footnote(el.id);
    return number ? footnoteReferenceXml(number) : '';
  }
  const own = formatOf(el, format);
  return wrapRuns(el, [...el.childNodes].map((child) => inlineRuns(child, own, pkg)).join(''), pkg);
}
