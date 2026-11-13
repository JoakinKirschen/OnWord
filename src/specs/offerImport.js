/** Importing a contractor's offer: reading the file, choosing its columns, and the AI reader. */

import { toBase64 } from '../core/base64.js';
import { parseCsv } from '../core/csv.js';
import { $, hit } from '../core/dom.js';
import { esc } from '../core/html.js';
import { newId } from '../core/ids.js';
import { columnsOf, detectColumns, FIELDS, matchLines, readLines } from '../core/spec/offers.js';
import { columnName, readXlsx } from '../core/xlsx.js';

const LABELS = {
  number: 'Number',
  title: 'Description',
  unit: 'Unit',
  quantity: 'Quantity',
  price: 'Unit price',
  amount: 'Amount',
};
const PREVIEW = 5; // unmatched lines listed in the dialog
const CANNOT_READ = 'This file could not be read. Import an Excel workbook (.xlsx), a CSV file or a PDF.';

/** @typedef {import('../core/spec/offers.js').OfferLine} OfferLine */

/**
 * @typedef {object} OfferImportDeps
 * @property {HTMLDialogElement} dialog
 * @property {HTMLInputElement} input the file chooser
 * @property {import('../core/spec/aiReader.js').AiReader | null} aiReader
 * @property {import('../core/commands.js').Commands} commands
 * @property {import('../ui/toast.js').Toast} toast
 * @property {() => import('../core/spec/model.js').Spec | null} spec
 * @property {() => import('../core/spec/model.js').Article[]} articles
 * @property {() => Promise<void>} save writes pending article changes, so the AI reader sees them
 * @property {(offer: import('../core/spec/offers.js').Offer) => void} onImport
 *
 * @param {OfferImportDeps} deps
 */
export function initOfferImport({ dialog, input, aiReader, commands, toast, spec, articles, save, onImport }) {
  const form = $('form', dialog),
    contractor = $('[name=contractor]', dialog),
    layoutBox = $('#offerLayout', dialog),
    sheetSelect = $('#offerSheet', dialog),
    headerInput = $('#offerHeader', dialog),
    columnsBox = $('#offerColumns', dialog),
    summary = $('#offerSummary', dialog),
    aiButton = $('#offerAi', dialog),
    importButton = $('button[value=ok]', dialog);
  /** The file being imported: its sheets, or the PDF as base64. */
  let file = { name: '', sheets: /** @type {import('../core/xlsx.js').Sheet[]} */ ([]), pdf: '' };
  let sheet = 0;
  /** @type {{ header: number, columns: import('../core/spec/offers.js').Columns }} */
  let layout = { header: 0, columns: {} };
  /** @type {OfferLine[]} */
  let lines = [];
  let fromAi = false;

  const rows = () => file.sheets[sheet]?.rows ?? [];

  function drawSummary() {
    const { prices, unmatched } = matchLines(lines, articles());
    const matched = Object.keys(prices).length;
    importButton.disabled = !matched;
    if (!lines.length) {
      summary.innerHTML = `<p class="spec-empty">${
        file.pdf
          ? aiReader
            ? 'A PDF is read by the AI reader.'
            : 'Reading a PDF needs the AI reader, which is not set up on this server. Import the Excel file instead.'
          : 'No priced lines found. Choose the columns that hold the number or description and the unit price.'
      }</p>`;
      return;
    }
    const listed = unmatched
      .slice(0, PREVIEW)
      .map((line) => `<li>${esc([line.number, line.title].filter(Boolean).join(' '))}</li>`);
    const more = unmatched.length > PREVIEW ? `<li>and ${unmatched.length - PREVIEW} more</li>` : '';
    summary.innerHTML = `<p><b>${lines.length}</b> priced lines${fromAi ? ' read by the AI reader' : ''},
      <b>${matched}</b> matched to an article.</p>
      ${unmatched.length ? `<p>Not matched to an article:</p><ul>${listed.join('')}${more}</ul>` : ''}`;
  }

  function readSheet() {
    lines = readLines(rows(), layout);
    fromAi = false;
    drawSummary();
  }

  function drawColumns() {
    const headings = rows()[layout.header] ?? [];
    headerInput.value = String(layout.header + 1);
    columnsBox.innerHTML = FIELDS.map((field) => {
      const options = headings.map((heading, i) => {
        const chosen = layout.columns[field] === i ? ' selected' : '';
        return `<option value="${i}"${chosen}>${columnName(i)}: ${esc(String(heading))}</option>`;
      });
      return `<label>${LABELS[field]}<select data-field="${field}"><option value="">—</option>${options.join('')}</select></label>`;
    }).join('');
  }

  function chooseSheet(/** @type {number} */ index) {
    sheet = index;
    sheetSelect.value = String(index);
    layout = detectColumns(rows()) ?? { header: 0, columns: columnsOf(rows()[0] ?? []) };
    drawColumns();
    readSheet();
  }

  async function open(/** @type {File} */ chosen) {
    const extension = chosen.name.split('.').pop().toLowerCase();
    file = { name: chosen.name, sheets: [], pdf: '' };
    if (extension === 'pdf') file.pdf = toBase64(new Uint8Array(await chosen.arrayBuffer()));
    else if (extension === 'csv' || extension === 'txt')
      file.sheets = [{ name: chosen.name, rows: parseCsv(await chosen.text()) }];
    else file.sheets = await readXlsx(await chosen.arrayBuffer());
    form.reset();
    contractor.value = chosen.name.replace(/\.[^.]+$/, '');
    $('#offerFile', dialog).textContent = chosen.name;
    layoutBox.hidden = !file.sheets.length;
    sheetSelect.innerHTML = file.sheets.map((s, i) => `<option value="${i}">${esc(s.name)}</option>`).join('');
    $('#offerSheetField', dialog).hidden = file.sheets.length < 2;
    aiButton.hidden = !aiReader;
    lines = [];
    fromAi = false;
    if (file.sheets.length)
      chooseSheet(
        Math.max(
          0,
          file.sheets.findIndex((s) => detectColumns(s.rows)),
        ),
      );
    else drawSummary();
    dialog.showModal();
  }

  commands.register({
    'spec.importOffer': () => input.click(),
    /** Lets Claude read the file: for PDFs, and for spreadsheets whose layout the columns cannot capture. */
    async 'spec.readOfferWithAi'() {
      const project = spec();
      if (!aiReader || !project) return;
      aiButton.disabled = importButton.disabled = true;
      summary.innerHTML = '<p>The AI reader is reading the offer. This can take a minute or two…</p>';
      try {
        await save();
        const text = rows()
          .map((row) => row.join('\t'))
          .join('\n');
        const reading = await aiReader.read(
          project.id,
          file.pdf ? { name: file.name, pdf: file.pdf } : { name: file.name, text },
        );
        lines = reading.lines.map((line) => ({ ...line, quantity: line.quantity ?? NaN }));
        if (reading.contractor && contractor.value === file.name.replace(/\.[^.]+$/, ''))
          contractor.value = reading.contractor;
        fromAi = true;
        layoutBox.hidden = true;
        drawSummary();
      } catch (err) {
        summary.innerHTML = `<p class="offer-error">${esc(/** @type {Error} */ (err).message || 'The AI reader failed.')}</p>`;
      } finally {
        aiButton.disabled = false;
      }
    },
  });

  input.addEventListener('change', async () => {
    const chosen = input.files?.[0];
    input.value = ''; // choosing the same file again must fire `change` again
    if (!chosen) return;
    try {
      await open(chosen);
    } catch {
      toast(CANNOT_READ);
    }
  });
  sheetSelect.addEventListener('change', () => chooseSheet(Number(sheetSelect.value)));
  headerInput.addEventListener('change', () => {
    const header = Math.max(0, Number(headerInput.value) - 1 || 0);
    layout = { header, columns: columnsOf(rows()[header] ?? []) };
    drawColumns();
    readSheet();
  });
  columnsBox.addEventListener('change', (e) => {
    const select = hit(e, 'select');
    if (select.value === '') delete layout.columns[select.dataset.field];
    else layout.columns[select.dataset.field] = Number(select.value);
    readSheet();
  });
  form.addEventListener('submit', (e) => {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    const name = contractor.value.trim();
    if (!name) return contractor.focus();
    dialog.close();
    onImport({ id: newId(), contractor: name, date: Date.now(), ...matchLines(lines, articles()) });
  });
}
