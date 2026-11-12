import { $$ } from '../../core/dom.js';

/**
 * Paragraph style, font, font size and line spacing.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initFormatting(ctx) {
  const { content, selection, events, commands } = ctx;
  const doc = content.ownerDocument;
  let pendingSize = null; // size chosen with a collapsed caret, applied as the user types

  // execCommand only produces the legacy 1–7 sizes; size 7 is applied as a marker and rewritten.
  function fixFontSizes(pt) {
    for (const el of $$('font[size="7"], span[style*="xxx-large"]', content)) {
      let span = el;
      if (el.tagName === 'FONT') {
        span = doc.createElement('span');
        span.append(...el.childNodes);
        el.replaceWith(span);
      }
      span.style.fontSize = pt + 'pt';
      $$('[style*="font-size"]', span).forEach((child) => (child.style.fontSize = ''));
    }
  }

  function selectedBlocks() {
    const s = selection.current();
    if (!s) return [];
    const range = s.getRangeAt(0);
    const blocks = $$('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,div', content).filter((b) => range.intersectsNode(b));
    return blocks.filter((b) => !blocks.some((other) => other !== b && b.contains(other))); // innermost only
  }

  commands.register({
    'format.block'(tag) {
      selection.restore();
      // Leaving a quote: Chrome nests the new block inside the blockquote unless it is unwrapped first.
      if (tag !== 'blockquote' && selection.closest('blockquote')) doc.execCommand('outdent');
      ctx.exec('formatBlock', `<${tag}>`);
    },
    'format.font'(name) {
      ctx.exec('fontName', name);
    },
    'format.size'(pt) {
      selection.restore();
      const collapsed = selection.current()?.isCollapsed;
      doc.execCommand('styleWithCSS', false, 'true');
      doc.execCommand('fontSize', false, '7');
      if (collapsed) pendingSize = pt;
      else {
        fixFontSizes(pt);
        ctx.changed();
      }
    },
    'format.spacing'(value) {
      selection.restore();
      selectedBlocks().forEach((b) => (b.style.lineHeight = value));
      ctx.changed();
    },
  });

  events.on('input', () => {
    if (pendingSize) fixFontSizes(pendingSize);
  });
  events.on('open', () => {
    pendingSize = null;
  });
  content.addEventListener('mousedown', () => {
    pendingSize = null;
  });
}
