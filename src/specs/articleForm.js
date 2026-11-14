/** The form of the selected article: drawing it, its measurement lines and what typing in it changes. */

import { $, hit } from '../core/dom.js';
import { evaluate } from '../core/spec/formula.js';
import { initArticleText } from './articleText.js';
import { articleHtml, linesHtml, number, sourceHtml, totalsText } from './templates.js';

const NOTHING = '<p class="spec-empty">Choose an article in the list, or add one.</p>';

/**
 * @typedef {import('../core/spec/model.js').Article} Article
 * @typedef {object} ArticleFormDeps
 * @property {HTMLElement} panel
 * @property {import('../core/commands.js').Commands} commands
 * @property {() => Article | undefined} selected
 * @property {() => boolean} editable
 * @property {(article: Article) => Article | undefined} sourceOf the master article a project's article came from
 * @property {ReturnType<typeof import('./prices.js').createPriceLibrary>} library
 * @property {(id: string) => void} changed records a change to an article
 * @property {() => void} drawTree shows the tree again, after a change it shows
 *
 * @param {ArticleFormDeps} deps
 */
export function createArticleForm({ panel, commands, selected, editable, sourceOf, library, changed, drawTree }) {
  function draw() {
    const article = selected();
    panel.innerHTML = article
      ? articleHtml(article, { editable: editable(), source: sourceOf(article), library: library.noteHtml(article) })
      : NOTHING;
  }

  /** Refreshes what is computed from the article without touching the fields being typed in. */
  function drawDerived(/** @type {Article} */ article) {
    const totals = totalsText(article);
    $('#articleQuantity', panel).textContent = totals.quantity;
    $('#articleAmount', panel).textContent = totals.amount;
    $('#articleSource', panel).innerHTML = sourceHtml(article, sourceOf(article), editable());
    article.lines.forEach((line, i) => ($(`[data-result="${i}"]`, panel).textContent = number(evaluate(line.formula))));
    library.drawNote($('#articleLibrary', panel), article);
  }

  commands.register({
    'spec.addLine'() {
      const article = selected();
      article.lines.push({ text: '', formula: '' });
      $('#articleLines', panel).innerHTML = linesHtml(article, editable());
      changed(article.id);
      $(`[data-line="${article.lines.length - 1}"]`, panel).focus();
    },
    'spec.removeLine'(index) {
      const article = selected();
      article.lines.splice(Number(index), 1);
      $('#articleLines', panel).innerHTML = linesHtml(article, editable());
      drawDerived(article);
      changed(article.id);
    },
  });

  panel.addEventListener('input', (e) => {
    const article = selected();
    const input = hit(e, 'input');
    if (!article) return;
    if (input?.dataset.field) {
      const { field } = input.dataset;
      article[field] = field === 'price' ? Number(input.value) || 0 : input.value;
      if (field !== 'price') drawTree();
    } else if (input?.dataset.line) article.lines[Number(input.dataset.line)][input.dataset.part] = input.value;
    else if (hit(e, '#articleText')) {
      article.html = $('#articleText', panel).innerHTML;
      drawTree(); // the tree marks articles whose text differs from the master
    }
    drawDerived(article);
    changed(article.id);
  });
  initArticleText(panel);

  return { draw };
}
