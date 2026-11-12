import { $, hit } from '../../core/dom.js';
import { esc } from '../../core/html.js';

/** Returns a safe absolute URL, or null when the scheme is not supported. */
function normalizeUrl(input) {
  const url = input.trim();
  if (!url) return null;
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(url)) return 'mailto:' + url;
  if (/^(https?:|mailto:|tel:|#)/i.test(url)) return url;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(url) && !/^[\w.-]+:\d/.test(url); // "host:8080" is not a scheme
  return hasScheme ? null : 'https://' + url;
}

/**
 * Link dialog (insert, edit, remove) and Ctrl/⌘+click to follow links.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initLinks(ctx) {
  const { root, content, selection, commands, toast } = ctx;
  const dialog = $('#linkDlg', root),
    textInput = $('#linkText', root),
    urlInput = $('#linkUrl', root),
    removeBtn = $('#linkRemove', root);
  let range = null; // selection when the dialog opened
  let target = null; // existing <a> being edited, if any

  commands.register({
    'link.edit'() {
      selection.restore();
      const s = selection.current();
      if (!s) return;
      range = s.getRangeAt(0).cloneRange();
      target = selection.closest('a');
      textInput.value = target ? target.textContent : range.toString();
      urlInput.value = target ? target.getAttribute('href') : '';
      removeBtn.hidden = !target;
      dialog.returnValue = '';
      dialog.showModal();
      urlInput.focus();
    },
  });

  function apply() {
    const url = normalizeUrl(urlInput.value);
    if (!url) return toast('That link address isn’t supported.');
    const text = textInput.value || url;
    if (target) {
      target.setAttribute('href', url);
      if (target.textContent !== text) target.textContent = text;
      ctx.changed();
    } else {
      selection.setRange(range);
      if (!range.collapsed && text === range.toString()) ctx.exec('createLink', url);
      else ctx.exec('insertHTML', `<a href="${esc(url)}">${esc(text)}</a>`);
    }
  }

  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'ok') apply();
    else if (dialog.returnValue === 'remove' && target) {
      target.replaceWith(...target.childNodes);
      ctx.changed();
    }
    content.focus();
  });

  content.addEventListener('click', (e) => {
    const a = hit(e, 'a[href]');
    if (a && (e.ctrlKey || e.metaKey)) window.open(a.href, '_blank', 'noopener');
  });
}
