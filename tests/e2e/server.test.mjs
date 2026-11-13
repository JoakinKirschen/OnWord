/**
 * Accounts and server storage, against the real PHP API with a throw-away SQLite database
 * (or the database named by ONWORD_TEST_CONFIG). Skipped when PHP is not installed.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCREENS = '#home:not([hidden]), #editorView:not([hidden]), #account:not([hidden])';
const hasPhp = (() => {
  try {
    return /pdo_sqlite/i.test(execFileSync('php', ['-m']).toString());
  } catch {
    return false;
  }
})();

let php, browser, base;

const freePort = () =>
  new Promise((done) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });

before(async () => {
  if (!hasPhp) return;
  const dir = mkdtempSync(join(tmpdir(), 'onword-server-'));
  // ONWORD_TEST_CONFIG points at a config file for another database, e.g. a local MariaDB.
  const config = process.env.ONWORD_TEST_CONFIG || join(dir, 'config.php');
  if (!process.env.ONWORD_TEST_CONFIG)
    writeFileSync(config, `<?php return ['dsn' => 'sqlite:${join(dir, 'test.sqlite')}'];`);
  const port = await freePort();
  base = `http://127.0.0.1:${port}/`;
  php = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', ROOT], {
    env: { ...process.env, ONWORD_CONFIG: config },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    if (
      await fetch(base + 'api/index.php?r=auth/me').then(
        (r) => r.ok,
        () => false,
      )
    )
      break;
    await new Promise((wait) => setTimeout(wait, 100));
  }
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  php?.kill();
});

/** A separate browser (own cookies), like another person or another computer. */
async function visitor() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(base);
  await page.waitForSelector(SCREENS);
  return page;
}

async function register(page, name, email, password = 'correct horse') {
  await page.click('#accountSwitch');
  await page.fill('[name=name]', name);
  await page.fill('[name=email]', email);
  await page.fill('[name=password]', password);
  await page.click('#accountSubmit');
}

async function signIn(page, email, password = 'correct horse') {
  await page.fill('[name=email]', email);
  await page.fill('[name=password]', password);
  await page.click('#accountSubmit');
}

const saved = (page) => page.waitForFunction(() => document.querySelector('#saveState').textContent === 'Saved');
const editorText = (page) => page.innerText('#editor');

test('an account keeps its documents on the server, across browsers', { skip: !hasPhp }, async () => {
  const laptop = await visitor();
  assert.ok(await laptop.isVisible('#account'), 'nothing is shown before signing in');
  assert.ok(await laptop.isHidden('#home'));

  await register(laptop, 'Ann', 'ann@example.com');
  await laptop.waitForSelector('#home:not([hidden])');
  assert.equal(await laptop.textContent('#userName'), 'Ann');
  await laptop.click('[data-act="library.new"]');
  await laptop.waitForSelector('#editorView:not([hidden])');
  await laptop.fill('#title', 'Server notes');
  await laptop.click('#editor');
  await laptop.keyboard.type('kept on the server');
  await saved(laptop);

  const phone = await visitor();
  await signIn(phone, 'ann@example.com', 'wrong password');
  await phone.waitForFunction(() => document.querySelector('#accountError').textContent !== '');
  assert.match(await phone.textContent('#accountError'), /not correct/);
  await signIn(phone, 'ann@example.com');
  await phone.waitForSelector('.card');
  assert.equal(await phone.textContent('.card-title'), 'Server notes');
  await phone.click('.card');
  await phone.waitForSelector('#editorView:not([hidden])');
  assert.equal(await editorText(phone), 'kept on the server');

  await laptop.reload();
  await laptop.waitForSelector(SCREENS);
  assert.equal(await editorText(laptop), 'kept on the server', 'still signed in and loaded after a reload');
  await laptop.click('.doc-bar .brand');
  await laptop.click('[data-act="account.signOut"]');
  await laptop.waitForSelector('#account:not([hidden])');
  assert.deepEqual([...laptop.errors, ...phone.errors], []);
});

test('sharing: view-only and edit access for another account', { skip: !hasPhp }, async () => {
  const owner = await visitor();
  await register(owner, 'Olga', 'olga@example.com');
  await owner.waitForSelector('#home:not([hidden])');
  const guest = await visitor();
  await register(guest, 'Gus', 'gus@example.com');
  await guest.waitForSelector('#home:not([hidden])');

  await owner.click('[data-act="library.new"]');
  await owner.waitForSelector('#editorView:not([hidden])');
  await owner.fill('#title', 'Shared spec');
  await owner.click('#editor');
  await owner.keyboard.type('owner text');
  await saved(owner);
  await owner.click('.doc-bar .brand');
  await owner.waitForSelector('.card');

  await owner.click('.card-more');
  await owner.click('.pop [data-act="library.share"]');
  await owner.fill('#shareEmail', 'nobody@example.com');
  await owner.click('#shareDlg [value=add]');
  await owner.waitForFunction(() => document.querySelector('#shareError').textContent !== '');
  assert.match(await owner.textContent('#shareError'), /Nobody has an account/);
  await owner.fill('#shareEmail', 'gus@example.com');
  await owner.click('#shareDlg [value=add]');
  await owner.waitForSelector('#shareList .share-role');
  assert.match(await owner.innerText('#shareList'), /Gus[\s\S]*Can view/);

  await guest.reload();
  await guest.waitForSelector('.card');
  assert.match(await guest.textContent('.card-date'), /Shared by Olga · view only/);
  await guest.click('.card');
  await guest.waitForSelector('#editorView:not([hidden])');
  assert.equal(await editorText(guest), 'owner text');
  assert.equal(await guest.textContent('#saveState'), 'View only');
  assert.equal(await guest.getAttribute('#editor', 'contenteditable'), 'false');

  await owner.selectOption('#shareRole', 'edit');
  await owner.fill('#shareEmail', 'gus@example.com');
  await owner.click('#shareDlg [value=add]');
  await owner.waitForFunction(() => /Can edit/.test(document.querySelector('#shareList').textContent));
  await guest.reload();
  await guest.waitForSelector('#editorView:not([hidden])');
  await guest.click('#editor');
  await guest.keyboard.press('Control+End');
  await guest.keyboard.type(' plus guest text');
  await saved(guest);

  await owner.click('#shareDlg [value=done]');
  await owner.click('.card');
  await owner.waitForSelector('#editorView:not([hidden])');
  assert.equal(await editorText(owner), 'owner text plus guest text');
  assert.deepEqual([...owner.errors, ...guest.errors], []);
});

test('saving over a newer version is refused and reported', { skip: !hasPhp }, async () => {
  const first = await visitor();
  await register(first, 'Cy', 'cy@example.com');
  await first.waitForSelector('#home:not([hidden])');
  await first.click('[data-act="library.new"]');
  await first.waitForSelector('#editorView:not([hidden])');
  await first.click('#editor');
  await first.keyboard.type('base');
  await saved(first);

  const second = await visitor();
  await signIn(second, 'cy@example.com');
  await second.waitForSelector('.card');
  await second.click('.card');
  await second.waitForSelector('#editorView:not([hidden])');
  await second.click('#editor');
  await second.keyboard.press('Control+End');
  await second.keyboard.type(' second');
  await saved(second);

  await first.click('#editor');
  await first.keyboard.press('Control+End');
  await first.keyboard.type(' first');
  await first.waitForFunction(() => /changed elsewhere/.test(document.querySelector('#saveState').textContent));
  assert.match(await first.textContent('#toast'), /changed somewhere else/);
  await second.reload();
  await second.waitForSelector('#editorView:not([hidden])');
  assert.equal(await editorText(second), 'base second', 'the newer version was not overwritten');
});

test('the API refuses requests without a session or security token', { skip: !hasPhp }, async () => {
  const api = (route, init) =>
    fetch(`${base}api/index.php?r=${route}`, init).then(async (r) => [r.status, (await r.json()).error]);
  assert.deepEqual(await api('docs/list'), [401, 'signed_out']);
  assert.deepEqual(await api('auth/login', { method: 'POST', body: '{}' }), [403, 'csrf']);
  assert.deepEqual(await api('nothing/here'), [404, 'not_found']);
});
