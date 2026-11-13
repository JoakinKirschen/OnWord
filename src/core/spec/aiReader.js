/**
 * The AI reader: the server sends a contractor's file to Claude, which reads its priced lines and matches
 * them to the project's articles. Used for files the spreadsheet reader cannot read (PDF, unusual layouts).
 * Only available when the site runs with its server part and an API key is configured there.
 */

/**
 * @typedef {object} AiReading
 * @property {string} contractor the contractor's name, if the file shows it
 * @property {import('./offers.js').OfferLine[]} lines
 *
 * @typedef {object} AiFile what is sent: a PDF as base64, or a spreadsheet as tab-separated text
 * @property {string} name
 * @property {string} [pdf]
 * @property {string} [text]
 */

/** @param {{ api: import('../api.js').Api }} deps */
export function createAiReader({ api }) {
  return {
    /** @param {string} specId @param {AiFile} file @returns {Promise<AiReading>} */
    read: (specId, file) => api.post('ai/read', { specId, ...file }),
  };
}

/** @typedef {ReturnType<typeof createAiReader>} AiReader */
