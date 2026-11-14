import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMPTY_DOC } from '../../src/core/html.js';
import { createPreferences } from '../../src/core/preferences.js';
import { createDocumentStore } from '../../src/core/storage.js';

/** In-memory Storage. `limit` caps the total characters stored, to simulate a full quota. */
function fakeStorage(limit = Infinity) {
  const data = new Map();
  const size = () => [...data.values()].reduce((sum, value) => sum + value.length, 0);
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem(key, value) {
      const next = size() - (data.get(key)?.length ?? 0) + String(value).length;
      if (next > limit) throw new Error('QuotaExceededError');
      data.set(key, String(value));
    },
    removeItem: (key) => data.delete(key),
    keys: () => [...data.keys()],
  };
}
const setup = (limit) => {
  const storage = fakeStorage(limit);
  const failures = [];
  return { storage, failures, store: createDocumentStore({ storage, onQuotaExceeded: (op) => failures.push(op) }) };
};

test('create, read, write and index', () => {
  const { store } = setup();
  const doc = store.create({ title: 'Plan' });
  assert.equal(store.read(doc.id), EMPTY_DOC);
  assert.ok(store.write(doc.id, '<p>x</p>', { title: 'Plan B', snippet: 'x' }));
  assert.equal(store.read(doc.id), '<p>x</p>');
  assert.equal(store.meta(doc.id).title, 'Plan B');
  assert.equal(store.index().length, 1);
});

test('write with null html only updates metadata', () => {
  const { store } = setup();
  const doc = store.create({ title: 'A', html: '<p>keep</p>' });
  store.write(doc.id, null, { page: { size: 'a4', orientation: 'portrait', margin: 'normal' } });
  assert.equal(store.read(doc.id), '<p>keep</p>');
  assert.equal(store.meta(doc.id).page.size, 'a4');
});

test('duplicate copies content under a new id', () => {
  const { store } = setup();
  const doc = store.create({
    title: 'A',
    html: '<p>a</p>',
    snippet: 'a',
    page: { size: 'a4', orientation: 'portrait', margin: 'wide' },
  });
  const copy = store.duplicate(doc.id);
  assert.notEqual(copy.id, doc.id);
  assert.equal(copy.title, 'Copy of A');
  assert.equal(store.read(copy.id), '<p>a</p>');
  assert.equal(copy.page.margin, 'wide', 'page setup is copied');
  assert.equal(store.duplicate('missing'), null);
  assert.equal(copy.template, undefined, 'a copy of a document is a document');
});

test('a document can be copied as a template, which stays a template when copied', () => {
  const { store } = setup();
  const doc = store.create({ title: 'Report', html: '<p>r</p>' });
  const template = store.duplicate(doc.id, { title: 'Report', template: true });
  assert.deepEqual([template.title, template.template, store.read(template.id)], ['Report', true, '<p>r</p>']);
  assert.equal(store.meta(doc.id).template, undefined, 'the document stays a document');
  assert.equal(store.duplicate(template.id).template, true);
});

test('remove deletes content, versions and the index entry', () => {
  const { store, storage } = setup();
  const doc = store.create({ title: 'A' });
  store.addVersion(doc.id, '<p>v</p>', 'v');
  store.remove(doc.id);
  assert.deepEqual(store.index(), []);
  assert.deepEqual(storage.keys(), ['onword:index']);
});

test('versions are newest first and capped', () => {
  const { store } = setup();
  const doc = store.create({ title: 'A' });
  for (let i = 0; i < 14; i++) store.addVersion(doc.id, `<p>${i}</p>`, String(i));
  const versions = store.versions(doc.id);
  assert.equal(versions.length, 10);
  assert.equal(versions[0].snippet, '13');
});

test('a full quota is reported for documents and absorbed for versions', (t) => {
  t.mock.method(console, 'error', () => {});
  const { store, failures } = setup(400);
  const doc = store.create({ title: 'A' });
  assert.equal(store.write(doc.id, 'x'.repeat(1000), {}), false);
  assert.deepEqual(failures, ['write']);
  assert.equal(store.create({ title: 'B', html: 'x'.repeat(1000) }), null);
  assert.deepEqual(failures, ['write', 'create']);
  assert.equal(store.index().length, 1, 'the failed document left nothing behind');
  assert.equal(store.addVersion(doc.id, 'x'.repeat(1000), ''), false);
  assert.deepEqual(failures, ['write', 'create'], 'version failures are silent');
});

test('corrupt index data reads as empty', () => {
  const { store, storage } = setup();
  storage.setItem('onword:index', '{not json');
  assert.deepEqual(store.index(), []);
});

test('preferences round-trip and fall back', () => {
  const prefs = createPreferences(fakeStorage());
  assert.equal(prefs.get('outline', true), true);
  prefs.set('outline', false);
  assert.equal(prefs.get('outline', true), false);
});
