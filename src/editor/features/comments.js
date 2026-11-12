import { $, $$ } from '../../core/dom.js';
import { esc } from '../../core/html.js';
import { selectedBlocks } from '../blocks.js';

const ANCHOR = 'span.comment';
const PANEL_PREF = 'comments';
const AUTHOR_PREF = 'author';
const QUOTE_LENGTH = 60;

const when = (/** @type {string} */ iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

/**
 * Comments: a remark attached to a stretch of text. The remark is stored on the highlighted span itself
 * (`title`, `data-author`, `data-date`), so it travels with the document; the side panel lists them.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initComments(ctx) {
  const { root, content, selection, events, commands, prefs, toast } = ctx;
  const doc = content.ownerDocument;
  const panel = $('#commentsPanel', root),
    list = $('#commentList', root),
    dialog = $('#commentDlg', root),
    authorInput = $('#commentAuthor', root),
    textInput = $('#commentText', root);
  /** @type {Range | null} */
  let target = null;
  const anchors = () => $$(ANCHOR, content);

  function card(/** @type {HTMLElement} */ anchor, /** @type {number} */ index) {
    const quote = anchor.textContent.trim();
    const short = quote.length > QUOTE_LENGTH ? quote.slice(0, QUOTE_LENGTH) + '…' : quote;
    const byline = [anchor.dataset.author || 'Unknown', when(anchor.dataset.date)].filter(Boolean).join(' · ');
    return `<article class="comment-card" data-act="review.goto" data-arg="${index}">
      <header>${esc(byline)}</header><blockquote>${esc(short)}</blockquote><p>${esc(anchor.title)}</p>
      <button class="btn sm" data-act="review.resolve" data-arg="${index}">Resolve</button></article>`;
  }

  function render() {
    if (panel.hidden) return;
    list.innerHTML =
      anchors().map(card).join('') || '<p class="comment-empty">Select text and choose Review → Add comment.</p>';
  }

  function showPanel(/** @type {boolean} */ show) {
    panel.hidden = !show;
    prefs.set(PANEL_PREF, show);
    render();
    events.emit('layout'); // the page has more or less room
  }

  commands.register({
    'review.comment'() {
      selection.restore();
      const s = selection.current();
      if (!s || s.isCollapsed) return toast('Select the text to comment on first.');
      if (selectedBlocks(ctx).length > 1) return toast('Select text within one paragraph to comment on it.');
      target = s.getRangeAt(0).cloneRange();
      authorInput.value = prefs.get(AUTHOR_PREF, '');
      textInput.value = '';
      dialog.returnValue = '';
      dialog.showModal();
      (authorInput.value ? textInput : authorInput).focus();
    },
    'review.comments': () => showPanel(panel.hidden),
    'review.goto'(index) {
      const anchor = anchors()[Number(index)];
      if (!anchor) return;
      anchor.scrollIntoView({ block: 'center', behavior: 'smooth' });
      selection.selectNode(anchor);
    },
    /** Removes the comment and keeps the text it was attached to. */
    'review.resolve'(index) {
      const anchor = anchors()[Number(index)];
      if (!anchor) return;
      anchor.replaceWith(...anchor.childNodes);
      ctx.changed();
    },
  });

  dialog.addEventListener('close', () => {
    const text = textInput.value.trim();
    if (dialog.returnValue === 'ok' && text && target) {
      const author = authorInput.value.trim() || 'Anonymous';
      prefs.set(AUTHOR_PREF, author);
      const anchor = doc.createElement('span');
      anchor.className = 'comment';
      anchor.title = text;
      anchor.dataset.author = author;
      anchor.dataset.date = new Date().toISOString();
      anchor.append(target.extractContents());
      target.insertNode(anchor);
      ctx.changed();
      if (panel.hidden) showPanel(true);
    }
    content.focus();
  });

  panel.hidden = !prefs.get(PANEL_PREF, false);
  events.on('change', render);
  events.on('open', render);
}
