/** Converts a .docx file to editor HTML. */

import { sanitize } from '../html.js';
import { readZip } from '../zip.js';
import { STYLE } from './parts.js';
import { readComments, readFootnotes } from './notes.js';
import { paragraphStyleAttr } from './paragraph.js';
import { inlineHtml, noteId } from './runs.js';
import { readSection } from './section.js';
import { tableHtml } from './tables.js';
import { all, attr, isOn, kid, kids, parseXml, val } from './xml.js';

const MAX_HEADING = 5;
const TOC = 'toc'; // a styles-map value for the entries of a table of contents
const TOC_HTML = '<div class="toc"></div>'; // the editor fills it in from the headings
const SUBTITLE = 'p.subtitle'; // a styles-map value: tag plus class
const LIST_TAGS = ['ul', 'ol'];
const CHECKBOX = /^([☐☑])\s?/;

/**
 * @typedef {import('./runs.js').Package & { styles: Map<string, string>, ordered: (numId: string, level: number) => boolean }} Context
 * `styles` maps a paragraph style id to the HTML tag it becomes.
 */

/** The tag a paragraph style stands for, judged by its (language-independent) id and its name. */
function tagForStyle(/** @type {string} */ id, /** @type {string} */ name) {
  const key = `${id} ${name}`.toLowerCase();
  if (/\btoc\s*\d/.test(key)) return TOC;
  const heading = key.match(/heading\s*(\d)/);
  if (heading) return 'h' + Math.min(Number(heading[1]) + 1, MAX_HEADING); // the app's "Heading 1" is <h2>
  if (/subtitle/.test(key)) return SUBTITLE;
  if (/\btitle\b/.test(key)) return 'h1';
  if (/quote|block\s*text/.test(key)) return 'blockquote';
  if (/list\s*bullet/.test(key)) return 'ul'; // list styles carry their numbering in the style itself
  if (/list\s*number/.test(key)) return 'ol';
  if (/code|preformatted|source/.test(key)) return 'pre';
  return 'p';
}

function readStyles(/** @type {Document | null} */ doc) {
  const styles = new Map(Object.entries(STYLE).map(([, id]) => [id, tagForStyle(id, '')]));
  for (const style of all(doc, 'style')) {
    const id = attr(style, 'styleId');
    if (id && attr(style, 'type') === 'paragraph') styles.set(id, tagForStyle(id, val(style, 'name') || ''));
  }
  return styles;
}

/** Returns a function telling whether a numbering instance's level is ordered (numbers) or bulleted. */
function readNumbering(/** @type {Document | null} */ doc) {
  const formats = new Map();
  for (const abstract of all(doc, 'abstractNum')) {
    const levels = new Map();
    for (const lvl of kids(abstract, 'lvl')) levels.set(attr(lvl, 'ilvl'), val(lvl, 'numFmt'));
    formats.set(attr(abstract, 'abstractNumId'), levels);
  }
  const nums = new Map(all(doc, 'num').map((num) => [attr(num, 'numId'), val(num, 'abstractNumId')]));
  return (/** @type {string} */ numId, /** @type {number} */ level) =>
    (formats.get(nums.get(numId))?.get(String(level)) ?? 'bullet') !== 'bullet';
}

function readRelationships(/** @type {Document | null} */ doc) {
  const links = new Map();
  const images = new Map();
  const parts = new Map(); // headers and footers
  for (const rel of all(doc, 'Relationship')) {
    const id = rel.getAttribute('Id');
    const type = rel.getAttribute('Type')?.split('/').pop();
    const target = rel.getAttribute('Target') || '';
    const path = target.startsWith('/') ? target.slice(1) : 'word/' + target;
    if (type === 'hyperlink') links.set(id, target);
    else if (type === 'image') images.set(id, path);
    else if (type === 'header' || type === 'footer') parts.set(id, path);
  }
  return { links, images, parts };
}

/** Collects output while tracking which lists are open, so consecutive list paragraphs nest correctly. */
function createOutput() {
  const out = [];
  const open = []; // tags of the lists currently open, outermost first
  let checklist = false;
  const closeLists = (depth = 0) => {
    while (open.length > depth) out.push(`</li></${open.pop()}>`);
  };
  const closeChecklist = () => {
    if (checklist) out.push('</ul>');
    checklist = false;
  };
  return {
    block(/** @type {string} */ html) {
      closeLists();
      closeChecklist();
      out.push(html);
    },
    checkItem(/** @type {boolean} */ checked, /** @type {string} */ html) {
      closeLists();
      if (!checklist) out.push('<ul class="checklist">');
      checklist = true;
      out.push(`<li${checked ? ' class="checked"' : ''}>${html || '<br>'}</li>`);
    },
    listItem(/** @type {string} */ tag, /** @type {number} */ level, /** @type {string} */ html) {
      closeChecklist();
      closeLists(level + 1);
      if (open.length === level + 1 && open[level] !== tag) closeLists(level);
      else if (open.length === level + 1) out.push('</li>');
      while (open.length < level + 1) {
        out.push(`<${tag}>`);
        open.push(tag);
        if (open.length < level + 1) out.push('<li>'); // a skipped level still needs an item to hold the next list
      }
      out.push('<li>' + html);
    },
    /** A run of table-of-contents entries becomes one (empty) table of contents. */
    toc() {
      if (out[out.length - 1] !== TOC_HTML) this.block(TOC_HTML);
    },
    html() {
      closeLists();
      closeChecklist();
      return out.join('');
    },
  };
}

/** The list a paragraph belongs to, from its own numbering or from a list style; null for ordinary text. */
function listPlacement(/** @type {Element | undefined} */ pPr, /** @type {string} */ tag, /** @type {Context} */ ctx) {
  const numPr = kid(pPr, 'numPr');
  const numId = val(numPr, 'numId');
  if (numId && numId !== '0') {
    const level = Number(val(numPr, 'ilvl')) || 0;
    return { tag: ctx.ordered(numId, level) ? 'ol' : 'ul', level };
  }
  return LIST_TAGS.includes(tag) ? { tag, level: 0 } : null;
}

function paragraph(
  /** @type {Element} */ p,
  /** @type {Context} */ ctx,
  /** @type {ReturnType<typeof createOutput>} */ out,
) {
  const pPr = kid(p, 'pPr');
  const tag = ctx.styles.get(val(pPr, 'pStyle')) || 'p';
  if (tag === TOC) return out.toc();
  const flags = { pageBreak: isOn(pPr, 'pageBreakBefore') };
  const inner = inlineHtml(p, ctx, flags);
  const list = listPlacement(pPr, tag, ctx);
  if (list) {
    out.listItem(list.tag, list.level, inner);
  } else if (CHECKBOX.test(inner)) {
    out.checkItem(inner.startsWith('☑'), inner.replace(CHECKBOX, ''));
  } else if (!inner && kid(kid(pPr, 'pBdr'), 'bottom')) {
    out.block('<hr>'); // an empty paragraph with a bottom border is how Word draws a horizontal line
  } else if (inner || !flags.pageBreak) {
    const [name, className] = tag.split('.');
    const attrs = (className ? ` class="${className}"` : '') + paragraphStyleAttr(pPr);
    out.block(`<${name}${attrs}>${inner || '<br>'}</${name}>`);
  }
  if (flags.pageBreak) out.block('<hr class="page-break">');
}

/** HTML for the block-level children of a body, table cell or content control. */
function blocks(/** @type {Element} */ container, /** @type {Context} */ ctx) {
  const out = createOutput();
  for (const child of container.children) {
    if (child.localName === 'p') paragraph(child, ctx, out);
    else if (child.localName === 'tbl') out.block(tableHtml(child, (cell) => blocks(cell, ctx)));
    else if (child.localName === 'sdt')
      out.block(
        kids(child, 'sdtContent')
          .map((c) => blocks(c, ctx))
          .join(''),
      );
  }
  return out.html();
}

/**
 * @param {ArrayBuffer | Uint8Array} source the .docx file
 * @returns {Promise<{ html: string, page?: import('../page.js').PageSetup }>}
 */
export async function readDocx(source) {
  const files = await readZip(source);
  const body = kid(parseXml(files.get('word/document.xml'))?.documentElement, 'body');
  if (!body) throw new Error('Not a Word document');
  const relationships = readRelationships(parseXml(files.get('word/_rels/document.xml.rels')));
  const part = (/** @type {string} */ name) => parseXml(files.get(`word/${name}.xml`));
  /** @type {Context} */
  const ctx = {
    files,
    ...relationships,
    comments: readComments(part('comments')),
    usedNotes: [],
    styles: readStyles(part('styles')),
    ordered: readNumbering(part('numbering')),
  };
  const html = blocks(body, ctx);
  // Footnotes are converted last: only now is it known which ones the text refers to, and in what order.
  const notes = readFootnotes(part('footnotes'));
  const items = ctx.usedNotes.map((id) => {
    const text = (notes.get(id) ?? []).map((p) => inlineHtml(p, ctx, {})).join('<br>');
    return `<li id="fn-${noteId(id)}">${text.trim() || '<br>'}</li>`;
  });
  const footnotes = items.length ? `<ol class="footnotes">${items.join('')}</ol>` : '';
  return { html: sanitize(html + footnotes), page: readSection(body, { files, parts: relationships.parts }) };
}
