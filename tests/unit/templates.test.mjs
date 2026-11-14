import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSpecDirectory } from '../../src/core/spec/directory.js';
import { createDocumentStore } from '../../src/core/storage.js';
import { TEMPLATES, fromTemplate, templateChoices } from '../../src/core/templates.js';

/** In-memory Storage. */
function fakeStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}
const newStore = () => createDocumentStore({ storage: fakeStorage(), onQuotaExceeded: () => {} });

test('a new document starts from a built-in template, a stored one, or blank', async () => {
  const store = newStore();
  const page = { size: 'a4', orientation: 'landscape', margin: 'narrow' };
  const own = store.create({
    title: 'Minutes',
    html: '<p>Our minutes</p>',
    snippet: 'Our minutes',
    page,
    template: true,
  });
  const letter = TEMPLATES.find((t) => t.id === 'letter');
  assert.deepEqual(await fromTemplate(store, 'letter'), { title: 'Letter', html: letter.html });
  assert.deepEqual(await fromTemplate(store, own.id), {
    title: 'Minutes',
    html: '<p>Our minutes</p>',
    snippet: 'Our minutes',
    page,
    styles: undefined,
  });
  const plain = store.create({ title: 'Not a template' });
  assert.deepEqual(await fromTemplate(store, plain.id), {}, 'an ordinary document is not a template');
  assert.deepEqual(await fromTemplate(store), {});
});

test('the template choices are the built-in ones, then the stored ones by name', () => {
  const store = newStore();
  store.create({ title: 'Report', html: '<p>r</p>', template: true });
  store.create({ title: 'Agenda', html: '<p>a</p>', template: true });
  store.create({ title: 'A document' });
  const choices = templateChoices(store);
  assert.deepEqual(
    choices.map((c) => c.name),
    [...TEMPLATES.map((t) => t.name), 'Agenda', 'Report'],
  );
  assert.deepEqual(choices.at(-1).html, '<p>r</p>');
  assert.equal(choices.at(-1).builtIn, false);
});

test("the directory names the user's own projects only", async () => {
  const specs = [
    { id: 'p1', kind: 'project', title: 'School', mine: true },
    { id: 'm1', kind: 'master', title: 'Standard', mine: true },
    { id: 'm2', kind: 'master', title: 'Theirs', mine: false },
    { id: 'p0', kind: 'project', title: 'Annex', mine: true },
  ];
  let lists = 0;
  const directory = createSpecDirectory({
    specStore: { list: async () => (lists++, specs) },
  });
  assert.equal(directory.title('p1'), null, 'nothing is known before the first listing');
  await Promise.all([directory.refresh(), directory.refresh()]);
  assert.equal(lists, 1, 'listings at the same time share one request');
  assert.deepEqual(
    directory.projects().map((p) => p.title),
    ['Annex', 'School'],
  );
  assert.equal(directory.title('p1'), 'School');
  assert.equal(directory.title('m1'), null, 'a master is not a project');
  assert.equal(directory.title(null), null);
});
