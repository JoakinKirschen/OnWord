import { $ } from '../../core/dom.js';
import { esc } from '../../core/html.js';

const KEEP_ORIGINAL_BELOW = 350_000; // bytes
const MAX_WIDTH = 1400;

/** Reads an image file as a data URL, scaling large images down to protect the storage quota. */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      if (file.size < KEEP_ORIGINAL_BELOW) return resolve(reader.result);
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read image'));
      img.onload = () => {
        const scale = Math.min(1, MAX_WIDTH / img.naturalWidth);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const g = canvas.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, canvas.width, canvas.height);
        g.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Image insertion plus the floating resize/remove bar shown for a clicked image. */
export function initImages(ctx) {
  const { root, content, scroller, selection, events, commands, toast } = ctx;
  const view = root.ownerDocument.defaultView;
  const input = $('#imgInput', root), bar = $('#imgBar', root);
  let active = null;

  async function insertFiles(files) {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        ctx.exec('insertHTML', `<img src="${await fileToDataUrl(file)}" alt="${esc(file.name || 'image')}">`);
      } catch {
        toast('That image could not be added.');
      }
    }
  }

  function hideBar() {
    active = null;
    bar.hidden = true;
  }
  function placeBar() {
    if (!active?.isConnected) return hideBar();
    const img = active.getBoundingClientRect(), box = scroller.getBoundingClientRect();
    if (img.bottom < box.top || img.top > box.bottom) return (bar.hidden = true);
    bar.hidden = false;
    bar.style.left = Math.max(6, Math.min(img.left, view.innerWidth - bar.offsetWidth - 6)) + 'px';
    bar.style.top = Math.max(box.top + 4, img.top - bar.offsetHeight - 6) + 'px';
  }

  commands.register({
    'image.pick'() {
      selection.restore();
      input.click();
    },
    'image.insertFiles': insertFiles,
  });

  input.addEventListener('change', () => {
    insertFiles([...input.files]);
    input.value = '';
  });
  content.addEventListener('click', (e) => {
    if (e.target.tagName !== 'IMG') return hideBar();
    active = e.target;
    selection.selectNode(active);
    placeBar();
  });
  bar.addEventListener('mousedown', (e) => e.preventDefault());
  bar.addEventListener('click', (e) => {
    const value = e.target.dataset.img;
    if (!value || !active) return;
    if (value === 'remove') {
      active.remove();
      hideBar();
    } else {
      active.style.width = value + '%';
      active.style.height = 'auto';
      active.removeAttribute('height');
      placeBar();
    }
    ctx.changed();
  });
  scroller.addEventListener('scroll', () => { if (active) placeBar(); });
  view.addEventListener('resize', hideBar);
  events.on('open', hideBar);
  events.on('dismiss', hideBar);
}
