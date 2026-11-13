const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const LENGTH = 16;

/** A random id for something created in the browser; the server accepts ids of this shape. */
export function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(LENGTH));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}
