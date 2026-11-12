/** The fixed XML parts of a .docx package: content types, relationships, styles and numbering. */

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
};
export const BULLET_NUM_ID = 1;
const BULLET_ABSTRACT = 0;
const DECIMAL_ABSTRACT = 1;
const LIST_LEVELS = 9;
const INDENT_PER_LEVEL = 720; // twips
const BULLETS = ['•', '◦', '▪'];
const NUMBER_FORMATS = ['decimal', 'lowerLetter', 'lowerRoman'];

/**
 * [Content_Types].xml
 * @param {('header' | 'footer')[]} running which header/footer parts the package contains
 */
export function contentTypes(running) {
  const overrides = running.map((kind) => `<Override PartName="/word/${kind}1.xml" ContentType="${CT}.${kind}+xml"/>`);
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

/** @typedef {{ id: string, type: 'hyperlink' | 'image' | 'header' | 'footer', target: string }} Relationship */

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

const paragraphStyle = (/** @type {{ id: string, name: string, pPr?: string, rPr?: string, next?: string }} */ s) =>
  `<w:style w:type="paragraph" w:styleId="${s.id}"><w:name w:val="${s.name}"/><w:basedOn w:val="Normal"/>` +
  `<w:next w:val="${s.next || 'Normal'}"/><w:qFormat/><w:pPr>${s.pPr || ''}</w:pPr><w:rPr>${s.rPr || ''}</w:rPr></w:style>`;
const heading = (/** @type {number} */ level, /** @type {string} */ spacing, /** @type {string} */ rPr) =>
  paragraphStyle({
    id: `Heading${level}`,
    name: `heading ${level}`,
    pPr: `<w:keepNext/>${spacing}<w:outlineLvl w:val="${level - 1}"/>`,
    rPr,
  });
const size = (/** @type {number} */ pt) => `<w:sz w:val="${pt * 2}"/><w:szCs w:val="${pt * 2}"/>`;

/** word/styles.xml — mirrors styles/document.css. */
export const STYLES = `${XML_HEADER}<w:styles xmlns:w="${WML}">
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/>${size(11)}<w:lang w:val="en-US"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${paragraphStyle({ id: 'Title', name: 'Title', pPr: '<w:keepNext/><w:spacing w:before="360" w:after="160" w:line="288" w:lineRule="auto"/>', rPr: size(24) })}
${heading(1, '<w:spacing w:before="320" w:after="120" w:line="300" w:lineRule="auto"/>', size(18))}
${heading(2, '<w:spacing w:before="280" w:after="80"/>', `<w:b/><w:color w:val="333333"/>${size(14)}`)}
${heading(3, '<w:spacing w:before="240" w:after="80"/>', `<w:b/><w:color w:val="555555"/>${size(12)}`)}
${heading(4, '<w:spacing w:before="200" w:after="80"/>', `<w:b/><w:i/><w:color w:val="555555"/>${size(11)}`)}
${paragraphStyle({ id: 'Subtitle', name: 'Subtitle', pPr: '<w:spacing w:after="240"/>', rPr: `<w:color w:val="666666"/>${size(14)}` })}
${paragraphStyle({ id: 'Quote', name: 'Quote', next: 'Quote', pPr: '<w:pBdr><w:left w:val="single" w:sz="18" w:space="10" w:color="C5C8D4"/></w:pBdr><w:ind w:left="280"/>', rPr: '<w:color w:val="444444"/>' })}
${paragraphStyle({ id: 'Code', name: 'Code', next: 'Code', pPr: '<w:shd w:val="clear" w:color="auto" w:fill="F3F4F7"/><w:spacing w:line="276" w:lineRule="auto"/>', rPr: `<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>${size(10)}` })}
</w:styles>`;

function abstractNum(/** @type {number} */ id, /** @type {(level: number) => string} */ format) {
  const levels = Array.from({ length: LIST_LEVELS }, (_, level) => {
    const left = INDENT_PER_LEVEL * (level + 1);
    return `<w:lvl w:ilvl="${level}"><w:start w:val="1"/>${format(level)}<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${left}" w:hanging="360"/></w:pPr></w:lvl>`;
  });
  return `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${levels.join('')}</w:abstractNum>`;
}

/**
 * word/numbering.xml. Every ordered list gets its own numbering instance so it restarts at 1.
 * @param {number[]} orderedNumIds
 */
export function numbering(orderedNumIds) {
  const bullets = abstractNum(
    BULLET_ABSTRACT,
    (l) => `<w:numFmt w:val="bullet"/><w:lvlText w:val="${BULLETS[l % BULLETS.length]}"/>`,
  );
  const decimals = abstractNum(
    DECIMAL_ABSTRACT,
    (l) => `<w:numFmt w:val="${NUMBER_FORMATS[l % NUMBER_FORMATS.length]}"/><w:lvlText w:val="%${l + 1}."/>`,
  );
  const restart = Array.from(
    { length: LIST_LEVELS },
    (_, l) => `<w:lvlOverride w:ilvl="${l}"><w:startOverride w:val="1"/></w:lvlOverride>`,
  ).join('');
  const ordered = orderedNumIds.map(
    (id) => `<w:num w:numId="${id}"><w:abstractNumId w:val="${DECIMAL_ABSTRACT}"/>${restart}</w:num>`,
  );
  return `${XML_HEADER}<w:numbering xmlns:w="${WML}">${bullets}${decimals}
<w:num w:numId="${BULLET_NUM_ID}"><w:abstractNumId w:val="${BULLET_ABSTRACT}"/></w:num>
${ordered.join('\n')}
</w:numbering>`;
}
