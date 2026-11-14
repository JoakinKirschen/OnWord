/**
 * Heading levels of a Word 97–2003 document's paragraphs. A paragraph's style is found through the
 * formatting pages (FKPs) that cover the file offset of its paragraph mark; a style is a heading when it is
 * one of Word's built-in Heading 1–9 or has an outline level of its own or from the style it is based on.
 */

const PAGE = 512;
const BX_SIZE = 13;
const PN_MASK = 0x3fffff;
const HEADING_STI = { first: 1, last: 9 }; // Word's built-in "heading 1" … "heading 9", in any language
const OUTLINE_LEVEL = 0x2640; // sprmPOutLvl: 0–8 a heading level, 9 body text
const NO_BASE = 0xfff;
const MAX_DEPTH = 10;
/** Operand sizes of sprms by their spra (top three bits); 0 means the size is in the first byte. */
const OPERAND = [1, 1, 2, 4, 2, 2, 0, 3];

/**
 * @param {Uint8Array} main the WordDocument stream, which holds the formatting pages
 * @param {Uint8Array} table the table stream
 * @param {{ styles: { fc: number, lcb: number }, paragraphs: { fc: number, lcb: number } }} at where the
 *   style sheet and the table of paragraph formatting pages are
 * @returns {(offset: number) => number} the heading level (1–9) of the paragraph whose mark is at this
 *   file offset; 0 for text
 */
export function headingLevels(main, table, at) {
  const styles = styleLevels(table, at.styles);
  const tableView = view(table);
  const count = (at.paragraphs.lcb - 4) / 8;
  const fcs = Array.from({ length: count + 1 }, (_, i) => tableView.getUint32(at.paragraphs.fc + i * 4, true));
  const pages = Array.from(
    { length: count },
    (_, i) => tableView.getUint32(at.paragraphs.fc + (count + 1) * 4 + i * 4, true) & PN_MASK,
  );
  return (offset) => {
    const i = fcs.findIndex((fc, n) => n < count && fc <= offset && offset < fcs[n + 1]);
    return i < 0 ? 0 : (styles.get(styleIn(main, pages[i], offset)) ?? 0);
  };
}

const view = (/** @type {Uint8Array} */ bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** The style (istd) of the paragraph whose mark is at `offset`, from formatting page `pn`. */
function styleIn(/** @type {Uint8Array} */ main, /** @type {number} */ pn, /** @type {number} */ offset) {
  const page = main.subarray(pn * PAGE, (pn + 1) * PAGE);
  if (page.length < PAGE) return 0;
  const v = view(page);
  const runs = page[PAGE - 1];
  for (let j = 0; j < runs; j++) {
    if (v.getUint32(j * 4, true) > offset || offset >= v.getUint32((j + 1) * 4, true)) continue;
    const papx = page[(runs + 1) * 4 + j * BX_SIZE] * 2;
    if (!papx) return 0; // no properties: the Normal style
    return v.getUint16(papx + (page[papx] ? 1 : 2), true);
  }
  return 0;
}

/** Heading level by style index, for the paragraph styles that are headings. */
function styleLevels(/** @type {Uint8Array} */ table, /** @type {{ fc: number, lcb: number }} */ at) {
  const v = view(table);
  const headerSize = v.getUint16(at.fc, true);
  const count = v.getUint16(at.fc + 2, true);
  const baseSize = v.getUint16(at.fc + 4, true);
  const styles = [];
  for (let i = 0, pos = at.fc + 2 + headerSize; i < count && pos < at.fc + at.lcb; i++) {
    const size = v.getUint16(pos, true);
    styles.push(size ? readStyle(table.subarray(pos + 2, pos + 2 + size), baseSize) : null);
    pos += 2 + size;
  }
  const levelOf = (/** @type {number} */ istd, depth = 0) => {
    const style = styles[istd];
    if (!style || depth > MAX_DEPTH) return 0;
    if (style.sti >= HEADING_STI.first && style.sti <= HEADING_STI.last) return style.sti;
    if (style.outline !== null) return style.outline < 9 ? style.outline + 1 : 0;
    return style.base === NO_BASE ? 0 : levelOf(style.base, depth + 1);
  };
  const levels = new Map();
  styles.forEach((style, istd) => {
    const level = style?.paragraph ? levelOf(istd) : 0;
    if (level) levels.set(istd, level);
  });
  return levels;
}

/** A style's identity (sti), kind, the style it is based on and the outline level it sets, if any. */
function readStyle(/** @type {Uint8Array} */ std, /** @type {number} */ baseSize) {
  const v = view(std);
  const style = {
    sti: v.getUint16(0, true) & 0xfff,
    paragraph: (v.getUint16(2, true) & 0xf) === 1,
    base: v.getUint16(2, true) >> 4,
    outline: /** @type {number | null} */ (null),
  };
  if (!style.paragraph || std.length < baseSize + 2) return style;
  // After the fixed part: the name (length, characters, closing 0), then the paragraph properties.
  let pos = baseSize + 2 + v.getUint16(baseSize, true) * 2 + 2;
  pos += pos % 2;
  if (pos + 4 > std.length) return style;
  const upxEnd = Math.min(pos + 2 + v.getUint16(pos, true), std.length);
  style.outline = outlineLevel(std, pos + 4, upxEnd); // past the size and the style index
  return style;
}

/** The operand of sprmPOutLvl in a run of properties, or null. */
function outlineLevel(/** @type {Uint8Array} */ bytes, /** @type {number} */ start, /** @type {number} */ end) {
  const v = view(bytes);
  for (let pos = start; pos + 2 <= end;) {
    const sprm = v.getUint16(pos, true);
    if (sprm === OUTLINE_LEVEL) return bytes[pos + 2];
    const size = OPERAND[sprm >> 13] || bytes[pos + 2] + 1;
    pos += 2 + size;
  }
  return null;
}
