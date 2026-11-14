import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VERSION } from '../../src/core/version.js';
import { useApp } from './harness.mjs';

const { openApp, openEditor } = useApp();

test('the privacy policy and terms of use open over the app and close again', async () => {
  const page = await openApp();
  await page.goto(page.url().split('#')[0] + '#/privacy');
  await page.waitForSelector('#legal:not([hidden])');
  assert.equal(await page.textContent('#legalText h1'), 'Privacy policy');
  assert.match(await page.innerText('#legalText'), /run by the site’s operator, who is responsible/);
  assert.equal(await page.textContent('#legalVersion'), `OnWord ${VERSION}`);
  assert.equal(await page.title(), 'Privacy policy – OnWord');

  await page.click('.legal-foot a[href="#/terms"]');
  await page.waitForFunction(() => document.querySelector('#legalText h1').textContent === 'Terms of use');
  await page.click('[data-act="app.back"]');
  await page.waitForFunction(() => location.hash === '#/privacy');
  await page.click('[data-act="app.back"]');
  await page.waitForSelector('#legal', { state: 'hidden' });
  assert.ok(await page.isVisible('#home'), 'the screen underneath is still there');
  assert.deepEqual(page.errors, []);
});

test('back from a legal page returns to the open document as it was', async () => {
  const page = await openEditor();
  await page.keyboard.type('unsaved words');
  await page.evaluate(() => (location.hash = '#/terms'));
  await page.waitForSelector('#legal:not([hidden])');
  assert.ok(await page.isVisible('#editorView'), 'the document stays open underneath');
  await page.click('[data-act="app.back"]');
  await page.waitForSelector('#legal', { state: 'hidden' });
  assert.equal(await page.innerText('#editor'), 'unsaved words');
  assert.deepEqual(page.errors, []);
});
