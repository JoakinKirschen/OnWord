/**
 * Importing a master's articles from a Word document (.docx, or .doc from Word 97–2003): reading it,
 * showing the articles found to choose from, and adding the chosen ones.
 */

import { readDoc } from '../core/doc/reader.js';
import { $, $$, hit } from '../core/dom.js';
import { readDocx } from '../core/docx/reader.js';
import { esc } from '../core/html.js';
import { newId } from '../core/ids.js';
import { draftArticles, placeChosen, toArticles } from '../core/spec/articleImport.js';
import { outline, subtree } from '../core/spec/model.js';

const INDENT = 18;
const HEADING = /^H([2-6])$/; // Word's Heading 1 is the app's <h2>
const FOUND_NOTHING_MS = 8000;

/** @typedef {import('../core/spec/model.js').Article} Article */

const plural = (/** @type {number} */ n, /** @type {string} */ word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A .docx as blocks: its headings, with Word's numbers in front, and the text between them. */
async function docxBlocks(/** @type {Uint8Array} */ bytes) {
  const { html } = await readDocx(bytes, { headingNumbers: true });
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  return [...body.children]
    .filter((el) => !el.classList.contains('footnotes'))
    .map((el) => {
      // Spacing and fonts of the Word file's paragraphs would fix the look of the documents made from
      // the specification; bold, italic and lists stay.
      for (const block of [el, ...$$('p, li', el)]) if (block.matches('p, li')) block.removeAttribute('style');
      const heading = HEADING.exec(el.tagName);
      const items = el.tagName === 'UL' || el.tagName === 'OL' ? $$('li', el) : [el];
      const text = items.map((item) => item.textContent.trim()).join('\n');
      return { level: heading ? Number(heading[1]) - 1 : 0, text, html: el.outerHTML };
    });
}

/** A .doc as blocks: its paragraphs, plain, headings by their style. */
const docBlocks = (/** @type {Uint8Array} */ bytes) =>
  readDoc(bytes).map(({ text, heading }) => ({
    level: heading,
    text,
    html: `<p>${esc(text).replace(/\n/g, '<br>')}</p>`,
  }));

/**
 * @typedef {object} ArticleImportDeps
 * @property {HTMLDialogElement} dialog
 * @property {HTMLInputElement} input the file input
 * @property {import('../core/commands.js').Commands} commands
 * @property {import('../ui/toast.js').Toast} toast
 * @property {() => Article[]} articles the specification's articles
 * @property {() => boolean} editable
 * @property {(articles: Article[]) => void} add adds the chosen articles, parents before children
 *
 * @param {ArticleImportDeps} deps
 */
export function initArticleImport({ dialog, input, commands, toast, articles, editable, add }) {
  const form = $('form', dialog),
    list = $('#importList', dialog),
    note = $('#importNote', dialog);
  /** The articles read from the file. @type {Article[]} */
  let found = [];

  /** A row to tick; articles whose number the specification has already start unticked. */
  function row(/** @type {{ article: Article, depth: number }} */ { article, depth }) {
    const known = articles().some((a) => a.number === article.number);
    return `<label class="import-item" style="padding-left: ${depth * INDENT}px">
      <input type="checkbox" value="${article.id}"${known ? '' : ' checked'}>
      <span>${esc(`${article.number} ${article.title}`)}</span>
      ${article.unit ? `<small>${esc(article.unit)}</small>` : ''}${known ? '<em>already in the master</em>' : ''}</label>`;
  }

  async function show(/** @type {File} */ file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const drafts = draftArticles(/\.doc$/i.test(file.name) ? docBlocks(bytes) : await docxBlocks(bytes));
    if (!drafts.length) {
      const how = 'Articles are read from its headings, or from titles that start with a number.';
      return toast(`No articles were found in “${file.name}”. ${how}`, FOUND_NOTHING_MS);
    }
    found = toArticles(drafts, { existing: articles(), newId });
    const numbered = drafts.some((d) => d.number);
    note.textContent = [
      `${plural(found.length, 'article')} in “${file.name}”, each with the text under its heading.`,
      numbered ? '' : 'The document gives no numbers, so they are numbered in order.',
      'Untick what should not be imported.',
    ]
      .filter(Boolean)
      .join(' ');
    list.innerHTML = outline(found).map(row).join('');
    dialog.showModal();
  }

  commands.register({
    'spec.importArticles'() {
      if (!editable()) return toast('Only the owner can change this specification.');
      input.value = '';
      input.click();
    },
  });

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    show(file).catch((err) => {
      console.error(err);
      toast(`“${file.name}” could not be read (${err.message}).`, FOUND_NOTHING_MS);
    });
  });
  // Ticking an article ticks everything under it, and the same for unticking.
  list.addEventListener('change', (e) => {
    const box = hit(e, 'input');
    const below = subtree(found, box.value);
    for (const other of $$('input', list)) if (below.has(other.value)) other.checked = box.checked;
  });
  form.addEventListener('submit', (e) => {
    if (e.submitter?.value !== 'ok') return;
    const chosen = new Set($$('input:checked', list).map((box) => box.value));
    const placed = placeChosen(found, chosen, articles());
    if (placed.length) add(placed);
  });
}
