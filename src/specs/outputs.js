/** What a specification can be turned into: a bill of quantities for Excel, and an ordinary document. */

import { download } from '../core/download.js';
import { quantitiesCsv, specToHtml } from '../core/spec/output.js';

const SNIPPET_LENGTH = 500;

/**
 * @typedef {object} OutputsDeps
 * @property {import('../core/commands.js').Commands} commands
 * @property {import('../core/storage.js').DocumentStore} documents where "Create document" puts its result
 * @property {(hash: string) => void} navigate
 * @property {() => { spec: import('../core/spec/model.js').Spec,
 *   articles: import('../core/spec/model.js').Article[] }} current the open specification, articles in use
 *
 * @param {OutputsDeps} deps
 */
export function initOutputs({ commands, documents, navigate, current }) {
  commands.register({
    'spec.exportCsv'() {
      const { spec, articles } = current();
      download(`${spec.title} - quantities.csv`, quantitiesCsv(articles), 'text/csv');
    },
    /** Turns the specification into an ordinary document, from where it can be printed or exported. */
    'spec.compose'() {
      const { spec, articles } = current();
      const html = specToHtml(spec, articles);
      const text = new DOMParser().parseFromString(html, 'text/html').body.textContent;
      const created = documents.create({ title: spec.title, html, snippet: text.slice(0, SNIPPET_LENGTH) });
      if (created) navigate('#/d/' + created.id);
    },
  });
}
