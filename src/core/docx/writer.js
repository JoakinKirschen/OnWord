/** Converts document content (a DOM subtree) to a .docx file. */

import { PX_PER_INCH, normalizePage, pageGeometry } from '../page.js';
import { writeZip } from '../zip.js';
import { inlineRuns, textRun } from './inline.js';
import { commentsXml, footnotesXml, tocXml } from './notes.js';
import { paragraphXml } from './paragraph.js';
import {
  BULLET_NUM_ID,
  contentTypes,
  DOCUMENT_NAMESPACES,
  documentRels,
  numbering,
  partFile,
  ROOT_RELS,
  STYLE,
  STYLES,
  XML_HEADER,
} from './parts.js';
import { runningXml, sectionXml } from './section.js';
import { tableXml } from './tables.js';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const TWIPS_PER_PX = 1440 / PX_PER_INCH;
const BLOCKS = /^(P|DIV|H[1-6]|BLOCKQUOTE|PRE|UL|OL|TABLE|HR)$/;
const RULE =
  '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="B9BCC8"/></w:pBdr></w:pPr></w:p>';
const PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
const CHECKBOX = { open: '☐ ', done: '☑ ' };

const isBlock = (/** @type {Node} */ node) => node.nodeType === 1 && BLOCKS.test(/** @type {Element} */ (node).tagName);
const headingStyle = (/** @type {string} */ tag) => STYLE[tag.toLowerCase()] || STYLE.h5; // H6 falls back to the smallest

/** Text of a <pre>, with <br> as a line break (`textContent` drops them). */
function preformattedText(/** @type {Node} */ node) {
  if (node.nodeType === 3) return node.nodeValue;
  if (node.nodeName === 'BR') return '\n';
  return [...node.childNodes].map(preformattedText).join('');
}

/**
 * @typedef {{ pkg: import('./inline.js').Package, nextNumId: () => number, contentWidth: number }} State
 * @typedef {import('./paragraph.js').ParagraphOptions} ParagraphOptions
 */

/** Paragraphs for a list. Nested lists may sit inside an item or (as Chrome writes them) beside it. */
function list(
  /** @type {Element} */ el,
  /** @type {number} */ level,
  /** @type {number} */ numId,
  /** @type {State} */ state,
) {
  const out = [];
  const nested = (/** @type {Element} */ child) =>
    list(child, level + 1, child.tagName === 'OL' ? state.nextNumId() : BULLET_NUM_ID, state);
  for (const child of el.children) {
    if (/^(UL|OL)$/.test(child.tagName)) {
      out.push(nested(child));
      continue;
    }
    const item = /** @type {HTMLElement} */ (child);
    const runs = inlineRuns(item, {}, state.pkg);
    if (el.classList.contains('checklist')) {
      const box = textRun(item.classList.contains('checked') ? CHECKBOX.done : CHECKBOX.open);
      out.push(paragraphXml(box + runs, item, { indent: 360 * (level + 1) }));
    } else {
      const numPr = `<w:numPr><w:ilvl w:val="${Math.min(level, 8)}"/><w:numId w:val="${numId}"/></w:numPr>`;
      out.push(paragraphXml(runs, item, { numbering: numPr }));
    }
    for (const sub of item.querySelectorAll(':scope > ul, :scope > ol')) out.push(nested(sub));
  }
  return out.join('');
}

function block(/** @type {HTMLElement} */ el, /** @type {State} */ state, /** @type {ParagraphOptions} */ options) {
  const { tagName } = el;
  if (el.matches('ol.footnotes')) return ''; // written to their own part
  if (el.matches('div.toc')) return tocXml(el, Math.round(state.contentWidth * TWIPS_PER_PX));
  if (tagName === 'UL') return list(el, 0, BULLET_NUM_ID, state);
  if (tagName === 'OL') return list(el, 0, state.nextNumId(), state);
  if (tagName === 'TABLE')
    return tableXml(/** @type {HTMLTableElement} */ (el), state.contentWidth * TWIPS_PER_PX, (cell) =>
      blocks(cell, state),
    );
  if (tagName === 'HR') return el.classList.contains('page-break') ? PAGE_BREAK : RULE;
  if (tagName === 'BLOCKQUOTE') return blocks(el, state, { style: STYLE.quote });
  if (tagName === 'PRE')
    return paragraphXml(textRun(preformattedText(el), { preserve: true }), el, { style: STYLE.code });
  if (/^H[1-6]$/.test(tagName))
    return paragraphXml(inlineRuns(el, {}, state.pkg), el, { style: headingStyle(tagName) });
  if ([...el.childNodes].some(isBlock)) return blocks(el, state, options); // a wrapper <div>
  const style = el.classList.contains('subtitle') ? { ...options, style: STYLE.subtitle } : options;
  return paragraphXml(inlineRuns(el, {}, state.pkg), el, style);
}

/** Body XML for a container's children; consecutive inline nodes share one paragraph. */
function blocks(
  /** @type {Element} */ container,
  /** @type {State} */ state,
  /** @type {ParagraphOptions} */ options = {},
) {
  const out = [];
  let loose = '';
  const flush = () => {
    if (loose) out.push(paragraphXml(loose, null, options));
    loose = '';
  };
  for (const node of container.childNodes) {
    if (node.nodeType === 3 && !loose && !node.nodeValue.trim()) continue; // whitespace between blocks
    if (isBlock(node)) {
      flush();
      out.push(block(/** @type {HTMLElement} */ (node), state, options));
    } else loose += inlineRuns(node, {}, state.pkg);
  }
  flush();
  return out.join('');
}

/**
 * @param {Element} content the document body element
 * @param {{ page?: Partial<import('../page.js').PageSetup> }} [options]
 * @returns {Promise<Uint8Array>} the .docx file
 */
export async function writeDocx(content, { page } = {}) {
  const setup = normalizePage(page);
  const geometry = pageGeometry(setup);
  const contentWidth = geometry.width - 2 * geometry.margin;
  /** @type {import('./parts.js').Relationship[]} */
  const rels = [];
  /** @type {{ name: string, data: Uint8Array | string }[]} */
  const extraParts = [];
  const orderedNumIds = [];
  /** Registers a relationship from the document to `target` and returns its id. */
  const relate = (/** @type {import('./parts.js').Relationship['type']} */ type, /** @type {string} */ target) => {
    const id = `rId${rels.length + 1}`;
    rels.push({ id, type, target });
    return id;
  };
  // Footnotes live in a list at the end of the document; a reference finds its note by id.
  const notes = [...content.querySelectorAll('ol.footnotes > li')];
  const noteNumbers = new Map(notes.map((note, i) => [note.id.replace('fn-', 'fnref-'), i + 1]));
  /** @type {{ text: string, authorship: string }[]} */
  const comments = [];
  let changes = 0;
  /** @type {State} */
  const state = {
    contentWidth,
    nextNumId: () => orderedNumIds[orderedNumIds.push(BULLET_NUM_ID + 1 + orderedNumIds.length) - 1],
    pkg: {
      maxImageWidth: contentWidth,
      addLink: (url) => relate('hyperlink', url),
      addImage(bytes, extension) {
        const name = `media/image${extraParts.length + 1}.${extension}`;
        extraParts.push({ name: 'word/' + name, data: bytes });
        return relate('image', name);
      },
      footnote: (referenceId) => noteNumbers.get(referenceId),
      addComment: (text, authorship) => comments.push({ text, authorship }) - 1,
      nextId: () => ++changes,
    },
  };
  const body = blocks(content, state) || '<w:p/>';

  /** @type {import('./parts.js').OptionalPart[]} */
  const optional = [];
  const addPart = (/** @type {import('./parts.js').OptionalPart} */ kind, /** @type {string} */ xml) => {
    optional.push(kind);
    extraParts.push({ name: 'word/' + partFile(kind), data: xml });
    return relate(kind, partFile(kind));
  };
  /** @type {{ header?: string, footer?: string }} */
  const refs = {};
  for (const kind of /** @type {const} */ (['header', 'footer'])) {
    if (setup[kind].text) refs[kind] = addPart(kind, runningXml(kind, setup[kind]));
  }
  if (notes.length) addPart('footnotes', footnotesXml(notes.map((note) => inlineRuns(note, {}, state.pkg))));
  if (comments.length) addPart('comments', commentsXml(comments));

  const document = `${XML_HEADER}<w:document ${DOCUMENT_NAMESPACES}><w:body>${body}${sectionXml(setup, refs)}</w:body></w:document>`;
  return writeZip([
    { name: '[Content_Types].xml', data: contentTypes(optional) },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'word/document.xml', data: document },
    { name: 'word/_rels/document.xml.rels', data: documentRels(rels) },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/numbering.xml', data: numbering(orderedNumIds) },
    ...extraParts,
  ]);
}
