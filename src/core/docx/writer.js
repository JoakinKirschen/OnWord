/** Converts document content (a DOM subtree) to a .docx file. */

import { PX_PER_INCH, normalizePage, pageGeometry } from '../page.js';
import { writeZip } from '../zip.js';
import { inlineRuns, textRun } from './inline.js';
import { paragraphXml } from './paragraph.js';
import {
  BULLET_NUM_ID,
  contentTypes,
  DOCUMENT_NAMESPACES,
  documentRels,
  numbering,
  ROOT_RELS,
  STYLE,
  STYLES,
  XML_HEADER,
} from './parts.js';
import { runningXml, sectionXml } from './section.js';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const TWIPS_PER_PX = 1440 / PX_PER_INCH;
const BLOCKS = /^(P|DIV|H[1-6]|BLOCKQUOTE|PRE|UL|OL|TABLE|HR)$/;
const BORDER =
  '<w:top w:val="single" w:sz="4" w:color="9A9EAC"/><w:left w:val="single" w:sz="4" w:color="9A9EAC"/><w:bottom w:val="single" w:sz="4" w:color="9A9EAC"/><w:right w:val="single" w:sz="4" w:color="9A9EAC"/><w:insideH w:val="single" w:sz="4" w:color="9A9EAC"/><w:insideV w:val="single" w:sz="4" w:color="9A9EAC"/>';
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

function table(/** @type {HTMLTableElement} */ el, /** @type {State} */ state) {
  const columns = Math.max(1, ...[...el.rows].map((row) => row.cells.length));
  const width = Math.floor((state.contentWidth * TWIPS_PER_PX) / columns);
  const rows = [...el.rows].map((row) => {
    const cells = [...row.cells].map((cell) => {
      const body = blocks(cell, state) || '<w:p/>';
      const end = body.endsWith('</w:tbl>') ? '<w:p/>' : ''; // a cell must end with a paragraph
      return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${body}${end}</w:tc>`;
    });
    return `<w:tr>${cells.join('')}</w:tr>`;
  });
  const grid = `<w:gridCol w:w="${width}"/>`.repeat(columns);
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${BORDER}</w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows.join('')}</w:tbl>`;
}

function block(/** @type {HTMLElement} */ el, /** @type {State} */ state, /** @type {ParagraphOptions} */ options) {
  const { tagName } = el;
  if (tagName === 'UL') return list(el, 0, BULLET_NUM_ID, state);
  if (tagName === 'OL') return list(el, 0, state.nextNumId(), state);
  if (tagName === 'TABLE') return table(/** @type {HTMLTableElement} */ (el), state);
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
    },
  };
  const body = blocks(content, state) || '<w:p/>';

  /** @type {{ header?: string, footer?: string }} */
  const refs = {};
  const running = /** @type {const} */ (['header', 'footer']).filter((kind) => setup[kind].text);
  for (const kind of running) {
    extraParts.push({ name: `word/${kind}1.xml`, data: runningXml(kind, setup[kind]) });
    refs[kind] = relate(kind, `${kind}1.xml`);
  }

  const document = `${XML_HEADER}<w:document ${DOCUMENT_NAMESPACES}><w:body>${body}${sectionXml(setup, refs)}</w:body></w:document>`;
  return writeZip([
    { name: '[Content_Types].xml', data: contentTypes(running) },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'word/document.xml', data: document },
    { name: 'word/_rels/document.xml.rels', data: documentRels(rels) },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/numbering.xml', data: numbering(orderedNumIds) },
    ...extraParts,
  ]);
}
