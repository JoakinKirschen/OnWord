/**
 * Command registry. Features register named commands ("table.insert"); menus, toolbar buttons
 * (`data-act`) and shortcuts run them by name, so features never import each other.
 */
export function createCommands() {
  const registry = new Map();
  return {
    register(map) {
      for (const [name, fn] of Object.entries(map)) {
        if (registry.has(name)) throw new Error(`Command already registered: ${name}`);
        registry.set(name, fn);
      }
    },
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
