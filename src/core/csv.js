/** Reads CSV text into rows of cells. The separator is whichever of ; , or tab the first line uses most. */

const SEPARATORS = [';', ',', '\t'];

/** The separator a file uses, judged by its first line outside quotes. */
function separatorOf(/** @type {string} */ text) {
  const first = (text.split(/\r?\n/, 1)[0] ?? '').replace(/"[^"]*"/g, '');
  const counts = SEPARATORS.map((s) => first.split(s).length);
  return SEPARATORS[counts.indexOf(Math.max(...counts))];
}

/**
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const source = text.replace(/^\uFEFF/, ''); // the byte-order mark Excel writes
  const separator = separatorOf(source);
  /** @type {string[][]} */
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') cell += source[++i];
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === separator) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i++;
      rows.push([...row, cell]);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}
