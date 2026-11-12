import { $, hit } from '../../core/dom.js';
import { normalizePage } from '../../core/page.js';
import { indentsOf, selectedBlocks, setIndents } from '../blocks.js';

const PREF = 'ruler';
const SNAP = 12; // an eighth of an inch
const MIN_LINE = 96; // never squeeze the text narrower than this
const INCH = { unit: 96, tick: 12 };
const CENTIMETRE = { unit: 96 / 2.54, tick: 96 / 2.54 / 2 };

/**
 * Horizontal ruler: shows the page margins and lets the indents of the selected paragraphs be dragged.
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
  };
  /** @type {{ marker: string, x: number, zoom: number, from: import('../blocks.js').Indents, blocks: HTMLElement[] } | null} */
  let drag = null;

  /** Left page margin and the width available for text, in CSS pixels. */
  function textArea() {
    const style = getComputedStyle(content);
    const margin = parseFloat(style.paddingLeft);
    return { margin, width: content.clientWidth - margin - parseFloat(style.paddingRight) };
  }

  function drawScale() {
    const { unit, tick } = normalizePage(session.meta()?.page).size === 'a4' ? CENTIMETRE : INCH;
    const count = Math.floor(textArea().width / unit);
    scale.style.setProperty('--ruler-tick', tick + 'px');
    scale.innerHTML = Array.from(
      { length: count },
      (_, i) => `<span style="left:${(i + 1) * unit}px">${i + 1}</span>`,
    ).join('');
  }

  function placeMarkers(indents = indentsOf(selectedBlocks(ctx)[0])) {
    const { margin, width } = textArea();
    markers.left.style.left = margin + indents.left + 'px';
    markers.firstLine.style.left = margin + indents.left + indents.firstLine + 'px';
    markers.right.style.left = margin + width - indents.right + 'px';
  }

  /** Indents after dragging `drag.marker` by `delta` pixels, kept inside the text area. */
  function dragged(/** @type {number} */ delta) {
    const { from, marker } = drag;
    const { width } = textArea();
    const clamp = (/** @type {number} */ value, /** @type {number} */ min, /** @type {number} */ max) =>
      Math.min(Math.max(value, min), Math.max(min, max));
    if (marker === 'right') return { ...from, right: clamp(from.right - delta, 0, width - from.left - MIN_LINE) };
    if (marker === 'firstLine') {
      return {
        ...from,
        firstLine: clamp(from.firstLine + delta, -from.left, width - from.left - from.right - MIN_LINE),
      };
    }
    return { ...from, left: clamp(from.left + delta, Math.max(0, -from.firstLine), width - from.right - MIN_LINE) };
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
    const indents = dragged(Math.round((e.clientX - drag.x) / drag.zoom / SNAP) * SNAP);
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
