/**
 * Reads the text of a Word 97–2003 document (.doc) as paragraphs, each with its heading level from its
 * paragraph style. Formatting, tables and pictures are not read: the text is enough to find a
 * specification's articles. Word 95 and older, and encrypted files, are refused.
 */

import { readCompound } from './compound.js';
import { headingLevels } from './styles.js';

const WORD_ID = 0xa5ec;
const WORD_97 = 0xc1; // nFib of Word 97 and later; earlier versions store text differently
const ENCRYPTED = 0x0100;
const TABLE_1 = 0x0200; // which of the two table streams holds the tables
const COMPRESSED = 0x40000000; // a piece stored one byte per character (Windows-1252)
const FC_MASK = 0x3fffffff;
const PIECE_DESCRIPTOR = 8;
/** Where the File Information Block keeps what is read here (Word 97 layout). */
const FIB = { flags: 0x0a, textLength: 0x4c, styles: 0xa2, paragraphs: 0x102, pieces: 0x1a2 };
const PARAGRAPH_END = new Set(['\r', '\x07', '\x0c']); // paragraph mark, end of a table cell or row, page break
const FIELD = { begin: '\x13', separator: '\x14', end: '\x15' };
/** Characters that stand for something not text (pictures, note marks) or for a special hyphen. */
const REPLACED = { '\x01': '', '\x02': '', '\x05': '', '\x08': '', '\x1e': '-', '\x1f': '', '\x0b': '\n' };

/**
 * @typedef {{ text: string, heading: number }} DocParagraph `heading`: 1 for Heading 1 and so on; 0 for text
 * @param {ArrayBuffer | Uint8Array} source the .doc file
 * @returns {DocParagraph[]}
 */
export function readDoc(source) {
  const streams = readCompound(source instanceof Uint8Array ? source : new Uint8Array(source));
  const main = streams.get('WordDocument');
  if (!main) throw new Error('Not a Word document');
  const fib = new DataView(main.buffer, main.byteOffset, main.byteLength);
  const u32 = (/** @type {number} */ at) => fib.getUint32(at, true);
  if (fib.getUint16(0, true) !== WORD_ID) throw new Error('Not a Word document');
  if (fib.getUint16(2, true) < WORD_97) throw new Error('Word 95 and older documents are not supported');
  const flags = fib.getUint16(FIB.flags, true);
  if (flags & ENCRYPTED) throw new Error('This document is protected with a password');
  const table = streams.get(flags & TABLE_1 ? '1Table' : '0Table');
  if (!table) throw new Error('The document is damaged');
  const at = (/** @type {number} */ offset) => ({ fc: u32(offset), lcb: u32(offset + 4) });

  const levelOf = headingLevels(main, table, { styles: at(FIB.styles), paragraphs: at(FIB.paragraphs) });
  return paragraphsOf(pieces(main, table, at(FIB.pieces), u32(FIB.textLength)), levelOf);
}

/**
 * The text split into paragraphs. Of a field (a page number, a link, a table of contents) only its result
 * is shown, not its code.
 * @param {ReturnType<typeof pieces>} parts
 * @param {(offset: number) => number} levelOf heading level by the file offset of a paragraph mark
 * @returns {DocParagraph[]}
 */
function paragraphsOf(parts, levelOf) {
  const paragraphs = [];
  let text = '';
  const fields = []; // per open field, whether its code is being read
  for (const { chars, offsetOf } of parts) {
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      if (char === FIELD.begin) fields.push(true);
      else if (char === FIELD.separator && fields.length) fields[fields.length - 1] = false;
      else if (char === FIELD.end) fields.pop();
      else if (PARAGRAPH_END.has(char)) {
        paragraphs.push({ text: tidy(text), heading: levelOf(offsetOf(i)) });
        text = '';
      } else if (!fields.at(-1)) text += REPLACED[char] ?? char;
    }
  }
  if (text.trim()) paragraphs.push({ text: tidy(text), heading: 0 });
  return paragraphs.filter((p) => p.text);
}

const tidy = (/** @type {string} */ text) =>
  text
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim();

/**
 * The main document's text in pieces, in order, each with the file offset of its characters: the piece
 * table says where each run of characters is stored and how.
 * @param {Uint8Array} main the WordDocument stream
 * @param {Uint8Array} table the table stream
 * @param {{ fc: number, lcb: number }} clx where the piece table is
 * @param {number} textLength characters in the main document; footnotes and headers follow it
 */
function pieces(main, table, { fc, lcb }, textLength) {
  const view = new DataView(table.buffer, table.byteOffset, table.byteLength);
  let pos = fc;
  while (pos < fc + lcb && table[pos] === 1) pos += 3 + view.getUint16(pos + 1, true); // formatting, skipped
  if (table[pos] !== 2) throw new Error('The document is damaged');
  const plc = pos + 5;
  const count = (view.getUint32(pos + 1, true) - 4) / (4 + PIECE_DESCRIPTOR);
  const out = [];
  for (let i = 0; i < count; i++) {
    const start = view.getUint32(plc + i * 4, true);
    const end = Math.min(view.getUint32(plc + (i + 1) * 4, true), textLength);
    if (start >= end) continue;
    const raw = view.getUint32(plc + (count + 1) * 4 + i * PIECE_DESCRIPTOR + 2, true);
    const compressed = (raw & COMPRESSED) !== 0;
    const width = compressed ? 1 : 2;
    const offset = compressed ? (raw & FC_MASK) / 2 : raw & FC_MASK;
    const bytes = main.subarray(offset, offset + (end - start) * width);
    out.push({
      chars: new TextDecoder(compressed ? 'windows-1252' : 'utf-16le').decode(bytes),
      offsetOf: (/** @type {number} */ index) => offset + index * width,
    });
  }
  return out;
}
