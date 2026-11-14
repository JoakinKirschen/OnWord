import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { html, menu, useApp, waitSaved } from './harness.mjs';

const { openEditor } = useApp();
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Computed style properties of the first element matching `selector` in the document. */
const look = (page, selector) =>
  page.evaluate((s) => {
    const { color, fontFamily, fontSize, fontWeight, marginBottom } = getComputedStyle(
      document.querySelector('#editor ' + s),
    );
    return { color, fontFamily, fontSize, fontWeight, marginBottom };
  }, selector);

/** Clicks Apply in the Styles dialog and waits for the document's style sheet to change. */
async function apply(page) {
  const sheet = () => page.evaluate(() => document.querySelector('style[data-print="styles"]').textContent);
  const before = await sheet();
  await page.click('#stylesDlg .primary');
  await page.waitForFunction((old) => document.querySelector('style[data-print="styles"]').textContent !== old, before);
}

async function writeDocument(page) {
  await page.evaluate(() => {
    const editor = document.querySelector('#editor');
    editor.innerHTML = '<h2>Chapter</h2><p>Body text</p><h2>Second chapter</h2><blockquote><p>Quoted</p></blockquote>';
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
}

test('changing a style in the Styles dialog changes every paragraph with it, and is kept', async () => {
  const page = await openEditor();
  await writeDocument(page);
  await page.click('#editor h2');
  await menu(page, 'Format', 'format.styles');
  assert.equal(await page.inputValue('#styleId'), 'heading1'); // opens on the caret's style
  assert.equal(await page.inputValue('#styleSize'), '18');
  await page.fill('#styleSize', '22');
  await page.fill('#styleColor', '#1a55c9');
  await page.check('#styleBold');
  assert.equal(await page.evaluate(() => document.querySelector('#stylePreview').style.fontSize), '22pt');
  // Switching styles keeps what was changed so far.
  await page.selectOption('#styleId', 'normal');
  await page.fill('#styleFont', 'Georgia');
  await page.fill('#styleAfter', '14');
  await apply(page);

  const expected = { color: 'rgb(26, 85, 201)', fontFamily: 'Georgia', fontSize: '29.3333px', fontWeight: '700' };
  for (const heading of ['h2', 'h2 ~ h2']) {
    const { color, fontFamily, fontSize, fontWeight } = await look(page, heading);
    assert.deepEqual({ color, fontFamily, fontSize, fontWeight }, expected);
  }
  assert.equal((await look(page, 'p')).marginBottom, '18.6667px');
  assert.doesNotMatch(await html(page), /style=/); // the paragraphs themselves are unchanged

  await waitSaved(page);
  await page.reload();
  await page.waitForSelector('#editorView:not([hidden])');
  assert.equal((await look(page, 'h2')).color, 'rgb(26, 85, 201)');

  await menu(page, 'Format', 'format.styles');
  await page.selectOption('#styleId', 'heading1');
  await page.click('[data-act="format.styleReset"]');
  assert.equal(await page.inputValue('#styleSize'), '18');
  await apply(page);
  assert.equal((await look(page, 'h2')).fontSize, '24px');
  assert.equal((await look(page, 'h2')).fontFamily, 'Georgia'); // still Normal text's font
  assert.deepEqual(page.errors, []);
});

test('a style can be updated to match the selected text', async () => {
  const page = await openEditor();
  await writeDocument(page);
  await page.evaluate(() => {
    const heading = document.querySelector('#editor h2');
    heading.innerHTML = '<span style="color: rgb(192, 53, 43); font-size: 20pt">Chapter</span>';
    heading.style.marginBottom = '2pt';
  });
  await page.click('#editor h2 span');
  await menu(page, 'Format', 'format.updateStyle');
  assert.match(await page.textContent('#toast'), /Heading 1/);
  const second = await look(page, 'h2 ~ h2');
  assert.equal(second.color, 'rgb(192, 53, 43)');
  assert.equal(second.fontSize, '26.6667px');
  assert.equal(second.marginBottom, '2.66667px');
  assert.equal((await look(page, 'p')).color, 'rgb(0, 0, 0)'); // other styles keep their look
  assert.deepEqual(page.errors, []);
});

test('styles travel with Word and HTML downloads', async () => {
  const page = await openEditor();
  await writeDocument(page);
  await page.click('#editor h2');
  await menu(page, 'Format', 'format.styles');
  await page.fill('#styleColor', '#27ae60');
  await page.fill('#styleSize', '20');
  await page.selectOption('#styleId', 'quote');
  await page.check('#styleItalic');
  await apply(page);

  const [web] = await Promise.all([page.waitForEvent('download'), menu(page, 'File', 'file.downloadHtml')]);
  assert.match(await readFile(await web.path(), 'utf8'), /body h2\{font-size:20pt;color:#27ae60\}/);

  const [word] = await Promise.all([page.waitForEvent('download'), menu(page, 'File', 'file.downloadDocx')]);
  const file = await readFile(await word.path());
  await page.click('.doc-bar .brand');
  await page.waitForSelector('#home:not([hidden])');
  await page.setInputFiles('#importInput', { name: 'Styled.docx', mimeType: DOCX, buffer: file });
  await page.waitForSelector('#editorView:not([hidden])');
  assert.deepEqual(
    await page.evaluate(() => {
      const id = location.hash.split('/').pop();
      return JSON.parse(localStorage.getItem('onword:index')).find((d) => d.id === id).styles;
    }),
    { heading1: { color: '#27ae60', size: 20 }, quote: { italic: true } },
  );
  assert.equal((await look(page, 'h2')).color, 'rgb(39, 174, 96)');
  assert.deepEqual(page.errors, []);
});
