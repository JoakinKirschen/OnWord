/** Maps a table that may contain merged cells (colspan/rowspan) onto a regular grid. */

/**
 * @typedef {{ cell: HTMLTableCellElement, row: number, col: number, rowSpan: number, colSpan: number }} Slot
 *   where a cell starts and how far it reaches
 */

/**
 * `grid[row][col]` is the slot of the cell covering that position (the same object for every position a
 * merged cell covers).
 * @param {HTMLTableElement} table
 * @returns {Slot[][]}
 */
export function tableGrid(table) {
  /** @type {Slot[][]} */
  const grid = [...table.rows].map(() => []);
  [...table.rows].forEach((tr, row) => {
    let col = 0;
    for (const cell of tr.cells) {
      while (grid[row][col]) col++; // taken by a cell reaching down from an earlier row
      const slot = { cell, row, col, rowSpan: cell.rowSpan, colSpan: cell.colSpan };
      for (let r = row; r < row + cell.rowSpan && r < grid.length; r++) {
        for (let c = col; c < col + cell.colSpan; c++) grid[r][c] = slot;
      }
      col += cell.colSpan;
    }
  });
  return grid;
}

/** @param {Slot[][]} grid @param {Element} cell @returns {Slot | undefined} */
export const slotOf = (grid, cell) => grid.flat().find((slot) => slot?.cell === cell);

/** Number of grid columns. @param {Slot[][]} grid */
export const gridWidth = (grid) => Math.max(0, ...grid.map((row) => row.length));
