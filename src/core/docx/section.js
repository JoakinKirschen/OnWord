/** Section-level layout in both directions: page size, margins, columns, header and footer. */

import { esc } from '../html.js';
import { PAGES_TOKEN, PAGE_TOKEN, PX_PER_INCH, matchPage, normalizePage, pageGeometry } from '../page.js';
import { NAMESPACES, XML_HEADER } from './parts.js';
import { all, attr, kid, kids, parseXml, val } from './xml.js';

const TWIPS_PER_PX = 1440 / PX_PER_INCH;
const COLUMN_GAP = 720; // twips; matches the 48px gap in styles/page.css
const TOKENS = /(\{page\}|\{pages\})/;
const FIELDS = { [PAGE_TOKEN]: 'PAGE', [PAGES_TOKEN]: 'NUMPAGES' };
const RUN_STYLE = '<w:rPr><w:color w:val="555555"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>';
const ROOT_TAG = { header: 'hdr', footer: 'ftr' };

/** @typedef {import('../page.js').RunningText} RunningText */

/**
 * The XML part for a header or footer: one paragraph, with page fields for the tokens.
 * @param {'header' | 'footer'} kind
 * @param {RunningText} running
 */
export function runningXml(kind, running) {
  const runs = running.text
    .split(TOKENS)
    .filter(Boolean)
    .map((part) =>
      FIELDS[part]
        ? `<w:fldSimple w:instr=" ${FIELDS[part]} "><w:r>${RUN_STYLE}<w:t>1</w:t></w:r></w:fldSimple>`
        : `<w:r>${RUN_STYLE}<w:t xml:space="preserve">${esc(part)}</w:t></w:r>`,
    );
  const tag = ROOT_TAG[kind];
  return `${XML_HEADER}<w:${tag} ${NAMESPACES}><w:p><w:pPr><w:jc w:val="${running.align}"/></w:pPr>${runs.join('')}</w:p></w:${tag}>`;
}

/**
 * The <w:sectPr> closing the body.
 * @param {Partial<import('../page.js').PageSetup>} page
 * @param {{ header?: string, footer?: string }} refs relationship ids of the header/footer parts, if any
 */
export function sectionXml(page, refs) {
  const { width, height, margin, orientation, columns } = pageGeometry(page);
  const twips = (/** @type {number} */ px) => Math.round(px * TWIPS_PER_PX);
  const m = twips(margin);
  return [
    '<w:sectPr>',
    refs.header && `<w:headerReference w:type="default" r:id="${refs.header}"/>`,
    refs.footer && `<w:footerReference w:type="default" r:id="${refs.footer}"/>`,
    `<w:pgSz w:w="${twips(width)}" w:h="${twips(height)}"${orientation === 'landscape' ? ' w:orient="landscape"' : ''}/>`,
    `<w:pgMar w:top="${m}" w:right="${m}" w:bottom="${m}" w:left="${m}" w:header="${Math.round(m / 2)}" w:footer="${Math.round(m / 2)}" w:gutter="0"/>`,
    columns > 1 && `<w:cols w:num="${columns}" w:space="${COLUMN_GAP}"/>`,
    '</w:sectPr>',
  ]
    .filter(Boolean)
    .join('');
}

const fieldToken = (/** @type {string | null} */ instruction) =>
  /\bNUMPAGES\b/.test(instruction ?? '') ? PAGES_TOKEN : /\bPAGE\b/.test(instruction ?? '') ? PAGE_TOKEN : '';

/** Text of a header/footer part, with page fields turned back into tokens. @returns {RunningText | undefined} */
function readRunning(/** @type {Document | null} */ doc) {
  if (!doc) return undefined;
  let text = '';
  let cached = false; // inside the stored result of a complex field, which the token replaces
  for (const node of doc.getElementsByTagName('*')) {
    const name = node.localName;
    if (name === 'fldSimple') text += fieldToken(attr(node, 'instr'));
    else if (name === 'instrText') text += fieldToken(node.textContent);
    else if (name === 'fldChar') cached = attr(node, 'fldCharType') === 'separate';
    else if (name === 'tab') text += ' ';
    else if (name === 't' && !cached && node.parentElement?.parentElement?.localName !== 'fldSimple')
      text += node.textContent;
  }
  const align = val(kid(all(doc, 'p')[0], 'pPr'), 'jc');
  return { text: text.replace(/\s+/g, ' ').trim(), align: align === 'both' || !align ? 'left' : align };
}

/**
 * Page setup described by the body's section properties.
 * @param {Element} body
 * @param {{ files: Map<string, Uint8Array>, parts: Map<string, string> }} pkg `parts`: relationship id → archive path
 * @returns {import('../page.js').PageSetup | undefined}
 */
export function readSection(body, { files, parts }) {
  const section = kid(body, 'sectPr') || all(body, 'sectPr').pop();
  const size = kid(section, 'pgSz');
  if (!size) return undefined;
  const px = (/** @type {string | null} */ twips) => Number(twips) / TWIPS_PER_PX;
  const running = (/** @type {string} */ name) => {
    const ref = kids(section, name).find((el) => (attr(el, 'type') ?? 'default') === 'default');
    return readRunning(parseXml(files.get(parts.get(ref?.getAttribute('r:id')))));
  };
  return normalizePage({
    ...matchPage({
      width: px(attr(size, 'w')),
      height: px(attr(size, 'h')),
      margin: px(attr(kid(section, 'pgMar'), 'left') ?? '1440'),
    }),
    columns: Number(attr(kid(section, 'cols'), 'num')) || 1,
    header: running('headerReference'),
    footer: running('footerReference'),
  });
}
