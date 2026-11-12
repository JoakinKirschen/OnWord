import { $, hit } from '../../core/dom.js';
import { esc } from '../../core/html.js';
import { PAGES_TOKEN, PAGE_TOKEN, normalizePage } from '../../core/page.js';
import { pageLayout } from '../metrics.js';

const PAGE_NUMBERS = `Page ${PAGE_TOKEN} of ${PAGES_TOKEN}`;
const TOKENS = /(\{page\}|\{pages\})/;
const COUNTERS = { [PAGE_TOKEN]: 'counter(page)', [PAGES_TOKEN]: 'counter(pages)' };
const BAND_HEIGHT = 16; // .page-band in styles/page.css
const PRINT_FONT = 'font: 9pt Arial, Helvetica, sans-serif; color: #555;';

/** A CSS `content` value for running text: quoted strings interleaved with page counters. */
function cssContent(/** @type {string} */ text) {
  return text
    .split(TOKENS)
    .filter(Boolean)
    .map((part) => COUNTERS[part] || `"${part.replace(/[\\"]/g, '\\$&')}"`)
    .join(' ');
}

/** The @page margin box that prints a header ('top') or footer ('bottom') on every page. */
function marginBox(
  /** @type {'top' | 'bottom'} */ edge,
  /** @type {import('../../core/page.js').RunningText} */ running,
) {
  return running.text ? `@${edge}-${running.align} { content: ${cssContent(running.text)}; ${PRINT_FONT} }` : '';
}

/**
 * Header and footer: one line of text each, shown in the margins of every page and printed there.
 * `{page}` and `{pages}` stand for the page number and the page count.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initHeaderFooter(ctx) {
  const { root, content, session, store, events, commands, toast } = ctx;
  const dialog = $('#headerFooterDlg', root);
  const bands = $('#pageBands', root);
  const inputs = {
    header: { text: $('#headerText', root), align: $('#headerAlign', root) },
    footer: { text: $('#footerText', root), align: $('#footerAlign', root) },
  };
  // Page counters only exist in @page margin boxes, so the printed version is generated CSS.
  const printStyle = root.appendChild(root.ownerDocument.createElement('style'));
  printStyle.dataset.print = 'running';
  const current = () => normalizePage(session.meta()?.page);

  /** A band in the margin of page `number`, `offset` pixels below the top of that page. */
  function band(
    /** @type {import('../../core/page.js').RunningText} */ running,
    /** @type {Record<string, any>} */ at,
  ) {
    const text = running.text.replaceAll(PAGE_TOKEN, at.number).replaceAll(PAGES_TOKEN, at.pages);
    const id = at.id ? ` id="${at.id}"` : '';
    return `<div class="page-band"${id} title="Double-click to edit the ${at.kind}" style="top: ${at.top}px; text-align: ${running.align}">${esc(text)}</div>`;
  }

  function render() {
    const page = current();
    const { margin, body, pitch, pages } = pageLayout(content);
    const html = [];
    for (let p = 0; p < pages; p++) {
      const at = { number: p + 1, pages };
      const top = p * pitch + margin / 2 - BAND_HEIGHT / 2;
      html.push(band(page.header, { ...at, kind: 'header', top, id: p === 0 && 'pageHeader' }));
      html.push(
        band(page.footer, { ...at, kind: 'footer', top: top + margin + body, id: p === pages - 1 && 'pageFooter' }),
      );
    }
    bands.innerHTML = html.join('');
    printStyle.textContent = `@page { ${marginBox('top', page.header)} ${marginBox('bottom', page.footer)} }`;
  }

  function save(/** @type {Partial<import('../../core/page.js').PageSetup>} */ changes) {
    store.write(session.id, null, { page: normalizePage({ ...current(), ...changes }) });
    render();
  }

  commands.register({
    'page.headerFooter'() {
      const page = current();
      for (const name of /** @type {const} */ (['header', 'footer'])) {
        inputs[name].text.value = page[name].text;
        inputs[name].align.value = page[name].align;
      }
      dialog.returnValue = '';
      dialog.showModal();
    },
    /** Dialog button: puts page numbering into the footer field. */
    'page.numberFooter'() {
      const input = inputs.footer.text;
      if (!input.value.includes(PAGE_TOKEN)) input.value = [input.value, PAGE_NUMBERS].filter(Boolean).join(' · ');
    },
    /** Insert → Page numbers: adds numbering to the footer straight away. */
    'page.numbers'() {
      const { footer } = current();
      if (footer.text.includes(PAGE_TOKEN)) return toast('The footer already shows page numbers.');
      save({ footer: { ...footer, text: [footer.text, PAGE_NUMBERS].filter(Boolean).join(' · ') } });
      toast('Page numbers added to the footer.');
    },
  });

  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'ok') {
      save({
        header: { text: inputs.header.text.value.trim(), align: inputs.header.align.value },
        footer: { text: inputs.footer.text.value.trim(), align: inputs.footer.align.value },
      });
    }
    content.focus();
  });
  bands.addEventListener('dblclick', (e) => {
    if (hit(e, '.page-band')) commands.run('page.headerFooter');
  });
  events.on('pages', render);
}
