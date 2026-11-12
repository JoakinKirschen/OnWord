/**
 * Minimal ZIP reader/writer (no ZIP64, no encryption), enough for Office documents.
 * Compression uses the platform's CompressionStream, so nothing is bundled.
 */

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const END_SIG = 0x06054b50;
const END_SIZE = 22;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;
const UTF8_FLAG = 0x0800;
const VERSION = 20;
/** Already-compressed formats are stored as-is. */
const STORED_EXTENSIONS = /\.(png|jpe?g|gif|webp)$/i;

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

/** @param {Uint8Array} bytes */
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** @param {Uint8Array} bytes @param {CompressionStream | DecompressionStream} transform */
async function pipe(bytes, transform) {
  const stream = new Blob([/** @type {BlobPart} */ (bytes)]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Writes little-endian fields: each is [byteSize, value]. */
function record(/** @type {[number, number][]} */ fields) {
  const bytes = new Uint8Array(fields.reduce((sum, [size]) => sum + size, 0));
  const view = new DataView(bytes.buffer);
  let offset = 0;
  for (const [size, value] of fields) {
    if (size === 2) view.setUint16(offset, value, true);
    else view.setUint32(offset, value, true);
    offset += size;
  }
  return bytes;
}

function concat(/** @type {Uint8Array[]} */ parts) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Builds a ZIP archive. Entries keep the given order (Office requires `[Content_Types].xml` first).
 * @param {{ name: string, data: Uint8Array | string }[]} files
 * @returns {Promise<Uint8Array>}
 */
export async function writeZip(files) {
  const encoder = new TextEncoder();
  const body = [];
  const directory = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
    const method = STORED_EXTENSIONS.test(file.name) ? METHOD_STORE : METHOD_DEFLATE;
    const packed = method === METHOD_DEFLATE ? await pipe(data, new CompressionStream('deflate-raw')) : data;
    /** @type {[number, number][]} */
    const shared = [
      [2, VERSION],
      [2, UTF8_FLAG],
      [2, method],
      [2, 0],
      [2, 0x21],
      [4, crc32(data)],
      [4, packed.length],
      [4, data.length],
      [2, name.length],
      [2, 0],
    ];
    const local = record([[4, LOCAL_SIG], ...shared]);
    directory.push(
      record([[4, CENTRAL_SIG], [2, VERSION], ...shared, [2, 0], [2, 0], [2, 0], [4, 0], [4, offset]]),
      name,
    );
    body.push(local, name, packed);
    offset += local.length + name.length + packed.length;
  }
  const central = concat(directory);
  const end = record([
    [4, END_SIG],
    [2, 0],
    [2, 0],
    [2, files.length],
    [2, files.length],
    [4, central.length],
    [4, offset],
    [2, 0],
  ]);
  return concat([...body, central, end]);
}

/**
 * Reads every entry of a ZIP archive.
 * @param {ArrayBuffer | Uint8Array} source
 * @returns {Promise<Map<string, Uint8Array>>}
 */
export async function readZip(source) {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - END_SIZE;
  while (end >= 0 && view.getUint32(end, true) !== END_SIG) end--; // a trailing comment may follow the record
  if (end < 0) throw new Error('Not a ZIP archive');

  const decoder = new TextDecoder();
  const entries = new Map();
  let pos = view.getUint32(end + 16, true);
  for (let i = view.getUint16(end + 10, true); i > 0; i--) {
    if (view.getUint32(pos, true) !== CENTRAL_SIG) throw new Error('Corrupt ZIP directory');
    const method = view.getUint16(pos + 10, true);
    const packedSize = view.getUint32(pos + 20, true);
    const nameLength = view.getUint16(pos + 28, true);
    const local = view.getUint32(pos + 42, true);
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength));
    pos += 46 + nameLength + view.getUint16(pos + 30, true) + view.getUint16(pos + 32, true);

    // The local header repeats the name and has its own extra field; data starts after both.
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const packed = bytes.subarray(start, start + packedSize);
    if (method === METHOD_STORE) entries.set(name, packed);
    else if (method === METHOD_DEFLATE) entries.set(name, await pipe(packed, new DecompressionStream('deflate-raw')));
    else throw new Error(`Unsupported ZIP compression method ${method}`);
  }
  return entries;
}
