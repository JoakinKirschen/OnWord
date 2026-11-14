/** Table geometry in both directions: column widths, cell borders, padding, shading and vertical alignment. */

import { cssPx, pxToPt } from '../units.js';
import { hexColor } from './inline.js';
import { attr, kid, val } from './xml.js';

const TWIPS_PER_PT = 20;
const TWIPS_PER_PX = 15;
const EIGHTHS_PER_PT = 8; // border widths (w:sz) are in eighths of a point
const SIDES = ['top', 'left', 'bottom', 'right'];
const LOGICAL = { left: 'start', right: 'end' }; // newer files name the sides by writing direction
const NO_BORDER = ['nil', 'none'];
const THIN = 4; // w:sz of the thinnest usual line; such lines in black or grey keep the editor's own border
const EDITOR_BORDER_COLOR = '9A9EAC'; // styles/document.css
const PLAIN_COLORS = [undefined, null, 'auto', '000000', EDITOR_BORDER_COLOR];
const FROM_WORD_STYLE = { double: 'double', dashed: 'dashed', dotted: 'dotted', dashSmallGap: 'dashed' };
const TO_WORD_STYLE = { solid: 'single', double: 'double', dashed: 'dashed', dotted: 'dotted' };
const WORD_PADDING = { top: 0, left: 108, bottom: 0, right: 108 }; // twips, when nothing sets the cell margins
/** The editor's cell padding (styles/document.css), written as the table's default cell margins. */
const EDITOR_PADDING = { top: 4, left: 6, bottom: 4, right: 6 }; // pt
const V_ALIGN = { center: 'middle', bottom: 'bottom' };
const TO_V_ALIGN = { middle: 'center', bottom: 'bottom' };
const PERCENT = 100;
const PCT_UNITS = 50; // w:type="pct" widths are in fiftieths of a percent

/** @typedef {import('./styles.js').Chain} Chain */
/** @typedef {{ top: boolean, left: boolean, bottom: boolean, right: boolean }} Edges which sides lie on the table's edge */

/** The child named after a side, under either of its names. */
const side = (/** @type {Element | undefined} */ el, /** @type {string} */ name) =>
  kid(el, name) || kid(el, LOGICAL[name] ?? name);

/** A table's borders and cell margins: its style first, then its own properties. */
export function tableLook(/** @type {Chain} */ tblPr) {
  const decided = (/** @type {string} */ group, /** @type {string} */ name) =>
    side(
      kid(
        tblPr.findLast((el) => side(kid(el, group), name)),
        group,
      ),
      name,
    );
  const names = [...SIDES, 'insideH', 'insideV'];
  return {
    borders: Object.fromEntries(names.map((name) => [name, decided('tblBorders', name)])),
    margins: Object.fromEntries(SIDES.map((name) => [name, decided('tblCellMar', name)])),
  };
}

/** CSS for one border, or null when it is the editor's own thin line. */
function borderCss(/** @type {Element | undefined} */ border) {
  const kind = attr(border, 'val');
  if (!border || !kind || NO_BORDER.includes(kind)) return 'none';
  const size = Number(attr(border, 'sz')) || THIN;
  const color = attr(border, 'color');
  const plain = PLAIN_COLORS.includes(color);
  const style = FROM_WORD_STYLE[kind] ?? 'solid';
  if (size <= THIN && plain && style === 'solid') return null;
  return `${+(size / EIGHTHS_PER_PT).toFixed(2)}pt ${style} #${plain ? '000000' : color}`;
}

/** The shortest CSS for padding given as top, left, bottom, right in pt. */
function paddingCss(/** @type {number[]} */ [top, left, bottom, right]) {
  if (top === bottom && left === right) return top === left ? `${top}pt` : `${top}pt ${left}pt`;
  return `${top}pt ${right}pt ${bottom}pt ${left}pt`;
}

/**
 * CSS declarations for a cell: borders, padding, shading and vertical alignment.
 * @param {Element | undefined} tcPr
 * @param {ReturnType<typeof tableLook>} look
 * @param {Edges} edges
 */
export function cellCss(tcPr, look, edges) {
  const own = kid(tcPr, 'tcBorders');
  const inner = { top: 'insideH', bottom: 'insideH', left: 'insideV', right: 'insideV' };
  const borders = SIDES.map((name) => borderCss(side(own, name) ?? look.borders[edges[name] ? name : inner[name]]));
  const borderRules = borders.every((b) => b === borders[0])
    ? [borders[0] && `border: ${borders[0]}`]
    : borders.map((b, i) => b && `border-${SIDES[i]}: ${b}`);
  const margins = kid(tcPr, 'tcMar');
  const padding = SIDES.map((name) => {
    const twips = attr(side(margins, name) ?? look.margins[name], 'w');
    return +(Number(twips ?? WORD_PADDING[name]) / TWIPS_PER_PT).toFixed(2);
  });
  const fill = attr(kid(tcPr, 'shd'), 'fill');
  const align = V_ALIGN[val(tcPr, 'vAlign')];
  return [
    ...borderRules,
    SIDES.some((name, i) => padding[i] !== EDITOR_PADDING[name]) && `padding: ${paddingCss(padding)}`,
    /^[0-9a-f]{6}$/i.test(fill ?? '') && `background-color: #${fill}`,
    align && `vertical-align: ${align}`,
  ].filter(Boolean);
}

/** `<colgroup>` for the table grid, or '' when the columns are equal anyway. */
export function columnsHtml(/** @type {Element} */ tbl) {
  const widths = [...(kid(tbl, 'tblGrid')?.children ?? [])]
    .filter((col) => col.localName === 'gridCol')
    .map((col) => Number(attr(col, 'w')) || 0);
  const total = widths.reduce((sum, w) => sum + w, 0);
  if (!total || widths.every((w) => w === widths[0])) return '';
  const cols = widths.map((w) => `<col style="width: ${+((w / total) * PERCENT).toFixed(2)}%;">`);
  return `<colgroup>${cols.join('')}</colgroup>`;
}

/** The table's width as a percentage of the text width. */
export function tableWidth(/** @type {Element} */ tbl, /** @type {number} */ textWidth) {
  const width = kid(kid(tbl, 'tblPr'), 'tblW');
  const value = parseFloat(attr(width, 'w') ?? '');
  const type = attr(width, 'type');
  let percent = PERCENT;
  if (type === 'pct') percent = String(attr(width, 'w')).endsWith('%') ? value : value / PCT_UNITS;
  else if (type === 'dxa' && textWidth) percent = (value / textWidth) * PERCENT;
  return Math.min(PERCENT, +percent.toFixed(2)) || PERCENT;
}

// Writing

/** Widths of the grid columns in twips, from the table's <col> elements where they fit the grid. */
export function gridColumns(
  /** @type {HTMLTableElement} */ el,
  /** @type {number} */ width,
  /** @type {number} */ count,
) {
  const cols = [...el.querySelectorAll('col')].map((col) => parseFloat(col.style.width) || 0);
  const total = cols.reduce((sum, w) => sum + w, 0);
  if (cols.length !== count || !total) return Array(count).fill(Math.floor(width / count));
  return cols.map((w) => Math.floor((w / total) * width));
}

/** <w:tblW> for the table's CSS width (a percentage of the text width). */
export function tableWidthXml(/** @type {HTMLTableElement} */ el) {
  const percent = el.style.width.endsWith('%') ? parseFloat(el.style.width) : PERCENT;
  return `<w:tblW w:w="${Math.round(Math.min(percent, PERCENT) * PCT_UNITS)}" w:type="pct"/>`;
}

/** Thin grey lines all round, as the editor draws a table. */
export const TABLE_BORDERS = [...SIDES, 'insideH', 'insideV']
  .map((name) => `<w:${name} w:val="single" w:sz="${THIN}" w:color="${EDITOR_BORDER_COLOR}"/>`)
  .join('');

/** Default cell margins matching the editor's padding, so cells without their own padding look the same. */
export const CELL_MARGINS = `<w:tblCellMar>${SIDES.map(
  (name) => `<w:${name} w:w="${EDITOR_PADDING[name] * TWIPS_PER_PT}" w:type="dxa"/>`,
).join('')}</w:tblCellMar>`;

function borderXml(/** @type {CSSStyleDeclaration} */ style, /** @type {string} */ name) {
  const cssName = name[0].toUpperCase() + name.slice(1);
  const kind = style[`border${cssName}Style`];
  if (!kind) return '';
  if (kind === 'none' || kind === 'hidden') return `<w:${name} w:val="nil"/>`;
  const width = pxToPt(cssPx(style[`border${cssName}Width`] || '1px'));
  const size = Math.max(2, Math.round(width * EIGHTHS_PER_PT));
  const color = hexColor(style[`border${cssName}Color`]) || 'auto';
  return `<w:${name} w:val="${TO_WORD_STYLE[kind] ?? 'single'}" w:sz="${size}" w:space="0" w:color="${color}"/>`;
}

/** Cell properties after width and merging: borders, shading, margins and vertical alignment, in schema order. */
export function cellPropertiesXml(/** @type {HTMLTableCellElement} */ cell) {
  const { style } = cell;
  const borders = SIDES.map((name) => borderXml(style, name)).join('');
  const fill = hexColor(style.backgroundColor);
  const margins = style.padding
    ? SIDES.map((name) => {
        const css = style[`padding${name[0].toUpperCase()}${name.slice(1)}`];
        return `<w:${name} w:w="${Math.round(cssPx(css) * TWIPS_PER_PX)}" w:type="dxa"/>`;
      }).join('')
    : '';
  const align = TO_V_ALIGN[style.verticalAlign];
  return [
    borders && `<w:tcBorders>${borders}</w:tcBorders>`,
    fill && `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`,
    margins && `<w:tcMar>${margins}</w:tcMar>`,
    align && `<w:vAlign w:val="${align}"/>`,
  ]
    .filter(Boolean)
    .join('');
}
