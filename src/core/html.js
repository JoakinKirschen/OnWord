import { $$ } from './dom.js';

export const EMPTY_DOC = '<p><br></p>';

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const textToHtml = (text) =>
  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => `<p>${esc(line) || '<br>'}</p>`)
    .join('') || EMPTY_DOC;

const REMOVED_TAGS =
  'script,style,iframe,frame,object,embed,link,meta,title,base,form,input,button,textarea,select,noscript,svg,math,template,audio,video';
const URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction', 'background'];
const SAFE_URL = /^(https?:|mailto:|tel:|#|data:image\/(png|jpe?g|gif|webp);)/i;

/** Classes with a meaning in documents; every other class is dropped. */
const ALLOWED_CLASSES = [
  'page-break',
  'checklist',
  'checked',
  'subtitle',
  'comment',
  'fn-ref',
  'footnotes',
  'toc',
  'toc-1',
  'toc-2',
  'toc-3',
  'toc-4',
  'toc-5',
  'toc-page',
  'toc-empty',
];
/** Ids that tie a footnote reference to its note; every other id is dropped. */
const ALLOWED_ID = /^fn(ref)?-[a-z0-9]+$/;
/** Who made a comment or tracked change, and when. */
const ALLOWED_DATA = ['data-author', 'data-date'];

/** Reduces `class` to the allowed names. Returns false when none remain. */
function keepAllowedClasses(/** @type {Element} */ el) {
  const kept = [...el.classList].filter((name) => ALLOWED_CLASSES.includes(name));
  if (kept.length) el.className = kept.join(' ');
  return kept.length > 0;
}

const UNSAFE_STYLE = /url\s*\(|expression|position\s*:/i;
const ALWAYS_REMOVED = ['srcset', 'contenteditable'];

/** Whether an attribute must go. May rewrite `class` in place to its allowed names. */
function isUnwanted(/** @type {Element} */ el, /** @type {string} */ name, /** @type {string} */ value) {
  if (name.startsWith('on') || ALWAYS_REMOVED.includes(name)) return true;
  if (name === 'id') return !ALLOWED_ID.test(value);
  if (name === 'class') return !keepAllowedClasses(el);
  if (name === 'style') return UNSAFE_STYLE.test(value);
  if (name.startsWith('data-')) return !ALLOWED_DATA.includes(name);
  return URL_ATTRS.includes(name) && !SAFE_URL.test(value.trim());
}

/**
 * Strip anything executable or app-specific from foreign HTML (paste, import).
 * @param {string} html
 */
export function sanitize(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  $$(REMOVED_TAGS, doc).forEach((el) => el.remove());
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
  const comments = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => c.remove());
  for (const el of $$('*', doc.body)) {
    for (const { name, value } of [...el.attributes]) {
      if (isUnwanted(el, name.toLowerCase(), value)) el.removeAttribute(name);
    }
  }
  return doc.body.innerHTML;
}
