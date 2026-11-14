/** The workspace's views (articles, bill of quantities, prices, offers, site reviews) and the tabs that show them. */

import { $, $$ } from '../core/dom.js';

/**
 * @template {string} Name
 * @param {{ root: HTMLElement, commands: import('../core/commands.js').Commands,
 *   panels: Record<Name, [string, (() => string) | null]> }} deps `panels`: per view, its panel's selector and
 *   what to draw there when it is shown (null for a panel that draws itself)
 */
export function createViews({ root, commands, panels }) {
  const views = Object.entries(panels).map(([name, [selector, html]]) => ({
    name: /** @type {Name} */ (name), // Object.entries forgets the type of the keys
    element: $(selector, root),
    html,
  }));
  /** @param {any} name @returns {name is Name} */
  const has = (name) => views.some((v) => v.name === name);

  /** Shows one view, drawing it afresh, and marks its tab. */
  function show(/** @type {Name} */ shown) {
    for (const { name, element, html } of views) {
      element.hidden = name !== shown;
      if (name === shown && html) element.innerHTML = html();
    }
    for (const tab of $$('[data-act="spec.view"]', root)) tab.classList.toggle('on', tab.dataset.arg === shown);
  }

  commands.register({ 'spec.view': (name) => show(has(name) ? name : views[0].name) });

  return {
    show,
    has,
    /** The view on screen. @returns {Name} */
    current: () => /** @type {Name} */ (views.find((v) => !v.element.hidden)?.name ?? views[0].name),
  };
}
