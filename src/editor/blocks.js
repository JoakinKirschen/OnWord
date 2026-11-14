import { $$ } from '../core/dom.js';
import { cssPx } from '../core/units.js';

const isContainer = (el, content) => el === content || /^(TD|TH|LI|BLOCKQUOTE)$/.test(el.tagName);

/** Chrome nests lists (and other blocks) inside <p>, which is invalid and re-parses differently on reload. */
export function tidy(content) {
  const bad = $$('p > ul, p > ol, p > table, p > blockquote, p > pre, p > hr, p > p', content);
  if (!bad.length) return;
  const s = content.ownerDocument.getSelection();
  const pos = s.rangeCount ? [s.anchorNode, s.anchorOffset, s.focusNode, s.focusOffset] : null;
  for (const el of bad) {
    const p = el.parentElement;
    if (p?.tagName === 'P') p.replaceWith(...p.childNodes);
  }
  if (pos && content.contains(pos[0]) && content.contains(pos[2])) {
    try {
      s.setBaseAndExtent(...pos);
    } catch {
      /* selection no longer valid */
    }
  }
}

/**
 * Insert a block-level node at the caret. Done through the DOM because execCommand('insertHTML')
 * mangles tables that land inside a paragraph. `focus(node)` picks where the caret goes afterwards.
 * @param {import('./editor.js').EditorContext} ctx
 * @param {HTMLElement} node
 * @param {(node: HTMLElement) => Element} [focus]
 */
export function insertBlock(ctx, node, focus = (n) => n) {
  const { content, selection } = ctx;
  selection.restore();
  const s = selection.current();
  if (!s) return;
  const r = s.getRangeAt(0);
  r.deleteContents();
  let block = /** @type {HTMLElement} */ (
    r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement
  );
  if (isContainer(block, content)) r.insertNode(node);
  else {
    while (!isContainer(block.parentElement, content)) block = block.parentElement;
    block.after(node);
    if (block.tagName === 'P' && !block.textContent && !block.querySelector('img')) block.remove();
  }
  if (!node.nextElementSibling) {
    const p = content.ownerDocument.createElement('p');
    p.innerHTML = '<br>';
    node.after(p);
  }
  selection.caretInto(focus(node));
  ctx.changed();
}

const BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,div';

/**
 * The innermost block elements touched by the selection (the paragraphs a paragraph-level format applies to).
 * @param {import('./editor.js').EditorContext} ctx
 * @returns {HTMLElement[]}
 */
export function selectedBlocks({ content, selection }) {
  const s = selection.current();
  if (!s) return [];
  const range = s.getRangeAt(0);
  const blocks = $$(BLOCK_SELECTOR, content).filter((b) => range.intersectsNode(b));
  return blocks.filter((b) => !blocks.some((other) => other !== b && b.contains(other)));
}

/** @typedef {{ left: number, right: number, firstLine: number }} Indents in CSS pixels; `firstLine` is relative to `left` */

/** @param {HTMLElement | undefined} block @returns {Indents} */
export const indentsOf = (block) => ({
  left: cssPx(block?.style.marginLeft),
  right: cssPx(block?.style.marginRight),
  firstLine: cssPx(block?.style.textIndent),
});

/** @param {HTMLElement} block @param {Indents} indents */
export function setIndents(block, { left, right, firstLine }) {
  // Hundredths of a pixel keep centimetre positions exact enough for Word's twips (15 to the pixel).
  const px = (/** @type {number} */ value) => (Math.round(value * 100) ? `${+value.toFixed(2)}px` : '');
  block.style.marginLeft = px(left);
  block.style.marginRight = px(right);
  block.style.textIndent = px(firstLine);
}
