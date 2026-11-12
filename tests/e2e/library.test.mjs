import assert from 'node:assert/strict';
import { test } from 'node:test';
import { text, useApp, waitSaved } from './harness.mjs';

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
