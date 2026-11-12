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

/**
 * @typedef {{ size: string, orientation: string, margin: string }} PageSetup
 * @typedef {{ width: number, height: number, margin: number, css: string, orientation: string }} PageGeometry
 */

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
  };
}

/**
 * Pixel dimensions for a page setup, with width/height swapped for landscape.
 * @param {Partial<PageSetup>} [page]
 * @returns {PageGeometry}
 */
export function pageGeometry(page) {
  const { size, orientation, margin } = normalizePage(page);
  const { width, height, css } = PAGE_SIZES[size];
  const landscape = orientation === 'landscape';
  return {
    width: landscape ? height : width,
    height: landscape ? width : height,
    margin: PAGE_MARGINS[margin].px,
    css,
    orientation,
  };
}

const nearest = (/** @type {[string, number][]} */ candidates, /** @type {number} */ value) =>
  candidates.reduce((best, item) => (Math.abs(item[1] - value) < Math.abs(best[1] - value) ? item : best))[0];

/**
 * The supported page setup closest to arbitrary dimensions (used when importing files).
 * @param {{ width: number, height: number, margin: number }} px
 * @returns {PageSetup}
 */
export function matchPage({ width, height, margin }) {
  const landscape = width > height;
  const long = Math.max(width, height);
  return {
    size: nearest(
      Object.entries(PAGE_SIZES).map(([id, s]) => [id, s.height]),
      long,
    ),
    orientation: landscape ? 'landscape' : 'portrait',
    margin: nearest(
      Object.entries(PAGE_MARGINS).map(([id, m]) => [id, m.px]),
      margin,
    ),
  };
}
