/**
 * End-to-end smoke test: drives the real app in headless Chromium through the main flows.
 * Needs Playwright (`npm i -D playwright && npx playwright install chromium`).
 * Run: node tests/smoke.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try {
    const file = join(ROOT, path === '/' ? 'index.html' : path);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}/`;

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 850 } });
const errs = [];
let failed = 0;
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
p.on('dialog', (d) => d.accept('Renamed'));
const ok = (name, pass) => { if (!pass) failed++; console.log(pass ? 'PASS' : 'FAIL', name); };

try {
  await p.goto(base);
  ok('empty state', await p.isVisible('#empty'));
  await p.click('[data-act="library.new"]'); await p.waitForSelector('#editorView:not([hidden])');
  await p.fill('#title', 'My Report');
  await p.click('#editor');
  await p.keyboard.type('Hello world'); await p.keyboard.press('Enter'); await p.keyboard.type('second foo line foo');
  const html = () => p.evaluate(() => document.querySelector('#editor').innerHTML);
  ok('paragraphs', /<p>Hello world<\/p><p>second foo line foo<\/p>/.test(await html()));
  // bold
  await p.keyboard.press('Control+A'); await p.click('[data-cmd=bold]');
  ok('bold', /font-weight|<b>/.test(await html())); ok('bold state', await p.evaluate(()=>document.querySelector('[data-cmd=bold]').classList.contains('on')));
  await p.click('[data-cmd=bold]');
  // font size
  await p.selectOption('#selSize', '24'); ok('size', /font-size: 24pt/.test(await html()));
  ok('size shown', await p.inputValue('#selSize') === '24');
  await p.selectOption('#selFont', 'Georgia'); ok('font', /Georgia/.test(await html()));
  // color
  await p.click('[data-colors=foreColor]'); await p.click('.swatches button:nth-child(9)'); ok('color', /color: rgb\(192, 53, 43\)/.test(await html()));
  // heading on first para
  await p.keyboard.press('Control+Home'); await p.selectOption('#selBlock', 'h1'); ok('h1', /<h1/.test(await html()));
  await p.selectOption('#selBlock', 'blockquote'); ok('quote', /<blockquote/.test(await html()) && !/<h1/.test(await html()));
  await p.selectOption('#selBlock', 'p'); ok('back to p', !/<blockquote/.test(await html()));
  await p.click('[data-cmd=justifyCenter]'); ok('center', /text-align: center/.test(await html()));
  await p.selectOption('#selSpacing', '2'); ok('spacing', /line-height: 2/.test(await html()));
  // list + table + link at end
  await p.keyboard.press('Control+End'); await p.keyboard.press('Enter');
  await p.click('[data-cmd=insertUnorderedList]'); await p.keyboard.type('item'); ok('list', /<ul>/.test(await html()));
  await p.keyboard.press('Enter'); await p.keyboard.press('Enter');
  await p.click('[data-act="table.dialog"]'); await p.click('#tableDlg .primary'); await p.waitForSelector('#editor td'); ok('table', (await p.locator('#editor td').count()) === 9);
  await p.click('#editor td >> nth=0'); await p.keyboard.type('a'); await p.keyboard.press('Tab'); await p.keyboard.type('b');
  ok('tab cell', await p.evaluate(()=>document.querySelectorAll('#editor td')[1].textContent==='b'));
  await p.click('[data-menu=Table]'); await p.click('.pop [data-arg=colRight]'); ok('col add', (await p.locator('#editor td').count()) === 12);
  await p.click('[data-menu=Table]'); await p.click('.pop [data-arg=delRow]'); ok('row del', (await p.locator('#editor td').count()) === 8);
  await p.keyboard.press('Control+End'); await p.keyboard.press('Control+k');
  await p.fill('#linkText', 'site'); await p.fill('#linkUrl', 'example.com'); await p.click('#linkDlg .primary'); await p.waitForSelector('#editor a');
  ok('link', /<a href="https:\/\/example.com">site<\/a>/.test(await html()));
  // find/replace
  await p.keyboard.press('Control+f'); await p.fill('#findInput', 'foo'); ok('find count', (await p.textContent('#findCount')) === '1 of 2');
  await p.fill('#replaceInput', 'bar'); await p.click('[data-act="find.replaceAll"]'); ok('replaced', /bar line bar/.test(await p.innerText('#editor')));
  await p.click('[data-act="find.close"]');
  // paste sanitize
  await p.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/html', '<p onclick="x()">pasted<script>alert(1)</script><a href="javascript:alert(1)">l</a></p>'); document.querySelector('#editor').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
  const h = await html(); ok('sanitized', /pasted/.test(h) && !/script|onclick|javascript:/.test(h));
  // image
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await p.setInputFiles('#imgInput', { name: 'a.png', mimeType: 'image/png', buffer: png }); await p.waitForSelector('#editor img');
  await p.evaluate(()=>{const i=document.querySelector('#editor img');i.style.width='80px';i.style.height='80px'}); await p.click('#editor img'); await p.click('[data-img="50"]'); ok('img resize', await p.evaluate(()=>document.querySelector('#editor img').style.width==='50%'));
  await p.waitForTimeout(700); ok('saved', (await p.textContent('#saveState')) === 'Saved');
  const [dl] = await Promise.all([p.waitForEvent('download'), (async()=>{ await p.click('[data-menu=File]'); await p.click('.pop [data-act="file.downloadHtml"]'); })()]);
  ok('download name', dl.suggestedFilename() === 'My Report.html');
  // reload persists
  await p.reload(); ok('persist', /bar line bar/.test(await p.innerText('#editor')) && await p.inputValue('#title') === 'My Report');
  await p.click('.doc-bar .brand'); await p.waitForSelector('#home:not([hidden])');
  ok('card', (await p.textContent('.card-title')) === 'My Report');
  await p.click('.card-more'); await p.click('.pop [data-act="library.copy"]'); ok('copy', (await p.locator('.card').count()) === 2);
  await p.click('.card-more >> nth=0'); await p.click('.pop [data-act="library.rename"]'); ok('rename', (await p.textContent('.card-title >> nth=0')) === 'Renamed');
  await p.fill('#search', 'zzz'); ok('search', (await p.locator('.card').count()) === 0); await p.fill('#search', '');
  await p.click('.card-more >> nth=0'); await p.click('.pop [data-act="library.delete"]'); ok('delete', (await p.locator('.card').count()) === 1);
  await p.click('[data-act="app.theme"]'); await p.click('.card'); await p.waitForSelector('#editorView:not([hidden])');
 
  ok('no console errors', errs.length === 0);
  if (errs.length) console.log(errs);
} finally {
  await b.close();
  server.close();
}
if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\nSmoke test passed.');
