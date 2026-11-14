import assert from 'node:assert/strict';
import { test } from 'node:test';
import { html, menu, text, useApp } from './harness.mjs';

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

test('turning a paragraph into a list keeps the cursor where it was', async () => {
  const page = await openEditor();
  await page.keyboard.type('item');
  await page.click('[data-cmd="insertOrderedList"]');
  await page.keyboard.type(' more');
  assert.equal(await html(page), '<ol><li>item more</li></ol>');
  assert.deepEqual(page.errors, []);
});

test('bullet and numbering styles', async () => {
  const page = await openEditor();
  await page.keyboard.type('item');
  const pick = async (type) => {
    await page.click('[data-lists]');
    await page.click(`.pop [data-act="format.listStyle"][data-arg="${type}"]`);
  };
  await pick('lower-roman');
  assert.equal(await html(page), '<ol style="list-style-type: lower-roman;"><li>item</li></ol>');
  await page.keyboard.press('Enter');
  await page.keyboard.type('next');
  assert.deepEqual(
    await page.evaluate(() =>
      [...document.querySelectorAll('#editor li')].map((li) => getComputedStyle(li).listStyleType),
    ),
    ['lower-roman', 'lower-roman'],
  );
  await pick('square');
  assert.equal(await html(page), '<ul style="list-style-type: square;"><li>item</li><li>next</li></ul>');
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

test('subtitle and heading 4 styles', async () => {
  const page = await openEditor();
  await page.keyboard.type('Tagline');
  await page.selectOption('#selBlock', 'subtitle');
  assert.equal(await html(page), '<p class="subtitle">Tagline</p>');
  assert.equal(await page.inputValue('#selBlock'), 'subtitle');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Body');
  assert.equal(await html(page), '<p class="subtitle">Tagline</p><p>Body</p>', 'Enter returns to normal text');
  await page.keyboard.press('Control+Home');
  await page.selectOption('#selBlock', 'h5');
  assert.equal(await html(page), '<h5>Tagline</h5><p>Body</p>');
  await page.selectOption('#selBlock', 'p');
  assert.equal(await html(page), '<p>Tagline</p><p>Body</p>');
  assert.deepEqual(page.errors, []);
});

test('change case applies to the selection only', async () => {
  const page = await openEditor();
  await page.keyboard.type('hello big world. second sentence');
  await page.keyboard.press('Control+A');
  await menu(page, 'Format', 'format.case', 'title');
  assert.equal(await text(page), 'Hello Big World. Second Sentence');
  await menu(page, 'Format', 'format.case', 'sentence');
  assert.equal(await text(page), 'Hello big world. Second sentence');
  await page.dblclick('#editor p', { position: { x: 8, y: 8 } });
  await menu(page, 'Format', 'format.case', 'upper');
  assert.equal(await text(page), 'HELLO big world. Second sentence');
  assert.deepEqual(page.errors, []);
});

test('format painter copies character formatting to the next selection', async () => {
  const page = await openEditor();
  await page.keyboard.type('styled plain');
  await page.dblclick('#editor p', { position: { x: 8, y: 8 } });
  await page.click('[data-cmd=bold]');
  await page.click('[data-colors=foreColor]');
  await page.click('.swatches button:nth-child(9)');
  await page.selectOption('#selSize', '18');

  await page.click('[data-act="format.painter"]');
  assert.ok(await page.evaluate(() => document.querySelector('#editor').classList.contains('painting')));
  const plain = await page.evaluate(() => {
    const range = document.createRange();
    const node = [...document.querySelector('#editor p').childNodes].at(-1);
    range.setStart(node, node.length - 3);
    range.setEnd(node, node.length);
    const box = range.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  await page.mouse.dblclick(plain.x, plain.y);
  await page.waitForFunction(() => !document.querySelector('#editor').classList.contains('painting'));
  const painted = await page.evaluate(() => {
    const style = getComputedStyle(document.getSelection().anchorNode.parentElement);
    return [style.fontWeight, style.color, style.fontSize];
  });
  assert.deepEqual(painted, ['700', 'rgb(192, 53, 43)', '24px']);
  assert.match(await text(page), /^styled plain$/);
  assert.deepEqual(page.errors, []);
});
