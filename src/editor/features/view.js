import { $ } from '../../core/dom.js';
import { insertBlock } from '../blocks.js';

const MARKS_PREF = 'marks';
const MARKS_CLASS = 'show-marks';

/**
 * Zoom and formatting marks, plus the small insert commands that need no UI of their own.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initView(ctx) {
  const { root, content, events, commands, prefs } = ctx;
  const sheet = $('#sheet', root),
    slider = $('#zoom', root),
    label = $('#zoomLabel', root);

  function zoom(/** @type {number} */ factor) {
    sheet.style.zoom = String(factor);
    slider.value = String(Math.round(factor * 100));
    label.textContent = Math.round(factor * 100) + '%';
    events.emit('layout');
  }

  commands.register({
    'view.zoom': (factor) => zoom(Number(factor)),
    /** Shows a ¶ at the end of every paragraph. */
    'view.marks'() {
      prefs.set(MARKS_PREF, content.classList.toggle(MARKS_CLASS));
    },
    'insert.pageBreak'() {
      const hr = content.ownerDocument.createElement('hr');
      hr.className = 'page-break';
      insertBlock(ctx, hr, (node) => node.nextElementSibling);
    },
    'insert.date'() {
      ctx.exec('insertText', new Date().toLocaleDateString([], { dateStyle: 'long' }));
    },
  });

  slider.addEventListener('input', () => zoom(Number(slider.value) / 100));
  content.classList.toggle(MARKS_CLASS, prefs.get(MARKS_PREF, false));
}
