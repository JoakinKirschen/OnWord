/**
 * Document styles: what Normal text, the Title, the Subtitle, Headings 1–4 and quotes look like in one
 * document. A document stores only what it changes (`StyleOverrides`); the editor's own look, in
 * styles/document.css, is the default. Changing a style changes every paragraph that uses it, except
 * where a paragraph has direct formatting of its own.
 */

/** @typedef {'normal' | 'title' | 'subtitle' | 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'quote'} StyleId */
/**
 * @typedef {object} StyleDefinition
 * @property {string} font
 * @property {number} size points
 * @property {string} color `#rrggbb`
 * @property {boolean} bold
 * @property {boolean} italic
 * @property {boolean} underline
 * @property {string} align left, center, right or justify
 * @property {number} before space before, in points
 * @property {number} after space after, in points
 * @property {number} lineHeight a multiple of the font size
 * @typedef {Partial<Record<StyleId, Partial<StyleDefinition>>>} StyleOverrides
 */

/** id → [label, element it applies to]. Order is the order of the Styles dialog. */
export const STYLES = {
  normal: ['Normal text', 'p:not(.subtitle, .toc p)'], // entries of a table of contents have their own look
  title: ['Title', 'h1'],
  subtitle: ['Subtitle', 'p.subtitle'],
  heading1: ['Heading 1', 'h2'],
  heading2: ['Heading 2', 'h3'],
  heading3: ['Heading 3', 'h4'],
  heading4: ['Heading 4', 'h5'],
  quote: ['Quote', 'blockquote'],
};
export const STYLE_IDS = /** @type {StyleId[]} */ (Object.keys(STYLES));
export const ALIGNMENTS = ['left', 'center', 'right', 'justify'];

/** @type {StyleDefinition} mirrors `.doc-content` and `.doc-content p` in styles/document.css */
const NORMAL = {
  font: 'Arial',
  size: 11,
  color: '#000000',
  bold: false,
  italic: false,
  underline: false,
  align: 'left',
  before: 0,
  after: 8,
  lineHeight: 1.5,
};
/** What each other style sets itself in styles/document.css; the rest it takes from Normal text. */
const OWN = {
  title: { size: 24, bold: false, before: 18, after: 8, lineHeight: 1.2 },
  subtitle: { size: 14, color: '#666666', before: 0, after: 12 },
  heading1: { size: 18, bold: false, before: 16, after: 6, lineHeight: 1.25 },
  heading2: { size: 14, bold: true, before: 14, after: 4, color: '#333333' },
  heading3: { size: 12, bold: true, before: 12, after: 4, color: '#555555' },
  heading4: { size: 11, bold: true, italic: true, before: 10, after: 4, color: '#555555' },
  quote: { color: '#444444', before: 0, after: 8 },
};
/** Properties a block takes from the document (CSS inheritance) unless its style sets them. */
const INHERITED = ['font', 'size', 'color', 'bold', 'italic', 'lineHeight'];
/** Normal text's properties that belong to the document as a whole rather than to its paragraphs. */
const DOCUMENT_WIDE = ['font', 'size', 'color', 'bold', 'italic', 'lineHeight'];
const LIMITS = { size: [6, 96], before: [0, 96], after: [0, 96], lineHeight: [0.8, 4] };
const MAX_FONT = 60;

const clamp = (/** @type {number} */ value, /** @type {number[]} */ [min, max]) => Math.min(max, Math.max(min, value));
const round = (/** @type {number} */ value, /** @type {number} */ places) => +value.toFixed(places);

/** A validated value for one property, or undefined when the given one is unusable. */
function cleanValue(/** @type {string} */ key, /** @type {any} */ value) {
  if (key === 'font') {
    const font = String(value ?? '')
      .replace(/[^\w ,.'-]/g, '')
      .trim()
      .slice(0, MAX_FONT);
    return font || undefined;
  }
  if (key === 'color') return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
  if (key === 'align') return ALIGNMENTS.includes(value) ? value : undefined;
  if (typeof NORMAL[key] === 'boolean') return typeof value === 'boolean' ? value : undefined;
  const number = Number(value);
  if (value === '' || value == null || !Number.isFinite(number)) return undefined;
  return round(clamp(number, LIMITS[key]), key === 'lineHeight' ? 2 : 1);
}

/** The full look of every style, given what a document changes. @returns {Record<StyleId, StyleDefinition>} */
export function resolveStyles(/** @type {StyleOverrides | null | undefined} */ overrides) {
  const given = normalizeStyles(overrides);
  const normal = { ...NORMAL, ...given.normal };
  const inherited = Object.fromEntries(INHERITED.map((key) => [key, normal[key]]));
  const out = /** @type {Record<StyleId, StyleDefinition>} */ ({ normal });
  for (const id of STYLE_IDS.slice(1)) {
    out[id] = { ...NORMAL, ...inherited, underline: false, align: 'left', ...OWN[id], ...given[id] };
  }
  return out;
}

/**
 * Keeps only known styles, known properties and valid values (styles may come from a file or an
 * older version), and drops values that equal what the style would have anyway.
 * @param {StyleOverrides | null | undefined} given
 * @returns {StyleOverrides}
 */
export function normalizeStyles(given) {
  /** @type {StyleOverrides} */
  const out = {};
  if (!given || typeof given !== 'object') return out;
  for (const id of STYLE_IDS) {
    const entry = given[id];
    if (!entry || typeof entry !== 'object') continue;
    const clean = Object.fromEntries(
      Object.keys(NORMAL)
        .map((key) => [key, cleanValue(key, entry[key])])
        .filter(([, value]) => value !== undefined),
    );
    if (Object.keys(clean).length) out[id] = clean;
  }
  return out;
}

/**
 * The overrides that make `id` look like `definition`, leaving the other styles as they are.
 * @param {StyleOverrides | null | undefined} overrides
 * @param {StyleId} id
 * @param {Partial<StyleDefinition>} definition
 * @returns {StyleOverrides}
 */
export function setStyle(overrides, id, definition) {
  const base = normalizeStyles({ ...overrides, [id]: undefined });
  const defaults = resolveStyles(base)[id];
  const wanted = normalizeStyles({ [id]: definition })[id] ?? {};
  const changes = Object.fromEntries(Object.entries(wanted).filter(([key, value]) => defaults[key] !== value));
  return Object.keys(changes).length ? { ...base, [id]: changes } : base;
}

/** CSS declarations for some properties of a style definition. */
function declarations(/** @type {Partial<StyleDefinition>} */ style) {
  const css = {
    font: (/** @type {string} */ v) => `font-family:${v.includes(' ') ? `'${v.replace(/'/g, '')}'` : v}`,
    size: (/** @type {number} */ v) => `font-size:${v}pt`,
    color: (/** @type {string} */ v) => `color:${v}`,
    bold: (/** @type {boolean} */ v) => `font-weight:${v ? 700 : 400}`,
    italic: (/** @type {boolean} */ v) => `font-style:${v ? 'italic' : 'normal'}`,
    underline: (/** @type {boolean} */ v) => `text-decoration:${v ? 'underline' : 'none'}`,
    align: (/** @type {string} */ v) => `text-align:${v}`,
    before: (/** @type {number} */ v) => `margin-top:${v}pt`,
    after: (/** @type {number} */ v) => `margin-bottom:${v}pt`,
    lineHeight: (/** @type {number} */ v) => `line-height:${v}`,
  };
  return Object.entries(style)
    .map(([key, value]) => css[key](value))
    .join(';');
}

/**
 * Style sheet for what a document changes, scoped to the element that holds the document. Only changed
 * properties are written, so a document without overrides looks exactly as the default style sheet says.
 * @param {StyleOverrides | null | undefined} overrides
 * @param {string} scope selector of the document's container, e.g. `#editor` or `body`
 */
export function stylesCss(overrides, scope) {
  const given = normalizeStyles(overrides);
  const rules = [];
  const rule = (/** @type {string} */ selector, /** @type {Partial<StyleDefinition>} */ style) => {
    const body = declarations(style);
    if (body) rules.push(`${selector}{${body}}`);
  };
  const split = (/** @type {Partial<StyleDefinition>} */ style, /** @type {boolean} */ wide) =>
    Object.fromEntries(Object.entries(style).filter(([key]) => DOCUMENT_WIDE.includes(key) === wide));
  if (given.normal) {
    rule(scope, split(given.normal, true));
    rule(`${scope} ${STYLES.normal[1]}`, split(given.normal, false));
  }
  for (const id of STYLE_IDS.slice(1)) if (given[id]) rule(`${scope} ${STYLES[id][1]}`, given[id]);
  // The default style sheet removes the space above the first block; a style's own must not bring it back.
  if (rules.some((r) => r.includes('margin-top'))) rules.push(`${scope} > :first-child{margin-top:0}`);
  return rules.join('\n');
}

/** The style a block element uses, or null for one no style applies to (lists, tables…). */
export function styleOf(/** @type {Element} */ block) {
  return STYLE_IDS.find((id) => block.matches(STYLES[id][1])) ?? null;
}
