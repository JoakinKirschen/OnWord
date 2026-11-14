import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { useApp } from './harness.mjs';

const { openApp } = useApp();
const FIXTURES = new URL('../fixtures/', import.meta.url);
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const saved = (page) => page.waitForFunction(() => document.querySelector('#specState').textContent === 'Saved');
const field = (name) => `#articlePanel [data-field="${name}"]`;
const rows = (page) => page.locator('#offersPanel .offers tbody tr').allInnerTexts();
const summary = (page) => page.innerText('#offerSummary');

/** A master with the articles the fixture prices, and a project built from it with its own quantities. */
async function project(page) {
  page.on('dialog', (dialog) => dialog.accept('Standard'));
  await page.click('#home .main-nav a[href="#/masters"]');
  await page.click('[data-act="spec.newMaster"]');
  await page.waitForSelector('#specView:not([hidden])');
  for (const [where, title, unit] of [
    ['tree', 'Grondwerken', ''],
    ['child', 'Sleuf graven', 'm'],
    ['tree', 'Betonklinkers', 'm²'],
  ]) {
    await page.click(
      where === 'child'
        ? '#articlePanel [data-act="spec.addArticle"]'
        : '.spec-tree-tools [data-act="spec.addArticle"]',
    );
    await page.fill(field('title'), title);
    if (unit) await page.fill(field('unit'), unit);
    await page.click('#articleTree .tree-item >> nth=0'); // a new top-level article then follows "1"
  }
  await saved(page);
  await page.click('.spec-bar .brand');
  await page.click('#home .main-nav a[href="#/"]');
  await page.click('[data-act="spec.newProject"]');
  await page.fill('#projectDlg [name=title]', 'School');
  await page.waitForSelector('#projectArticles input');
  await page.click('#projectDlg .primary');
  await page.waitForSelector('#specView:not([hidden])');
  for (const [nth, quantity, price] of [
    [1, '40', '20'],
    [2, '100', ''],
  ]) {
    await page.click(`#articleTree .tree-item >> nth=${nth}`);
    await page.click('[data-act="spec.addLine"]');
    await page.fill('[data-line="0"][data-part="formula"]', quantity);
    if (price) await page.fill(field('price'), price);
  }
  await saved(page);
  await page.click('[data-act="spec.view"][data-arg="offers"]');
}

const csv = (text) => ({ name: 'Janssens.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });

test('offers from Excel and CSV, side by side, and taking one over', async () => {
  const page = await openApp();
  await project(page);
  assert.match(await page.innerText('#offersPanel'), /No offers yet/);

  const workbook = await readFile(new URL('offer-openpyxl.xlsx', FIXTURES));
  await page.setInputFiles('#offerInput', { name: 'Peeters meetstaat.xlsx', mimeType: XLSX, buffer: workbook });
  await page.waitForSelector('#offerDlg[open]');
  assert.equal(await page.inputValue('#offerSheet'), '1', 'the sheet with the bill of quantities is chosen');
  assert.equal(await page.inputValue('#offerHeader'), '4');
  assert.equal(await page.inputValue('#offerColumns [data-field="price"]'), '4');
  assert.equal(await page.isVisible('#offerAi'), false, 'no AI reader without the server');
  assert.match(await summary(page), /^3 priced lines, 2 matched to an article\./);
  assert.match(await summary(page), /Not matched to an article:\s+9\.9 Meerwerk afvoer$/);
  assert.equal(await page.inputValue('#offerDlg [name=contractor]'), 'Peeters meetstaat');
  await page.fill('#offerDlg [name=contractor]', 'Peeters');
  await page.click('#offerDlg .primary');
  assert.equal(await page.textContent('#toast'), 'Offer of Peeters imported: 2 prices.');
  assert.deepEqual(await rows(page), [
    '1.1\tSleuf graven\tm\t40\t20.00\t18.50',
    '2\tBetonklinkers\tm²\t100\t—\t42.75 ≠',
  ]);
  assert.equal(
    await page.getAttribute('.offer-qty', 'title'),
    'Quantity in the offer: 120',
    'the contractor priced another quantity',
  );

  await page.setInputFiles(
    '#offerInput',
    csv(
      'Number;Article;Unit;Quantity;Unit price;Amount\r\n1.1;Sleuf graven;m;40;17,00;680\r\n2;Betonklinkers;m²;100;45;4500\r\n',
    ),
  );
  await page.click('#offerDlg .primary');
  assert.deepEqual(await rows(page), [
    '1.1\tSleuf graven\tm\t40\t20.00\t18.50\t17.00',
    '2\tBetonklinkers\tm²\t100\t—\t42.75 ≠\t45.00',
  ]);
  assert.deepEqual(await page.locator('#offersPanel tbody .offer-low').allInnerTexts(), ['17.00', '42.75 ≠']);
  assert.equal(
    await page.innerText('#offersPanel tfoot'),
    'Total for the project’s quantities\t800.00\t5,015.00\t5,180.00',
  );
  assert.equal(await page.innerText('#offersPanel tfoot .offer-low'), '5,015.00', 'the lowest total');
  assert.match(await page.innerText('#offersPanel .offer-unmatched summary'), /Peeters: 1 lines not matched/);

  await page.click('th:has-text("Janssens") [data-act="spec.useOffer"]');
  assert.deepEqual(
    (await rows(page)).map((row) => row.split('\t')[4]),
    ['17.00', '45.00'],
    'the project takes over the prices',
  );
  await page.click('th:has-text("Peeters") [data-act="spec.removeOffer"]');
  await saved(page);
  await page.reload();
  await page.click('[data-act="spec.view"][data-arg="offers"]');
  assert.deepEqual(await rows(page), [
    '1.1\tSleuf graven\tm\t40\t17.00\t17.00',
    '2\tBetonklinkers\tm²\t100\t45.00\t45.00',
  ]);
  assert.deepEqual(page.errors, []);
});

test('choosing the columns by hand, and a PDF without the AI reader', async () => {
  const page = await openApp();
  await project(page);
  await page.setInputFiles('#offerInput', csv('Code;Tekst;Bedrag\n1.1;Sleuf;19\n2;Klinkers;44\n'));
  await page.waitForSelector('#offerDlg[open]');
  assert.match(await summary(page), /No priced lines found/);
  assert.equal(await page.isDisabled('#offerDlg .primary'), true);
  await page.selectOption('#offerColumns [data-field="number"]', '0');
  await page.selectOption('#offerColumns [data-field="price"]', '2');
  assert.match(await summary(page), /^2 priced lines, 2 matched to an article\.$/);
  await page.click('#offerDlg .primary');
  assert.deepEqual(
    (await rows(page)).map((row) => row.split('\t').at(-1)),
    ['19.00', '44.00'],
  );

  await page.setInputFiles('#offerInput', {
    name: 'offer.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4'),
  });
  await page.waitForSelector('#offerDlg[open]');
  assert.match(await summary(page), /needs the AI reader, which is not set up/);
  assert.equal(await page.isDisabled('#offerDlg .primary'), true);
  await page.click('#offerDlg [value=cancel]');

  await page.setInputFiles('#offerInput', { name: 'broken.xlsx', mimeType: XLSX, buffer: Buffer.from('not a zip') });
  await page.waitForFunction(() => /could not be read/.test(document.querySelector('#toast').textContent));
  assert.deepEqual(page.errors, []);
});
