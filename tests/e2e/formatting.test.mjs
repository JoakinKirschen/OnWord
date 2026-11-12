import assert from 'node:assert/strict';
import { test } from 'node:test';
import { html, useApp } from './harness.mjs';

const { openEditor } = useApp();

test('character formatting from the toolbar', async () => {
  const page = await openEditor();
  await page.keyboard.type('Hello world');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second line');
  assert.match(await html(page), /<p>Hello world<\/p><p>second line<\/p>/);

  await page.keyboard.press('Control+A');
  await page.click('[data-cmd=bold]');
  assert.match(await html(page), /font-weight|<b>/);
  assert.ok(await page.locator('[data-cmd=bold].on').count(), 'bold button reflects state');
  await page.click('[data-cmd=bold]');

  await page.selectOption('#selSize', '24');
  assert.match(await html(page), /font-size: 24pt/);
  assert.equal(await page.inputValue('#selSize'), '24');
  await page.selectOption('#selFont', 'Georgia');
  assert.match(await html(page), /Georgia/);

  await page.click('[data-colors=foreColor]');
  await page.click('.swatches button:nth-child(9)');
  assert.match(await html(page), /color: rgb\(192, 53, 43\)/);
  assert.deepEqual(page.errors, []);
});

test('paragraph styles, alignment, spacing and lists', async () => {
  const page = await openEditor();
  await page.keyboard.type('Heading');
  await page.selectOption('#selBlock', 'h1');
  assert.match(await html(page), /<h1/);
  await page.selectOption('#selBlock', 'blockquote');
  assert.match(await html(page), /<blockquote/);
  assert.doesNotMatch(await html(page), /<h1/);
  await page.selectOption('#selBlock', 'p');
  assert.doesNotMatch(await html(page), /<blockquote/);

  await page.click('[data-cmd=justifyCenter]');
  assert.match(await html(page), /text-align: center/);
  await page.selectOption('#selSpacing', '2');
  assert.match(await html(page), /line-height: 2/);

  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.click('[data-cmd=insertUnorderedList]');
  await page.keyboard.type('item');
  assert.match(await html(page), /<ul><li[^>]*>item<\/li><\/ul>/);
  assert.doesNotMatch(await html(page), /<p[^>]*><ul>/, 'list is not nested inside a paragraph');
  assert.deepEqual(page.errors, []);
});

test('markdown shortcuts while typing', async () => {
  const page = await openEditor();
  await page.keyboard.type('## Section');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- first');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('> quoted');
  const result = await html(page);
  assert.match(result, /<h2[^>]*>Section<\/h2>/);
  assert.match(result, /<ul><li[^>]*>first<\/li><\/ul>/);
  assert.match(result, /<blockquote[^>]*>quoted/);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('a - b');
  assert.match(await html(page), /a - b/, 'markers in the middle of a line are left alone');
  assert.deepEqual(page.errors, []);
});

test('checklists: create, tick, continue and convert back', async () => {
  const page = await openEditor();
  const tick = async (index) => {
    const box = await page.locator('#editor ul.checklist > li').nth(index).boundingBox();
    await page.mouse.click(box.x - 15, box.y + 8);
  };
  await page.keyboard.type('buy milk');
  await page.click('[data-act="format.checklist"]');
  assert.equal(await html(page), '<ul class="checklist"><li>buy milk</li></ul>');

  await tick(0);
  assert.equal(await html(page), '<ul class="checklist"><li class="checked">buy milk</li></ul>');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('call home');
  assert.match(
    await html(page),
    /<li class="checked">buy milk<\/li><li class="">call home<\/li>|<li class="checked">buy milk<\/li><li>call home<\/li>/,
  );
  await tick(0);
  assert.doesNotMatch(await html(page), /class="checked"/);

  await page.click('[data-act="format.checklist"]');
  assert.doesNotMatch(await html(page), /checklist/);
  assert.match(await html(page), /<ul[^>]*><li[^>]*>buy milk<\/li>/);
  assert.deepEqual(page.errors, []);
});

test('typing "[] " starts a checklist without changing a neighbouring list', async () => {
  const page = await openEditor();
  await page.keyboard.type('- plain');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('[] task');
  assert.equal(await html(page), '<ul><li>plain</li></ul><ul class="checklist"><li>task</li></ul>');
  assert.deepEqual(page.errors, []);
});
