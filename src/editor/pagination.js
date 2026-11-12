/** Page-break arithmetic for the paged view. Pure: it works on measurements, not on the DOM. */

const TOLERANCE = 0.5; // sub-pixel rounding in measured positions

/**
 * @typedef {{ top: number, height: number, forced?: boolean }} BlockBox a top-level block as laid out
 *   without page gaps; `forced` means an explicit page break precedes it
 * @typedef {{ start: number, body: number, pitch: number }} PageMetrics `start`: where page 1's text begins;
 *   `body`: text height of a page; `pitch`: distance from one page's text to the next page's
 */

/**
 * Decides which blocks start a new page. A block that does not fit in the space left on its page moves to
 * the next one as a whole; a block taller than a page stays where it is and simply runs on.
 * @param {BlockBox[]} blocks in document order
 * @param {PageMetrics} metrics
 * @returns {{ breaks: { index: number, extra: number }[], pages: number }} `extra`: how far block `index`
 *   (and everything after it) has to move down
 */
export function paginate(blocks, { start, body, pitch }) {
  const breaks = [];
  let shift = 0;
  let pageStart = start;
  let pages = 1;
  blocks.forEach(({ top, height, forced }, index) => {
    let y = top + shift;
    const atPageStart = y <= pageStart + TOLERANCE;
    const overflows = y + height > pageStart + body + TOLERANCE;
    if ((forced || overflows) && !atPageStart) {
      pageStart += pitch;
      pages++;
      breaks.push({ index, extra: pageStart - y });
      shift += pageStart - y;
      y = pageStart;
    }
    while (y + height > pageStart + body + TOLERANCE) {
      pageStart += pitch; // taller than a page: it occupies the following pages too
      pages++;
    }
  });
  return { breaks, pages };
}
