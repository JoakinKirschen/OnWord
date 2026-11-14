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
  const BODY = 'style="line-height: 1.32; margin-bottom: 10pt;"';
  const ITEM = 'style="line-height: 1.32;"';
  const CELL = 'style="border: none; padding: 0pt 5.4pt;"';
  const page = await openApp();
  await importDocx(page, 'Fixture.docx', await readFile(new URL('python-docx.docx', FIXTURES)));
  assert.equal(await page.inputValue('#title'), 'Fixture');
  assert.equal(
    await html(page),
    // python-docx's template: 1.15 lines and 10pt after each paragraph; tables without a style have no borders.
    '<h1>Fixture title</h1><h2>Section one</h2><h3>Sub section</h3>' +
      `<p ${BODY}>Plain <b>bold</b> <i>italic</i> <span style="color: #C0352B; font-size: 18pt">red big</span> &amp; &lt;escaped&gt;</p>` +
      '<p style="text-align: center; line-height: 1.32; margin-bottom: 10pt;">Centered</p>' +
      `<ul><li ${ITEM}>bullet one</li><li ${ITEM}>bullet two</li></ul><ol><li ${ITEM}>number one</li><li ${ITEM}>number two</li></ol>` +
      '<blockquote>A quotation</blockquote>' +
      `<table style="width: 100%;"><tbody><tr><td ${CELL}><p ${BODY}>a</p></td><td ${CELL}><p ${BODY}>b</p></td></tr>` +
      `<tr><td ${CELL}><p ${BODY}>c</p></td><td ${CELL}><p ${BODY}>d</p></td></tr></tbody></table>` +
      `<hr class="page-break"><p ${BODY}>After the break</p>`,
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
  const item = '<li style="line-height: 1.15; margin-top: 1.8pt; margin-bottom: 1.8pt; font-size: 12pt;">';
  assert.ok(
    result.includes(
      `<ul>${item}a<ul>${item}nested</li></ul></li>${item}b</li></ul><ol>${item}one</li>${item}two</li></ol>`,
    ),
  );
  assert.match(result, /<blockquote>quoted<\/blockquote>/);
  assert.match(result, /<pre>code line<\/pre>/);
  assert.deepEqual(page.errors, []);
});

test('imports a letter laid out like a Google Docs export: inherited styles, table geometry, header', async () => {
  const page = await openApp();
  await importDocx(page, 'Letter.docx', await readFile(new URL('styled-letter.docx', FIXTURES)));
  // Document defaults: Arial 9pt, justified, line spacing 260 (1.08 of Word's single line).
  const body = 'text-align: justify; line-height: 1.25; margin-bottom: 0pt';
  // In the table, the table style's single spacing and no space after.
  const inTable = 'style="text-align: justify; line-height: 1.15; margin-bottom: 0pt; font-size: 9pt;"';
  const expected =
    `<p style="${body};"><br></p>` + // empty, with every border switched off: not a horizontal line
    '<h2>Letter heading</h2>' +
    `<p style="${body}; font-size: 9pt;">Body text with <span style="color: #C0352B"><b>marked</b></span> and ` +
    '<span style="font-size: 14pt">larger</span></p>' +
    '<p style="line-height: 1.25; margin-left: 48px; margin-bottom: 6pt;">Indented</p>' + // style based on a style
    '<table style="width: 50%;"><colgroup><col style="width: 25.01%;"><col style="width: 74.99%;"></colgroup><tbody>' +
    '<tr><td style="border-top: none; border-left: none; border-bottom: none; padding: 0pt 5.75pt; background-color: #FFF2CC; vertical-align: middle;">' +
    `<p ${inTable}>☒ Done</p></td>` +
    `<td style="border: none; padding: 0pt;"><p ${inTable}>Wide</p></td></tr>` +
    `<tr><td style="border-top: none; border-left: none; border-bottom: none; padding: 0pt 5.75pt;"><p ${inTable}>☐ Open</p></td>` +
    '<td style="border-top: none; border-bottom: 1.5pt solid #1A55C9; border-right: none; padding: 0pt 5.75pt;">' +
    `<p ${inTable}><br></p></td></tr></tbody></table>` +
    `<p style="${body}; font-size: 9pt;">After the table</p>`;
  assert.equal(await html(page), expected);
  assert.equal(await page.textContent('#pageHeader'), 'Our reference A-123 2018-09-28', 'cells keep apart');

  // What was imported comes back the same after a trip through the editor's own .docx.
  const [download] = await Promise.all([page.waitForEvent('download'), menu(page, 'File', 'file.downloadDocx')]);
  await page.click('.doc-bar .brand');
  await page.waitForSelector('#home:not([hidden])');
  await importDocx(page, 'Again.docx', await readFile(await download.path()));
  assert.equal(await html(page), expected);
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
    '<table style="width: 80%;"><colgroup><col style="width: 30%;"><col style="width: 70%;"></colgroup><tbody>' +
    '<tr><td style="border: none; padding: 0pt 5pt; background-color: #FFF2CC; vertical-align: middle;">cell</td>' +
    '<td style="border-bottom: 1.5pt dashed #1A55C9;"><p style="font-size: 9pt;">small</p></td></tr></tbody></table>' +
    '<p style="line-height: 12pt; font-size: 14pt; font-family: Georgia;">Exact lines</p>' +
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
  await page.fill('#header-left', 'Draft & confidential');
  await page.fill('#header-right', 'v2');
  await page.fill('#footer-center', 'Page {page} of {pages}');
  await page.check('#firstPageOwn');
  await page.fill('#firstHeader-center', 'Cover');
  await page.click('#headerFooterDlg .primary');
  await page.waitForFunction(() => document.querySelector('#pageHeader').textContent === 'Cover');

  const [download] = await Promise.all([page.waitForEvent('download'), menu(page, 'File', 'file.downloadDocx')]);
  assert.equal(download.suggestedFilename(), 'Untitled document.docx');
  const file = await readFile(await download.path());
  assert.equal(file.subarray(0, 2).toString(), 'PK');

  await page.click('.doc-bar .brand');
  await page.waitForSelector('#home:not([hidden])');
  await importDocx(page, 'Round trip.docx', file);
  assert.equal(strip(await html(page)), strip(source));
  assert.deepEqual(await page.locator('#pageHeader span').allTextContents(), ['', 'Cover', '']);
  await menu(page, 'File', 'page.headerFooter');
  assert.deepEqual(
    await page.evaluate(() =>
      ['header-left', 'header-center', 'header-right', 'footer-center', 'firstHeader-center'].map(
        (id) => document.getElementById(id).value,
      ),
    ),
    ['Draft & confidential', '', 'v2', 'Page {page} of {pages}', 'Cover'],
  );
  assert.ok(await page.isChecked('#firstPageOwn'));
  await page.click('#headerFooterDlg [value="cancel"]');
  assert.equal(await page.textContent('#pageFooter'), '', 'the first page has its own, empty footer');
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
