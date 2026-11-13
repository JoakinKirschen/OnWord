/** Client for the server API (api/index.php): JSON requests carrying the session cookie and CSRF token. */

/**
 * @typedef {{ id: number, email: string, name: string }} User
 * @typedef {{ user: User | null, csrf: string, registration?: { open: boolean, code: boolean }, ai?: boolean }} Session
 *   `ai`: whether the server's AI reader is set up
 * @typedef {Error & { status: number, code: string }} ApiError `status` 0 means the server was not reached
 * @typedef {ReturnType<typeof createApi>} Api
 */

/**
 * @param {{ base: string, request?: typeof fetch }} options `base`: URL of api/index.php
 */
export function createApi({ base, request = (...args) => fetch(...args) }) {
  let csrf = '';

  /** @returns {ApiError} */
  const error = (/** @type {number} */ status, /** @type {string} */ code, /** @type {string} */ message) =>
    Object.assign(new Error(message || code), { status, code });

  /** @returns {Promise<any>} */
  async function send(/** @type {'GET' | 'POST'} */ method, /** @type {string} */ route, /** @type {object} */ body) {
    let response;
    try {
      response = await request(`${base}?r=${route}`, {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
      });
    } catch {
      throw error(0, 'offline', 'The server could not be reached.');
    }
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) throw error(response.status, data?.error ?? 'bad_response', data?.message ?? '');
    if (typeof data.csrf === 'string') csrf = data.csrf; // signing in or out issues a new token
    return data;
  }

  /** @returns {Promise<Session>} */
  const session = () => send('GET', 'auth/me', undefined);

  return {
    session,
    /** @param {string} route e.g. `docs/get&id=abc` @returns {Promise<any>} */
    get: (route) => send('GET', route, undefined),
    /**
     * A token goes stale when the user signs in again in another tab; fetch the new one and retry once.
     * @param {string} route
     * @param {object} [body]
     * @returns {Promise<any>}
     */
    async post(route, body) {
      try {
        return await send('POST', route, body);
      } catch (err) {
        if (/** @type {ApiError} */ (err).code !== 'csrf') throw err;
        await session();
        return send('POST', route, body);
      }
    },
  };
}
