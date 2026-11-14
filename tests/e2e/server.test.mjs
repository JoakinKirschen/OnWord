/**
 * Accounts and server storage, against the real PHP API with a throw-away SQLite database
 * (or the database named by ONWORD_TEST_CONFIG). Skipped when PHP is not installed.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { fakeOidc } from './fakeOidc.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCREENS = '#home:not([hidden]), #editorView:not([hidden]), #account:not([hidden])';
const hasPhp = (() => {
  try {
    return /pdo_sqlite/i.test(execFileSync('php', ['-m']).toString());
  } catch {
    return false;
  }
})();

let php, browser, base, claude, oidc;

/**
 * A stand-in for the Claude API, so the AI reader is tested without a key or network. It keeps the last
 * request it received and answers with `claude.answer(request)`.
 */
function fakeClaude() {
  const fake = { last: null, answer: () => ({}), server: null, url: '' };
  fake.server = createHttpServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      fake.last = { path: req.url, headers: req.headers, body: JSON.parse(body) };
      const output = fake.answer(fake.last.body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: fake.last.body.model,
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: JSON.stringify(output) }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      );
    });
  });
  return new Promise((done) =>
    fake.server.listen(0, '127.0.0.1', () => {
      fake.url = `http://127.0.0.1:${fake.server.address().port}`;
      done(fake);
    }),
  );
}

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
  if (!process.env.ONWORD_TEST_CONFIG) {
    claude = await fakeClaude();
    oidc = await fakeOidc();
    // Two sign-on providers: a work account limited to its domain, and one open to anybody.
    const provider = (id, label, domains) =>
      `['id' => '${id}', 'label' => '${label}', 'issuer' => '${oidc.url}/${id}', 'client_id' => 'onword-${id}', 'client_secret' => 'test-secret', 'domains' => [${domains}]]`;
    const sso = `'sso' => [${provider('work', 'Work account', "'work.test'")}, ${provider('open', 'Google', '')}]`;
    // Visitors' addresses come from a header, so that each test browser is a connection of its own.
    const settings = `'dsn' => 'sqlite:${join(dir, 'test.sqlite')}', 'anthropic_api_key' => 'test-key', 'anthropic_base_url' => '${claude.url}', 'client_ip_header' => 'HTTP_X_TEST_IP', ${sso}`;
    writeFileSync(config, `<?php return [${settings}];`);
  }
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
  claude?.server.close();
  oidc?.server.close();
});

/** A separate browser (own cookies), like another person or another computer. */
let visitors = 0;
/** A different documentation-range address for every visitor (TEST-NET-3, RFC 5737). */
const testIp = () => `203.0.113.${++visitors}`;

async function visitor() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 },
    extraHTTPHeaders: { 'X-Test-IP': testIp() },
  });
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
// Unique per run, so the tests also pass against a database that keeps accounts from earlier runs.
const RUN = Date.now().toString(36);
const email = (/** @type {string} */ name) => `${name}.${RUN}@example.com`;
const editorText = (page) => page.innerText('#editor');

test('an account keeps its documents on the server, across browsers', { skip: !hasPhp }, async () => {
  const laptop = await visitor();
  assert.ok(await laptop.isVisible('#account'), 'nothing is shown before signing in');
  assert.ok(await laptop.isHidden('#home'));

  await register(laptop, 'Ann', email('ann'));
  await laptop.waitForSelector('#home:not([hidden])');
  assert.equal(await laptop.textContent('#userName'), 'Ann');
  await laptop.click('[data-act="library.new"]');
  await laptop.waitForSelector('#editorView:not([hidden])');
  await laptop.fill('#title', 'Server notes');
  await laptop.click('#editor');
  await laptop.keyboard.type('kept on the server');
  await saved(laptop);

  const phone = await visitor();
  await signIn(phone, email('ann'), 'wrong password');
  await phone.waitForFunction(() => document.querySelector('#accountError').textContent !== '');
  assert.match(await phone.textContent('#accountError'), /not correct/);
  await signIn(phone, email('ann'));
  await phone.waitForSelector('.card');
  assert.equal(await phone.textContent('.card-title'), 'Server notes');
  await phone.click('.card');
  await phone.waitForSelector('#editorView:not([hidden])');
  assert.equal(await editorText(phone), 'kept on the server');
  // The document's styles are stored with it.
  await phone.click('[data-menu="Format"]');
  await phone.click('.pop [data-act="format.styles"]');
  await phone.fill('#styleColor', '#1a55c9');
  await phone.click('#stylesDlg .primary');
  await phone.waitForFunction(() => getComputedStyle(document.querySelector('#editor')).color === 'rgb(26, 85, 201)');
  await phone.waitForFunction(() => !document.querySelector('#saveState').textContent.includes('Saving'));

  await laptop.reload();
  await laptop.waitForSelector(SCREENS);
  assert.equal(await editorText(laptop), 'kept on the server', 'still signed in and loaded after a reload');
  const color = () => laptop.evaluate(() => getComputedStyle(document.querySelector('#editor')).color);
  assert.equal(await color(), 'rgb(26, 85, 201)');
  await laptop.click('[data-menu="File"]');
  await laptop.click('.pop [data-act="file.copy"]');
  await laptop.waitForFunction(() => document.querySelector('#title').value.startsWith('Copy of'));
  await laptop.reload();
  await laptop.waitForSelector('#editorView:not([hidden])');
  assert.equal(await color(), 'rgb(26, 85, 201)', 'a copy keeps the styles');
  await laptop.click('.doc-bar .brand');
  await laptop.click('[data-act="account.signOut"]');
  await laptop.waitForSelector('#account:not([hidden])');
  assert.deepEqual([...laptop.errors, ...phone.errors], []);
});

test('sharing: view-only and edit access for another account', { skip: !hasPhp }, async () => {
  const owner = await visitor();
  await register(owner, 'Olga', email('olga'));
  await owner.waitForSelector('#home:not([hidden])');
  const guest = await visitor();
  await register(guest, 'Gus', email('gus'));
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
  await owner.fill('#shareEmail', email('nobody'));
  await owner.click('#shareDlg [value=add]');
  await owner.waitForFunction(() => document.querySelector('#shareError').textContent !== '');
  assert.match(await owner.textContent('#shareError'), /Nobody has an account/);
  await owner.fill('#shareEmail', email('gus'));
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
  await owner.fill('#shareEmail', email('gus'));
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
  await register(first, 'Cy', email('cy'));
  await first.waitForSelector('#home:not([hidden])');
  await first.click('[data-act="library.new"]');
  await first.waitForSelector('#editorView:not([hidden])');
  await first.click('#editor');
  await first.keyboard.type('base');
  await saved(first);

  const second = await visitor();
  await signIn(second, email('cy'));
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

test(
  'specifications on the server: masters are shared for reading, projects stay private',
  { skip: !hasPhp },
  async () => {
    const specSaved = (page) =>
      page.waitForFunction(() => document.querySelector('#specState').textContent === 'Saved');
    const author = await visitor();
    await register(author, 'Mia', email('mia'));
    await author.waitForSelector('#home:not([hidden])');
    author.on('dialog', (dialog) => dialog.accept('Shared master'));
    await author.click('#home .main-nav a[href="#/specs"]');
    await author.click('[data-act="spec.newMaster"]');
    await author.waitForSelector('#specView:not([hidden])');
    await author.click('.spec-tree-tools [data-act="spec.addArticle"]');
    await author.fill('#articlePanel [data-field="title"]', 'Paving');
    await author.fill('#articlePanel [data-field="unit"]', 'm²');
    await author.click('#articleText');
    await author.keyboard.type('Concrete pavers.');
    await author.click('#articlePanel [data-act="spec.addArticle"]');
    await author.fill('#articlePanel [data-field="title"]', 'Edging');
    await specSaved(author);

    // Another account sees the master read-only and can build its own project from it.
    const reader = await visitor();
    await register(reader, 'Raf', email('raf'));
    await reader.waitForSelector('#home:not([hidden])');
    await reader.click('#home .main-nav a[href="#/specs"]');
    await reader.waitForSelector('#masterList .spec-row');
    assert.match(await reader.innerText('#masterList'), /Shared master[\s\S]*by Mia[\s\S]*read only/);
    await reader.click('#masterList a');
    await reader.waitForSelector('#specView:not([hidden])');
    await reader.click('#articleTree .tree-item');
    assert.equal(await reader.isDisabled('#articlePanel [data-field="title"]'), true);
    assert.equal(await reader.getAttribute('#articleText', 'contenteditable'), 'false');

    await reader.click('.spec-bar .brand');
    await reader.click('[data-act="spec.newProject"]');
    await reader.fill('#projectDlg [name=title]', 'Raf project');
    await reader.waitForSelector('#projectArticles input');
    await reader.click('#projectDlg .primary');
    await reader.waitForSelector('#specView:not([hidden])');
    assert.deepEqual(await reader.locator('#articleTree .tree-item').allInnerTexts(), ['1\nPaving', '1.1\nEdging']);
    await reader.click('#articleTree .tree-item >> nth=0');
    assert.equal(await reader.innerText('#articleText'), 'Concrete pavers.');
    await reader.click('[data-act="spec.addLine"]');
    await reader.fill('[data-line="0"][data-part="formula"]', '12 * 4');
    await specSaved(reader);
    await reader.reload();
    await reader.click('#articleTree .tree-item >> nth=0');
    assert.equal(await reader.textContent('#articleQuantity'), '48 m²', 'measurements are stored on the server');
    await reader.fill('#articlePanel [data-field="price"]', '30');
    await specSaved(reader);

    // The price library: the reader's own project prices show in the master they came from.
    const prices = (page) => page.locator('#pricesPanel tbody tr').allInnerTexts();
    await reader.click('.spec-bar .brand');
    await reader.click('#masterList a');
    await reader.waitForSelector('#specView:not([hidden])');
    await reader.click('[data-act="spec.view"][data-arg="prices"]');
    assert.deepEqual(await prices(reader), ['1\tPaving\tm²\t0\t—\t1\t30.00\t30.00\t\t']);
    await reader.click('#pricesPanel tbody tr');
    await reader.click('#priceRecords summary');
    assert.deepEqual(
      await reader.locator('#priceRecords tbody tr').allInnerTexts(),
      ['Raf project\t48 m²\t30.00'],
      'each price comes with the quantity it was given for',
    );

    // Taking an article out of the project keeps it, with its measurements and price, but out of the prices.
    await reader.click('.spec-bar .brand');
    await reader.click('#projectList a');
    await reader.waitForSelector('#specView:not([hidden])');
    await reader.click('[data-act="spec.side"][data-arg="master"]');
    await reader.uncheck('#masterTree .pick-item:has-text("Paving") input');
    await reader.click('#masterApply');
    await reader.click('#removeDlg [value="remove"]');
    await reader.waitForSelector('#masterTree .pick-item.removing', { state: 'detached' });
    await specSaved(reader);
    await reader.reload();
    await reader.waitForSelector('#specView:not([hidden])');
    assert.equal(await reader.locator('#articleTree .tree-item').count(), 0);
    await reader.click('.spec-bar .brand');
    await reader.click('#masterList a');
    await reader.waitForSelector('#specView:not([hidden])');
    await reader.click('[data-act="spec.view"][data-arg="prices"]');
    assert.deepEqual(await prices(reader), ['1\tPaving\tm²\t0\t—\t0\t\t\t\t'], 'a removed article has no price');
    await reader.click('.spec-bar .brand');
    await reader.click('#projectList a');
    await reader.waitForSelector('#specView:not([hidden])');
    await reader.click('[data-act="spec.side"][data-arg="master"]');
    await reader.check('#masterTree .pick-item:has-text("Paving") input');
    await reader.click('#masterApply');
    await reader.waitForSelector('#articleTree:visible');
    assert.equal(await reader.textContent('#articleQuantity'), '48 m²', 'brought back as it was');
    assert.equal(await reader.inputValue('#articlePanel [data-field="price"]'), '30');
    await specSaved(reader);

    // The project is not visible to the master's author, and the API refuses writes to someone else's master.
    await author.click('.spec-bar .brand');
    await author.waitForSelector('#projectList');
    assert.doesNotMatch(await author.innerText('#projectList'), /Raf project/);
    const masterId = await author.evaluate(() => document.querySelector('#masterList a').hash.split('/').pop());
    const refused = await reader.evaluate(async (id) => {
      const me = await (await fetch('api/index.php?r=auth/me')).json();
      const response = await fetch('api/index.php?r=specs/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrf },
        body: JSON.stringify({ id, title: 'Taken over' }),
      });
      return [response.status, (await response.json()).error];
    }, masterId);
    assert.deepEqual(refused, [403, 'read_only']);
    await author.click('#masterList a');
    await author.waitForSelector('#specView:not([hidden])');
    await author.click('[data-act="spec.view"][data-arg="prices"]');
    assert.deepEqual(await prices(author), ['1\tPaving\tm²\t0\t—\t0\t\t\t\t'], "another account's prices stay private");
    assert.deepEqual([...author.errors, ...reader.errors], []);
  },
);

test(
  'offers on the server, read by the AI reader, and kept from other accounts',
  { skip: !hasPhp || !!process.env.ONWORD_TEST_CONFIG },
  async () => {
    const specSaved = (page) =>
      page.waitForFunction(() => document.querySelector('#specState').textContent === 'Saved');
    const owner = await visitor();
    await register(owner, 'Ines', email('ines'));
    await owner.waitForSelector('#home:not([hidden])');
    await owner.click('#home .main-nav a[href="#/specs"]');
    await owner.click('[data-act="spec.newProject"]');
    await owner.fill('#projectDlg [name=title]', 'Ines project');
    await owner.selectOption('#projectMaster', '');
    await owner.click('#projectDlg .primary');
    await owner.waitForSelector('#specView:not([hidden])');
    await owner.click('.spec-tree-tools [data-act="spec.addArticle"]');
    await owner.fill('#articlePanel [data-field="title"]', 'Paving');
    await owner.fill('#articlePanel [data-field="unit"]', 'm²');
    await owner.click('[data-act="spec.addLine"]');
    await owner.fill('[data-line="0"][data-part="formula"]', '48');

    // The fake model matches the first line to the article it finds in the instructions, and makes up an id.
    claude.answer = (request) => {
      const id = request.system.match(/^(\w+)\t1\tPaving/m)?.[1] ?? '';
      return {
        contractor: 'Bouw Peeters',
        lines: [
          { articleId: id, number: 'A-7', title: 'Pavers', unit: 'm²', quantity: 50, price: 31.5 },
          { articleId: '', number: '99', title: 'Extra work', unit: 'st', quantity: 0, price: 12 },
          { articleId: 'madeupid99', number: '98', title: 'Other', unit: 'st', quantity: 1, price: 3 },
        ],
      };
    };
    await owner.click('[data-act="spec.view"][data-arg="offers"]');
    const pdf = Buffer.from('%PDF-1.4 offer');
    await owner.setInputFiles('#offerInput', { name: 'offer.pdf', mimeType: 'application/pdf', buffer: pdf });
    await owner.waitForSelector('#offerDlg[open]');
    assert.match(await owner.innerText('#offerSummary'), /A PDF is read by the AI reader/);
    await owner.click('#offerAi');
    await owner.waitForFunction(() =>
      /read by the AI reader/.test(document.querySelector('#offerSummary').textContent),
    );
    assert.match(await owner.innerText('#offerSummary'), /^3 priced lines read by the AI reader, 1 matched/);
    assert.equal(await owner.inputValue('#offerDlg [name=contractor]'), 'Bouw Peeters');

    const { headers, body, path } = claude.last;
    assert.equal(path, '/v1/messages');
    assert.equal(headers['x-api-key'], 'test-key', 'the key stays on the server');
    assert.equal(headers['anthropic-version'], '2026-10-21');
    assert.equal(body.model, 'claude-opus-5-5');
    assert.equal(body.output_config.format.type, 'json_schema');
    assert.deepEqual(body.messages[0].content[0].source, {
      type: 'base64',
      media_type: 'application/pdf',
      data: pdf.toString('base64'),
    });

    await owner.click('#offerDlg .primary');
    await specSaved(owner);
    await owner.reload();
    await owner.click('[data-act="spec.view"][data-arg="offers"]');
    assert.deepEqual(await owner.locator('#offersPanel .offers tbody tr').allInnerTexts(), [
      '1\tPaving\tm²\t48\t—\t31.50 ≠',
    ]);
    assert.match(await owner.innerText('#offersPanel .offer-unmatched summary'), /Bouw Peeters: 2 lines not matched/);

    // Another account cannot see, change or have read the offers of this project.
    const projectId = await owner.evaluate(() => location.hash.split('/').pop());
    const other = await visitor();
    await register(other, 'Bo', email('bo'));
    await other.waitForSelector('#home:not([hidden])');
    const answers = await other.evaluate(async (specId) => {
      const me = await (await fetch('api/index.php?r=auth/me')).json();
      const call = async (route, payload) => {
        const init = payload
          ? { method: 'POST', headers: { 'X-CSRF-Token': me.csrf }, body: JSON.stringify(payload) }
          : undefined;
        const response = await fetch(`api/index.php?r=${route}`, init);
        return [response.status, (await response.json()).error];
      };
      return [
        await call(`offers/list&specId=${specId}`),
        await call('offers/save', { specId, offer: { id: 'abcdefgh1', contractor: 'X', prices: {} } }),
        await call('ai/read', { specId, name: 'x.csv', text: 'a' }),
      ];
    }, projectId);
    assert.deepEqual(answers, [
      [404, 'not_found'],
      [404, 'not_found'],
      [404, 'not_found'],
    ]);
    assert.deepEqual([...owner.errors, ...other.errors], []);
  },
);

test('templates are kept on the server and private to their owner', { skip: !hasPhp }, async () => {
  const laptop = await visitor();
  await register(laptop, 'Tess', email('tess'));
  await laptop.waitForSelector('#home:not([hidden])');
  await laptop.click('[data-act="library.newTemplate"]');
  await laptop.waitForSelector('#editorView:not([hidden])');
  await laptop.fill('#title', 'Weekly report');
  await laptop.click('#editor');
  await laptop.keyboard.type('Progress this week');
  await saved(laptop);

  const phone = await visitor();
  await signIn(phone, email('tess'));
  await phone.waitForSelector('#home:not([hidden])');
  await phone.waitForFunction(() => /Progress this week/.test(document.querySelector('#templates').textContent));
  assert.equal(await phone.locator('.card').count(), 0, 'a template is not listed as a document');
  await phone.click('.template-item:nth-child(6) .template');
  await phone.waitForSelector('#editorView:not([hidden])');
  assert.equal(await editorText(phone), 'Progress this week');
  await phone.click('[data-menu="File"]');
  await phone.click('.pop [data-act="file.saveAsTemplate"]');
  await phone.waitForFunction(() => !document.querySelector('#saveState').textContent.includes('Saving'));

  const [, { documents }] = await call(laptop, 'docs/list');
  assert.deepEqual(documents.map((d) => [d.title, d.template]).sort(), [
    ['Weekly report', false],
    ['Weekly report', true],
    ['Weekly report', true],
  ]);
  const template = documents.find((d) => d.template);
  assert.equal((await call(laptop, 'docs/update', { id: template.id, template: 'yes' }))[0], 400);

  const other = await visitor();
  await register(other, 'Ugo', email('ugo'));
  await other.waitForSelector('#home:not([hidden])');
  assert.deepEqual((await call(other, 'docs/list'))[1], { documents: [] }, "another account sees no one's templates");
  assert.equal((await call(other, `docs/get&id=${template.id}`))[0], 404);
  assert.equal((await call(other, 'docs/copy', { id: template.id, newId: 'stolencopy1' }))[0], 404);
  assert.deepEqual([...laptop.errors, ...phone.errors, ...other.errors], []);
});

/** Calls the API from a signed-in page, as the app does: JSON, with the session's security token. */
const call = (page, route, body) =>
  page.evaluate(
    async ([r, b]) => {
      const me = await (await fetch('api/index.php?r=auth/me')).json();
      const init = b
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrf },
            body: JSON.stringify(b),
          }
        : {};
      const response = await fetch(`api/index.php?r=${r}`, init);
      return [response.status, await response.json()];
    },
    [route, body],
  );

test('site reviews and their photos on the server, for the project owner only', { skip: !hasPhp }, async () => {
  const PHOTO =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const owner = await visitor();
  await register(owner, 'Sam', email('sam'));
  await owner.waitForSelector('#home:not([hidden])');
  const [, { spec }] = await call(owner, 'specs/create', { id: 'projectsam1', kind: 'project', title: 'Site' });
  const review = {
    id: 'reviewsam1',
    number: 1,
    date: '2026-11-14',
    attendees: 'Sam',
    observations: [
      { id: 'obs00001', location: 'Hall', status: 'defect', photos: [{ id: 'photo0001', caption: 'crack' }] },
      { id: 'obs00002', status: 'nonsense', due: 'soon', photos: [{ id: 'bad id!' }] },
    ],
  };
  assert.deepEqual(await call(owner, 'reviews/save', { specId: spec.id, review }), [200, { ok: true }]);
  const photo = (id, data) => ({ specId: spec.id, reviewId: review.id, id, data });
  assert.deepEqual(await call(owner, 'photos/add', photo('photo0001', PHOTO)), [200, { ok: true }]);
  assert.deepEqual((await call(owner, 'photos/add', photo('photo0002', 'data:text/html;base64,PGI+')))[0], 400);

  const [, { reviews }] = await call(owner, `reviews/list&specId=${spec.id}`);
  assert.equal(reviews.length, 1);
  assert.deepEqual(
    reviews[0].observations.map((o) => [o.status, o.due, o.photos]),
    [
      ['defect', '', [{ id: 'photo0001', caption: 'crack' }]],
      ['remark', '', []],
    ],
    'what the server keeps is cleaned',
  );
  const photos = (page) => call(page, `photos/list&specId=${spec.id}&reviewId=${review.id}`);
  assert.deepEqual(await photos(owner), [200, { photos: { photo0001: PHOTO } }]);

  // Another account sees none of it, as if it did not exist.
  const other = await visitor();
  await register(other, 'Tom', email('tom'));
  await other.waitForSelector('#home:not([hidden])');
  assert.equal((await call(other, `reviews/list&specId=${spec.id}`))[0], 404);
  assert.equal((await photos(other))[0], 404);
  assert.equal((await call(other, 'reviews/save', { specId: spec.id, review }))[0], 404);
  assert.equal((await call(other, 'reviews/delete', { specId: spec.id, id: review.id }))[0], 404);

  // A photo the review no longer refers to is dropped; deleting the review takes its photos along.
  const without = { ...review, observations: [{ ...review.observations[0], photos: [] }] };
  await call(owner, 'reviews/save', { specId: spec.id, review: without });
  assert.deepEqual(await photos(owner), [200, { photos: {} }]);
  assert.deepEqual(await call(owner, 'reviews/delete', { specId: spec.id, id: review.id }), [200, { ok: true }]);
  assert.equal((await photos(owner))[0], 404);
  assert.deepEqual([...owner.errors, ...other.errors], []);
});

test('an older database gets the columns added since', { skip: !hasPhp || !!process.env.ONWORD_TEST_CONFIG }, () => {
  const file = join(mkdtempSync(join(tmpdir(), 'onword-upgrade-')), 'old.sqlite');
  // The users, documents and articles tables as schema version 3 created them.
  const script = `require '${join(ROOT, 'api/lib/db.php')}';
      $db = new PDO('sqlite:${file}', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
      $db->exec('CREATE TABLE schema_info (version INT NOT NULL)');
      $db->exec('INSERT INTO schema_info (version) VALUES (3)');
      $db->exec('CREATE TABLE documents (id VARCHAR(32) NOT NULL PRIMARY KEY, owner_id INT NOT NULL,
        title VARCHAR(200) NOT NULL, snippet TEXT NOT NULL, page TEXT NULL, html TEXT NOT NULL,
        rev INT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)');
      $db->exec('CREATE TABLE articles (id VARCHAR(32) NOT NULL PRIMARY KEY, spec_id VARCHAR(32) NOT NULL,
        parent_id VARCHAR(32) NULL, number VARCHAR(60) NOT NULL, title VARCHAR(300) NOT NULL, unit VARCHAR(30) NOT NULL,
        html TEXT NOT NULL, source_id VARCHAR(32) NULL, line_data TEXT NOT NULL, price DOUBLE NOT NULL DEFAULT 0)');
      $db->exec('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email VARCHAR(190) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL, password_hash VARCHAR(255) NOT NULL, created_at BIGINT NOT NULL)');
      ensure_schema($db);
      $columns = fn ($table) => array_column($db->query("PRAGMA table_info($table)")->fetchAll(), 'name');
      echo json_encode([(int) $db->query('SELECT version FROM schema_info')->fetchColumn(),
        in_array('styles', $columns('documents')), in_array('removed', $columns('articles')),
        in_array('sso_subject', $columns('users')), in_array('template', $columns('documents'))]);`;
  const [version, hasStyles, hasRemoved, hasSso, hasTemplate] = JSON.parse(
    execFileSync('php', ['-r', script]).toString(),
  );
  assert.equal(hasTemplate, true, 'documents can be templates');
  assert.equal(hasSso, true, 'accounts can be linked to a sign-on provider');
  assert.equal(hasStyles, true);
  assert.equal(hasRemoved, true, 'articles taken out of a project are kept');
  assert.ok(version >= 8);
});

/** A bare API client with its own cookie and address, like a script someone runs against the site. */
function apiClient(ip) {
  let cookie = '';
  let csrf = '';
  async function send(route, body) {
    const response = await fetch(`${base}api/index.php?r=${route}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, 'X-Test-IP': ip, cookie },
      body: body && JSON.stringify(body),
    });
    const set = response.headers.getSetCookie().map((c) => c.split(';')[0]);
    if (set.length) cookie = set.join('; ');
    const data = await response.json();
    if (data.csrf) csrf = data.csrf;
    return [response.status, data.error ?? 'ok'];
  }
  return { get: (route) => send(route), post: (route, body) => send(route, body), start: () => send('auth/me') };
}

test('sign-in and registration are throttled without locking anyone out', { skip: !hasPhp }, async () => {
  const victim = apiClient('198.51.100.1');
  await victim.start();
  const account = { name: 'Vic', email: email('vic'), password: 'blue horse battery' };
  assert.deepEqual(await victim.post('auth/register', account), [200, 'ok']);
  await victim.post('auth/logout', {});

  // Someone else guessing the password is stopped, without the owner being locked out.
  const guesser = apiClient('198.51.100.2');
  await guesser.start();
  for (let i = 0; i < 8; i++) {
    assert.deepEqual(await guesser.post('auth/login', { email: account.email, password: `guess ${i}` }), [
      401,
      'bad_credentials',
    ]);
  }
  assert.deepEqual(await guesser.post('auth/login', { email: account.email, password: account.password }), [
    429,
    'too_many_attempts',
  ]);
  assert.deepEqual(await victim.post('auth/login', account), [200, 'ok'], 'the owner can still sign in');

  // One connection trying address after address is stopped too.
  const sprayer = apiClient('198.51.100.3');
  await sprayer.start();
  for (let i = 0; i < 30; i++) await sprayer.post('auth/login', { email: `nobody${i}@example.com`, password: 'x' });
  assert.deepEqual(await sprayer.post('auth/login', { email: email('other'), password: 'x' }), [
    429,
    'too_many_attempts',
  ]);

  // Passwords that are guessed first are refused; registration attempts are limited per connection.
  const registrar = apiClient('198.51.100.4');
  await registrar.start();
  const attempt = (n, password) => registrar.post('auth/register', { name: 'Reg', email: email(`reg${n}`), password });
  const weak = ['short1', 'password2024!', 'qwertyuiop', 'aaaaaaaaaaaa', `my reg4.${RUN} pass`]; // the last: the address
  for (const [n, password] of weak.entries()) {
    assert.deepEqual(await attempt(n, password), [400, 'weak_password'], password);
  }
  for (let n = 5; n < 10; n++) {
    assert.deepEqual(await attempt(n, 'blue horse battery'), [200, 'ok']);
    await registrar.post('auth/logout', {});
  }
  assert.deepEqual(await attempt(10, 'blue horse battery'), [429, 'too_many_attempts'], 'ten attempts an hour');
});

test(
  'single sign-on: new and existing accounts, allowed domains, and sign-ins that must fail',
  { skip: !hasPhp || !!process.env.ONWORD_TEST_CONFIG },
  async () => {
    const page = await visitor();
    /** Plays one sign-in through the given provider's button; resolves when the app shows a screen. */
    const signOn = async (label) => {
      await page.click(`.sso-btn:has-text("${label}")`);
      await page.waitForSelector('#home:not([hidden]), #account:not([hidden])');
    };
    const signOut = async () => {
      await page.click('[data-act="account.signOut"]');
      await page.waitForSelector('#account:not([hidden])');
    };
    assert.deepEqual(await page.locator('.sso-btn').allInnerTexts(), [
      'Sign in with Work account',
      'Sign in with Google',
    ]);
    assert.ok(await page.isVisible('#accountForm'), 'passwords are still allowed here');

    // A first sign-in with a work account creates the account, named after the provider's profile.
    oidc.user = { sub: 'work-1', email: `ann.${RUN}@work.test`, name: 'Ann Work' };
    await signOn('Work account');
    assert.equal(await page.textContent('#userName'), 'Ann Work');
    await page.click('[data-act="library.new"]');
    await page.waitForSelector('#editorView:not([hidden])');
    await page.click('.doc-bar .brand');
    await signOut();
    oidc.user = { ...oidc.user, name: 'Renamed at the provider' };
    await signOn('Work account');
    assert.equal(await page.textContent('#userName'), 'Ann Work', 'the same account the next time');
    assert.equal(await page.locator('.card').count(), 1, 'with its documents');
    await signOut();

    // An address outside the work domain, an unverified one, a cancelled and a forged sign-in are refused.
    const refused = async (label, user, message, forge = false) => {
      oidc.user = user;
      oidc.forge = forge;
      await signOn(label);
      assert.ok(await page.isVisible('#account'), message.source);
      assert.match(await page.textContent('#accountError'), message);
      oidc.forge = false;
    };
    await refused('Work account', { sub: 'work-2', email: `bob.${RUN}@else.test` }, /may not sign in here/);
    await refused('Google', { sub: 'g-1', email: `eve.${RUN}@gmail.test`, email_verified: false }, /may not sign in/);
    await refused('Google', null, /cancelled or refused/);
    await refused('Google', { sub: 'g-2', email: `mal.${RUN}@gmail.test` }, /did not work/, true);
    await page.goto(`${base}api/sso.php?code=stolen&state=guessed`);
    await page.waitForSelector('#account:not([hidden])');
    assert.match(await page.textContent('#accountError'), /not started here/, 'a sign-in it did not start');

    // A provider without domains signs in to the account that already has the address.
    const lena = apiClient('198.51.100.20');
    await lena.start();
    await lena.post('auth/register', { name: 'Lena', email: email('lena'), password: 'blue horse battery' });
    oidc.user = { sub: 'g-3', email: email('lena'), name: 'Lena Google' };
    await signOn('Google');
    assert.equal(await page.textContent('#userName'), 'Lena', 'linked to the existing account');
    assert.deepEqual(page.errors, []);
  },
);

test('the API refuses requests without a session or security token', { skip: !hasPhp }, async () => {
  const api = (route, init) =>
    fetch(`${base}api/index.php?r=${route}`, init).then(async (r) => [r.status, (await r.json()).error]);
  assert.deepEqual(await api('docs/list'), [401, 'signed_out']);
  assert.deepEqual(await api('prices/list'), [401, 'signed_out']);
  assert.deepEqual(await api('offers/list&specId=abcdefgh'), [401, 'signed_out']);
  assert.deepEqual(await api('auth/login', { method: 'POST', body: '{}' }), [403, 'csrf']);
  assert.deepEqual(await api('nothing/here'), [404, 'not_found']);
  assert.deepEqual(await api('auth/sso&provider=nobody'), [404, 'not_found']);
});
