import assert from 'node:assert/strict';
import { test } from 'node:test';
import { useApp, waitSaved } from './harness.mjs';

const { openApp } = useApp();
const cards = (page, list) => page.locator(`${list} .card-meta`).allInnerTexts();
const nav = (page, hash) => page.click(`#home .main-nav a[href="${hash}"]`);

/** Starts a project without a master from the Projects page; leaves it open in the workspace. */
async function newProject(page, title) {
  await nav(page, '#/');
  await page.click('[data-act="spec.newProject"]');
  await page.fill('#projectDlg [name=title]', title);
  await page.selectOption('#projectMaster', '');
  await page.click('#projectDlg .primary');
  await page.waitForSelector('#specView:not([hidden])');
}

test('the home screen shows the projects, and a project keeps its documents', async () => {
  const page = await openApp('#/');
  assert.ok(await page.isVisible('#projectsPage'), 'projects come first');
  assert.equal(await page.getAttribute('#home .main-nav a[aria-current="page"]', 'href'), '#/');
  assert.match(await page.innerText('#projectList'), /^No projects yet/);
  assert.ok(await page.isVisible('#recentEmpty'));

  await newProject(page, 'School');
  await page.fill('#specPhase', 'Tender');
  await page.click('[data-act="spec.view"][data-arg="documents"]');
  assert.equal(await page.textContent('#documentsPanel .spec-empty'), 'No documents in this project yet.');
  assert.deepEqual(await page.locator('#documentsPanel .template-name').allTextContents(), [
    'Blank',
    'Letter',
    'Meeting notes',
    'Résumé',
    'Project brief',
  ]);

  // A document started in the project says so, and leads back to it.
  await page.click('#documentsPanel .template[data-arg="letter"]');
  await page.waitForSelector('#editorView:not([hidden])');
  assert.equal(await page.inputValue('#title'), 'Letter');
  await page.waitForSelector('#docProject:not([hidden])');
  assert.equal(await page.textContent('#docProject'), 'School');
  await page.click('#editor');
  await page.keyboard.type('Dear contractor,');
  await waitSaved(page);
  await page.click('#docProject');
  await page.waitForSelector('#documentsPanel:not([hidden]) .doc-row');
  assert.match(await page.innerText('#documentsPanel .doc-list'), /^Letter\s+Edited/);

  // "Create document" files the specification's document under the project too.
  await page.click('[data-act="spec.compose"]');
  await page.waitForSelector('#editorView:not([hidden])');
  await page.waitForSelector('#docProject:not([hidden])');
  assert.equal(await page.inputValue('#title'), 'School');

  // The Documents page names each document's project and can show one project's documents.
  await page.click('.doc-bar .brand');
  await page.waitForSelector('#documentsPage:not([hidden]) .card');
  assert.deepEqual(await page.locator('#grid .card-project').allTextContents(), ['School', 'School']);
  await page.selectOption('#docFilter', { label: 'Not in a project' });
  assert.equal(await page.locator('#grid .card').count(), 0);
  assert.equal(await page.textContent('#empty'), 'No documents match.');
  await page.selectOption('#docFilter', { label: 'School' });
  assert.equal(await page.locator('#grid .card').count(), 2);

  await nav(page, '#/');
  await page.waitForSelector('#recentList .card');
  assert.match(await page.innerText('#projectList'), /School\s+Phase Tender\s+2 documents · changed/);
  assert.equal((await cards(page, '#recentList')).length, 2);
  assert.match((await cards(page, '#recentList'))[1], /^Letter\nSchool\nEdited/);
  assert.equal(await page.title(), 'OnWord');
  assert.deepEqual(page.errors, []);
});

test('a document moves into a project and out; deleting the project keeps it', async () => {
  const page = await openApp();
  await page.click('[data-act="library.new"]');
  await page.waitForSelector('#editorView:not([hidden])');
  assert.ok(await page.isHidden('#docProject'), 'a document from the Documents page is in no project');
  await page.click('#editor');
  await page.keyboard.type('Site notes');
  await waitSaved(page);
  await page.click('.doc-bar .brand');
  const move = async () => {
    await page.click('#grid .card-more');
    await page.click('.pop [data-act="library.move"]');
  };
  await move();
  await page.waitForSelector('#toast:not([hidden])');
  assert.match(await page.textContent('#toast'), /no projects yet/);

  await newProject(page, 'Villa');
  await page.click('.spec-bar .brand');
  await nav(page, '#/docs');
  await move();
  await page.waitForSelector('#moveDlg[open]');
  await page.selectOption('#moveProject', { label: 'Villa' });
  await page.click('#moveDlg .primary');
  await page.waitForSelector('#grid .card-project:not([hidden])');
  assert.equal(await page.textContent('#grid .card-project'), 'Villa');

  // Taken out in the project, it stays a document.
  await nav(page, '#/');
  await page.click('#projectList a');
  await page.waitForSelector('#specView:not([hidden])');
  await page.click('[data-act="spec.view"][data-arg="documents"]');
  assert.equal(await page.locator('#documentsPanel .doc-row').count(), 1);
  await page.click('#documentsPanel [data-act="spec.unfileDocument"]');
  await page.waitForSelector('#documentsPanel .spec-empty');
  await page.click('.spec-bar .brand');
  await nav(page, '#/docs');
  assert.ok(await page.isHidden('#grid .card-project'));

  // Deleting the project says what happens to its documents, and keeps them.
  await move();
  await page.selectOption('#moveProject', { label: 'Villa' });
  await page.click('#moveDlg .primary');
  await nav(page, '#/');
  await page.waitForSelector('#projectList .project-card');
  let question = '';
  page.once('dialog', (dialog) => {
    question = dialog.message();
    dialog.accept();
  });
  await page.click('#projectList [data-act="spec.remove"]');
  await page.waitForFunction(() => /^No projects yet/.test(document.querySelector('#projectList').innerText));
  assert.match(question, /Its 1 document will stay, in no project\./);
  await nav(page, '#/docs');
  await page.selectOption('#docFilter', { label: 'Not in a project' });
  assert.equal(await page.textContent('#grid .card-title'), 'Untitled document');
  assert.ok(await page.isHidden('#grid .card-project'));
  assert.deepEqual(page.errors, []);
});
