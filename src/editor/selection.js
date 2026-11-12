/** Selection utilities scoped to the editable `content` element. */
export function createSelection(content) {
  const doc = content.ownerDocument;
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
  function anchorElement() {
    const node = current()?.anchorNode;
    if (!node) return null;
    return node.nodeType === 1 ? node : node.parentElement;
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
