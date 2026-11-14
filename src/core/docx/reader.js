/** Converts a .docx file to editor HTML. */

import { sanitize } from '../html.js';
import { readZip } from '../zip.js';
import { readDocStyles } from './docStyles.js';
import { readNumbering } from './numbering.js';
import { readComments, readFootnotes } from './notes.js';
import { readParagraph } from './paragraph.js';
import { inlineHtml, noteId } from './runs.js';
import { readSection } from './section.js';
import { readStyleSheet, TOC } from './styles.js';
import { tableHtml } from './tables.js';
import { all, attr, isOn, kid, kids, parseXml, val } from './xml.js';

const TOC_HTML = '<div class="toc"></div>'; // the editor fills it in from the headings
const LIST_TAGS = ['ul', 'ol'];
const CHECKBOX = /^([☐☑])\s?/;
const NO_BORDER = ['nil', 'none'];

/**
 * @typedef {import('./runs.js').Package & { sheet: import('./styles.js').StyleSheet, textWidth: number,
 *   table?: import('./styles.js').TextChains, numbering: ReturnType<typeof readNumbering> }} Context
 * `table` holds what the table style of the table being read gives its paragraphs; `textWidth` is in twips.
 */

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
  const open = []; // opening tags (with attributes) of the lists currently open, outermost first
  let checklist = false;
  const closeLists = (depth = 0) => {
    while (open.length > depth) out.push(`</li></${open.pop().split(' ')[0]}>`);
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
    listItem(
      /** @type {string} */ tag,
      /** @type {number} */ level,
      /** @type {string} */ html,
      /** @type {string} */ attrs = '',
    ) {
      closeChecklist();
      closeLists(level + 1);
      if (open.length === level + 1 && open[level] !== tag) closeLists(level);
      else if (open.length === level + 1) out.push('</li>');
      while (open.length < level + 1) {
        out.push(`<${tag}>`);
        open.push(tag);
        if (open.length < level + 1) out.push('<li>'); // a skipped level still needs an item to hold the next list
      }
      out.push(`<li${attrs}>${html}`);
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
    const { ordered, type } = ctx.numbering(numId, level);
    const style = type ? ` style="list-style-type: ${type};"` : '';
    return { tag: (ordered ? 'ol' : 'ul') + style, level };
  }
  return LIST_TAGS.includes(tag) ? { tag, level: 0 } : null;
}

const present = (/** @type {(Element | undefined)[]} */ list) => list.filter(Boolean);

/**
 * Whether a paragraph is a checklist item as the writer puts it: an indented paragraph starting with a
 * ballot box. A box in ordinary text, such as a form's ticked options in a table, stays text.
 */
function isCheckItem(/** @type {Element | undefined} */ pPr, /** @type {string} */ inner) {
  return CHECKBOX.test(inner) && Number(attr(kid(pPr, 'ind'), 'left') ?? attr(kid(pPr, 'ind'), 'start')) > 0;
}

/** Whether a paragraph is an empty one with a bottom border: how Word draws a horizontal line. */
function isRule(/** @type {Element | undefined} */ pPr, /** @type {string} */ inner) {
  const border = kid(kid(pPr, 'pBdr'), 'bottom');
  return !inner && !!border && !NO_BORDER.includes(attr(border, 'val') ?? '');
}

/**
 * Every level of formatting a paragraph inherits, its own last. Headings and other blocks with a look
 * of their own in the editor take only what the paragraph sets itself.
 */
function inheritance(/** @type {Element | undefined} */ pPr, /** @type {Context} */ ctx) {
  const id = val(pPr, 'pStyle');
  const style = ctx.sheet.paragraph(id);
  const defaults = ctx.sheet.defaults();
  const fromTable = ctx.table ?? { pPr: [], rPr: [] };
  const text = [...defaults.rPr, ...fromTable.rPr, ...style.rPr];
  // The paragraph mark's size counts for the paragraph's line height in Word, as the element's does in CSS.
  const mark = kid(pPr, 'rPr');
  return {
    pPr: [...defaults.pPr, ...fromTable.pPr, ...style.pPr, ...present([pPr])],
    rPr: [...text, ...present([mark])],
    text,
  };
}

function paragraph(
  /** @type {Element} */ p,
  /** @type {Context} */ ctx,
  /** @type {ReturnType<typeof createOutput>} */ out,
) {
  const pPr = kid(p, 'pPr');
  const tag = ctx.sheet.tag(val(pPr, 'pStyle'));
  if (tag === TOC) return out.toc();
  const list = listPlacement(pPr, tag, ctx);
  const plain = tag === 'p' || !!list;
  const chains = plain ? inheritance(pPr, ctx) : { pPr: present([pPr]), rPr: [], text: undefined };
  const look = readParagraph(chains, list ? 'li' : plain ? 'p' : 'direct');
  /** @type {import('./runs.js').Flags} */
  const flags = { pageBreak: isOn(pPr, 'pageBreakBefore'), text: chains.text, base: look.base };
  const inner = inlineHtml(p, ctx, flags);
  if (list) {
    out.listItem(list.tag, list.level, inner, look.attr);
  } else if (isCheckItem(pPr, inner)) {
    out.checkItem(inner.startsWith('☑'), inner.replace(CHECKBOX, ''));
  } else if (isRule(pPr, inner)) {
    out.block('<hr>');
  } else if (inner || !flags.pageBreak) {
    const [name, className] = tag.split('.');
    const attrs = (className ? ` class="${className}"` : '') + look.attr;
    out.block(`<${name}${attrs}>${inner || '<br>'}</${name}>`);
  }
  if (flags.pageBreak) out.block('<hr class="page-break">');
}

/** A table, its paragraphs reading with what its table style gives them. */
function table(/** @type {Element} */ tbl, /** @type {Context} */ ctx) {
  const style = ctx.sheet.table(val(kid(tbl, 'tblPr'), 'tblStyle'));
  const inner = { ...ctx, table: { pPr: style.pPr, rPr: style.rPr } };
  return tableHtml(tbl, { cellHtml: (cell) => blocks(cell, inner), tblPr: style.tblPr, textWidth: ctx.textWidth });
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

/** Width of the text column in twips: the page less its side margins. */
function textWidth(/** @type {Element} */ body) {
  const section = kid(body, 'sectPr') || all(body, 'sectPr').pop();
  const margins = kid(section, 'pgMar');
  return Number(attr(kid(section, 'pgSz'), 'w')) - Number(attr(margins, 'left')) - Number(attr(margins, 'right')) || 0;
}

/**
 * @param {ArrayBuffer | Uint8Array} source the .docx file
 * @returns {Promise<{ html: string, page?: import('../page.js').PageSetup, styles: import('../docStyles.js').StyleOverrides }>}
 */
export async function readDocx(source) {
  const files = await readZip(source);
  const body = kid(parseXml(files.get('word/document.xml'))?.documentElement, 'body');
  if (!body) throw new Error('Not a Word document');
  const relationships = readRelationships(parseXml(files.get('word/_rels/document.xml.rels')));
  const part = (/** @type {string} */ name) => parseXml(files.get(`word/${name}.xml`));
  const sheet = readStyleSheet(part('styles'));
  /** @type {Context} */
  const ctx = {
    files,
    ...relationships,
    comments: readComments(part('comments')),
    usedNotes: [],
    sheet,
    characterStyle: sheet.character,
    textWidth: textWidth(body),
    numbering: readNumbering(part('numbering')),
  };
  const html = blocks(body, ctx);
  // Footnotes are converted last: only now is it known which ones the text refers to, and in what order.
  const notes = readFootnotes(part('footnotes'));
  const items = ctx.usedNotes.map((id) => {
    const text = (notes.get(id) ?? []).map((p) => inlineHtml(p, ctx, {})).join('<br>');
    return `<li id="fn-${noteId(id)}">${text.trim() || '<br>'}</li>`;
  });
  const footnotes = items.length ? `<ol class="footnotes">${items.join('')}</ol>` : '';
  return {
    html: sanitize(html + footnotes),
    page: readSection(body, { files, parts: relationships.parts }),
    styles: readDocStyles(sheet),
  };
}
