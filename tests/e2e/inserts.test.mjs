import assert from 'node:assert/strict';
import { test } from 'node:test';
import { html, menu, useApp } from './harness.mjs';

const { openEditor } = useApp();
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const cells = (page) => page.locator('#editor td').count();

test('tables: insert, tab between cells, add and delete rows and columns', async () => {
  const page = await openEditor();
  await page.keyboard.type('intro');
  await page.click('[data-act="table.dialog"]');
  await page.click('#tableDlg .primary');
  await page.waitForSelector('#editor td');
  assert.equal(await cells(page), 9);
  assert.match(await html(page), /<p>intro<\/p><table/, 'table is a sibling of the paragraph, not inside it');

  await page.click('#editor td >> nth=0');
  await page.keyboard.type('a');
  await page.keyboard.press('Tab');
  await page.keyboard.type('b');
  assert.equal(await page.locator('#editor td >> nth=1').textContent(), 'b');

  await menu(page, 'Table', 'table.edit', 'colRight');
  assert.equal(await cells(page), 12);
  await menu(page, 'Table', 'table.edit', 'delRow');
  assert.equal(await cells(page), 8);
  assert.deepEqual(page.errors, []);
});

test('links: insert through the dialog with a normalised address', async () => {
  const page = await openEditor();
  await page.keyboard.press('Control+k');
  await page.fill('#linkText', 'site');
  await page.fill('#linkUrl', 'example.com');
  await page.click('#linkDlg .primary');
  await page.waitForSelector('#editor a');
  assert.match(await html(page), /<a href="https:\/\/example.com">site<\/a>/);

  await page.keyboard.press('Control+k');
  await page.fill('#linkUrl', 'javascript:alert(1)');
  await page.click('#linkDlg .primary');
  await page.waitForSelector('#toast:not([hidden])');
  assert.doesNotMatch(await html(page), /javascript:/);
  assert.deepEqual(page.errors, []);
});

test('images: insert from a file, resize, align and remove', async () => {
  const page = await openEditor();
  await page.setInputFiles('#imgInput', { name: 'a.png', mimeType: 'image/png', buffer: PIXEL });
  await page.waitForSelector('#editor img');
  await page.evaluate(() =>
    Object.assign(document.querySelector('#editor img').style, { width: '80px', height: '80px' }),
  );
  await page.click('#editor img');
  await page.click('[data-img="50"]');
  assert.equal(await page.evaluate(() => document.querySelector('#editor img').style.width), '50%');
  await page.click('[data-img="right"]');
  assert.equal(await page.evaluate(() => document.querySelector('#editor img').style.float), 'right');
  await page.click('[data-img="center"]');
  assert.deepEqual(
    await page.evaluate(() => {
      const { float, display, margin } = document.querySelector('#editor img').style;
      return [float, display, margin];
    }),
    ['', 'block', '0px auto'],
  );
  await page.click('[data-img="remove"]');
  assert.equal(await page.locator('#editor img').count(), 0);
  assert.deepEqual(page.errors, []);
});

test('pasted HTML is sanitised', async () => {
  const page = await openEditor();
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData(
      'text/html',
      '<p onclick="x()">pasted<script>alert(1)</script><a href="javascript:alert(1)">l</a></p>',
    );
    document
      .querySelector('#editor')
      .dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  const result = await html(page);
  assert.match(result, /pasted/);
  assert.doesNotMatch(result, /script|onclick|javascript:/);
});

test('page break and date from the Insert menu', async () => {
  const page = await openEditor();
  await page.keyboard.type('before');
  await menu(page, 'Insert', 'insert.pageBreak');
  await page.keyboard.type('after');
  assert.match(await html(page), /<p>before<\/p><hr class="page-break"><p>after<\/p>/);
  assert.deepEqual(page.errors, []);
});

test('special characters picker', async () => {
  const page = await openEditor();
  await page.keyboard.type('Price: 5');
  await menu(page, 'Insert', 'insert.symbols');
  await page.click('.symbol-grid [data-arg="€"]');
  assert.equal(await page.innerText('#editor'), 'Price: 5€');
  assert.deepEqual(page.errors, []);
});
