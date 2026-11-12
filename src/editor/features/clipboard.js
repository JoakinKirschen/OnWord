import { sanitize } from '../../core/html.js';

const imagesIn = (transfer) => [...(transfer?.files || [])].filter((f) => f.type.startsWith('image/'));

/** Paste (sanitised HTML, images) and image drag-and-drop. */
export function initClipboard(ctx) {
  const { content, selection, commands } = ctx;
  const doc = content.ownerDocument;

  content.addEventListener('paste', (e) => {
    const html = e.clipboardData?.getData('text/html');
    const images = imagesIn(e.clipboardData);
    if (html) {
      e.preventDefault();
      ctx.exec('insertHTML', sanitize(html));
    } else if (images.length) {
      e.preventDefault();
      commands.run('image.insertFiles', images);
    }
  });

  content.addEventListener('drop', (e) => {
    const images = imagesIn(e.dataTransfer);
    if (!images.length) return;
    e.preventDefault();
    const range = doc.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (range) selection.setRange(range);
    commands.run('image.insertFiles', images);
  });
}
