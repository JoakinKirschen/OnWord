import { $$ } from './dom.js';

export const EMPTY_DOC = '<p><br></p>';

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const textToHtml = (text) =>
  text.replace(/\r\n?/g, '\n').split('\n').map((line) => `<p>${esc(line) || '<br>'}</p>`).join('') || EMPTY_DOC;

const REMOVED_TAGS = 'script,style,iframe,frame,object,embed,link,meta,title,base,form,input,button,textarea,select,noscript,svg,math,template,audio,video';
const URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction', 'background'];
const SAFE_URL = /^(https?:|mailto:|tel:|#|data:image\/(png|jpe?g|gif|webp);)/i;

/** Strip anything executable or app-specific from foreign HTML (paste, import). */
export function sanitize(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  $$(REMOVED_TAGS, doc).forEach((el) => el.remove());
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
  const comments = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => c.remove());
  for (const el of $$('*', doc.body)) {
    for (const { name, value } of [...el.attributes]) {
      const n = name.toLowerCase();
      const unsafe = n.startsWith('on') || n === 'id' || n.startsWith('data-') || n === 'srcset' || n === 'contenteditable' ||
        (n === 'class' && value !== 'page-break') ||
        (URL_ATTRS.includes(n) && !SAFE_URL.test(value.trim())) ||
        (n === 'style' && /url\s*\(|expression|position\s*:/i.test(value));
      if (unsafe) el.removeAttribute(name);
    }
  }
  return doc.body.innerHTML;
}
