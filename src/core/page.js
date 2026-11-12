/** Page geometry: the paper sizes and margins a document can use, in CSS pixels (96 per inch). */

export const PX_PER_INCH = 96;
/** id → { label, css (CSS page-size name), width, height } in portrait. */
export const PAGE_SIZES = {
  letter: { label: 'Letter (8.5 × 11 in)', css: 'letter', width: 816, height: 1056 },
  a4: { label: 'A4 (210 × 297 mm)', css: 'A4', width: 794, height: 1123 },
  legal: { label: 'Legal (8.5 × 14 in)', css: 'legal', width: 816, height: 1344 },
};
/** id → { label, px }. */
export const PAGE_MARGINS = {
  normal: { label: 'Normal (1 in)', px: 96 },
  moderate: { label: 'Moderate (0.75 in)', px: 72 },
  narrow: { label: 'Narrow (0.5 in)', px: 48 },
  wide: { label: 'Wide (1.5 in)', px: 144 },
};
const DEFAULTS = { size: 'letter', orientation: 'portrait', margin: 'normal' };
const ALIGNMENTS = ['left', 'center', 'right'];
const MAX_COLUMNS = 3;
const MAX_RUNNING_TEXT = 200;
/** Placeholders in header/footer text for the current page number and the page count. */
export const PAGE_TOKEN = '{page}';
export const PAGES_TOKEN = '{pages}';

/**
 * @typedef {{ text: string, align: string }} RunningText a header or footer: one line of text
 * @typedef {{ size: string, orientation: string, margin: string, columns: number, header: RunningText, footer: RunningText }} PageSetup
 * @typedef {{ width: number, height: number, margin: number, bodyHeight: number, css: string, orientation: string, columns: number }} PageGeometry
 */

/** @param {Partial<RunningText>} [value] @returns {RunningText} */
const normalizeRunning = (value) => ({
  text: String(value?.text ?? '').slice(0, MAX_RUNNING_TEXT),
  align: ALIGNMENTS.includes(value?.align) ? value.align : 'center',
});

/**
 * Fills in defaults and drops unknown values (metadata may come from an older version or a file).
 * @param {Partial<PageSetup>} [page]
 * @returns {PageSetup}
 */
export function normalizePage(page = {}) {
  return {
    size: page.size in PAGE_SIZES ? page.size : DEFAULTS.size,
    orientation: page.orientation === 'landscape' ? 'landscape' : DEFAULTS.orientation,
    margin: page.margin in PAGE_MARGINS ? page.margin : DEFAULTS.margin,
    columns: Math.min(MAX_COLUMNS, Math.max(1, Math.round(Number(page.columns)) || 1)),
    header: normalizeRunning(page.header),
    footer: normalizeRunning(page.footer),
  };
}

/**
 * Pixel dimensions for a page setup, with width/height swapped for landscape.
 * @param {Partial<PageSetup>} [page]
 * @returns {PageGeometry}
 */
export function pageGeometry(page) {
  const { size, orientation, margin, columns } = normalizePage(page);
  const { width, height, css } = PAGE_SIZES[size];
  const landscape = orientation === 'landscape';
  const px = PAGE_MARGINS[margin].px;
  const pageHeight = landscape ? width : height;
  return {
    width: landscape ? height : width,
    height: pageHeight,
    margin: px,
    bodyHeight: pageHeight - 2 * px,
    css,
    orientation,
    columns,
  };
}

const nearest = (/** @type {[string, number][]} */ candidates, /** @type {number} */ value) =>
  candidates.reduce((best, item) => (Math.abs(item[1] - value) < Math.abs(best[1] - value) ? item : best))[0];

/**
 * The supported paper size, orientation and margin closest to arbitrary dimensions (used when importing).
 * @param {{ width: number, height: number, margin: number }} px
 * @returns {Pick<PageSetup, 'size' | 'orientation' | 'margin'>}
 */
export function matchPage({ width, height, margin }) {
  const sizes = /** @type {[string, number][]} */ (Object.entries(PAGE_SIZES).map(([id, s]) => [id, s.height]));
  const margins = /** @type {[string, number][]} */ (Object.entries(PAGE_MARGINS).map(([id, m]) => [id, m.px]));
  return {
    size: nearest(sizes, Math.max(width, height)),
    orientation: width > height ? 'landscape' : 'portrait',
    margin: nearest(margins, margin),
  };
}
