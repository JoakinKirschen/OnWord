import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { useApp } from './harness.mjs';

const { openApp } = useApp();
const FIXTURES = new URL('../fixtures/', import.meta.url);
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const tree = (page) => page.locator('#articleTree .tree-item').allInnerTexts();
const rows = (page) => page.locator('#importList .import-item').allInnerTexts();
const saved = (page) => page.waitForFunction(() => document.querySelector('#specState').textContent === 'Saved');

/** Hands a fixture to the import, as choosing it in the file dialog does, and waits for the preview. */
async function choose(page, name, mimeType = DOCX) {
  const buffer = await readFile(new URL(name, FIXTURES));
  await page.setInputFiles('#articleInput', { name, mimeType, buffer });
  await page.waitForSelector('#importDlg[open]');
}

test("a master's articles come from a Word document, in the outline of its headings", async () => {
  const page = await openApp();
  page.on('dialog', (dialog) => dialog.accept('Standaard'));
  await page.click('#home .main-nav a[href="#/masters"]');
  await page.click('[data-act="spec.newMaster"]');
  await page.waitForSelector('#specView:not([hidden])');
  assert.ok(await page.isVisible('#specImport'));

  // Word's automatic heading numbers become the article numbers; the text under a heading its text.
  await choose(page, 'spec-autonumbered.docx');
  assert.match(await page.textContent('#importNote'), /^6 articles in “spec-autonumbered\.docx”/);
  assert.deepEqual(await rows(page), [
    '20 Grondwerken',
    '20.1 Uitgravingen',
    '20.1.1 Sleuven voor funderingen\nm³',
    '20.1.2 Putten\nst',
    '21 Bestrating',
    '21.1 Betonklinkers\nm²',
  ]);
  await page.uncheck('#importList .import-item:has-text("21 Bestrating") input');
  assert.equal(await page.isChecked('#importList .import-item:has-text("21.1") input'), false, 'with what is under it');
  await page.click('#importDlg .primary');
  await page.waitForSelector('#articleTree .tree-item');
  assert.deepEqual(await tree(page), [
    '20\nGrondwerken',
    '20.1\nUitgravingen',
    '20.1.1\nSleuven voor funderingen',
    '20.1.2\nPutten',
  ]);
  assert.equal(await page.inputValue('#articlePanel [data-field="title"]'), 'Grondwerken', 'the first is opened');
  await page.click('#articleTree .tree-item:has-text("Sleuven")');
  assert.equal(await page.inputValue('#articlePanel [data-field="unit"]'), 'm³');
  assert.equal(
    await page.innerHTML('#articleText'),
    '<p>Sleuven graven met verticale wanden.</p><p><b>Meeteenheid:</b> m³</p>' +
      '<ul><li>Breedte volgens plan</li><li>Diepte tot vaste grond</li></ul>',
  );

  // An older .doc of the same text adds what is new, under the articles already there.
  await choose(page, 'spec-numbered.doc', 'application/msword');
  assert.deepEqual(await page.locator('#importList input:checked').count(), 2);
  assert.match((await rows(page))[0], /^20 Grondwerken\s*already in the master$/);
  await page.click('#importDlg .primary');
  await page.waitForFunction(() => document.querySelectorAll('#articleTree .tree-item').length === 6);
  await saved(page);
  await page.reload();
  await page.waitForSelector('#articleTree .tree-item');
  assert.deepEqual((await tree(page)).slice(4), ['21\nBestrating', '21.1\nBetonklinkers']);
  await page.click('#articleTree .tree-item:has-text("Betonklinkers")');
  assert.equal(await page.inputValue('#articlePanel [data-field="unit"]'), 'm²');
  assert.equal(await page.innerText('#articleText'), 'Grijze betonklinkers, 22 x 11 x 8 cm.\n\nMeeteenheid: m2');

  // A file that is not a Word document says so.
  await page.setInputFiles('#articleInput', {
    name: 'notes.doc',
    mimeType: 'application/msword',
    buffer: Buffer.from('x'),
  });
  await page.waitForSelector('#toast:not([hidden])');
  assert.match(await page.textContent('#toast'), /“notes\.doc” could not be read/);
  assert.deepEqual(
    page.errors.filter((e) => !/Not a compound file/.test(e)),
    [],
  );
});

test('a project has no import from Word: its articles come from its master', async () => {
  const page = await openApp('#/');
  await page.click('[data-act="spec.newProject"]');
  await page.fill('#projectDlg [name=title]', 'School');
  await page.selectOption('#projectMaster', '');
  await page.click('#projectDlg .primary');
  await page.waitForSelector('#specView:not([hidden])');
  assert.ok(await page.isHidden('#specImport'));
  assert.deepEqual(page.errors, []);
});
