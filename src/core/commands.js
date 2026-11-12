/**
 * Command registry. Features register named commands ("table.insert"); menus, toolbar buttons
 * (`data-act`) and shortcuts run them by name, so features never import each other.
 * @typedef {ReturnType<typeof createCommands>} Commands
 */
export function createCommands() {
  /** @type {Map<string, (arg?: any) => any>} */
  const registry = new Map();
  return {
    /** @param {Record<string, (arg?: any) => any>} map */
    register(map) {
      for (const [name, fn] of Object.entries(map)) {
        if (registry.has(name)) throw new Error(`Command already registered: ${name}`);
        registry.set(name, fn);
      }
    },
    /** @param {string} name @param {any} [arg] @returns {any} */
    run(name, arg) {
      const fn = registry.get(name);
      if (!fn) {
        console.warn(`Unknown command: ${name}`);
        return undefined;
      }
      return fn(arg);
    },
  };
}
