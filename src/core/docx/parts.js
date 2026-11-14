/** The fixed XML parts of a .docx package: content types and relationships (styles: docStyles.js, lists: numbering.js). */

import { resolveStyles } from '../docStyles.js';
import { esc } from '../html.js';

export const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const WML = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml';

/** Namespace declarations for parts that only use text (headers, footers). */
export const NAMESPACES = `xmlns:w="${WML}" xmlns:r="${REL}"`;

export const DOCUMENT_NAMESPACES =
  `xmlns:w="${WML}" xmlns:r="${REL}" ` +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

const NORMAL = resolveStyles({}).normal;
/** The look of a plain paragraph in styles/document.css; imported paragraphs only state how they differ. */
export const BODY = { font: NORMAL.font, size: NORMAL.size, lineHeight: NORMAL.lineHeight, after: NORMAL.after };
export const SINGLE_LINE = 240; // w:spacing line units for Word's single spacing
// Word's single spacing is the font's own line height (ascent + descent + gap), about 1.15 em for Arial,
// Times New Roman and most text fonts, so Word's multiples are scaled by it to look the same in CSS.
export const SINGLE_LINE_CSS = 1.15;

/** `w:line` for a CSS line-height multiple. */
export const wordLine = (/** @type {number} */ lineHeight) => Math.round((lineHeight / SINGLE_LINE_CSS) * SINGLE_LINE);

/** Paragraph style ids used by the writer, and understood by the reader. */
export const STYLE = {
  h1: 'Title',
  subtitle: 'Subtitle',
  h2: 'Heading1',
  h3: 'Heading2',
  h4: 'Heading3',
  h5: 'Heading4',
  quote: 'Quote',
  code: 'Code',
  footnote: 'FootnoteText',
};
/** Where each optional part lives inside word/. */
const PART_FILES = {
  header: 'header1.xml',
  footer: 'footer1.xml',
  firstHeader: 'header2.xml',
  firstFooter: 'footer2.xml',
  footnotes: 'footnotes.xml',
  comments: 'comments.xml',
};

/** The kind of content a part holds, which names its content type and relationship. */
const PART_TYPES = { firstHeader: 'header', firstFooter: 'footer' };

/** @typedef {'header' | 'footer' | 'firstHeader' | 'firstFooter' | 'footnotes' | 'comments'} OptionalPart */

/** Archive path of an optional part, relative to word/. @param {OptionalPart} kind */
export const partFile = (kind) => PART_FILES[kind];

/** @param {OptionalPart} kind @returns {'header' | 'footer' | 'footnotes' | 'comments'} */
export const partType = (kind) => PART_TYPES[kind] ?? kind;

/**
 * [Content_Types].xml
 * @param {OptionalPart[]} optional the optional parts the package contains
 */
export function contentTypes(optional) {
  const overrides = optional.map(
    (kind) => `<Override PartName="/word/${PART_FILES[kind]}" ContentType="${CT}.${partType(kind)}+xml"/>`,
  );
  return `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Default Extension="jpeg" ContentType="image/jpeg"/>
<Default Extension="gif" ContentType="image/gif"/>
<Override PartName="/word/document.xml" ContentType="${CT}.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="${CT}.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="${CT}.numbering+xml"/>
${overrides.join('\n')}
</Types>`;
}

export const ROOT_RELS = `${XML_HEADER}<Relationships xmlns="${PKG_REL}">
<Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/>
</Relationships>`;

/** @typedef {{ id: string, type: 'hyperlink' | 'image' | ReturnType<typeof partType>, target: string }} Relationship */

/**
 * word/_rels/document.xml.rels
 * @param {Relationship[]} extra links, images, header and footer
 */
export function documentRels(extra) {
  const items = extra.map(({ id, type, target }) => {
    const mode = type === 'hyperlink' ? ' TargetMode="External"' : '';
    return `<Relationship Id="${id}" Type="${REL}/${type}" Target="${esc(target)}"${mode}/>`;
  });
  return `${XML_HEADER}<Relationships xmlns="${PKG_REL}">
<Relationship Id="rIdStyles" Type="${REL}/styles" Target="styles.xml"/>
<Relationship Id="rIdNumbering" Type="${REL}/numbering" Target="numbering.xml"/>
${items.join('\n')}
</Relationships>`;
}
