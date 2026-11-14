import assert from 'node:assert/strict';
import { test } from 'node:test';
import { html, useApp } from './harness.mjs';

const { openApp } = useApp();
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const saved = (page) => page.waitForFunction(() => document.querySelector('#reviewState').textContent === 'Saved');
const card = (n) => `#reviewBody article.obs:nth-of-type(${n + 1})`; // the cards are the only <article>s

/** A master with two articles and a project built from it, left open on its Site reviews tab. */
async function project(page) {
  page.on('dialog', (dialog) => dialog.accept('Standard'));
  await page.click('#home .main-nav a[href="#/masters"]');
  await page.click('[data-act="spec.newMaster"]');
  await page.waitForSelector('#specView:not([hidden])');
  for (const title of ['Walls', 'Roof']) {
    await page.click('.spec-tree-tools [data-act="spec.addArticle"]');
    await page.fill('#articlePanel [data-field="title"]', title);
  }
  await page.waitForFunction(() => document.querySelector('#specState').textContent === 'Saved');
  await page.click('.spec-bar .brand');
  await page.click('#home .main-nav a[href="#/"]');
  await page.click('[data-act="spec.newProject"]');
  await page.fill('#projectDlg [name=title]', 'School');
  await page.waitForSelector('#projectArticles input');
  await page.click('#projectDlg .primary');
  await page.waitForSelector('#specView:not([hidden])');
  await page.click('[data-act="spec.view"][data-arg="reviews"]');
}

/** Adds a photo to an observation card through the photo picker. */
async function addPhoto(page, n, name) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click(`${card(n)} [data-act="site.photo"]`),
  ]);
  await chooser.setFiles({ name, mimeType: 'image/png', buffer: PNG });
  await page.waitForSelector(`${card(n)} .photo img`);
}

test('a site review on a phone: visit, observations with photos and follow-up, kept and reported', async () => {
  const page = await openApp();
  await page.setViewportSize({ width: 390, height: 844 });
  await project(page);
  assert.match(await page.innerText('#reviewsPanel'), /No site reviews yet/);
  await page.click('[data-act="spec.newReview"]');
  await page.waitForSelector('#reviewView:not([hidden])');
  assert.equal(await page.textContent('#reviewTitle'), 'Site review 1');
  assert.equal(await page.textContent('#reviewProject'), 'School');
  assert.match(await page.inputValue('[data-field="date"]'), /^\d{4}-\d{2}-\d{2}$/, 'dated today');
  await page.fill('[data-field="date"]', '2026-11-14');
  await page.fill('[data-field="attendees"]', 'Ann (architect), Bo (contractor)');
  await page.fill('[data-field="weather"]', 'Rain');
  await page.fill('[data-field="temperature"]', '8 °C');

  await page.click('[data-act="site.addObservation"]');
  await page.fill(`${card(0)} [data-o="location"]`, 'Ground floor, kitchen');
  await page.click(`${card(0)} [data-act="site.status"][data-arg$=":defect"]`);
  assert.ok(await page.isVisible(`${card(0)}.status-defect`));
  await page.fill(`${card(0)} [data-o="text"]`, 'Crack in the wall.');
  await page.selectOption(`${card(0)} [data-o="articleId"]`, { label: '1 Walls' });
  await addPhoto(page, 0, 'crack.png');
  await page.fill(`${card(0)} [data-caption]`, 'Crack above the window');
  await page.fill(`${card(0)} [data-o="action"]`, 'Contractor repairs');
  await page.fill(`${card(0)} [data-o="due"]`, '2026-11-30');
  await page.click('[data-act="site.addObservation"]');
  await page.fill(`${card(1)} [data-o="location"]`, 'Roof');
  await page.click(`${card(1)} [data-act="site.status"][data-arg$=":ok"]`);
  // On a phone the page does not scroll sideways.
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await saved(page);

  await page.reload();
  await page.waitForSelector('#reviewView:not([hidden])');
  await page.waitForSelector(`${card(0)} .photo img`);
  assert.equal(await page.inputValue(`${card(0)} [data-caption]`), 'Crack above the window', 'stored with its photo');
  assert.equal(await page.inputValue('[data-field="attendees"]'), 'Ann (architect), Bo (contractor)');
  assert.ok(await page.isVisible(`${card(1)}.status-ok`));

  // Back in the project: the list, and the next review takes over what was left open.
  await page.click('#reviewBack');
  await page.waitForSelector('#reviewsPanel:not([hidden]) .review-row');
  assert.match(
    await page.innerText('#reviewsPanel'),
    /Site review 1\s+2026-11-14\s+2 observations · 1 open · 1 defect/,
  );
  await page.click('[data-act="spec.newReview"]');
  await page.waitForSelector('#reviewView:not([hidden])');
  assert.equal(await page.textContent('#reviewTitle'), 'Site review 2');
  assert.equal(await page.locator('#reviewBody .obs').count(), 1, 'only the open item');
  assert.equal(await page.inputValue(`${card(0)} [data-o="location"]`), 'Ground floor, kitchen');
  assert.equal(await page.textContent(`${card(0)} .obs-from`), 'Carried over from site review 1');
  assert.equal(await page.locator(`${card(0)} .photo`).count(), 0, 'photos stay with their own review');
  await page.click(`${card(0)} [data-o="done"]`);
  await saved(page);

  // The report of review 1 is an ordinary document.
  await page.click('#reviewBack');
  await page.waitForSelector('#reviewsPanel:not([hidden]) .review-row');
  await page.click('.review-row a:has-text("Site review 1")');
  await page.waitForSelector('#reviewView:not([hidden]) .photo img');
  await page.click('[data-act="site.report"]');
  await page.waitForSelector('#editorView:not([hidden])');
  assert.equal(await page.inputValue('#title'), 'Site review 1 – School');
  await page.waitForSelector('#docProject:not([hidden])');
  assert.equal(await page.textContent('#docProject'), 'School', 'the report is filed under the project');
  const report = await html(page); // dates are written in the reader's own language
  assert.match(report, /^<h1>Site review 1<\/h1><p class="subtitle">School — [^<]*2026<\/p>/);
  assert.match(report, /Ann \(architect\), Bo \(contractor\)/);
  assert.match(
    report,
    /<h3>1\. Ground floor, kitchen — Defect<\/h3><p><i>Article 1 Walls<\/i><\/p><p>Crack in the wall\.<\/p>/,
  );
  assert.match(report, /<img src="data:image\/jpeg;base64,[^"]+" alt="Crack above the window"/);
  assert.match(report, /<b>Action: Contractor repairs — due [^<]*30[^<]*<\/b>/);
  assert.match(report, /<h2>Open items<\/h2><table/);
  assert.deepEqual(page.errors, []);
});

test('removing an observation, a photo and a whole review asks first', async () => {
  const page = await openApp();
  await project(page);
  await page.click('[data-act="spec.newReview"]');
  await page.waitForSelector('#reviewView:not([hidden])');
  await page.click('[data-act="site.addObservation"]');
  await addPhoto(page, 0, 'one.png');
  await page.click(`${card(0)} [data-act="site.removePhoto"]`);
  assert.equal(await page.locator(`${card(0)} .photo`).count(), 0);
  await page.click(`${card(0)} [data-act="site.removeObservation"]`);
  assert.equal(await page.locator('#reviewBody .obs').count(), 0);
  await saved(page);
  await page.click('#reviewBack');
  await page.waitForSelector('#reviewsPanel:not([hidden]) .review-row');
  await page.click('[data-act="spec.removeReview"]');
  await page.waitForSelector('#reviewsPanel .spec-empty');
  assert.match(await page.innerText('#reviewsPanel'), /No site reviews yet/);
  assert.deepEqual(page.errors, []);
});
