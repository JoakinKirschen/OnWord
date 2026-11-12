import assert from 'node:assert/strict';
import { test } from 'node:test';
import { html, menu, text, useApp } from './harness.mjs';

const { openEditor } = useApp();
/** The document with the author/date attributes removed, which differ on every run. */
const plain = async (page) => (await html(page)).replace(/ data-(author|date)="[^"]*"/g, '');

test('comments: add to a selection, list in the panel, resolve', async () => {
  const page = await openEditor();
  await page.keyboard.type('Please review this sentence.');
  await menu(page, 'Review', 'review.comment');
  assert.match(await page.textContent('#toast'), /Select the text/);

  await page.dblclick('#editor p', { position: { x: 70, y: 8 } });
  await menu(page, 'Review', 'review.comment');
  await page.fill('#commentAuthor', 'Ada');
  await page.fill('#commentText', 'Is "review" the right word?');
  await page.click('#commentDlg .primary');
  await page.waitForSelector('#editor span.comment');
  assert.equal(
    await plain(page),
    '<p>Please <span class="comment" title="Is &quot;review&quot; the right word?">review</span> this sentence.</p>',
  );
  assert.equal(await page.getAttribute('#editor span.comment', 'data-author'), 'Ada');
  assert.ok(await page.isVisible('#commentsPanel'), 'the panel opens when a comment is added');
  assert.match(await page.innerText('.comment-card'), /Ada[\s\S]*review[\s\S]*Is "review" the right word\?/);

  await page.reload();
  assert.equal(await page.locator('.comment-card').count(), 1, 'comments are stored with the document');
  await page.click('.comment-card [data-act="review.resolve"]');
  assert.equal(await html(page), '<p>Please review this sentence.</p>');
  assert.equal(await page.locator('.comment-card').count(), 0);
  assert.deepEqual(page.errors, []);
});

test('track changes: typing and deleting are marked, then accepted', async () => {
  const page = await openEditor();
  await page.keyboard.type('base text');
  assert.equal(await page.textContent('#trackState'), 'Track changes: off');
  await page.click('#trackState');
  assert.equal(await page.textContent('#trackState'), 'Track changes: on');

  await page.click('#editor');
  await page.keyboard.press('End');
  await page.keyboard.type(' new');
  assert.equal(await plain(page), '<p>base text<ins> new</ins></p>');
  await page.keyboard.press('Backspace');
  assert.equal(await plain(page), '<p>base text<ins> ne</ins></p>', 'deleting your own insertion just removes it');

  await page.keyboard.press('Home');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Delete');
  assert.equal(await plain(page), '<p><del>b</del><del>a</del>se text<ins> ne</ins></p>');
  assert.equal(await text(page), 'base text ne', 'deleted text stays visible');

  await menu(page, 'Review', 'review.acceptAll');
  assert.equal(await html(page), '<p>se text ne</p>');
  assert.deepEqual(page.errors, []);
});

test('track changes: replacing a selection, rejecting, and switching off', async () => {
  const page = await openEditor();
  await page.keyboard.type('one two three');
  await page.click('#trackState');
  await page.dblclick('#editor p', { position: { x: 40, y: 8 } });
  await page.keyboard.type('2');
  assert.equal(await plain(page), '<p>one <del>two</del><ins>2</ins> three</p>');

  await menu(page, 'Review', 'review.reject');
  assert.equal(await plain(page), '<p>one <del>two</del> three</p>', 'rejects the change at the caret only');
  await menu(page, 'Review', 'review.rejectAll');
  assert.equal(await html(page), '<p>one two three</p>');

  await page.click('#trackState');
  await page.click('#editor');
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  assert.equal(await html(page), '<p>one two three!</p>', 'nothing is marked once tracking is off');
  assert.deepEqual(page.errors, []);
});

test('footnotes: numbered in text order, notes follow their references', async () => {
  const page = await openEditor();
  const numbers = () => page.locator('#editor sup.fn-ref').allTextContents();
  const notes = () => page.locator('#editor ol.footnotes > li').allTextContents();
  await page.keyboard.type('Alpha beta');
  await menu(page, 'Insert', 'insert.footnote');
  await page.keyboard.type('note on beta');
  assert.deepEqual(await numbers(), ['1']);
  assert.deepEqual(await notes(), ['note on beta']);

  await page.click('#editor p', { position: { x: 30, y: 8 } });
  await page.keyboard.press('Home');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await menu(page, 'Insert', 'insert.footnote');
  await page.keyboard.type('note on alpha');
  assert.deepEqual(await numbers(), ['1', '2']);
  assert.deepEqual(await notes(), ['note on alpha', 'note on beta'], 'the earlier reference comes first');
  assert.match(
    await html(page),
    /^<p>Alpha<sup class="fn-ref" id="fnref-\w+" contenteditable="false">1<\/sup> beta<sup/,
  );

  await page.evaluate(() => {
    document.querySelector('#editor sup.fn-ref').remove();
    document.querySelector('#editor').dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
  assert.deepEqual(await numbers(), ['1']);
  assert.deepEqual(await notes(), ['note on beta'], 'a note disappears with its reference');
  assert.deepEqual(page.errors, []);
});

test('table of contents lists headings with page numbers and keeps itself up to date', async () => {
  const page = await openEditor();
  const entries = () => page.locator('#editor .toc p').allInnerTexts();
  await page.keyboard.type('# Report');
  await page.keyboard.press('Enter');
  await page.keyboard.type('## First part');
  await page.keyboard.press('Enter');
  await page.keyboard.type('body');
  await page.keyboard.press('Control+Home');
  await menu(page, 'Insert', 'insert.toc');
  assert.deepEqual(await entries(), ['Report\n1', 'First part\n1']);
  assert.equal(await page.getAttribute('#editor .toc', 'contenteditable'), 'false');

  await page.keyboard.press('Control+End');
  await page.keyboard.press('Control+Enter');
  await page.keyboard.type('## Second part');
  assert.deepEqual(
    await entries(),
    ['Report\n1', 'First part\n1', 'Second part\n2'],
    'a heading after a page break is on page 2',
  );
  assert.deepEqual(await page.locator('#outlineList button').allTextContents(), [
    'Report',
    'First part',
    'Second part',
  ]);
  assert.deepEqual(page.errors, []);
});

test('paged view: sheets, per-page footers and blocks moved to the next page', async () => {
  const page = await openEditor();
  await menu(page, 'Insert', 'page.numbers');
  await page.click('#editor');
  await page.keyboard.type('first');
  for (let i = 0; i < 30; i++) await page.keyboard.press('Enter');
  await page.keyboard.type('last');
  assert.equal(await page.locator('.page-gap').count(), 1);
  assert.deepEqual(await page.locator('.page-band:not(:empty)').allTextContents(), ['Page 1 of 2', 'Page 2 of 2']);

  const layout = await page.evaluate(() => {
    const paper = document.querySelector('#paper').getBoundingClientRect();
    const gap = document.querySelector('.page-gap').getBoundingClientRect();
    const blocks = [...document.querySelectorAll('#editor > p')].map((p) => p.getBoundingClientRect());
    return {
      height: paper.height,
      gapTop: gap.top - paper.top,
      crossing: blocks.filter((b) => b.bottom > gap.top - 96 && b.top < gap.bottom + 96).length,
      lastTop: blocks.at(-1).top - paper.top,
    };
  });
  assert.equal(layout.height, 2 * 1056 + 20, 'two full sheets with a gap between them');
  assert.equal(layout.gapTop, 1056);
  assert.equal(layout.crossing, 0, 'no paragraph sits in the margins around the gap');
  assert.ok(layout.lastTop > 1056 + 20 + 96, 'the last paragraph starts below the top margin of page 2');
  assert.doesNotMatch(await html(page), /margin/, 'the layout is not written into the document');
  assert.deepEqual(page.errors, []);
});
