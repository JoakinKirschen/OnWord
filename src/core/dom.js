/** DOM lookup helpers. A root is always required so modules stay inside the subtree they own. */
export const $ = (selector, root) => root.querySelector(selector);
export const $$ = (selector, root) => [...root.querySelectorAll(selector)];
