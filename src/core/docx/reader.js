/** Converts a .docx file to editor HTML. */

import { sanitize } from '../html.js';
import { readZip } from '../zip.js';
import { STYLE } from './parts.js';
import { paragraphStyleAttr } from './paragraph.js';
import { inlineHtml } from './runs.js';
import { readSection } from './section.js';
import { all, attr, isOn, kid, kids, parseXml, val } from './xml.js';

const MAX_HEADING = 5;
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
    html() {
      closeLists();
      closeChecklist();
      return out.join('');
    },
  };
}

function paragraph(
  /** @type {Element} */ p,
  /** @type {Context} */ ctx,
  /** @type {ReturnType<typeof createOutput>} */ out,
) {
  const pPr = kid(p, 'pPr');
  const flags = { pageBreak: isOn(pPr, 'pageBreakBefore') };
  const inner = inlineHtml(p, ctx, flags);
  const tag = ctx.styles.get(val(pPr, 'pStyle')) || 'p';
  const numPr = kid(pPr, 'numPr');
  const numId = val(numPr, 'numId');
  if (numId && numId !== '0') {
    const level = Number(val(numPr, 'ilvl')) || 0;
    out.listItem(ctx.ordered(numId, level) ? 'ol' : 'ul', level, inner);
  } else if (LIST_TAGS.includes(tag)) {
    out.listItem(tag, 0, inner);
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

function table(/** @type {Element} */ tbl, /** @type {Context} */ ctx) {
  const rows = kids(tbl, 'tr').map((tr) => {
    const cells = kids(tr, 'tc').map((tc) => {
      const span = Number(val(kid(tc, 'tcPr'), 'gridSpan'));
      const html = blocks(tc, ctx).replace(/^<p>([^]*)<\/p>$/, (whole, inner) =>
        inner.includes('<p') ? whole : inner,
      );
      return `<td${span > 1 ? ` colspan="${span}"` : ''}>${html || '<br>'}</td>`;
    });
    return `<tr>${cells.join('')}</tr>`;
  });
  return `<table style="width: 100%;"><tbody>${rows.join('')}</tbody></table>`;
}

/** HTML for the block-level children of a body, table cell or content control. */
function blocks(/** @type {Element} */ container, /** @type {Context} */ ctx) {
  const out = createOutput();
  for (const child of container.children) {
    if (child.localName === 'p') paragraph(child, ctx, out);
    else if (child.localName === 'tbl') out.block(table(child, ctx));
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
  /** @type {Context} */
  const ctx = {
    files,
    ...relationships,
    styles: readStyles(parseXml(files.get('word/styles.xml'))),
    ordered: readNumbering(parseXml(files.get('word/numbering.xml'))),
  };
  return { html: sanitize(blocks(body, ctx)), page: readSection(body, { files, parts: relationships.parts }) };
}
