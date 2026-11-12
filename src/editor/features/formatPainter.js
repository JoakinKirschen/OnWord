const ARMED_CLASS = 'painting';
const TOGGLES = ['bold', 'italic', 'underline', 'strikeThrough'];
const PX_TO_PT = 0.75;
const TRANSPARENT = /^(transparent|rgba\(0, 0, 0, 0\))$/;

/**
 * Format painter: copies the character formatting at the caret and applies it to the next selection.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initFormatPainter(ctx) {
  const { content, selection, events, commands, toast } = ctx;
  const doc = content.ownerDocument;
  /** @type {{ toggles: Record<string, boolean>, color: string, highlight: string, font: string, size: number } | null} */
  let copied = null;

  function disarm() {
    copied = null;
    content.classList.remove(ARMED_CLASS);
  }

  function paint() {
    const s = selection.current();
    if (!copied || !s || s.isCollapsed) return;
    const { toggles, color, highlight, font, size } = copied;
    disarm();
    doc.execCommand('styleWithCSS', false, 'true');
    doc.execCommand('removeFormat');
    for (const name of TOGGLES) if (doc.queryCommandState(name) !== toggles[name]) doc.execCommand(name);
    doc.execCommand('foreColor', false, color);
    if (!TRANSPARENT.test(highlight)) doc.execCommand('hiliteColor', false, highlight);
    doc.execCommand('fontName', false, font);
    commands.run('format.size', size);
    ctx.changed();
  }

  commands.register({
    'format.painter'() {
      if (copied) return disarm();
      selection.restore();
      const el = selection.anchorElement();
      if (!el) return;
      const style = getComputedStyle(el);
      copied = {
        toggles: Object.fromEntries(TOGGLES.map((name) => [name, doc.queryCommandState(name)])),
        color: style.color,
        highlight: doc.queryCommandValue('backColor'),
        font: style.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
        size: Math.round(parseFloat(style.fontSize) * PX_TO_PT),
      };
      content.classList.add(ARMED_CLASS);
      toast('Select the text to apply the formatting to.');
    },
  });

  // The selection is final only after the mouse-up has been handled.
  content.addEventListener('mouseup', () => setTimeout(paint));
  events.on('dismiss', disarm);
  events.on('open', disarm);
}
