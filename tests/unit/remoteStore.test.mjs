import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRemoteStore } from '../../src/core/remoteStore.js';

/** A stand-in for the server API that records requests and lets a test decide how each one ends. */
function fakeApi() {
  const calls = [];
  const waiting = [];
  return {
    calls,
    post(route, body) {
      calls.push([route, body]);
      return new Promise((resolve, reject) => waiting.push({ resolve, reject }));
    },
    get: async () => ({ documents: [] }),
    /** Completes the oldest unanswered request. */
    answer(value) {
      waiting.shift().resolve(value);
    },
    fail(code, status = 500) {
      waiting.shift().reject(Object.assign(new Error(code), { code, status }));
    },
  };
}
const settle = () => new Promise((done) => setTimeout(done, 0));
const setup = () => {
  const api = fakeApi();
  const conflicts = [];
  const store = createRemoteStore({ api, onConflict: (title) => conflicts.push(title) });
  return { api, store, conflicts };
};

test('a new document is usable at once and created on the server in the background', async () => {
  const { api, store } = setup();
  const doc = store.create({ title: 'Plan', html: '<p>a</p>' });
  assert.match(doc.id, /^[a-z0-9]{16}$/);
  assert.equal(store.read(doc.id), '<p>a</p>');
  assert.equal(store.index().length, 1);
  assert.equal(store.syncState(doc.id), 'saving');
  await settle();
  assert.equal(api.calls[0][0], 'docs/create');
  api.answer({ rev: 1 });
  await settle();
  assert.equal(store.syncState(doc.id), 'saved');
  assert.equal(store.pending(), 0);
});

test('changes made while a save is under way are merged into one following request', async () => {
  const { api, store } = setup();
  const doc = store.create({ title: 'Plan' });
  store.write(doc.id, '<p>1</p>', { title: 'Plan 1' });
  store.write(doc.id, '<p>2</p>', { snippet: 'two' });
  store.write(doc.id, '<p>3</p>', {});
  assert.equal(store.read(doc.id), '<p>3</p>', 'the local copy is always current');
  await settle();
  api.answer({ rev: 1 }); // create
  await settle();
  assert.deepEqual(api.calls[1], [
    'docs/update',
    { id: doc.id, rev: 1, title: 'Plan 1', snippet: 'two', html: '<p>3</p>' },
  ]);
  api.answer({ rev: 2, updated: 5 });
  await settle();
  assert.equal(api.calls.length, 2, 'nothing left to send');
  assert.equal(store.meta(doc.id).rev, 2);
  assert.equal(store.syncState(doc.id), 'saved');
});

test('a conflict stops saving that document and is reported once', async () => {
  const { api, store, conflicts } = setup();
  const doc = store.create({ title: 'Plan' });
  await settle();
  api.answer({ rev: 1 });
  store.write(doc.id, '<p>mine</p>', {});
  await settle();
  api.fail('conflict', 409);
  await settle();
  assert.deepEqual(conflicts, ['Plan']);
  assert.equal(store.syncState(doc.id), 'conflict');
  assert.equal(store.write(doc.id, '<p>more</p>', {}), false, 'further saves are refused');
  assert.equal(store.read(doc.id), '<p>more</p>', 'but the text is kept in this browser');
  assert.equal(api.calls.length, 2);
});

test('a failed save is kept and marked for retry', async () => {
  const { api, store } = setup();
  const doc = store.create({ title: 'Plan' });
  await settle();
  api.answer({ rev: 1 });
  store.write(doc.id, '<p>offline</p>', {});
  await settle();
  api.fail('offline', 0);
  await settle();
  assert.equal(store.syncState(doc.id), 'retrying');
  assert.equal(store.pending(), 1);
});

test('view-only documents cannot be written', () => {
  const { store } = setup();
  const doc = store.create({ title: 'Theirs' });
  store.meta(doc.id).role = 'view';
  assert.equal(store.write(doc.id, '<p>x</p>', {}), false);
  assert.equal(store.addVersion(doc.id, '<p>x</p>', ''), false);
});

test('a copy is made by the server and listed locally right away', async () => {
  const { api, store } = setup();
  const doc = store.create({ title: 'Plan' });
  const copy = store.duplicate(doc.id);
  assert.equal(copy.title, 'Copy of Plan');
  assert.equal(store.index().length, 2);
  await settle();
  api.answer({ rev: 1 });
  await settle();
  assert.deepEqual(api.calls[1], ['docs/copy', { id: doc.id, newId: copy.id }]);
});
