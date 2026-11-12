import { $, $$, hit } from '../../core/dom.js';

const HEADINGS = 'h1, h2, h3, h4, h5';
const PREF = 'outline';

/**
 * Outline sidebar: lists the document's headings and scrolls to one when clicked.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initOutline(ctx) {
  const { root, content, events, commands, prefs } = ctx;
  const panel = $('#outline', root),
    listEl = $('#outlineList', root);
  const headings = () => $$(HEADINGS, content).filter((h) => h.textContent.trim());

  function render() {
    if (panel.hidden) return;
    const items = headings().map((h, i) => {
      const button = content.ownerDocument.createElement('button');
      button.dataset.index = String(i);
      button.dataset.level = h.tagName[1];
      button.textContent = h.textContent.trim();
      return button;
    });
    if (items.length) return listEl.replaceChildren(...items);
    listEl.innerHTML = '<p class="outline-empty">Headings you add to the document will appear here.</p>';
  }

  commands.register({
    'view.outline'() {
      panel.hidden = !panel.hidden;
      prefs.set(PREF, !panel.hidden);
      render();
    },
  });

  listEl.addEventListener('click', (e) => {
    const index = hit(e, 'button')?.dataset.index;
    if (index != null) headings()[Number(index)]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });

  panel.hidden = !prefs.get(PREF, true);
  events.on('open', render);
  events.on('change', render);
}
