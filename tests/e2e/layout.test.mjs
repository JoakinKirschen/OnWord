import assert from 'node:assert/strict';
import { test } from 'node:test';
import { html, menu, useApp, waitSaved } from './harness.mjs';

const { openEditor } = useApp();
const firstStyle = (page) => page.evaluate(() => document.querySelector('#editor > *').getAttribute('style'));
const markerX = async (page, name) => {
  const box = await page.locator(`[data-marker="${name}"]`).boundingBox();
  return box.x + box.width / 2;
};
/** Drags a ruler marker horizontally by `dx` pixels. */
async function dragMarker(page, name, dx) {
  const box = await page.locator(`[data-marker="${name}"]`).boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, y, { steps: 4 });
  await page.mouse.up();
}

test('ruler markers set the indents of the current paragraph', async () => {
  const page = await openEditor();
  await page.keyboard.type('An indented paragraph');
  const paperLeft = (await page.locator('#paper').boundingBox()).x;
  assert.equal(await markerX(page, 'left'), paperLeft + 96, 'left marker starts at the page margin');

  await dragMarker(page, 'left', 48);
  assert.equal(await firstStyle(page), 'margin-left: 48px;');
  await dragMarker(page, 'firstLine', 24);
  assert.equal(await firstStyle(page), 'margin-left: 48px; text-indent: 24px;');
  await dragMarker(page, 'right', -96);
  assert.equal(await firstStyle(page), 'margin-left: 48px; text-indent: 24px; margin-right: 96px;');
  assert.equal(await markerX(page, 'firstLine'), paperLeft + 96 + 48 + 24, 'markers follow the paragraph');

  await dragMarker(page, 'left', -500);
  assert.match(await firstStyle(page), /^text-indent: 24px; margin-right: 96px;$/, 'indent cannot go past the margin');

  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await menu(page, 'View', 'view.ruler');
  assert.ok(await page.isHidden('#ruler'));
  assert.deepEqual(page.errors, []);
});

test('indent buttons move paragraphs and nest list items', async () => {
  const page = await openEditor();
  await page.keyboard.type('para');
  await page.click('[data-act="format.indent"]:not([data-arg])');
  await page.click('[data-act="format.indent"]:not([data-arg])');
  assert.equal(await html(page), '<p style="margin-left: 96px;">para</p>');
  await page.click('[data-act="format.indent"][data-arg="out"]');
  await page.click('[data-act="format.indent"][data-arg="out"]');
  await page.click('[data-act="format.indent"][data-arg="out"]');
  assert.equal(await html(page), '<p style="">para</p>');

  await page.keyboard.press('Enter');
  await page.keyboard.type('- one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('two');
  await page.click('[data-act="format.indent"]:not([data-arg])');
  assert.match(await html(page), /<ul><li>one<\/li><ul><li>two<\/li><\/ul><\/ul>/);
  assert.deepEqual(page.errors, []);
});

test('paragraph dialog sets alignment, indents and spacing', async () => {
  const page = await openEditor();
  await page.keyboard.type('Body text');
  await menu(page, 'Format', 'format.paragraph');
  await page.selectOption('#paraAlign', 'justify');
  await page.fill('#paraLeft', '0.5');
  await page.selectOption('#paraSpecial', 'hanging');
  await page.fill('#paraBy', '0.25');
  await page.selectOption('#paraLine', '2');
  await page.fill('#paraBefore', '6');
  await page.fill('#paraAfter', '12');
  await page.click('#paragraphDlg .primary');
  await page.waitForFunction(() => document.querySelector('#editor > p').style.textAlign === 'justify');
  assert.deepEqual(
    await page.evaluate(() => {
      const { marginLeft, textIndent, marginRight, lineHeight, marginTop, marginBottom } =
        document.querySelector('#editor > p').style;
      return { marginLeft, textIndent, marginRight, lineHeight, marginTop, marginBottom };
    }),
    {
      marginLeft: '72px',
      textIndent: '-24px',
      marginRight: '',
      lineHeight: '2',
      marginTop: '6pt',
      marginBottom: '12pt',
    },
  );

  await menu(page, 'Format', 'format.paragraph');
  assert.deepEqual(
    [await page.inputValue('#paraLeft'), await page.inputValue('#paraSpecial'), await page.inputValue('#paraBy')],
    ['0.5', 'hanging', '0.25'],
    'the dialog shows what was applied',
  );
  assert.deepEqual(page.errors, []);
});

test('header, footer and page numbers', async () => {
  const page = await openEditor();
  await page.keyboard.type('content');
  await page.dblclick('#pageHeader');
  await page.fill('#headerText', 'Annual "report"');
  await page.selectOption('#headerAlign', 'right');
  await page.click('[data-act="page.numberFooter"]');
  assert.equal(await page.inputValue('#footerText'), 'Page {page} of {pages}');
  await page.click('#headerFooterDlg .primary');
  await page.waitForFunction(() => document.querySelector('#pageHeader').textContent === 'Annual "report"');
  assert.equal(await page.textContent('#pageFooter'), 'Page 1 of 1');
  assert.equal(await page.evaluate(() => document.querySelector('#pageHeader').style.textAlign), 'right');
  assert.equal(
    await page.evaluate(() => document.querySelector('style[data-print="running"]').textContent.replace(/\s+/g, ' ')),
    '@page { @top-right { content: "Annual \\"report\\""; font: 9pt Arial, Helvetica, sans-serif; color: #555; } ' +
      '@bottom-center { content: "Page " counter(page) " of " counter(pages); font: 9pt Arial, Helvetica, sans-serif; color: #555; } }',
  );

  await page.reload();
  assert.equal(await page.textContent('#pageHeader'), 'Annual "report"', 'stored with the document');
  await menu(page, 'File', 'page.setup');
  await page.selectOption('#pageMargin', 'narrow');
  await page.click('#pageDlg .primary');
  await page.waitForFunction(() => document.querySelector('#sheet').style.getPropertyValue('--page-margin') === '48px');
  assert.equal(await page.textContent('#pageFooter'), 'Page 1 of 1', 'page setup keeps the header and footer');
  assert.deepEqual(page.errors, []);
});

test('Insert → Page numbers adds numbering once', async () => {
  const page = await openEditor();
  await menu(page, 'Insert', 'page.numbers');
  assert.equal(await page.textContent('#pageFooter'), 'Page 1 of 1');
  await menu(page, 'Insert', 'page.numbers');
  assert.match(await page.textContent('#toast'), /already/);
  assert.equal(await page.textContent('#pageFooter'), 'Page 1 of 1');
});

test('page count follows the content and the page size', async () => {
  const page = await openEditor();
  assert.match(await page.textContent('#counts'), /^1 page · /);
  await page.keyboard.type('line');
  for (let i = 0; i < 45; i++) await page.keyboard.press('Enter');
  await page.keyboard.type('end');
  assert.match(await page.textContent('#counts'), /^2 pages · /);
  await waitSaved(page);
  await page.reload();
  assert.match(await page.textContent('#counts'), /^2 pages · /, 'measured correctly when a document opens');
  assert.equal(await page.locator('#rulerScale span').count(), 6, 'the ruler is numbered for 6.5 inches of text');
  await page.click('#editor');
  await page.keyboard.press('Control+Enter');
  assert.match(await html(page), /<hr class="page-break">/, 'Ctrl+Enter inserts a page break');
  assert.deepEqual(page.errors, []);
});

test('columns', async () => {
  const page = await openEditor();
  await menu(page, 'File', 'page.setup');
  await page.selectOption('#pageColumns', '2');
  await page.click('#pageDlg .primary');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#editor')).columnCount === '2');
  await page.reload();
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#editor')).columnCount), '2');
});

test('zoom slider and formatting marks', async () => {
  const page = await openEditor();
  const width = () => page.evaluate(() => Math.round(document.querySelector('#paper').getBoundingClientRect().width));
  assert.equal(await width(), 816);
  await page.fill('#zoom', '50');
  assert.equal(await width(), 408);
  assert.equal(await page.textContent('#zoomLabel'), '50%');
  await menu(page, 'View', 'view.zoom', '1');
  assert.equal(await page.inputValue('#zoom'), '100');

  const mark = () => page.evaluate(() => getComputedStyle(document.querySelector('#editor p'), '::after').content);
  assert.equal(await mark(), 'none');
  await menu(page, 'View', 'view.marks');
  assert.equal(await mark(), '"¶"');
  await page.reload();
  assert.equal(await mark(), '"¶"', 'remembered');
  assert.equal(await html(page), '<p><br></p>', 'marks are not part of the document');
});
