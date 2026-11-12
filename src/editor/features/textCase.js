const CASES = {
  upper: (/** @type {string} */ text) => text.toUpperCase(),
  lower: (/** @type {string} */ text) => text.toLowerCase(),
  title: (/** @type {string} */ text) =>
    text.toLowerCase().replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu, (_, gap, letter) => gap + letter.toUpperCase()),
  sentence: (/** @type {string} */ text) =>
    text.toLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (_, gap, letter) => gap + letter.toUpperCase()),
};

/**
 * Change case of the selected text (UPPERCASE, lowercase, Title Case, Sentence case).
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initTextCase(ctx) {
  const { content, selection, commands, toast } = ctx;

  commands.register({
    'format.case'(kind) {
      selection.restore();
      const s = selection.current();
      if (!s || s.isCollapsed) return toast('Select the text to change first.');
      const range = s.getRangeAt(0);
      const { startContainer, startOffset, endContainer, endOffset } = range;
      const walker = content.ownerDocument.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      for (let node = /** @type {Text} */ (walker.nextNode()); node; node = /** @type {Text} */ (walker.nextNode())) {
        if (!range.intersectsNode(node)) continue;
        const from = node === startContainer ? startOffset : 0;
        const to = node === endContainer ? endOffset : node.length;
        node.replaceData(from, to - from, CASES[kind](node.data.slice(from, to)));
      }
      s.setBaseAndExtent(startContainer, startOffset, endContainer, endOffset); // replaceData collapses range ends
      ctx.changed();
    },
  });
}
