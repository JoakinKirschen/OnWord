const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
/** Label prefix for the primary modifier key, e.g. `MOD + 'B'`. */
export const MOD = isMac ? '⌘' : 'Ctrl+';
