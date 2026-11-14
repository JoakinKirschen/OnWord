import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { menu, text, useApp, waitSaved } from './harness.mjs';

const { openApp } = useApp();
const cards = (page) => page.locator('.card').count();

test('library: create, list, copy, rename, search, delete', async () => {
  const page = await openApp();
  page.on('dialog', (dialog) => dialog.accept('Renamed'));
  assert.ok(await page.isVisible('#empty'));

  await page.click('[data-act="library.new"]');
  await page.waitForSelector('#editorView:not([hidden])');
  await page.fill('#title', 'My Report');
  await page.click('#editor');
  await page.keyboard.type('quarterly numbers');
  await waitSaved(page);
  await page.click('.doc-bar .brand');
  await page.waitForSelector('#home:not([hidden])');
  assert.equal(await page.textContent('.card-title'), 'My Report');
  assert.match(await page.textContent('.thumb-page'), /quarterly numbers/);

  await page.click('.card-more');
  await page.click('.pop [data-act="library.copy"]');
  assert.equal(await cards(page), 2);
  await page.click('.card-more >> nth=0');
  await page.click('.pop [data-act="library.rename"]');
  assert.equal(await page.textContent('.card-title >> nth=0'), 'Renamed');

  await page.fill('#search', 'zzz');
  assert.equal(await cards(page), 0);
  await page.fill('#search', 'quarterly');
  assert.equal(await cards(page), 2);
  await page.fill('#search', '');

  await page.click('.card-more >> nth=0');
  await page.click('.pop [data-act="library.delete"]');
  assert.equal(await cards(page), 1);
  assert.deepEqual(page.errors, []);
});

test('library: import a text file and switch theme', async () => {
  const page = await openApp();
  await page.setInputFiles('#importInput', {
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('line one\nline <two>'),
  });
  await page.waitForSelector('#editorView:not([hidden])');
  assert.equal(await page.inputValue('#title'), 'notes');
  assert.equal(await text(page), 'line one\n\nline <two>');

  await page.click('.doc-bar .brand');
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.click('[data-act="app.theme"]');
  await page.reload();
  assert.notEqual(await page.evaluate(() => document.documentElement.dataset.theme), before);
  assert.deepEqual(page.errors, []);
});

test('an unknown document address falls back to the library', async () => {
  const page = await openApp();
  await page.goto(page.url() + '#/d/missing');
  await page.waitForSelector('#home:not([hidden])');
  assert.equal(new URL(page.url()).hash, '#/');
});

test('templates create a pre-filled document', async () => {
  const page = await openApp();
  assert.equal(await page.textContent('.template-band h2'), 'Start a new document', 'a section of their own');
  assert.ok(
    await page.evaluate(
      () =>
        document.querySelector('.template-band').getBoundingClientRect().bottom <=
        document.querySelector('.home-head').getBoundingClientRect().top,
    ),
    'above the documents',
  );
  assert.deepEqual(await page.locator('.template-name').allTextContents(), [
    'Blank',
    'Letter',
    'Meeting notes',
    'Résumé',
    'Project brief',
    'New template',
  ]);
  await page.click('.template[data-arg="meeting"]');
  await page.waitForSelector('#editorView:not([hidden])');
  assert.equal(await page.inputValue('#title'), 'Meeting notes');
  assert.equal(await page.locator('#editor ul.checklist > li').count(), 2);
  assert.deepEqual(await page.locator('#outlineList button').allTextContents(), [
    'Meeting notes',
    'Agenda',
    'Notes',
    'Action items',
  ]);
  assert.deepEqual(page.errors, []);
});

const goHome = async (page, { changed = true } = {}) => {
  if (changed) await waitSaved(page);
  await page.click('.doc-bar .brand');
  await page.waitForSelector('#home:not([hidden])');
};
const templateNames = (page) => page.locator('.template-item .template-name').allTextContents();
/** Opens the options of the template named `name` and picks `command`. */
async function templateMenu(page, name, command) {
  await page.locator('.template-item', { hasText: name }).hover();
  await page.locator('.template-item', { hasText: name }).locator('.template-more').click();
  await page.click(`.pop [data-act="${command}"]`);
}

test('templates of your own: create, use, edit, rename, delete', async () => {
  const page = await openApp();
  page.on('dialog', (dialog) => dialog.accept(dialog.type() === 'prompt' ? 'Invoice' : undefined));

  await page.click('[data-act="library.newTemplate"]');
  await page.waitForSelector('#editorView:not([hidden])');
  assert.ok(await page.isVisible('#templateBadge'), 'the editor says it is a template');
  await page.fill('#title', 'Site report');
  await page.click('#editor');
  await page.keyboard.type('Weather and attendees');
  await goHome(page);
  assert.deepEqual((await templateNames(page)).slice(5), ['Site report']);
  assert.match(await page.textContent('.template-item:nth-child(6) .template-page'), /Weather and attendees/);
  assert.equal(await page.locator('.card').count(), 0, 'templates are not listed with the documents');

  await page.click('.template-item:nth-child(6) .template');
  await page.waitForSelector('#editorView:not([hidden])');
  assert.ok(await page.isHidden('#templateBadge'), 'a document made from it is an ordinary document');
  assert.equal(await page.inputValue('#title'), 'Site report');
  assert.equal(await text(page), 'Weather and attendees');
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' today');
  await goHome(page);
  assert.equal(await page.locator('.card').count(), 1);

  await templateMenu(page, 'Site report', 'library.open');
  await page.waitForSelector('#editorView:not([hidden])');
  assert.equal(await text(page), 'Weather and attendees', 'the template did not change with the document');
  await page.click('#editor');
  await page.keyboard.press('Control+End');
  await page.keyboard.type(', and photos');
  await goHome(page);
  await page.click('.template-item:nth-child(6) .template');
  await page.waitForSelector('#editorView:not([hidden])');
  assert.equal(await text(page), 'Weather and attendees, and photos', 'new documents follow the edited template');
  await goHome(page, { changed: false });

  await templateMenu(page, 'Site report', 'library.rename');
  assert.deepEqual((await templateNames(page)).slice(5), ['Invoice']);
  await templateMenu(page, 'Invoice', 'library.delete');
  assert.deepEqual((await templateNames(page)).slice(5), []);
  assert.equal(await page.locator('.card').count(), 2, 'documents made from it stay');
  assert.deepEqual(page.errors, []);
});

test('templates from a built-in one and from a document', async () => {
  const page = await openApp();
  await templateMenu(page, 'Letter', 'library.customise');
  await page.waitForSelector('#editorView:not([hidden])');
  assert.ok(await page.isVisible('#templateBadge'));
  assert.equal(await page.inputValue('#title'), 'Letter');
  await page.click('#editor');
  await page.keyboard.press('Control+Home');
  await page.keyboard.type('ACME Ltd. ');
  await goHome(page);
  assert.deepEqual(await templateNames(page), [
    'Blank',
    'Letter',
    'Meeting notes',
    'Résumé',
    'Project brief',
    'Letter',
  ]);
  assert.ok(await page.isHidden('.template-item:nth-child(1) .template-more'), 'Blank has no options');

  await page.click('.template[data-arg="brief"]');
  await page.waitForSelector('#editorView:not([hidden])');
  await page.fill('#title', 'Bridge');
  await menu(page, 'File', 'file.saveAsTemplate');
  assert.match(await page.textContent('#toast'), /“Bridge” is now also a template/);
  assert.ok(await page.isHidden('#templateBadge'), 'the document itself stays a document');
  await goHome(page);
  assert.deepEqual((await templateNames(page)).slice(5), ['Bridge', 'Letter']);
  assert.match(await page.textContent('.template-item:nth-child(7) .template-page'), /^ACME Ltd\. /);

  await page.click('.card-more');
  await page.click('.pop [data-act="library.saveAsTemplate"]');
  assert.deepEqual((await templateNames(page)).slice(5), ['Bridge', 'Bridge', 'Letter']);
  assert.equal(await page.locator('.card').count(), 1);
  assert.deepEqual(page.errors, []);
});

test('backup downloads every document and restores into another browser', async () => {
  const page = await openApp();
  await page.click('[data-act="library.backup"]');
  assert.match(await page.textContent('#toast'), /no documents/);

  for (const template of ['letter', 'brief']) {
    await page.click(`.template[data-arg="${template}"]`);
    await page.waitForSelector('#editorView:not([hidden])');
    await page.click('.doc-bar .brand');
    await page.waitForSelector('#home:not([hidden])');
  }
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="library.backup"]')]);
  assert.match(download.suggestedFilename(), /^onword-backup-\d{4}-\d{2}-\d{2}\.json$/);

  const other = await openApp();
  const backup = {
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: await readFile(await download.path()),
  };
  await other.setInputFiles('#importInput', backup);
  await other.waitForSelector('.card');
  assert.deepEqual((await other.locator('.card-title').allTextContents()).sort(), ['Letter', 'Project brief']);
  assert.match(await other.textContent('#toast'), /Restored 2 documents/);
  await other.click('.card >> nth=0');
  await other.waitForSelector('#editorView:not([hidden])');
  assert.ok((await text(other)).length > 50, 'content was restored');
  await other.click('.doc-bar .brand');
  await other.click('[data-act="library.newTemplate"]');
  await other.waitForSelector('#editorView:not([hidden])');
  await other.fill('#title', 'Kept template');
  await goHome(other);
  const [again] = await Promise.all([other.waitForEvent('download'), other.click('[data-act="library.backup"]')]);
  const third = await openApp();
  await third.setInputFiles('#importInput', { ...backup, buffer: await readFile(await again.path()) });
  await third.waitForSelector('.card');
  assert.deepEqual((await templateNames(third)).slice(5), ['Kept template'], 'templates stay templates');
  assert.deepEqual([...page.errors, ...other.errors, ...third.errors], []);
});
