import { slotOf, tableGrid } from '../../core/tableGrid.js';

const isEmpty = (/** @type {Element} */ cell) => !cell.textContent.trim() && !cell.querySelector('img, table');

/**
 * Merging and splitting table cells.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initTableMerge(ctx) {
  const { content, selection, commands, toast } = ctx;
  const doc = content.ownerDocument;

  /** Moves the content of `from` into `into` and takes `from` out of the table. */
  function absorb(/** @type {HTMLTableCellElement} */ into, /** @type {HTMLTableCellElement} */ from) {
    if (!isEmpty(from)) {
      if (isEmpty(into)) into.replaceChildren();
      else into.append(doc.createElement('br'));
      into.append(...from.childNodes);
    }
    from.remove();
  }

  /** Gives every grid position of a merged cell its own cell again. */
  function split(/** @type {HTMLTableElement} */ table, /** @type {import('../../core/tableGrid.js').Slot} */ slot) {
    const grid = tableGrid(table);
    const end = slot.col + slot.colSpan;
    for (let r = slot.row; r < slot.row + slot.rowSpan; r++) {
      // New cells go before the first cell of this row that starts right of the merged area.
      const next = grid[r].find((other) => other && other.col >= end && other.row === r)?.cell ?? null;
      const missing = r === slot.row ? slot.colSpan - 1 : slot.colSpan;
      for (let i = 0; i < missing; i++) {
        const td = doc.createElement('td');
        td.innerHTML = '<br>';
        table.rows[r].insertBefore(td, next);
      }
    }
    slot.cell.colSpan = 1;
    slot.cell.rowSpan = 1;
  }

  /** The cell to merge with, or a message saying why there is none. */
  function neighbour(/** @type {import('../../core/tableGrid.js').Slot[][]} */ grid, slot, /** @type {string} */ how) {
    if (how === 'right') {
      const other = grid[slot.row][slot.col + slot.colSpan];
      if (!other) return 'There is no cell to the right.';
      return other.row === slot.row && other.rowSpan === slot.rowSpan ? other : 'These cells have different heights.';
    }
    const other = grid[slot.row + slot.rowSpan]?.[slot.col];
    if (!other) return 'There is no cell below.';
    return other.col === slot.col && other.colSpan === slot.colSpan ? other : 'These cells have different widths.';
  }

  commands.register({
    /** `how`: 'right' or 'down' merges with the neighbouring cell; 'split' undoes a merge. */
    'table.merge'(how) {
      selection.restore();
      const cell = selection.closest('td,th');
      if (!cell) return toast('Place the cursor inside a table first.');
      const table = cell.closest('table');
      const grid = tableGrid(table);
      const slot = slotOf(grid, cell);
      if (how === 'split') {
        if (slot.colSpan === 1 && slot.rowSpan === 1) return toast('This cell is not merged.');
        split(table, slot);
      } else {
        const other = neighbour(grid, slot, how);
        if (typeof other === 'string') return toast(other);
        if (how === 'right') cell.colSpan += other.colSpan;
        else cell.rowSpan += other.rowSpan;
        absorb(cell, other.cell);
      }
      selection.caretInto(cell);
      ctx.changed();
    },
  });
}
