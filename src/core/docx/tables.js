/** Tables in both directions, including merged cells (colspan/rowspan ↔ gridSpan/vMerge). */

import { gridWidth, tableGrid } from '../tableGrid.js';
import { attr, kid, kids, val } from './xml.js';

const BORDER_SIDES = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'];
const BORDERS = BORDER_SIDES.map((side) => `<w:${side} w:val="single" w:sz="4" w:color="9A9EAC"/>`).join('');
const EMPTY_CELL = '<w:p/>';

/**
 * @param {HTMLTableElement} el
 * @param {number} tableWidth available width in twips
 * @param {(cell: HTMLTableCellElement) => string} cellXml body XML for a cell's content
 */
export function tableXml(el, tableWidth, cellXml) {
  const grid = tableGrid(el);
  const columns = Math.max(1, gridWidth(grid));
  const width = Math.floor(tableWidth / columns);
  const rows = grid.map((slots, row) => {
    const cells = [];
    for (let col = 0; col < columns;) {
      const slot = slots[col];
      const span = slot?.colSpan ?? 1;
      // A cell merged downwards is repeated in each row it covers; only the first holds the content.
      const first = slot?.row === row;
      const merge = slot?.rowSpan > 1 ? `<w:vMerge${first ? ' w:val="restart"' : ''}/>` : '';
      const body = first ? cellXml(slot.cell) || EMPTY_CELL : EMPTY_CELL;
      const end = body.endsWith('</w:tbl>') ? EMPTY_CELL : ''; // a cell must end with a paragraph
      const properties = `<w:tcW w:w="${width * span}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${merge}`;
      cells.push(`<w:tc><w:tcPr>${properties}</w:tcPr>${body}${end}</w:tc>`);
      col += span;
    }
    return `<w:tr>${cells.join('')}</w:tr>`;
  });
  const columnsXml = `<w:gridCol w:w="${width}"/>`.repeat(columns);
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${BORDERS}</w:tblBorders></w:tblPr><w:tblGrid>${columnsXml}</w:tblGrid>${rows.join('')}</w:tbl>`;
}

/**
 * @param {Element} tbl a w:tbl
 * @param {(cell: Element) => string} cellHtml HTML for a cell's content
 */
export function tableHtml(tbl, cellHtml) {
  /** @type {Record<number, { rowspan: number }>} the cell each grid column is currently merged into */
  const merging = {};
  const rows = kids(tbl, 'tr').map((tr) => {
    const cells = [];
    let col = 0;
    for (const tc of kids(tr, 'tc')) {
      const properties = kid(tc, 'tcPr');
      const colspan = Number(val(properties, 'gridSpan')) || 1;
      const merge = kid(properties, 'vMerge');
      if (merge && attr(merge, 'val') !== 'restart' && merging[col]) merging[col].rowspan++;
      else {
        // A paragraph on its own is unwrapped so simple cells stay simple.
        const html = cellHtml(tc).replace(/^<p>([^]*)<\/p>$/, (whole, inner) => (inner.includes('<p') ? whole : inner));
        const cell = { html: html || '<br>', colspan, rowspan: 1 };
        if (merge) merging[col] = cell;
        else delete merging[col];
        cells.push(cell);
      }
      col += colspan;
    }
    return cells;
  });
  const span = (/** @type {string} */ name, /** @type {number} */ n) => (n > 1 ? ` ${name}="${n}"` : '');
  const html = rows.map(
    (cells) =>
      `<tr>${cells.map((c) => `<td${span('colspan', c.colspan)}${span('rowspan', c.rowspan)}>${c.html}</td>`).join('')}</tr>`,
  );
  return `<table style="width: 100%;"><tbody>${html.join('')}</tbody></table>`;
}
