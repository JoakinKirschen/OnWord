import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { html, menu, text, useApp } from './harness.mjs';

const { openApp, openEditor } = useApp();
const FIXTURES = new URL('../fixtures/', import.meta.url);
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
/** Shortens embedded images and drops the attribute the editor puts on generated footnote numbers. */
const strip = (value) => value.replace(/base64,[^"]+/g, 'base64,…').replaceAll(' contenteditable="false"', '');

/** Imports a .docx through the file picker and waits for the editor to open. */
async function importDocx(page, name, buffer) {
  await page.setInputFiles('#importInput', { name, mimeType: DOCX, buffer });
  await page.waitForSelector('#editorView:not([hidden])');
}

test('imports a document written by python-docx', async () => {
  const page = await openApp();
  await importDocx(page, 'Fixture.docx', await readFile(new URL('python-docx.docx', FIXTURES)));
  assert.equal(await page.inputValue('#title'), 'Fixture');
  assert.equal(
    await html(page),
    '<h1>Fixture title</h1><h2>Section one</h2><h3>Sub section</h3>' +
      '<p>Plain <b>bold</b> <i>italic</i> <span style="color: #C0352B; font-size: 18pt">red big</span> &amp; &lt;escaped&gt;</p>' +
      '<p style="text-align: center;">Centered</p>' +
      '<ul><li>bullet one</li><li>bullet two</li></ul><ol><li>number one</li><li>number two</li></ol>' +
      '<blockquote>A quotation</blockquote>' +
      '<table style="width: 100%;"><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>' +
      '<hr class="page-break"><p>After the break</p>',
  );
  assert.equal(await page.evaluate(() => document.querySelector('#sheet').style.getPropertyValue('--page-w')), '794px');
  assert.deepEqual(page.errors, []);
});

test('imports a document written by pandoc (nested lists, links, code)', async () => {
  const page = await openApp();
  await importDocx(page, 'pandoc.docx', await readFile(new URL('pandoc.docx', FIXTURES)));
  const result = await html(page);
  assert.match(result, /<h2>Pandoc title<\/h2>/);
  assert.match(result, /Some <i>emphasis<\/i>, <b>strong<\/b> and a <a href="https:\/\/example.org">link<\/a>\./);
  assert.match(
    result,
    /<ul><li>a<ul><li>nested<\/li><\/ul><\/li><li>b<\/li><\/ul><ol><li>one<\/li><li>two<\/li><\/ol>/,
  );
  assert.match(result, /<blockquote>quoted<\/blockquote>/);
  assert.match(result, /<pre>code line<\/pre>/);
  assert.deepEqual(page.errors, []);
});

test('a document survives export to .docx and re-import', async () => {
  const page = await openEditor();
  const source =
    '<h1>Report</h1><p class="subtitle">A subtitle</p><h2>Summary</h2><h5>Fine print</h5>' +
    '<p style="margin-left: 48px; margin-right: 24px; text-indent: -24px; margin-top: 6pt; margin-bottom: 12pt;">Indented</p>' +
    '<p>Plain <b>bold</b> <i>italic</i> <u>under</u> <s>gone</s> x<sup>2</sup> ' +
    '<span style="color: #C0352B; font-size: 18pt; font-family: Georgia">styled</span> ' +
    '<span style="background-color: #F1C40F">marked</span> <a href="https://example.com/?a=1&amp;b=2">a link</a></p>' +
    '<p style="text-align: center; line-height: 2;">Centred</p>' +
    '<ul><li>one</li><li>two<ul><li>nested</li></ul></li></ul><ol><li>first</li></ol><p>between</p><ol><li>restart</li></ol>' +
    '<ul class="checklist"><li class="checked">done</li><li>todo</li></ul>' +
    '<blockquote>A quote</blockquote><pre>line 1<br>  line 2</pre>' +
    '<table style="width: 100%;"><tbody><tr><td>a</td><td><b>b</b></td></tr></tbody></table>' +
    '<table style="width: 100%;"><tbody><tr><td colspan="2">wide</td><td rowspan="2">tall</td></tr><tr><td>x</td><td>y</td></tr></tbody></table>' +
    '<p>Noted<sup class="fn-ref" id="fnref-n1">1</sup> and <span class="comment" title="Check this" data-author="Ada" data-date="2026-03-04T05:06:07Z">commented</span>, ' +
    '<ins data-author="Bo" data-date="2026-03-04T05:06:07Z">added</ins><del data-author="Bo" data-date="2026-03-04T05:06:07Z">removed</del>.</p>' +
    '<p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" alt="dot" style="width: 40px; height: auto;"></p>' +
    '<hr><p>before</p><hr class="page-break"><p>after &amp; &lt;end&gt;</p>' +
    '<ol class="footnotes"><li id="fn-n1">The <b>note</b> text</li></ol>';
  await page.evaluate((value) => {
    const editor = document.querySelector('#editor');
    editor.innerHTML = value;
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }, source);
  await menu(page, 'File', 'page.setup');
  await page.selectOption('#pageSize', 'a4');
  await page.selectOption('#pageOrientation', 'landscape');
  await page.selectOption('#pageColumns', '2');
  await page.click('#pageDlg .primary');
  await menu(page, 'File', 'page.headerFooter');
  await page.fill('#headerText', 'Draft & confidential');
  await page.selectOption('#headerAlign', 'left');
  await page.fill('#footerText', 'Page {page} of {pages}');
  await page.click('#headerFooterDlg .primary');
  await page.waitForFunction(() => document.querySelector('#pageFooter').textContent !== '');

  const [download] = await Promise.all([page.waitForEvent('download'), menu(page, 'File', 'file.downloadDocx')]);
  assert.equal(download.suggestedFilename(), 'Untitled document.docx');
  const file = await readFile(await download.path());
  assert.equal(file.subarray(0, 2).toString(), 'PK');

  await page.click('.doc-bar .brand');
  await page.waitForSelector('#home:not([hidden])');
  await importDocx(page, 'Round trip.docx', file);
  assert.equal(strip(await html(page)), strip(source));
  assert.equal(await page.textContent('#pageHeader'), 'Draft & confidential');
  assert.equal(await page.evaluate(() => document.querySelector('#pageHeader').style.textAlign), 'left');
  assert.match(await page.textContent('#pageFooter'), /^Page 1 of \d+$/);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#editor')).columnCount), '2');
  assert.equal(
    await page.evaluate(() => document.querySelector('#sheet').style.getPropertyValue('--page-w')),
    '1123px',
  );
  assert.deepEqual(page.errors, []);
});

test('a file that is not a Word document is reported, not opened', async () => {
  const page = await openApp();
  await page.setInputFiles('#importInput', { name: 'broken.docx', mimeType: DOCX, buffer: Buffer.from('not a zip') });
  await page.waitForSelector('#toast:not([hidden])');
  assert.match(await page.textContent('#toast'), /broken\.docx.*could not be read/);
  assert.ok(await page.isVisible('#home'));
  assert.equal(await text(page), '');
});
