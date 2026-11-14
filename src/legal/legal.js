/**
 * The privacy policy and terms of use pages (`#/privacy`, `#/terms`). They open over whatever screen is
 * showing, signed in or not, because the sign-in screen and sign-on providers link to them.
 */

import { $ } from '../core/dom.js';
import { VERSION } from '../core/version.js';
import { privacyHtml, termsHtml } from './texts.js';

const PAGES = { '#/privacy': privacyHtml, '#/terms': termsHtml };
const TITLES = { '#/privacy': 'Privacy policy', '#/terms': 'Terms of use' };

/**
 * @typedef {ReturnType<typeof createLegal>} Legal
 * @param {{ root: HTMLElement }} deps
 */
export function createLegal({ root }) {
  const text = $('#legalText', root);
  /** @type {import('./texts.js').SiteOwner} */
  let site = {};
  let shown = '';

  return {
    /** Whether a hash names one of these pages; the screen underneath then stays as it is. */
    owns: (/** @type {string} */ hash) => Object.hasOwn(PAGES, hash),
    /** Who runs the site, as the server's settings say; the pages name them. */
    setSite(/** @type {import('./texts.js').SiteOwner | undefined} */ owner) {
      site = owner ?? {};
      if (shown) text.innerHTML = PAGES[shown](site);
    },
    /** Shows the page a hash names, or hides the pages for any other hash. */
    route(/** @type {string} */ hash) {
      shown = Object.hasOwn(PAGES, hash) ? hash : '';
      root.hidden = !shown;
      if (!shown) return;
      text.innerHTML = PAGES[shown](site);
      $('#legalVersion', root).textContent = `OnWord ${VERSION}`;
      root.ownerDocument.title = `${TITLES[shown]} – OnWord`;
      root.scrollTop = 0;
    },
  };
}
