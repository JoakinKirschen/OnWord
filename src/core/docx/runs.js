/** Converts WordprocessingML runs (text, formatting, links, images) to HTML. */

import { esc } from '../html.js';
import { all, attr, isOn, kid, kids, val } from './xml.js';

const EMU_PER_PX = 9525;
const TAB = '&emsp;';
const HIGHLIGHTS = {
  yellow: '#ffff00',
  green: '#00ff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  blue: '#0000ff',
  red: '#ff0000',
  darkBlue: '#000080',
  darkCyan: '#008080',
  darkGreen: '#008000',
  darkMagenta: '#800080',
  darkRed: '#800000',
  darkYellow: '#808000',
  darkGray: '#808080',
  lightGray: '#c0c0c0',
  black: '#000000',
};
const IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif' };
const HEX = /^[0-9a-f]{6}$/i;
const VERTICAL_TAGS = { superscript: 'sup', subscript: 'sub' };
const BASE64_CHUNK = 0x8000;

/**
 * @typedef {{ links: Map<string, string>, images: Map<string, string>, files: Map<string, Uint8Array> }} Package
 * `links` and `images` map relationship ids to URLs and to paths inside the archive.
 * @typedef {{ pageBreak?: boolean, inLink?: boolean }} Flags
 * `pageBreak` is set by a run that contains a page break.
 */

function base64(/** @type {Uint8Array} */ bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK)
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
  return btoa(binary);
}

/** Inline CSS declarations for a run's colour, highlight, size and font. */
function runCss(/** @type {Element} */ rPr) {
  const color = val(rPr, 'color');
  const fill = attr(kid(rPr, 'shd'), 'fill');
  const highlight = HIGHLIGHTS[val(rPr, 'highlight')] || (HEX.test(fill ?? '') ? '#' + fill : '');
  const size = Number(val(rPr, 'sz'));
  const font = attr(kid(rPr, 'rFonts'), 'ascii');
  return [
    HEX.test(color ?? '') && `color: #${color}`,
    highlight && `background-color: ${highlight}`,
    size && `font-size: ${size / 2}pt`,
    font && `font-family: ${font.replace(/[;"<>]/g, '')}`,
  ].filter(Boolean);
}

/** Tags for a run's bold, italic, underline, strikethrough and super/subscript. */
function runTags(/** @type {Element} */ rPr) {
  return [
    isOn(rPr, 'b') && 'b',
    isOn(rPr, 'i') && 'i',
    isOn(rPr, 'u') && 'u',
    (isOn(rPr, 'strike') || isOn(rPr, 'dstrike')) && 's',
    VERTICAL_TAGS[val(rPr, 'vertAlign')],
  ].filter(Boolean);
}

/** Opening and closing markup for a run's formatting. Inside a link, the link's own look is left to the editor. */
function wrapping(/** @type {Element | undefined} */ rPr, /** @type {boolean} */ inLink) {
  if (!rPr) return ['', ''];
  const css = runCss(rPr).filter((rule) => !inLink || !rule.startsWith('color'));
  const tags = runTags(rPr).filter((tag) => !inLink || tag !== 'u');
  const open = (css.length ? `<span style="${esc(css.join('; '))}">` : '') + tags.map((t) => `<${t}>`).join('');
  const close =
    tags
      .reverse()
      .map((t) => `</${t}>`)
      .join('') + (css.length ? '</span>' : '');
  return [open, close];
}

function image(/** @type {Element} */ drawing, /** @type {Package} */ pkg) {
  const embed = all(drawing, 'blip')[0]?.getAttribute('r:embed');
  const path = pkg.images.get(embed);
  const mime = IMAGE_MIME[path?.split('.').pop().toLowerCase()];
  const bytes = pkg.files.get(path);
  if (!mime || !bytes) return '';
  const width = Math.round(Number(all(drawing, 'extent')[0]?.getAttribute('cx')) / EMU_PER_PX);
  const alt = all(drawing, 'docPr')[0]?.getAttribute('descr') || '';
  const style = width ? ` style="width: ${width}px; height: auto;"` : '';
  return `<img src="data:${mime};base64,${base64(bytes)}" alt="${esc(alt)}"${style}>`;
}

/** HTML for one run. Sets `flags.pageBreak` when the run contains a page break. */
function run(/** @type {Element} */ r, /** @type {Package} */ pkg, /** @type {Flags} */ flags) {
  let html = '';
  for (const child of r.children) {
    if (child.localName === 't') html += esc(child.textContent);
    else if (child.localName === 'tab') html += TAB;
    else if (child.localName === 'noBreakHyphen') html += '-';
    else if (child.localName === 'br' || child.localName === 'cr') {
      if (attr(child, 'type') === 'page') flags.pageBreak = true;
      else html += '<br>';
    } else if (child.localName === 'drawing') html += image(child, pkg);
  }
  if (!html) return '';
  const [open, close] = wrapping(kid(r, 'rPr'), !!flags.inLink);
  return open + html + close;
}

/**
 * HTML for the inline content of a paragraph (runs, hyperlinks, tracked insertions, content controls).
 * @param {Element} parent a w:p or an inline container inside one
 * @param {Package} pkg
 * @param {Flags} flags
 * @returns {string}
 */
export function inlineHtml(parent, pkg, flags) {
  let html = '';
  for (const child of parent.children) {
    if (child.localName === 'r') html += run(child, pkg, flags);
    else if (child.localName === 'hyperlink') {
      const linkFlags = { ...flags, inLink: true };
      const inner = inlineHtml(child, pkg, linkFlags);
      flags.pageBreak ||= linkFlags.pageBreak;
      const href = pkg.links.get(child.getAttribute('r:id'));
      html += href && inner ? `<a href="${esc(href)}">${inner}</a>` : inner;
    } else if (['ins', 'smartTag', 'fldSimple', 'sdtContent'].includes(child.localName))
      html += inlineHtml(child, pkg, flags);
    else if (child.localName === 'sdt')
      html += kids(child, 'sdtContent')
        .map((c) => inlineHtml(c, pkg, flags))
        .join('');
  }
  return html;
}
