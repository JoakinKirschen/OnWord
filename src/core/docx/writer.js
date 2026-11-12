/** Converts document content (a DOM subtree) to a .docx file. */

import { PX_PER_INCH, pageGeometry } from '../page.js';
import { writeZip } from '../zip.js';
import { inlineRuns, textRun } from './inline.js';
import {
  BULLET_NUM_ID,
  CONTENT_TYPES,
  DOCUMENT_NAMESPACES,
  documentRels,
  numbering,
  ROOT_RELS,
  STYLE,
  STYLES,
  XML_HEADER,
} from './parts.js';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const TWIPS_PER_PX = 1440 / PX_PER_INCH;
const SINGLE_LINE = 240; // w:spacing line units for line-height 1
const BLOCKS = /^(P|DIV|H[1-6]|BLOCKQUOTE|PRE|UL|OL|TABLE|HR)$/;
const ALIGN = { left: 'left', center: 'center', right: 'right', justify: 'both' };
const BORDER =
  '<w:top w:val="single" w:sz="4" w:color="9A9EAC"/><w:left w:val="single" w:sz="4" w:color="9A9EAC"/><w:bottom w:val="single" w:sz="4" w:color="9A9EAC"/><w:right w:val="single" w:sz="4" w:color="9A9EAC"/><w:insideH w:val="single" w:sz="4" w:color="9A9EAC"/><w:insideV w:val="single" w:sz="4" w:color="9A9EAC"/>';
const RULE =
  '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="B9BCC8"/></w:pBdr></w:pPr></w:p>';
const PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
const CHECKBOX = { open: '☐ ', done: '☑ ' };

const isBlock = (/** @type {Node} */ node) => node.nodeType === 1 && BLOCKS.test(/** @type {Element} */ (node).tagName);
const headingStyle = (/** @type {string} */ tag) => STYLE[tag.toLowerCase()] || STYLE.h4; // H5/H6 fall back to the smallest

/** Text of a <pre>, with <br> as a line break (`textContent` drops them). */
function preformattedText(/** @type {Node} */ node) {
  if (node.nodeType === 3) return node.nodeValue;
  if (node.nodeName === 'BR') return '\n';
  return [...node.childNodes].map(preformattedText).join('');
}

/**
 * @typedef {{ pkg: import('./inline.js').Package, nextNumId: () => number, contentWidth: number }} State
 * @typedef {{ style?: string, numbering?: string, indent?: number }} ParagraphOptions
 */

/** Paragraph properties from options and the element's own alignment / line spacing. */
function paragraphProperties(/** @type {HTMLElement | null} */ el, /** @type {ParagraphOptions} */ options) {
  const lineHeight = Number(el?.style.lineHeight);
  const parts = [
    options.style && `<w:pStyle w:val="${options.style}"/>`,
    options.numbering,
    lineHeight && `<w:spacing w:line="${Math.round(lineHeight * SINGLE_LINE)}" w:lineRule="auto"/>`,
    options.indent && `<w:ind w:left="${options.indent}"/>`,
    ALIGN[el?.style.textAlign] && `<w:jc w:val="${ALIGN[el.style.textAlign]}"/>`,
  ].filter(Boolean);
  return parts.length ? `<w:pPr>${parts.join('')}</w:pPr>` : '';
}

const paragraph = (
  /** @type {string} */ runs,
  /** @type {HTMLElement | null} */ el = null,
  /** @type {ParagraphOptions} */ options = {},
) => `<w:p>${paragraphProperties(el, options)}${runs}</w:p>`;

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
      out.push(paragraph(box + runs, item, { indent: 360 * (level + 1) }));
    } else {
      const numPr = `<w:numPr><w:ilvl w:val="${Math.min(level, 8)}"/><w:numId w:val="${numId}"/></w:numPr>`;
      out.push(paragraph(runs, item, { numbering: numPr }));
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
  if (tagName === 'PRE') return paragraph(textRun(preformattedText(el), { preserve: true }), el, { style: STYLE.code });
  if (/^H[1-6]$/.test(tagName)) return paragraph(inlineRuns(el, {}, state.pkg), el, { style: headingStyle(tagName) });
  if ([...el.childNodes].some(isBlock)) return blocks(el, state, options); // a wrapper <div>
  return paragraph(inlineRuns(el, {}, state.pkg), el, options);
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
    if (loose) out.push(paragraph(loose, null, options));
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

function sectionProperties(/** @type {import('../page.js').PageGeometry} */ page) {
  const twips = (/** @type {number} */ px) => Math.round(px * TWIPS_PER_PX);
  const orient = page.orientation === 'landscape' ? ' w:orient="landscape"' : '';
  const m = twips(page.margin);
  return `<w:sectPr><w:pgSz w:w="${twips(page.width)}" w:h="${twips(page.height)}"${orient}/><w:pgMar w:top="${m}" w:right="${m}" w:bottom="${m}" w:left="${m}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
}

/**
 * @param {Element} content the document body element
 * @param {{ page?: Partial<import('../page.js').PageSetup> }} [options]
 * @returns {Promise<Uint8Array>} the .docx file
 */
export async function writeDocx(content, { page } = {}) {
  const geometry = pageGeometry(page);
  const contentWidth = geometry.width - 2 * geometry.margin;
  /** @type {{ id: string, type: 'hyperlink' | 'image', target: string }[]} */
  const rels = [];
  /** @type {{ name: string, data: Uint8Array }[]} */
  const media = [];
  const orderedNumIds = [];
  const relId = () => `rId${rels.length + 1}`;
  /** @type {State} */
  const state = {
    contentWidth,
    nextNumId: () => orderedNumIds[orderedNumIds.push(BULLET_NUM_ID + 1 + orderedNumIds.length) - 1],
    pkg: {
      maxImageWidth: contentWidth,
      addLink(url) {
        const id = relId();
        rels.push({ id, type: 'hyperlink', target: url });
        return id;
      },
      addImage(bytes, extension) {
        const id = relId();
        const name = `media/image${media.length + 1}.${extension}`;
        rels.push({ id, type: 'image', target: name });
        media.push({ name: 'word/' + name, data: bytes });
        return id;
      },
    },
  };
  const body = blocks(content, state) || '<w:p/>';
  const document = `${XML_HEADER}<w:document ${DOCUMENT_NAMESPACES}><w:body>${body}${sectionProperties(geometry)}</w:body></w:document>`;
  return writeZip([
    { name: '[Content_Types].xml', data: CONTENT_TYPES },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'word/document.xml', data: document },
    { name: 'word/_rels/document.xml.rels', data: documentRels(rels) },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/numbering.xml', data: numbering(orderedNumIds) },
    ...media,
  ]);
}
