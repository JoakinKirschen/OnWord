/** Tables in both directions, including merged cells (colspan/rowspan ↔ gridSpan/vMerge). */

import { gridWidth, tableGrid } from '../tableGrid.js';
import {
  CELL_MARGINS,
  TABLE_BORDERS,
  cellCss,
  cellPropertiesXml,
  columnsHtml,
  gridColumns,
  tableLook,
  tableWidth,
  tableWidthXml,
} from './cells.js';
import { attr, kid, kids, val } from './xml.js';

const EMPTY_CELL = '<w:p/>';
/** Properties of a cell standing in for one a short row lacks: invisible, as the gap is in the editor. */
const MISSING_CELL = `<w:tcBorders>${['top', 'left', 'bottom', 'right'].map((side) => `<w:${side} w:val="nil"/>`).join('')}</w:tcBorders>`;

/**
 * @param {HTMLTableElement} el
 * @param {number} textWidth available width in twips
 * @param {(cell: HTMLTableCellElement) => string} cellXml body XML for a cell's content
 */
export function tableXml(el, textWidth, cellXml) {
  const grid = tableGrid(el);
  // Rows may stop short of the grid the <col>s describe, as in Word, where they simply end.
  const columns = Math.max(1, gridWidth(grid), el.querySelectorAll('col').length);
  const percent = el.style.width.endsWith('%') ? Math.min(100, parseFloat(el.style.width)) : 100;
  const widths = gridColumns(el, Math.floor((textWidth * percent) / 100), columns);
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
      const width = widths.slice(col, col + span).reduce((sum, w) => sum + w, 0);
      const properties =
        `<w:tcW w:w="${width}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${merge}` +
        (slot ? cellPropertiesXml(slot.cell) : MISSING_CELL);
      cells.push(`<w:tc><w:tcPr>${properties}</w:tcPr>${body}${end}</w:tc>`);
      col += span;
    }
    return `<w:tr>${cells.join('')}</w:tr>`;
  });
  const columnsXml = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('');
  const properties = `${tableWidthXml(el)}<w:tblBorders>${TABLE_BORDERS}</w:tblBorders><w:tblLayout w:type="fixed"/>${CELL_MARGINS}`;
  return `<w:tbl><w:tblPr>${properties}</w:tblPr><w:tblGrid>${columnsXml}</w:tblGrid>${rows.join('')}</w:tbl>`;
}

/**
 * @typedef {{ cellHtml: (cell: Element) => string, tblPr: import('./styles.js').Chain, textWidth: number }} TableReading
 *   `tblPr`: the table style's levels (the table's own properties are added here); `textWidth` in twips
 */

/**
 * @param {Element} tbl a w:tbl
 * @param {TableReading} reading
 */
export function tableHtml(tbl, { cellHtml, tblPr, textWidth }) {
  const look = tableLook([...tblPr, ...kids(tbl, 'tblPr')]);
  const columns = kids(kid(tbl, 'tblGrid'), 'gridCol').length;
  const trs = kids(tbl, 'tr');
  /** @type {Record<number, { rowspan: number }>} the cell each grid column is currently merged into */
  const merging = {};
  const rows = trs.map((tr, row) => {
    const cells = [];
    let col = 0;
    const tcs = kids(tr, 'tc');
    for (const tc of tcs) {
      const properties = kid(tc, 'tcPr');
      const colspan = Number(val(properties, 'gridSpan')) || 1;
      const merge = kid(properties, 'vMerge');
      if (merge && attr(merge, 'val') !== 'restart' && merging[col]) merging[col].rowspan++;
      else {
        // A paragraph on its own is unwrapped so simple cells stay simple.
        const html = cellHtml(tc).replace(/^<p>([^]*)<\/p>$/, (whole, inner) => (inner.includes('<p') ? whole : inner));
        const last = tc === tcs[tcs.length - 1];
        const edges = {
          top: row === 0,
          bottom: row === trs.length - 1,
          left: col === 0,
          right: last || col + colspan >= columns,
        };
        const css = cellCss(properties, look, edges);
        const cell = {
          html: html || '<br>',
          colspan,
          rowspan: 1,
          style: css.length ? ` style="${css.join('; ')};"` : '',
        };
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
      `<tr>${cells.map((c) => `<td${span('colspan', c.colspan)}${span('rowspan', c.rowspan)}${c.style}>${c.html}</td>`).join('')}</tr>`,
  );
  return `<table style="width: ${tableWidth(tbl, textWidth)}%;">${columnsHtml(tbl)}<tbody>${html.join('')}</tbody></table>`;
}
