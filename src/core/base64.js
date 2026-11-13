/** Base64 for binary data (images in documents, files sent to the server). */

// String.fromCharCode takes its arguments on the stack; a whole file at once would overflow it.
const CHUNK = 0x8000;

/** @param {Uint8Array} bytes */
export function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}
