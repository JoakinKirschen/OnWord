/**
 * Reads the streams of a Compound File (the container of Word 97–2003 .doc files and other older Office
 * files): a small file system of sectors chained through an allocation table, with a directory of streams.
 */

const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const HEADER_SIZE = 512;
const HEADER_FAT_ENTRIES = 109;
const DIR_ENTRY_SIZE = 128;
const LAST_SECTOR = 0xfffffffa; // values from here up end a chain or mark a sector as unused
const NO_ENTRY = 0xffffffff;
const STREAM = 2;
const ROOT = 5;

/**
 * The streams at the top level of the file, by name.
 * @param {Uint8Array} bytes
 * @returns {Map<string, Uint8Array>}
 */
export function readCompound(bytes) {
  if (bytes.length < HEADER_SIZE || SIGNATURE.some((b, i) => bytes[i] !== b)) throw new Error('Not a compound file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (/** @type {number} */ at) => view.getUint32(at, true);
  const sectorSize = 2 ** view.getUint16(0x1e, true);
  const miniSize = 2 ** view.getUint16(0x20, true);
  const perSector = sectorSize / 4;
  // The header takes the first sector's place, whatever the sector size.
  const sector = (/** @type {number} */ n) => {
    const start = (n + 1) * sectorSize;
    if (start + sectorSize > bytes.length) throw new Error('The file is incomplete');
    return bytes.subarray(start, start + sectorSize);
  };

  // Where the allocation table lives: 109 sectors named in the header, the rest in a chain of its own.
  const fatSectors = [];
  for (let i = 0; i < HEADER_FAT_ENTRIES; i++) fatSectors.push(u32(0x4c + i * 4));
  for (let next = u32(0x44), hops = 0; next < LAST_SECTOR && hops < bytes.length / sectorSize; hops++) {
    const bytesOf = sector(next);
    const block = new DataView(bytesOf.buffer, bytesOf.byteOffset, sectorSize);
    for (let i = 0; i < perSector - 1; i++) fatSectors.push(block.getUint32(i * 4, true));
    next = block.getUint32(sectorSize - 4, true);
  }
  const fat = tableOf(fatSectors.filter((n) => n < LAST_SECTOR).map(sector));

  /** The sectors of a chain, joined; `table` says which follows which. */
  const chain = (
    /** @type {number} */ first,
    /** @type {Uint32Array} */ table,
    /** @type {(n: number) => Uint8Array} */ read,
    size = Infinity,
  ) => {
    const parts = [];
    for (let n = first; n < LAST_SECTOR; n = table[n]) {
      if (parts.length > table.length || n >= table.length) throw new Error('The file is damaged');
      parts.push(read(n));
    }
    return join(parts).subarray(0, size);
  };
  const big = (/** @type {number} */ first, size = Infinity) => chain(first, fat, sector, size);

  const entries = directory(big(u32(0x30)));
  const root = entries.find((e) => e.type === ROOT);
  const miniStream = root ? big(root.start, root.size) : new Uint8Array();
  const miniFatStart = u32(0x3c);
  const miniFat = miniFatStart < LAST_SECTOR ? tableOf([big(miniFatStart)]) : new Uint32Array();
  const mini = (/** @type {number} */ n) => miniStream.subarray(n * miniSize, (n + 1) * miniSize);
  const cutoff = u32(0x38);

  const streams = new Map();
  for (const entry of topLevel(entries, root)) {
    if (entry.type !== STREAM) continue;
    const data = entry.size < cutoff ? chain(entry.start, miniFat, mini, entry.size) : big(entry.start, entry.size);
    streams.set(entry.name, data);
  }
  return streams;
}

/** 32-bit entries of the sectors given, as one table. */
function tableOf(/** @type {Uint8Array[]} */ sectors) {
  const bytes = join(sectors);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Uint32Array.from({ length: bytes.length / 4 }, (_, i) => view.getUint32(i * 4, true));
}

function join(/** @type {Uint8Array[]} */ parts) {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** The directory's entries: name, kind, first sector, size and their places in the tree. */
function directory(/** @type {Uint8Array} */ bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = [];
  for (let at = 0; at + DIR_ENTRY_SIZE <= bytes.length; at += DIR_ENTRY_SIZE) {
    const nameBytes = Math.max(0, view.getUint16(at + 0x40, true) - 2); // without the closing 0
    entries.push({
      name: new TextDecoder('utf-16le').decode(bytes.subarray(at, at + Math.min(nameBytes, 64))),
      type: bytes[at + 0x42],
      left: view.getUint32(at + 0x44, true),
      right: view.getUint32(at + 0x48, true),
      child: view.getUint32(at + 0x4c, true),
      start: view.getUint32(at + 0x74, true),
      size: view.getUint32(at + 0x78, true),
    });
  }
  return entries;
}

/** The entries directly in the root storage: its child and that child's siblings, a binary tree. */
function topLevel(/** @type {ReturnType<typeof directory>} */ entries, root) {
  const found = [];
  const seen = new Set();
  const visit = (/** @type {number} */ id) => {
    if (id === NO_ENTRY || id >= entries.length || seen.has(id)) return;
    seen.add(id);
    visit(entries[id].left);
    found.push(entries[id]);
    visit(entries[id].right);
  };
  if (root) visit(root.child);
  return found;
}
