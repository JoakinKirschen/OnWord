import { $, hit } from '../../core/dom.js';
import { esc } from '../../core/html.js';
import { PAGES_TOKEN, PAGE_TOKEN, RUNNING_PARTS, isBlank, normalizePage } from '../../core/page.js';
import { pageLayout } from '../metrics.js';

const PAGE_NUMBERS = `Page ${PAGE_TOKEN} of ${PAGES_TOKEN}`;
const TOKENS = /(\{page\}|\{pages\})/;
const COUNTERS = { [PAGE_TOKEN]: 'counter(page)', [PAGES_TOKEN]: 'counter(pages)' };
const BAND_HEIGHT = 16; // .page-band in styles/page.css
const PRINT_FONT = 'font: 9pt Arial, Helvetica, sans-serif; color: #555;';
/** The four lines the dialog edits: [page setup key, id prefix of its fields]. */
const LINES = /** @type {const} */ ([
  ['header', 'header'],
  ['footer', 'footer'],
  ['firstHeader', 'firstHeader'],
  ['firstFooter', 'firstFooter'],
]);

/** @typedef {import('../../core/page.js').RunningText} RunningText */

/** A CSS `content` value for running text: quoted strings interleaved with page counters. */
function cssContent(/** @type {string} */ text) {
  return text
    .split(TOKENS)
    .filter(Boolean)
    .map((part) => COUNTERS[part] || `"${part.replace(/[\\"]/g, '\\$&')}"`)
    .join(' ');
}

/**
 * The @page margin boxes that print a header ('top') or footer ('bottom'): one per part. `override`
 * also empties the boxes of blank parts, for the first page, which would otherwise show the others' text.
 */
function marginBoxes(
  /** @type {'top' | 'bottom'} */ edge,
  /** @type {RunningText} */ running,
  /** @type {boolean} */ override = false,
) {
  return RUNNING_PARTS.map((part) => {
    const box = `@${edge}-${part}`;
    if (running[part]) return `${box} { content: ${cssContent(running[part])}; ${PRINT_FONT} }`;
    return override ? `${box} { content: none; }` : '';
  })
    .filter(Boolean)
    .join(' ');
}

/** Adds page numbering to the centre of a footer, unless it already shows them. */
const withNumbers = (/** @type {RunningText} */ footer) => ({
  ...footer,
  center: [footer.center, PAGE_NUMBERS].filter(Boolean).join(' · '),
});
const hasNumbers = (/** @type {RunningText} */ running) => RUNNING_PARTS.some((p) => running[p].includes(PAGE_TOKEN));

/**
 * Header and footer: one line each, in a left, centre and right part, shown in the margins of every page
 * and printed there; optionally a different one on the first page. `{page}` and `{pages}` stand for the
 * page number and the page count.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initHeaderFooter(ctx) {
  const { root, content, session, store, events, commands, toast } = ctx;
  const dialog = $('#headerFooterDlg', root);
  const bands = $('#pageBands', root);
  const firstPage = $('#firstPageOwn', root);
  const firstFields = $('#firstPageFields', root);
  /** The dialog's text fields, by line and part. */
  const fields = Object.fromEntries(
    LINES.map(([key, prefix]) => [
      key,
      Object.fromEntries(RUNNING_PARTS.map((part) => [part, $(`#${prefix}-${part}`, root)])),
    ]),
  );
  // Page counters only exist in @page margin boxes, so the printed version is generated CSS.
  const printStyle = root.appendChild(root.ownerDocument.createElement('style'));
  printStyle.dataset.print = 'running';
  const current = () => normalizePage(session.meta()?.page);

  /** A band in the margin of page `number`, `top` pixels below the top of the document. */
  function band(/** @type {RunningText} */ running, /** @type {Record<string, any>} */ at) {
    const fill = (/** @type {string} */ text) =>
      esc(text.replaceAll(PAGE_TOKEN, at.number).replaceAll(PAGES_TOKEN, at.pages));
    const id = at.id ? ` id="${at.id}"` : '';
    const parts = isBlank(running)
      ? ''
      : RUNNING_PARTS.map((part) => `<span class="band-${part}">${fill(running[part])}</span>`).join('');
    return `<div class="page-band${parts ? '' : ' blank'}"${id} title="Double-click to edit the ${at.kind}" style="top: ${at.top}px">${parts}</div>`;
  }

  function render() {
    const page = current();
    const { margin, body, pitch, pages } = pageLayout(content);
    const html = [];
    for (let p = 0; p < pages; p++) {
      const own = page.firstPage && p === 0;
      const at = { number: p + 1, pages };
      const top = p * pitch + margin / 2 - BAND_HEIGHT / 2;
      html.push(
        band(own ? page.firstHeader : page.header, { ...at, kind: 'header', top, id: p === 0 && 'pageHeader' }),
      );
      html.push(
        band(own ? page.firstFooter : page.footer, {
          ...at,
          kind: 'footer',
          top: top + margin + body,
          id: p === pages - 1 && 'pageFooter',
        }),
      );
    }
    bands.innerHTML = html.join('');
    const first = page.firstPage
      ? `@page :first { ${marginBoxes('top', page.firstHeader, true)} ${marginBoxes('bottom', page.firstFooter, true)} }`
      : '';
    printStyle.textContent = `@page { ${marginBoxes('top', page.header)} ${marginBoxes('bottom', page.footer)} } ${first}`;
  }

  function save(/** @type {Partial<import('../../core/page.js').PageSetup>} */ changes) {
    store.write(session.id, null, { page: normalizePage({ ...current(), ...changes }) });
    render();
  }

  const showFirstFields = () => (firstFields.hidden = !firstPage.checked);
  /** @returns {RunningText} */
  const readLine = (/** @type {string} */ key) => {
    const value = (/** @type {string} */ part) => fields[key][part].value.trim();
    return { left: value('left'), center: value('center'), right: value('right') };
  };

  commands.register({
    'page.headerFooter'() {
      const page = current();
      for (const [key] of LINES) for (const part of RUNNING_PARTS) fields[key][part].value = page[key][part];
      firstPage.checked = page.firstPage;
      showFirstFields();
      dialog.returnValue = '';
      dialog.showModal();
    },
    /** Dialog button: puts page numbering into the footer. */
    'page.numberFooter'() {
      const footer = readLine('footer');
      if (!hasNumbers(footer)) fields.footer.center.value = withNumbers(footer).center;
    },
    /** Insert → Page numbers: adds numbering to the footer straight away. */
    'page.numbers'() {
      const { footer } = current();
      if (hasNumbers(footer)) return toast('The footer already shows page numbers.');
      save({ footer: withNumbers(footer) });
      toast('Page numbers added to the footer.');
    },
  });

  firstPage.addEventListener('change', showFirstFields);
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'ok') {
      save({
        ...Object.fromEntries(LINES.map(([key]) => [key, readLine(key)])),
        firstPage: firstPage.checked,
      });
    }
    content.focus();
  });
  bands.addEventListener('dblclick', (e) => {
    if (hit(e, '.page-band')) commands.run('page.headerFooter');
  });
  events.on('pages', render);
}
