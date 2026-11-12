import { $ } from '../../core/dom.js';

const SYMBOLS = [...'—–…•·§¶†©®™°±×÷≠≤≥≈∞√∑πΩµαβγδλ←→↑↓↔⇒✓✗★☆€£¥¢½¼¾²³«»“”‘’¿¡'];

/**
 * Special characters: a picker opened from the Insert menu.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initSymbols(ctx) {
  const { root, commands, popover } = ctx;
  const html = `<div class="symbol-grid">${SYMBOLS.map(
    (char) => `<button data-act="insert.symbol" data-arg="${char}" aria-label="${char}">${char}</button>`,
  ).join('')}</div>`;

  commands.register({
    'insert.symbols': () => popover.open($('[data-menu="Insert"]', root), html, 'symbols'),
    'insert.symbol': (char) => ctx.exec('insertText', char),
  });
}
