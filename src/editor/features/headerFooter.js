import { $ } from '../../core/dom.js';
import { PAGES_TOKEN, PAGE_TOKEN, normalizePage } from '../../core/page.js';
import { countPages } from '../metrics.js';

const PAGE_NUMBERS = `Page ${PAGE_TOKEN} of ${PAGES_TOKEN}`;
const TOKENS = /(\{page\}|\{pages\})/;
const COUNTERS = { [PAGE_TOKEN]: 'counter(page)', [PAGES_TOKEN]: 'counter(pages)' };
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
 * Header and footer: one line of text each, shown in the page margins and printed on every page.
 * `{page}` and `{pages}` stand for the page number and the page count.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initHeaderFooter(ctx) {
  const { root, content, session, store, events, commands, toast } = ctx;
  const dialog = $('#headerFooterDlg', root);
  const bands = { header: $('#pageHeader', root), footer: $('#pageFooter', root) };
  const inputs = {
    header: { text: $('#headerText', root), align: $('#headerAlign', root) },
    footer: { text: $('#footerText', root), align: $('#footerAlign', root) },
  };
  // Page counters only exist in @page margin boxes, so the printed version is generated CSS.
  const printStyle = root.appendChild(root.ownerDocument.createElement('style'));
  printStyle.dataset.print = 'running';
  const current = () => normalizePage(session.meta()?.page);

  function render() {
    const page = current();
    const pages = String(countPages(content));
    for (const name of /** @type {const} */ (['header', 'footer'])) {
      bands[name].textContent = page[name].text.replaceAll(PAGE_TOKEN, '1').replaceAll(PAGES_TOKEN, pages);
      bands[name].style.textAlign = page[name].align;
    }
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
  for (const band of Object.values(bands)) band.addEventListener('dblclick', () => commands.run('page.headerFooter'));
  events.on('open', render);
  events.on('layout', render);
  events.on('change', render);
}
