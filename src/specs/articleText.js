/** Editing an article's text: the formatting buttons, and pasting only clean HTML. */

import { hit } from '../core/dom.js';
import { sanitize } from '../core/html.js';

/**
 * @param {HTMLElement} panel the article form, which is redrawn but keeps its listeners
 */
export function initArticleText(panel) {
  const doc = panel.ownerDocument;
  // Formatting buttons act on the text selection, which a normal click would take away.
  panel.addEventListener('mousedown', (e) => {
    const button = hit(e, '[data-format]');
    if (!button) return;
    e.preventDefault();
    doc.execCommand(button.dataset.format);
  });
  panel.addEventListener('paste', (e) => {
    const html = hit(e, '#articleText') && e.clipboardData?.getData('text/html');
    if (!html) return;
    e.preventDefault();
    doc.execCommand('insertHTML', false, sanitize(html));
  });
}
