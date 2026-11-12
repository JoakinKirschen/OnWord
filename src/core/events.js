/**
 * Minimal publish/subscribe channel.
 * @typedef {ReturnType<typeof createEmitter>} Emitter
 */

export function createEmitter() {
  /** @type {Map<string, Set<(payload?: any) => void>>} */
  const listeners = new Map();
  return {
    /** @param {string} type @param {(payload?: any) => void} fn @returns {() => void} unsubscribe */
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type).delete(fn);
    },
    /** @param {string} type @param {any} [payload] */
    emit(type, payload) {
      listeners.get(type)?.forEach((fn) => fn(payload));
    },
  };
}
