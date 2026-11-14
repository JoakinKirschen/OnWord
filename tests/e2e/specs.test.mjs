import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { html, useApp } from './harness.mjs';

const { openApp } = useApp();
const saved = (page) => page.waitForFunction(() => document.querySelector('#specState').textContent === 'Saved');
const tree = (page) => page.locator('#articleTree .tree-item').allInnerTexts();
const field = (name) => `#articlePanel [data-field="${name}"]`;
/** Confirms the warning before articles are removed, and waits until the tree has `left` articles. */
async function confirmRemoval(page, left) {
  await page.click('#removeDlg [value="remove"]');
  await page.waitForFunction((n) => document.querySelectorAll('#articleTree .tree-item').length === n, left);
}

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
  assert.ok(await page.isHidden('#specTabs'), 'a master has nothing to pick from');
  await page.click('#articleTree .tree-item >> nth=0');
  await page.click('.spec-tree-tools [data-act="spec.addArticle"]');
  await page.fill(field('title'), 'Roofing');
  await addArticle(page, { child: true, title: 'Tiles' });
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
    '2.1 Tiles',
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
  assert.equal(await page.textContent('#removeTitle'), 'Remove 2 articles?');
  assert.deepEqual(await page.locator('#removeList li').allInnerTexts(), ['1 Earthworks', '1.1 Trench']);
  await confirmRemoval(page, 0);
  assert.deepEqual(await tree(page), [], 'deleting an article removes what is under it');
  assert.equal(await page.textContent('#articleTree'), 'No articles yet. Add the first one.');
  await saved(page);
  await page.click('.spec-bar .brand');
  await page.waitForSelector('#specsHome:not([hidden])');
  assert.match(await page.innerText('#projectList'), /School[\s\S]*Phase Tender · Lot 2 · from Standard/);
  assert.equal(await page.locator('#masterList .spec-row').count(), 1);
  assert.deepEqual(page.errors, []);
});

test("a project's Master tab adds and removes articles, and keeps the changes of removed ones", async () => {
  const page = await openApp();
  await newMaster(page, 'Standard');
  await addArticle(page, { title: 'Earthworks', text: 'Master text.' });
  await addArticle(page, { child: true, title: 'Trench', unit: 'm' });
  await page.click('#articleTree .tree-item >> nth=0');
  await page.click('.spec-tree-tools [data-act="spec.addArticle"]');
  await page.fill(field('title'), 'Roofing');
  await addArticle(page, { child: true, title: 'Tiles' });
  assert.ok(await page.isHidden('#specTabs'), 'a master has nothing to pick from');
  await saved(page);
  await page.click('.spec-bar .brand');
  await page.waitForSelector('#specsHome:not([hidden])');
  await page.click('[data-act="spec.newProject"]');
  await page.fill('#projectDlg [name=title]', 'School');
  await page.uncheck('#projectArticles label:has-text("Roofing") input');
  await page.click('#projectDlg .primary');
  await page.waitForSelector('#specView:not([hidden])');
  const master = page.locator('#masterTree .pick-item');
  const box = (title) => `#masterTree .pick-item:has-text("${title}") input`;

  // Adding: ticking an article ticks the article above it too.
  await page.click('[data-act="spec.side"][data-arg="master"]');
  assert.ok(await page.isHidden('#articleTree'));
  assert.deepEqual(await master.allInnerTexts(), [
    '1\nEarthworks\nin project',
    '1.1\nTrench\nin project',
    '2\nRoofing',
    '2.1\nTiles',
  ]);
  assert.ok(await page.isDisabled('#masterApply'));
  await page.check(box('Tiles'));
  assert.ok(await page.isChecked(box('Roofing')), 'with the article above it');
  assert.equal(await page.textContent('#masterApply'), 'Apply: add 2');
  await page.click('#masterApply');
  await page.waitForSelector('#articleTree:visible');
  assert.deepEqual(await tree(page), ['1\nEarthworks', '1.1\nTrench', '2\nRoofing', '2.1\nTiles']);
  assert.equal(await page.inputValue(field('title')), 'Roofing', 'the first added article is opened');

  // The project's own changes to Trench, which removing it must not lose.
  await page.click('#articleTree .tree-item >> nth=1');
  await page.click('[data-act="spec.addLine"]');
  await page.fill('[data-line="0"][data-part="formula"]', '12');
  await page.fill(field('price'), '30');
  await page.click('#articleText');
  await page.keyboard.type('Dig by hand.');

  // Removing: unticking an article unticks what is under it; the warning lists both.
  await page.click('[data-act="spec.side"][data-arg="master"]');
  await page.uncheck(box('Earthworks'));
  assert.ok(!(await page.isChecked(box('Trench'))));
  assert.match(await page.innerText('#masterTree'), /Earthworks\nwill be removed[\s\S]*Trench\nwill be removed/);
  assert.equal(await page.textContent('#masterApply'), 'Apply: remove 2');
  await page.click('#masterApply');
  assert.equal(await page.textContent('#removeTitle'), 'Remove 2 articles?');
  assert.deepEqual(await page.locator('#removeList li').allInnerTexts(), ['1 Earthworks', '1.1 Trench']);
  assert.match(await page.textContent('#removeText'), /kept with your changes/);
  await page.click('#removeDlg [value="cancel"]');
  assert.equal(await page.locator('#masterTree .pick-item.removing').count(), 2, 'cancelling changes nothing');
  await page.click('#masterApply');
  await page.click('#removeDlg [value="remove"]');
  await page.waitForSelector('#masterTree .pick-item.removing', { state: 'detached' });
  await page.click('[data-act="spec.side"][data-arg="project"]');
  assert.deepEqual(await tree(page), ['2\nRoofing', '2.1\nTiles']);
  await saved(page);

  // Bringing Trench back brings Earthworks with it, and Trench comes back as the project left it.
  await page.reload();
  await page.waitForSelector('#specView:not([hidden])');
  await page.click('[data-act="spec.side"][data-arg="master"]');
  await page.check(box('Trench'));
  await page.click('#masterApply');
  await page.waitForSelector('#articleTree:visible');
  assert.deepEqual(
    await tree(page),
    ['1\nEarthworks', '1.1\nTrench\n●', '2\nRoofing', '2.1\nTiles'],
    'Trench still differs from the master',
  );
  await page.click('#articleTree .tree-item >> nth=1');
  assert.equal(await page.innerText('#articleText'), 'Dig by hand.');
  assert.equal(await page.textContent('#articleQuantity'), '12 m');
  assert.equal(await page.inputValue(field('price')), '30');

  // An article of the project's own is deleted for good, and the warning says so.
  await page.click('#projectSide [data-act="spec.addArticle"]'); // under Earthworks, which stays
  await page.fill(field('title'), 'Extra');
  await page.click('#articlePanel [data-act="spec.deleteArticle"]');
  assert.match(await page.textContent('#removeText'), /deleted for good/);
  await confirmRemoval(page, 4);
  assert.deepEqual(await tree(page), ['1\nEarthworks', '1.1\nTrench\n●', '2\nRoofing', '2.1\nTiles']);
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

/** Opens an article by its position in the tree, measures it (when `quantity` is given) and prices it. */
async function price(page, nth, value, quantity = '') {
  await page.click(`#articleTree .tree-item >> nth=${nth}`);
  if (quantity) {
    await page.click('[data-act="spec.addLine"]');
    await page.fill('[data-line="0"][data-part="formula"]', quantity);
  }
  await page.fill(field('price'), value);
}

test('the price library relates prices to quantities and fills in missing prices', async () => {
  const page = await openApp();
  await newMaster(page, 'Standard');
  await addArticle(page, { title: 'Trench', unit: 'm' });
  await addArticle(page, { title: 'Paving', unit: 'm²' });
  await saved(page);

  await newProject(page, 'School');
  await price(page, 0, '10', '100');
  assert.equal(await page.textContent('#articleLibrary'), 'No prices from your other projects yet.');
  await saved(page);
  await newProject(page, 'Library');
  await price(page, 0, '20', '25');
  assert.match(await page.innerText('#articleLibrary'), /Too few measured prices yet/);
  await price(page, 1, '7');
  await saved(page);

  // 20 for 25 m and 10 for 100 m: the price falls by 29 % each time the quantity doubles.
  await newProject(page, 'Town hall');
  await page.click('#articleTree .tree-item >> nth=0');
  const note = () => page.innerText('#articleLibrary');
  assert.match(await note(), /^Price library \(2 projects\): 10\.00 – 20\.00 · average 15\.00 · latest 20\.00/);
  assert.match(await note(), /Prices are 29 % lower per doubling of the quantity\. Measure this article/);
  await page.click('#priceRecords summary');
  assert.deepEqual(await page.locator('#priceRecords tbody tr').allInnerTexts(), [
    'School\t100 m\t10.00',
    'Library\t25 m\t20.00',
  ]);
  await page.click('[data-act="spec.addLine"]');
  await page.fill('[data-line="0"][data-part="formula"]', '50');
  await page.fill(field('price'), '20');
  assert.match(await note(), /Expected for 50 m: 14\.14 · 29 % lower per doubling/, 'follows the measurement');
  assert.equal(await page.isVisible('#priceRecords tbody'), true, 'the price list stays open while measuring');

  await page.click('[data-act="spec.view"][data-arg="prices"]');
  const rows = () => page.locator('#pricesPanel tbody tr').allInnerTexts();
  assert.deepEqual(await rows(), [
    '1\tTrench\tm\t50\t20.00\t2\t10.00 – 20.00\t15.00\t14.14\t+41 %',
    '2\tPaving\tm²\t0\t—\t1\t7.00\t7.00\t\t',
  ]);
  assert.equal(await page.locator('#pricesPanel .price-high').count(), 1, 'a price far above the library is marked');
  await page.click('#pricesPanel tbody tr >> nth=0');
  await page.click('[data-act="spec.usePrice"][data-arg="expected"]');
  assert.equal(await page.inputValue(field('price')), '14.14');

  await page.click('[data-act="spec.view"][data-arg="prices"]');
  await page.click('[data-act="spec.fillPrices"]');
  assert.equal(await page.textContent('#toast'), '1 price filled in from the price library.');
  assert.deepEqual(await rows(), [
    '1\tTrench\tm\t50\t14.14\t2\t10.00 – 20.00\t15.00\t14.14\t0 %',
    '2\tPaving\tm²\t0\t7.00\t1\t7.00\t7.00\t\t0 %',
  ]);
  assert.equal(await page.locator('[data-act="spec.fillPrices"]').count(), 0, 'nothing is left to fill in');
  await saved(page);

  // The master sees the prices of every project built from it.
  await page.click('.spec-bar .brand');
  await page.click('#masterList a');
  await page.waitForSelector('#specView:not([hidden])');
  await page.click('[data-act="spec.view"][data-arg="prices"]');
  assert.deepEqual(await rows(), [
    '1\tTrench\tm\t0\t—\t3\t10.00 – 20.00\t14.71\t\t',
    '2\tPaving\tm²\t0\t—\t2\t7.00\t7.00\t\t',
  ]);
  await page.click('#pricesPanel tbody tr >> nth=0');
  assert.equal(await page.inputValue(field('title')), 'Trench', 'a row opens its article');
  assert.deepEqual(page.errors, []);
});
