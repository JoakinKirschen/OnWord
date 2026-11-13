/**
 * Reads the cell values of an Excel workbook (.xlsx): every sheet as rows of text and numbers. Formulas
 * are not evaluated; the value Excel stored with them when the file was saved is used.
 */

import { all, kid, kids, parseXml } from './docx/xml.js';
import { readZip } from './zip.js';

const LETTERS = 26;
const RELATIONSHIPS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** @typedef {string | number} Cell */
/** @typedef {{ name: string, rows: Cell[][] }} Sheet */

/** The zero-based column of a cell reference: "A1" → 0, "AB12" → 27. */
export function columnIndex(/** @type {string} */ ref) {
  const letters = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? 'A';
  return [...letters].reduce((n, c) => n * LETTERS + c.charCodeAt(0) - 64, 0) - 1;
}

/** The letters of a zero-based column: 0 → "A", 27 → "AB". */
export function columnName(/** @type {number} */ index) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / LETTERS))
    name = String.fromCharCode(65 + ((n - 1) % LETTERS)) + name;
  return name;
}

/** All text in an element, leaving out phonetic guides (`rPh`), which are not part of the value. */
function textOf(/** @type {Element | undefined} */ el) {
  return all(el, 't')
    .filter((t) => t.parentElement?.localName !== 'rPh')
    .map((t) => t.textContent)
    .join('');
}

/** @param {Element} cell @param {string[]} shared @returns {Cell} */
function valueOf(cell, shared) {
  const type = cell.getAttribute('t');
  const raw = kid(cell, 'v')?.textContent ?? '';
  if (type === 's') return shared[Number(raw)] ?? '';
  if (type === 'inlineStr') return textOf(kid(cell, 'is'));
  if (type === 'str' || type === 'e') return raw;
  if (type === 'b') return raw === '1' ? 'TRUE' : 'FALSE';
  return raw === '' ? '' : Number(raw);
}

/** @param {Document} doc @param {string[]} shared @returns {Cell[][]} */
function sheetRows(doc, shared) {
  /** @type {Cell[][]} */
  const rows = [];
  for (const row of all(doc, 'row')) {
    const index = Number(row.getAttribute('r')) - 1;
    /** @type {Cell[]} */
    const cells = [];
    kids(row, 'c').forEach((cell, i) => {
      const ref = cell.getAttribute('r');
      cells[ref ? columnIndex(ref) : i] = valueOf(cell, shared);
    });
    rows[Number.isInteger(index) && index >= 0 ? index : rows.length] = Array.from(cells, (v) => v ?? '');
  }
  return Array.from(rows, (row) => row ?? []);
}

/** Where a workbook relationship points, as a path inside the archive. */
const partPath = (/** @type {string} */ target) => (target.startsWith('/') ? target.slice(1) : `xl/${target}`);

/**
 * @param {ArrayBuffer | Uint8Array} source
 * @returns {Promise<Sheet[]>}
 */
export async function readXlsx(source) {
  const files = await readZip(source);
  const workbook = parseXml(files.get('xl/workbook.xml'));
  if (!workbook) throw new Error('This is not an Excel workbook.');
  const targets = new Map(
    all(parseXml(files.get('xl/_rels/workbook.xml.rels')), 'Relationship').map((r) => [
      r.getAttribute('Id'),
      partPath(r.getAttribute('Target') ?? ''),
    ]),
  );
  const shared = all(parseXml(files.get('xl/sharedStrings.xml')), 'si').map(textOf);
  return all(workbook, 'sheet').flatMap((sheet) => {
    const id = sheet.getAttributeNS(RELATIONSHIPS, 'id') ?? sheet.getAttribute('r:id');
    const doc = parseXml(files.get(targets.get(id) ?? ''));
    return doc ? [{ name: sheet.getAttribute('name') ?? '', rows: sheetRows(doc, shared) }] : [];
  });
}
