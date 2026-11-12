/** CSS length conversion. */

const PX_PER_UNIT = { px: 1, pt: 96 / 72, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 };

/**
 * An absolute CSS length ("48px", "0.5in", "6pt") in pixels; 0 for anything else.
 * @param {string | null | undefined} length
 */
export function cssPx(length) {
  const match = String(length ?? '').match(/^(-?[\d.]+)(px|pt|in|cm|mm)$/);
  return match ? Number(match[1]) * PX_PER_UNIT[match[2]] : 0;
}

/** @param {number} px */
export const pxToPt = (px) => (px * 72) / 96;
