/**
 * The specifications the user can see, kept from the last time they were listed, so screens can name the
 * project a document is filed under without asking the store each time.
 */

/** @typedef {import('./model.js').Spec} Spec */

/**
 * @typedef {ReturnType<typeof createSpecDirectory>} SpecDirectory
 * @param {{ specStore: import('./model.js').SpecStore }} deps
 */
export function createSpecDirectory({ specStore }) {
  /** @type {Spec[]} */
  let specs = [];
  /** @type {Promise<Spec[]> | null} */
  let listing = null;

  /** The user's own projects, by name. */
  const projects = () =>
    specs.filter((s) => s.kind === 'project' && s.mine).sort((a, b) => a.title.localeCompare(b.title));

  return {
    /** Lists the specifications again; resolves to all of them. Calls made meanwhile share one request. */
    refresh() {
      listing ??= specStore.list().then(
        (list) => {
          specs = list;
          listing = null;
          return list;
        },
        (err) => {
          listing = null;
          throw err;
        },
      );
      return listing;
    },
    /** Every specification, as last listed. */
    specs: () => specs,
    projects,
    /** The name of one of the user's projects, or null when it is not (or not yet known to be) one. */
    title: (/** @type {string | null | undefined} */ id) => (id && projects().find((p) => p.id === id)?.title) || null,
  };
}
