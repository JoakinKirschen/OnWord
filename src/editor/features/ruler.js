import { $, hit } from '../../core/dom.js';
import { normalizePage } from '../../core/page.js';
import { indentsOf, selectedBlocks, setIndents } from '../blocks.js';

const PREF = 'ruler';
const MIN_LINE = 96; // never squeeze the text narrower than this
// Word's rulers: a number every inch or centimetre, counted from the left margin outwards in both
// directions, and a tick every eighth of an inch or quarter of a centimetre. Markers snap to the ticks.
const INCH = { unit: 96, tick: 12 };
const CENTIMETRE = { unit: 96 / 2.54, tick: 96 / 2.54 / 4 };

/**
 * Horizontal ruler, laid out like Word's: shows the page margins and lets the indents of the selected
 * paragraphs be dragged with Word's four markers (first line, hanging, left and right indent).
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initRuler(ctx) {
  const { root, content, selection, session, events, commands, prefs } = ctx;
  const ruler = $('#ruler', root),
    scale = $('#rulerScale', root),
    sheet = $('#sheet', root);
  const markers = {
    left: $('[data-marker="left"]', ruler),
    right: $('[data-marker="right"]', ruler),
    firstLine: $('[data-marker="firstLine"]', ruler),
    hanging: $('[data-marker="hanging"]', ruler),
  };
  /** @type {{ marker: string, x: number, zoom: number, from: import('../blocks.js').Indents, blocks: HTMLElement[] } | null} */
  let drag = null;

  /** Left page margin and the width available for text, in CSS pixels. */
  function textArea() {
    const style = getComputedStyle(content);
    const margin = parseFloat(style.paddingLeft);
    return { margin, width: content.clientWidth - margin - parseFloat(style.paddingRight) };
  }

  const measure = () => (normalizePage(session.meta()?.page).size === 'a4' ? CENTIMETRE : INCH);

  function drawScale() {
    const { unit, tick } = measure();
    const { margin } = textArea();
    const first = Math.floor(-margin / unit) + 1;
    const last = Math.ceil((content.clientWidth - margin) / unit) - 1;
    scale.style.setProperty('--ruler-unit', unit + 'px');
    scale.style.setProperty('--ruler-tick', tick + 'px');
    scale.style.setProperty('--ruler-origin', margin + 'px');
    scale.innerHTML = Array.from({ length: last - first + 1 }, (_, i) => first + i)
      .filter(Boolean)
      .map((n) => `<span style="left:${margin + n * unit}px">${Math.abs(n)}</span>`)
      .join('');
  }

  function placeMarkers(indents = indentsOf(selectedBlocks(ctx)[0])) {
    const { margin, width } = textArea();
    markers.left.style.left = markers.hanging.style.left = margin + indents.left + 'px';
    markers.firstLine.style.left = margin + indents.left + indents.firstLine + 'px';
    markers.right.style.left = margin + width - indents.right + 'px';
  }

  /**
   * Indents after dragging `drag.marker` by `delta` pixels, kept inside the text area. The marker lands
   * on a tick, as in Word, unless `free` (Alt held down).
   * @param {number} delta
   * @param {boolean} free
   */
  function dragged(delta, free) {
    const { from, marker } = drag;
    const { width } = textArea();
    const { tick } = measure();
    const at = (/** @type {number} */ x) => (free ? x : Math.round(x / tick) * tick);
    const clamp = (/** @type {number} */ value, /** @type {number} */ min, /** @type {number} */ max) =>
      Math.min(Math.max(value, min), Math.max(min, max));
    const start = from.left + from.firstLine; // where the first line starts
    if (marker === 'right') {
      return { ...from, right: clamp(width - at(width - from.right + delta), 0, width - from.left - MIN_LINE) };
    }
    if (marker === 'firstLine') {
      const firstLine = at(start + delta) - from.left;
      return { ...from, firstLine: clamp(firstLine, -from.left, width - from.left - from.right - MIN_LINE) };
    }
    if (marker === 'hanging') {
      // Moves the other lines only: the first line stays where it is.
      const left = clamp(at(from.left + delta), 0, width - from.right - MIN_LINE);
      return { ...from, left, firstLine: start - left };
    }
    // The left indent box moves the whole paragraph, first line included.
    return { ...from, left: clamp(at(from.left + delta), Math.max(0, -from.firstLine), width - from.right - MIN_LINE) };
  }

  ruler.addEventListener('pointerdown', (e) => {
    const marker = hit(e, '[data-marker]');
    if (!marker) return;
    e.preventDefault(); // keep the document selection
    selection.restore();
    const blocks = selectedBlocks(ctx);
    if (!blocks.length) return;
    marker.setPointerCapture(e.pointerId);
    drag = {
      marker: marker.dataset.marker,
      x: e.clientX,
      zoom: Number(sheet.style.zoom) || 1,
      from: indentsOf(blocks[0]),
      blocks,
    };
  });
  ruler.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const indents = dragged((e.clientX - drag.x) / drag.zoom, e.altKey);
    drag.blocks.forEach((block) => setIndents(block, indents));
    placeMarkers(indents);
  });
  ruler.addEventListener('pointerup', () => {
    if (!drag) return;
    drag = null;
    ctx.changed();
  });

  commands.register({
    'view.ruler'() {
      ruler.hidden = !ruler.hidden;
      prefs.set(PREF, !ruler.hidden);
    },
  });

  ruler.hidden = !prefs.get(PREF, true);
  events.on('layout', () => {
    drawScale();
    placeMarkers();
  });
  events.on('selection', () => placeMarkers());
  events.on('change', () => {
    if (!drag) placeMarkers();
  });
}
