import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { html, menu, text, useApp, waitSaved } from './harness.mjs';

const { openEditor } = useApp();

async function downloadFrom(page, command) {
  const [download] = await Promise.all([page.waitForEvent('download'), menu(page, 'File', command)]);
  return { name: download.suggestedFilename(), body: await readFile(await download.path(), 'utf8') };
}

test('find and replace', async () => {
  const page = await openEditor();
  await page.keyboard.type('foo and Foo and foo');
  await page.keyboard.press('Control+f');
  await page.fill('#findInput', 'foo');
  assert.equal(await page.textContent('#findCount'), '1 of 3');
  await page.check('#findCase');
  assert.equal(await page.textContent('#findCount'), '1 of 2');
  await page.fill('#replaceInput', 'bar');
  await page.click('[data-act="find.replace"]');
  assert.equal(await text(page), 'bar and Foo and foo');
  assert.equal(await page.textContent('#findCount'), '1 of 1');
  await page.uncheck('#findCase');
  await page.click('[data-act="find.replaceAll"]');
  assert.equal(await text(page), 'bar and bar and bar');
  assert.deepEqual(page.errors, []);
});

test('word count and autosave survive a reload', async () => {
  const page = await openEditor();
  await page.fill('#title', 'My Report');
  await page.click('#editor');
  await page.keyboard.type('one two three');
  assert.match(await page.textContent('#counts'), /^3 words · 13 characters/);
  await waitSaved(page);
  await page.reload();
  assert.equal(await text(page), 'one two three');
  assert.equal(await page.inputValue('#title'), 'My Report');
});

test('downloads: HTML and Markdown', async () => {
  const page = await openEditor();
  await page.fill('#title', 'Notes: draft');
  await page.click('#editor');
  await page.keyboard.type('# Title');
  await page.keyboard.press('Enter');
  await page.keyboard.type('plain ');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('bold');
  await page.keyboard.press('Control+b');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('two');

  const web = await downloadFrom(page, 'file.downloadHtml');
  assert.equal(web.name, 'Notes draft.html');
  assert.match(web.body, /<title>Notes: draft<\/title>/);
  assert.match(web.body, /<h1[^>]*>Title<\/h1>/);

  const md = await downloadFrom(page, 'file.downloadMarkdown');
  assert.equal(md.name, 'Notes draft.md');
  assert.equal(md.body, '# Title\n\nplain **bold**\n\n- one\n- two\n');
  assert.deepEqual(page.errors, []);
});

test('outline lists headings and can be hidden', async () => {
  const page = await openEditor();
  await page.keyboard.type('# Intro');
  await page.keyboard.press('Enter');
  await page.keyboard.type('body');
  await page.keyboard.press('Enter');
  await page.keyboard.type('## Details');
  assert.deepEqual(await page.locator('#outlineList button').allTextContents(), ['Intro', 'Details']);
  await menu(page, 'View', 'view.outline');
  assert.ok(await page.isHidden('#outline'));
  await page.reload();
  assert.ok(await page.isHidden('#outline'), 'visibility is remembered');
});

test('page setup changes the paper and is stored with the document', async () => {
  const page = await openEditor();
  const pageWidth = () => page.evaluate(() => document.querySelector('#paper').style.getPropertyValue('--page-w'));
  assert.equal(await page.evaluate(() => document.querySelector('#paper').getBoundingClientRect().width), 816);
  await menu(page, 'File', 'page.setup');
  await page.selectOption('#pageSize', 'a4');
  await page.selectOption('#pageOrientation', 'landscape');
  await page.selectOption('#pageMargin', 'narrow');
  await page.click('#pageDlg .primary');
  await page.waitForFunction(() => document.querySelector('#paper').style.getPropertyValue('--page-w') === '1123px');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#editor')).paddingLeft), '48px');
  assert.match(
    await page.evaluate(() => document.querySelector('#editorView style').textContent),
    /size: A4 landscape; margin: 0.5in/,
  );
  await page.reload();
  assert.equal(await pageWidth(), '1123px');
  assert.deepEqual(page.errors, []);
});

test('version history: save and restore', async () => {
  const page = await openEditor();
  await page.keyboard.type('first draft');
  await menu(page, 'File', 'history.open');
  await page.click('#historyDlg [data-act="history.save"]');
  assert.equal(await page.locator('#versionList [data-act="history.restore"]').count(), 1);
  await page.click('#historyDlg .primary');

  await page.click('#editor');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('rewritten');
  assert.equal(await text(page), 'rewritten');
  await menu(page, 'File', 'history.open');
  await page.click('#versionList [data-act="history.restore"] >> nth=-1');
  assert.equal(await text(page), 'first draft');
  await menu(page, 'File', 'history.open');
  assert.equal(await page.locator('#versionList li').count(), 2, 'the replaced text was kept as a version');
  assert.match(await html(page), /first draft/);
  assert.deepEqual(page.errors, []);
});
