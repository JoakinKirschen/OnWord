const PREFIX = 'onword:pref:';

/**
 * Small per-browser settings (theme, panel visibility). Document data belongs in the store instead.
 * @param {Storage} storage
 */
export function createPreferences(storage) {
  return {
    /**
     * @template T
     * @param {string} name
     * @param {T} fallback
     * @returns {T}
     */
    get(name, fallback) {
      try {
        const raw = storage.getItem(PREFIX + name);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    /** @param {string} name @param {unknown} value */
    set(name, value) {
      try {
        storage.setItem(PREFIX + name, JSON.stringify(value));
      } catch {
        // A full or unavailable store only loses the preference; nothing to recover.
      }
    },
  };
}

/** @typedef {ReturnType<typeof createPreferences>} Preferences */
