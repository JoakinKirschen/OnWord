import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { html, useApp } from './harness.mjs';

const { openApp } = useApp();
const saved = (page) => page.waitForFunction(() => document.querySelector('#specState').textContent === 'Saved');
const tree = (page) => page.locator('#articleTree .tree-item').allInnerTexts();
const field = (name) => `#articlePanel [data-field="${name}"]`;

/** Opens the specifications screen and creates a master with the given name. */
async function newMaster(page, name) {
  page.on('dialog', (dialog) => dialog.accept(name));
  await page.click('#home .main-nav a[href="#/specs"]');
  await page.waitForSelector('#specsHome:not([hidden])');
  await page.click('[data-act="spec.newMaster"]');
  await page.waitForSelector('#specView:not([hidden])');
}

/** Adds an article (under the selected one when `child`) and fills in its title and optional fields. */
async function addArticle(page, { child = false, title, unit, text }) {
  await page.click(
    child ? '#articlePanel [data-act="spec.addArticle"]' : '.spec-tree-tools [data-act="spec.addArticle"]',
  );
  await page.fill(field('title'), title);
  if (unit) await page.fill(field('unit'), unit);
  if (text) {
    await page.click('#articleText');
    await page.keyboard.type(text);
  }
}

test('a master specification: numbered articles, text, measurement and prices', async () => {
  const page = await openApp();
  await newMaster(page, 'Standard specification');
  assert.equal(await page.inputValue('#specTitle'), 'Standard specification');
  assert.equal(await page.textContent('#specKind'), 'Master specification');

  await addArticle(page, { title: 'Earthworks' });
  assert.equal(await page.inputValue(field('number')), '1');
  await addArticle(page, { child: true, title: 'Trench', unit: 'm', text: 'Dig a trench.' });
  assert.equal(await page.inputValue(field('number')), '1.1', 'a sub-article is numbered below its parent');
  await page.click('.spec-tree-tools [data-act="spec.addArticle"]');
  assert.equal(await page.inputValue(field('number')), '1.2', 'a new article continues after its siblings');
  await page.fill(field('title'), 'Backfill');
  assert.deepEqual(await tree(page), ['1\nEarthworks', '1.1\nTrench', '1.2\nBackfill']);

  await page.click('#articleTree .tree-item >> nth=1');
  await page.click('[data-act="spec.addLine"]');
  await page.fill('[data-line="0"][data-part="text"]', 'north side');
  await page.fill('[data-line="0"][data-part="formula"]', '2 * 3,5');
  await page.click('[data-act="spec.addLine"]');
  await page.fill('[data-line="1"][data-part="formula"]', '4');
  assert.equal(await page.textContent('[data-result="0"]'), '7');
  assert.equal(await page.textContent('#articleQuantity'), '11 m');
  await page.fill(field('price'), '10');
  assert.equal(await page.textContent('#articleAmount'), '110.00');
  await page.fill('[data-line="1"][data-part="formula"]', '4 +');
  assert.equal(await page.textContent('#articleQuantity'), '— m', 'an unfinished formula has no value');
  await page.fill('[data-line="1"][data-part="formula"]', '4');

  await saved(page);
  await page.reload();
  assert.deepEqual(await tree(page), ['1\nEarthworks', '1.1\nTrench', '1.2\nBackfill'], 'stored and reloaded');
  await page.click('#articleTree .tree-item >> nth=1');
  assert.equal(await page.innerText('#articleText'), 'Dig a trench.');
  assert.equal(await page.textContent('#articleAmount'), '110.00');

  await page.fill('#articleSearch', 'back');
  assert.deepEqual(await tree(page), ['1.2\nBackfill']);
  assert.deepEqual(page.errors, []);
});

test('bill of quantities, export for Excel, and turning a specification into a document', async () => {
  const page = await openApp();
  await newMaster(page, 'Works');
  await addArticle(page, { title: 'Earthworks', text: 'General.' });
  await addArticle(page, { child: true, title: 'Trench', unit: 'm', text: 'Dig a trench.' });
  await page.click('[data-act="spec.addLine"]');
  await page.fill('[data-line="0"][data-part="formula"]', '12,5');
  await page.fill(field('price'), '4');

  await page.click('[data-act="spec.view"][data-arg="quantities"]');
  assert.deepEqual(await page.locator('#quantitiesPanel tbody tr').allInnerTexts(), [
    '1.1\tTrench\tm\t12.5\t4.00\t50.00',
  ]);
  assert.equal(await page.textContent('#quantitiesTotal'), '50.00');
  const [file] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="spec.exportCsv"]')]);
  assert.equal(file.suggestedFilename(), 'Works - quantities.csv');
  assert.match(await readFile(await file.path(), 'utf8'), /1\.1;Trench;m;12,5;4;50\r\n;Total;;;;50/);

  await page.click('#quantitiesPanel tbody tr');
  assert.equal(await page.inputValue(field('title')), 'Trench', 'a row opens its article');

  await page.click('[data-act="spec.compose"]');
  await page.waitForSelector('#editorView:not([hidden])');
  assert.equal(await page.inputValue('#title'), 'Works');
  assert.equal(
    await html(page),
    '<h1>Works</h1><h2>1 Earthworks</h2><p>General.</p><h3>1.1 Trench</h3><p>Dig a trench.</p>',
  );
  assert.deepEqual(page.errors, []);
});

test('a project takes articles from a master and shows where it differs', async () => {
  const page = await openApp();
  await newMaster(page, 'Standard');
  await addArticle(page, { title: 'Earthworks', text: 'Master text.' });
  await addArticle(page, { child: true, title: 'Trench', unit: 'm' });
  await page.click('#articleTree .tree-item >> nth=0');
  await page.click('.spec-tree-tools [data-act="spec.addArticle"]');
  await page.fill(field('title'), 'Roofing');
  await saved(page);

  await page.click('.spec-bar .brand');
  await page.waitForSelector('#specsHome:not([hidden])');
  await page.click('[data-act="spec.newProject"]');
  await page.fill('#projectDlg [name=title]', 'School');
  await page.fill('#projectDlg [name=phase]', 'Tender');
  await page.fill('#projectDlg [name=lot]', '2');
  assert.deepEqual(await page.locator('#projectArticles label').allInnerTexts(), [
    '1 Earthworks',
    '1.1 Trench',
    '2 Roofing',
  ]);
  await page.uncheck('#projectArticles label:has-text("Roofing") input');
  await page.click('#projectDlg .primary');
  await page.waitForSelector('#specView:not([hidden])');

  assert.equal(await page.textContent('#specKind'), 'Project');
  assert.equal(await page.inputValue('#specPhase'), 'Tender');
  assert.deepEqual(
    await tree(page),
    ['1\nEarthworks', '1.1\nTrench'],
    'only the chosen articles, with their structure',
  );
  await page.click('#articleTree .tree-item >> nth=0');
  assert.equal(await page.textContent('#articleSource'), 'Same as the master specification.');

  await page.click('#articleText');
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Project addition.');
  assert.match(await page.textContent('#articleSource'), /Differs from the master specification/);
  assert.equal(await page.locator('#articleTree .tree-flag').count(), 1);
  await page.click('[data-act="spec.resetArticle"]');
  assert.equal(await page.innerText('#articleText'), 'Master text.');
  assert.equal(await page.locator('#articleTree .tree-flag').count(), 0);

  await page.click('[data-act="spec.deleteArticle"]');
  assert.deepEqual(await tree(page), [], 'deleting an article removes what is under it');
  assert.equal(await page.textContent('#articleTree'), 'No articles yet. Add the first one.');
  await saved(page);
  await page.click('.spec-bar .brand');
  await page.waitForSelector('#specsHome:not([hidden])');
  assert.match(await page.innerText('#projectList'), /School[\s\S]*Phase Tender · Lot 2 · from Standard/);
  assert.equal(await page.locator('#masterList .spec-row').count(), 1);
  assert.deepEqual(page.errors, []);
});

/** Goes back to the list and starts a project from the only master, with all of its articles. */
async function newProject(page, title) {
  await page.click('.spec-bar .brand');
  await page.waitForSelector('#specsHome:not([hidden])');
  await page.click('[data-act="spec.newProject"]');
  await page.fill('#projectDlg [name=title]', title);
  await page.waitForSelector('#projectArticles input');
  await page.click('#projectDlg .primary');
  await page.waitForSelector('#specView:not([hidden])');
}

/** Opens an article by its position in the tree and gives it a unit price. */
async function price(page, nth, value) {
  await page.click(`#articleTree .tree-item >> nth=${nth}`);
  await page.fill(field('price'), value);
}

test('the price library shows what an article cost in other projects and fills in missing prices', async () => {
  const page = await openApp();
  await newMaster(page, 'Standard');
  await addArticle(page, { title: 'Trench', unit: 'm' });
  await addArticle(page, { title: 'Paving', unit: 'm²' });
  await saved(page);

  await newProject(page, 'School');
  await price(page, 0, '10');
  assert.equal(await page.textContent('#articleLibrary'), 'No prices from your other projects yet.');
  await saved(page);
  await newProject(page, 'Library');
  await price(page, 0, '20');
  await price(page, 1, '7');
  await saved(page);

  await newProject(page, 'Town hall');
  await page.click('#articleTree .tree-item >> nth=0');
  assert.match(
    await page.innerText('#articleLibrary'),
    /^Price library \(2 projects\): 10\.00 – 20\.00 · average 15\.00 · latest 20\.00/,
  );
  await page.click('[data-act="spec.usePrice"][data-arg="average"]');
  assert.equal(await page.inputValue(field('price')), '15');

  await page.click('[data-act="spec.view"][data-arg="prices"]');
  const rows = () => page.locator('#pricesPanel tbody tr').allInnerTexts();
  assert.deepEqual(await rows(), [
    '1\tTrench\tm\t15.00\t2\t10.00\t15.00\t20.00\t0 %',
    '2\tPaving\tm²\t—\t1\t7.00\t7.00\t7.00\t',
  ]);
  await page.click('[data-act="spec.fillPrices"]');
  assert.equal(await page.textContent('#toast'), '1 price filled in from the price library.');
  assert.equal((await rows())[1], '2\tPaving\tm²\t7.00\t1\t7.00\t7.00\t7.00\t0 %');
  assert.equal(await page.locator('[data-act="spec.fillPrices"]').count(), 0, 'nothing is left to fill in');
  await saved(page);

  // The master sees the prices of every project built from it.
  await page.click('.spec-bar .brand');
  await page.click('#masterList a');
  await page.waitForSelector('#specView:not([hidden])');
  await page.click('[data-act="spec.view"][data-arg="prices"]');
  assert.deepEqual(await rows(), [
    '1\tTrench\tm\t—\t3\t10.00\t15.00\t20.00\t',
    '2\tPaving\tm²\t—\t2\t7.00\t7.00\t7.00\t',
  ]);
  await page.click('#pricesPanel tbody tr >> nth=0');
  assert.equal(await page.inputValue(field('title')), 'Trench', 'a row opens its article');
  assert.deepEqual(page.errors, []);
});
