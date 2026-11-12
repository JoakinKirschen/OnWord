/** Shared setup for end-to-end tests: a static server for the repo and a headless browser. */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
// Tests run under the Content-Security-Policy the web host will send, so a violation fails here first.
const CSP = readFileSync(join(ROOT, '.htaccess'), 'utf8').match(/Content-Security-Policy "([^"]+)"/)[1];

/**
 * Registers before/after hooks for the calling test file and returns helpers.
 * Every `openApp()` call gets a fresh browser context, i.e. empty storage.
 */
export function useApp() {
  let server, browser, base;
  const contexts = [];

  before(async () => {
    server = createServer(async (req, res) => {
      const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
      try {
        const file = join(ROOT, path === '/' ? 'index.html' : path);
        const body = await readFile(file);
        const type = TYPES[extname(file)] || 'application/octet-stream';
        res.writeHead(200, { 'content-type': type, 'content-security-policy': CSP });
        res.end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${server.address().port}/`;
    browser = await chromium.launch();
  });

  after(async () => {
    await Promise.all(contexts.map((c) => c.close()));
    await browser?.close();
    server?.close();
  });

  /** Opens the library screen. `page.errors` collects uncaught errors and console errors. */
  async function openApp() {
    const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, acceptDownloads: true });
    contexts.push(context);
    const page = await context.newPage();
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && page.errors.push(m.text()));
    await page.goto(base);
    return page;
  }

  /** Opens the app with a new, focused, empty document. */
  async function openEditor() {
    const page = await openApp();
    await page.click('[data-act="library.new"]');
    await page.waitForSelector('#editorView:not([hidden])');
    await page.click('#editor');
    return page;
  }

  return { openApp, openEditor };
}

export const html = (page) => page.evaluate(() => document.querySelector('#editor').innerHTML);
export const text = (page) => page.innerText('#editor');
/** Opens a menu-bar menu and clicks the item that runs `command` (optionally with `arg`). */
export async function menu(page, name, command, arg) {
  await page.click(`[data-menu="${name}"]`);
  await page.click(`.pop [data-act="${command}"]${arg ? `[data-arg="${arg}"]` : ''}`);
}
export const waitSaved = (page) =>
  page.waitForFunction(() => document.querySelector('#saveState').textContent === 'Saved');
