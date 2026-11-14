/** The workspace's top bar: the specification's name, phase and lot, what kind it is, and where "back" goes. */

import { $, $$ } from '../core/dom.js';

/** What only a project has: phase and lot, and the tabs of offers, site reviews and documents. */
const PROJECT_ONLY = '#specProject, [data-arg="offers"], [data-arg="reviews"], [data-arg="documents"]';

/**
 * @typedef {import('../core/spec/model.js').Spec} Spec
 * @param {{ root: HTMLElement, current: () => Spec | null, changed: () => void }} deps `current`: the open
 *   specification, which typing in the fields changes
 */
export function createHeader({ root, current, changed }) {
  const inputs = { title: $('#specTitle', root), phase: $('#specPhase', root), lot: $('#specLot', root) };
  const back = $('.spec-bar .brand', root);

  for (const [name, input] of Object.entries(inputs)) {
    input.addEventListener('input', () => {
      current()[name] = input.value;
      changed();
    });
  }

  return {
    /** Fills the bar in for a specification that has just been opened. */
    show(/** @type {Spec} */ spec) {
      for (const [name, input] of Object.entries(inputs)) {
        input.value = spec[name];
        input.disabled = !spec.mine;
      }
      const project = spec.kind === 'project';
      $('#specKind', root).textContent = project ? 'Project' : 'Master specification';
      for (const element of $$(PROJECT_ONLY, root)) element.hidden = !project;
      $('#specReadOnly', root).hidden = spec.mine;
      back.href = project ? '#/' : '#/masters';
      back.title = project ? 'All projects' : 'All master specifications';
      back.setAttribute('aria-label', back.title);
    },
  };
}
