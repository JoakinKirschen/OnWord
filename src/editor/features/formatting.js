import { $$ } from '../../core/dom.js';
import { selectedBlocks } from '../blocks.js';

const SUBTITLE = 'subtitle';

/** Adds or removes a class without leaving an empty `class` attribute behind. */
function setClass(/** @type {HTMLElement} */ el, /** @type {string} */ name, /** @type {boolean} */ on) {
  el.classList.toggle(name, on);
  if (!el.classList.length) el.removeAttribute('class');
}

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

  commands.register({
    /** `style` is a tag name, or 'subtitle' (a paragraph with a class). */
    'format.block'(style) {
      selection.restore();
      const tag = style === SUBTITLE ? 'p' : style;
      // Leaving a quote: Chrome nests the new block inside the blockquote unless it is unwrapped first.
      if (tag !== 'blockquote' && selection.closest('blockquote')) doc.execCommand('outdent');
      ctx.exec('formatBlock', `<${tag}>`);
      for (const block of selectedBlocks(ctx)) setClass(block, SUBTITLE, style === SUBTITLE);
      ctx.changed();
      events.emit('selection'); // the toolbar shows the style, which the class has just changed
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
      selectedBlocks(ctx).forEach((b) => (b.style.lineHeight = value));
      ctx.changed();
    },
  });

  events.on('input', (/** @type {InputEvent} */ e) => {
    if (pendingSize) fixFontSizes(pendingSize);
    // Enter after a subtitle starts a normal paragraph, but Chrome copies the class to the new one.
    const paragraph = e?.inputType === 'insertParagraph' && selection.closest(`p.${SUBTITLE}`);
    if (paragraph && !paragraph.textContent) setClass(paragraph, SUBTITLE, false);
  });
  events.on('open', () => {
    pendingSize = null;
  });
  content.addEventListener('mousedown', () => {
    pendingSize = null;
  });
}
