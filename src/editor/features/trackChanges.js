import { $, $$ } from '../../core/dom.js';

const PREF = 'track';
const AUTHOR_PREF = 'author';
const MARKS = 'ins, del';

/**
 * Track changes: while it is on, typed text is marked as inserted (<ins>) and deleted text is kept and
 * marked as deleted (<del>) so each change can be accepted or rejected later. Only typing and deleting
 * are tracked; formatting, pasting and paragraph breaks go through unmarked.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initTrackChanges(ctx) {
  const { root, content, selection, commands, prefs, toast } = ctx;
  const doc = content.ownerDocument;
  const indicator = $('#trackState', root);
  let tracking = false;

  function setTracking(/** @type {boolean} */ on) {
    tracking = on;
    prefs.set(PREF, on);
    indicator.textContent = `Track changes: ${on ? 'on' : 'off'}`;
    indicator.classList.toggle('on', on);
  }

  function mark(/** @type {'ins' | 'del'} */ tag) {
    const el = doc.createElement(tag);
    el.dataset.author = prefs.get(AUTHOR_PREF, '') || 'Author';
    el.dataset.date = new Date().toISOString();
    return el;
  }

  function caretAt(/** @type {Range} */ spot, /** @type {boolean} */ toStart) {
    spot.collapse(toStart);
    selection.setRange(spot);
  }

  /** The text inside `range` as whole text nodes, splitting the nodes at its two ends. */
  function textPieces(/** @type {Range} */ range) {
    const { startContainer, startOffset, endContainer, endOffset } = range;
    const walker = doc.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    const spans = [];
    for (let node = /** @type {Text} */ (walker.nextNode()); node; node = /** @type {Text} */ (walker.nextNode())) {
      if (!range.intersectsNode(node)) continue;
      const from = node === startContainer ? startOffset : 0;
      const to = node === endContainer ? endOffset : node.length;
      if (from < to) spans.push({ node, from, to });
    }
    return spans.map(({ node, from, to }) => {
      if (to < node.length) node.splitText(to);
      return from > 0 ? node.splitText(from) : node;
    });
  }

  /**
   * Marks the text in `range` as deleted. Text the user inserted while tracking is simply removed, and
   * text already marked as deleted is left alone. Returns false when the range holds no text.
   */
  function strike(/** @type {Range} */ range, /** @type {boolean} */ backward) {
    const spots = textPieces(range).map((piece) => {
      const spot = doc.createRange();
      const parent = piece.parentElement;
      if (parent.closest('ins')) {
        spot.setStartBefore(piece);
        piece.remove();
        if (!parent.textContent && parent.matches('ins')) parent.remove();
      } else if (parent.closest('del')) spot.selectNode(piece);
      else {
        const del = mark('del');
        piece.replaceWith(del);
        del.append(piece);
        spot.selectNode(del);
      }
      return spot;
    });
    if (!spots.length) return false;
    caretAt(backward ? spots[0] : spots[spots.length - 1], backward);
    return true;
  }

  function type(/** @type {string} */ text) {
    const s = selection.current();
    if (!s) return;
    if (!s.isCollapsed) strike(s.getRangeAt(0), false);
    const range = selection.current().getRangeAt(0);
    const struck = selection.closest('del');
    if (struck) range.setStartAfter(struck); // new text never goes inside deleted text
    range.collapse(true);
    const node = doc.createTextNode(text);
    if (selection.closest('ins') && !struck) range.insertNode(node);
    else {
      const ins = mark('ins');
      ins.append(node);
      range.insertNode(ins);
    }
    range.setStart(node, node.length);
    caretAt(range, true);
  }

  /** The range a delete key would remove: the selection, or what the browser reports for the key. */
  function deletionRange(/** @type {InputEvent} */ e) {
    const s = selection.current();
    if (s && !s.isCollapsed) return s.getRangeAt(0);
    const [target] = e.getTargetRanges();
    if (!target) return null;
    const range = doc.createRange();
    range.setStart(target.startContainer, target.startOffset);
    range.setEnd(target.endContainer, target.endOffset);
    return range;
  }

  content.addEventListener('beforeinput', (e) => {
    if (!tracking || e.isComposing) return;
    if (e.inputType === 'insertText' && e.data) {
      e.preventDefault();
      type(e.data);
      ctx.changed();
    } else if (e.inputType.startsWith('delete')) {
      const range = deletionRange(e);
      // With no text in range (joining two paragraphs, say) the browser does its normal, untracked thing.
      if (!range || !strike(range, e.inputType.endsWith('Backward'))) return;
      e.preventDefault();
      ctx.changed();
    }
  });

  /** Tracked changes touched by the selection, or the one the caret is in. */
  function selectedMarks() {
    const s = selection.current();
    if (!s) return [];
    if (s.isCollapsed) return [selection.closest(MARKS)].filter(Boolean);
    const range = s.getRangeAt(0);
    return $$(MARKS, content).filter((el) => range.intersectsNode(el));
  }

  /** Accepting keeps insertions and drops deletions; rejecting does the opposite. */
  function settle(/** @type {HTMLElement[]} */ marks, /** @type {boolean} */ accept) {
    if (!marks.length) return toast('There is no tracked change here.');
    for (const el of marks) {
      if ((el.tagName === 'INS') === accept) el.replaceWith(...el.childNodes);
      else el.remove();
    }
    content.normalize();
    ctx.changed();
  }

  commands.register({
    'review.track': () => setTracking(!tracking),
    'review.accept': () => settle(selectedMarks(), true),
    'review.reject': () => settle(selectedMarks(), false),
    'review.acceptAll': () => settle($$(MARKS, content), true),
    'review.rejectAll': () => settle($$(MARKS, content), false),
  });

  setTracking(prefs.get(PREF, false));
}
