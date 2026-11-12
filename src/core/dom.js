/** DOM lookup helpers. A root is always required so modules stay inside the subtree they own. */
/**
 * Element subtypes cannot be inferred from a selector, so lookups are deliberately untyped (`any`).
 * @type {(selector: string, root: ParentNode) => any}
 */
export const $ = (selector, root) => root.querySelector(selector);
/** @type {(selector: string, root: ParentNode) => any[]} */
export const $$ = (selector, root) => [...root.querySelectorAll(selector)];

/**
 * The element an event was dispatched on. `Event.target` is typed as a bare EventTarget.
 * @param {Event} event
 * @returns {HTMLElement}
 */
export const targetOf = (event) => /** @type {HTMLElement} */ (event.target);

/**
 * Nearest ancestor of the event target matching `selector` (event delegation). Untyped like `$`.
 * @type {(event: Event, selector: string) => any}
 */
export const hit = (event, selector) => targetOf(event).closest(selector);
