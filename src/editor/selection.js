/**
 * Selection utilities scoped to the editable `content` element.
 * @typedef {ReturnType<typeof createSelection>} EditorSelection
 * @param {HTMLElement} content
 */
export function createSelection(content) {
  const doc = content.ownerDocument;
  /** @type {Range | null} */
  let saved = null; // last range seen inside the editor, restored after focus moves to the chrome

  /** The live Selection if it is inside the editor, otherwise null. */
  const current = () => {
    const s = doc.getSelection();
    return s.rangeCount && content.contains(s.anchorNode) ? s : null;
  };
  function setRange(range) {
    const s = doc.getSelection();
    s.removeAllRanges();
    s.addRange(range);
  }
  /** @returns {HTMLElement | null} the element containing the caret */
  function anchorElement() {
    const node = current()?.anchorNode;
    if (!node) return null;
    return /** @type {HTMLElement} */ (node.nodeType === 1 ? node : node.parentElement);
  }

  /** Characters of text between the start of the document and a point. */
  function textOffset(/** @type {Node} */ node, /** @type {number} */ offset) {
    const r = doc.createRange();
    r.setStart(content, 0);
    r.setEnd(node, offset);
    return r.toString().length;
  }
  /** The text node and offset `chars` characters into the document (its end if it is shorter). */
  function textPoint(/** @type {number} */ chars) {
    const walker = doc.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let left = chars;
    /** @type {Text | null} */
    let last = null;
    for (
      let node = /** @type {Text | null} */ (walker.nextNode());
      node;
      node = /** @type {Text | null} */ (walker.nextNode())
    ) {
      if (left <= node.length) return { node, offset: left };
      left -= node.length;
      last = node;
    }
    return last ? { node: last, offset: last.length } : null;
  }

  return {
    current,
    setRange,
    anchorElement,
    /** Records the current range; returns false when the selection is outside the editor. */
    remember() {
      const s = current();
      if (s) saved = s.getRangeAt(0).cloneRange();
      return !!s;
    },
    /** Puts focus and the last known range back into the editor. */
    restore() {
      if (current()) return;
      content.focus({ preventScroll: true });
      if (saved) setRange(saved);
    },
    /** Nearest ancestor of the caret matching `selector`, inside the editor. */
    closest(selector) {
      const el = anchorElement()?.closest(selector);
      return el && el !== content && content.contains(el) ? el : null;
    },
    /** The selection as character offsets, which survive the browser rebuilding the nodes around it. */
    offsets() {
      const s = current();
      return s ? [textOffset(s.anchorNode, s.anchorOffset), textOffset(s.focusNode, s.focusOffset)] : null;
    },
    /**
     * Selects what `offsets()` described, if that lies inside `within` (an offset at the edge of a block
     * also describes the end of the text before it, which is not where an empty block's caret belongs).
     * @param {number[] | null} offsets
     * @param {Node} within
     */
    restoreOffsets(offsets, within) {
      const [anchor, focus] = (offsets ?? []).map(textPoint);
      if (!anchor || !focus || !within.contains(anchor.node) || !within.contains(focus.node)) return;
      doc.getSelection().setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
    },
    caretInto(node) {
      const r = doc.createRange();
      r.selectNodeContents(node);
      r.collapse(true);
      setRange(r);
    },
    selectNode(node) {
      const r = doc.createRange();
      r.selectNode(node);
      setRange(r);
    },
  };
}
