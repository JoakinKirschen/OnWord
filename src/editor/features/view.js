import { $ } from '../../core/dom.js';
import { insertBlock } from '../blocks.js';

/**
 * Zoom, plus the small insert commands that need no UI of their own.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initView(ctx) {
  const { root, content, commands } = ctx;
  const paper = $('#paper', root);

  commands.register({
    'view.zoom'(factor) {
      paper.style.zoom = factor;
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
}
