import { $, $$ } from '../../core/dom.js';
import { insertBlock } from '../blocks.js';

const PERCENT = 100;

/**
 * Table insertion, row/column editing and Tab navigation between cells.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initTables(ctx) {
  const { root, content, selection, commands, toast } = ctx;
  const doc = content.ownerDocument;
  const dialog = $('#tableDlg', root),
    rowsInput = $('#tblRows', root),
    colsInput = $('#tblCols', root);

  const newCell = () => {
    const td = doc.createElement('td');
    td.innerHTML = '<br>';
    return td;
  };
  const clamp = (value, max) => Math.min(max, Math.max(1, Number(value) || 1));

  /** Keeps imported column widths (<col>) in step with an added or removed column, still adding up to 100%. */
  function adjustColumns(table, col, op) {
    const cols = $$('col', table);
    if (!cols.length) return;
    if (op === 'delCol') cols[col]?.remove();
    else cols[Math.min(col, cols.length - 1)][op === 'colLeft' ? 'before' : 'after'](doc.createElement('col'));
    const kept = $$('col', table);
    const known = kept.map((c) => parseFloat(c.style.width) || 0);
    const sized = known.filter(Boolean);
    const average = sized.reduce((sum, w) => sum + w, 0) / sized.length || PERCENT;
    const widths = known.map((w) => w || average); // a new column gets an equal share
    const total = widths.reduce((sum, w) => sum + w, 0);
    kept.forEach((c, i) => (c.style.width = `${+((widths[i] / total) * PERCENT).toFixed(2)}%`));
  }

  function insert(rows, cols) {
    const table = doc.createElement('table');
    table.style.width = '100%';
    table.innerHTML = '<tbody>' + ('<tr>' + '<td><br></td>'.repeat(cols) + '</tr>').repeat(rows) + '</tbody>';
    insertBlock(ctx, table, () => table.rows[0].cells[0]);
  }

  function edit(op) {
    selection.restore();
    const cell = selection.closest('td,th');
    if (!cell) return toast('Place the cursor inside a table first.');
    const row = cell.parentElement,
      table = cell.closest('table'),
      col = cell.cellIndex;
    const rows = [...table.rows];
    if (op === 'rowAbove' || op === 'rowBelow') {
      const tr = doc.createElement('tr');
      for (let i = 0; i < row.cells.length; i++) tr.append(newCell());
      row[op === 'rowAbove' ? 'before' : 'after'](tr);
    } else if (op === 'colLeft' || op === 'colRight') {
      adjustColumns(table, col, op);
      rows.forEach((r) =>
        r.cells[Math.min(col, r.cells.length - 1)]?.[op === 'colLeft' ? 'before' : 'after'](newCell()),
      );
    } else if (op === 'delRow') {
      if (rows.length === 1) table.remove();
      else {
        selection.caretInto((row.nextElementSibling || row.previousElementSibling).cells[0]);
        row.remove();
      }
    } else if (op === 'delCol') {
      if (row.cells.length === 1) table.remove();
      else {
        selection.caretInto(cell.nextElementSibling || cell.previousElementSibling);
        adjustColumns(table, col, op);
        rows.forEach((r) => r.cells[col]?.remove());
      }
    } else if (op === 'delTable') table.remove();
    ctx.changed();
  }

  commands.register({
    'table.dialog'() {
      selection.restore();
      dialog.returnValue = '';
      dialog.showModal();
    },
    'table.edit': edit,
    /** Moves to the next/previous cell. Returns false when the caret is not in a table. */
    'table.tab'(backwards) {
      const cell = selection.closest('td,th');
      if (!cell) return false;
      const table = cell.closest('table');
      const index = $$('td,th', table).indexOf(cell) + (backwards ? -1 : 1);
      if (index >= $$('td,th', table).length) edit('rowBelow');
      if (index >= 0) selection.caretInto($$('td,th', table)[index]);
      return true;
    },
  });

  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'ok') insert(clamp(rowsInput.value, 50), clamp(colsInput.value, 12));
    content.focus();
  });
}
