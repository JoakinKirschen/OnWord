import { EMPTY_DOC, sanitize, textToHtml } from '../core/html.js';

/** Creates a new document from a .txt/.md/.html file chosen through `input`. */
export function initImporter({ input, store, commands, navigate }) {
  commands.register({ 'library.import': () => input.click() });

  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    const raw = await file.text();
    const isHtml = /\.html?$/i.test(file.name) || file.type === 'text/html';
    const html = isHtml ? sanitize(raw) || EMPTY_DOC : textToHtml(raw);
    const text = new DOMParser().parseFromString(html, 'text/html').body.textContent.trim();
    const entry = store.create(file.name.replace(/\.[^.]+$/, '') || 'Imported document', html, text.slice(0, 500));
    if (entry) navigate('#/d/' + entry.id);
  });
}
