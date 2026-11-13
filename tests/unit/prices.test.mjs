import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalSpecStore } from '../../src/core/spec/localStore.js';
import { blankArticle } from '../../src/core/spec/model.js';
import { collectPrices, deviation, libraryKey, priceStats, roundPrice } from '../../src/core/spec/prices.js';

const record = (specId, price, more = {}) => ({
  sourceId: 'm1',
  specId,
  project: `P${specId}`,
  unit: 'm²',
  price,
  updated: 0,
  ...more,
});

test('price statistics: range, average, latest, and only for the same article and unit', () => {
  const records = [
    record('a', 40, { updated: 1 }),
    record('b', 55, { updated: 3 }),
    record('b', 48, { updated: 3 }),
    record('c', 999, { unit: 'st' }),
    record('d', 999, { sourceId: 'm2' }),
  ];
  assert.deepEqual(priceStats(records, 'm1', ' M² '), {
    count: 3,
    projects: 2,
    min: 40,
    max: 55,
    average: 47.67,
    latest: 55,
  });
  assert.equal(priceStats(records, 'm1', 'kg'), null, 'another unit is not comparable');
  assert.equal(priceStats(records, null, 'm²'), null, 'an article without a master article has no library');
  assert.equal(roundPrice(1.005 + 0.001), 1.01);
});

test('deviation from the average', () => {
  const stats = priceStats([record('a', 50)], 'm1', 'm²');
  assert.equal(Math.round(deviation(60, stats) * 100), 20);
  assert.equal(Math.round(deviation(45, stats) * 100), -10);
  assert.equal(deviation(0, stats), null, 'an article without a price is not compared');
  assert.equal(deviation(60, null), null);
});

test('library key: a master files prices under its own articles, a project under their source', () => {
  const article = { ...blankArticle({ sourceId: 'm1' }), id: 'p1' };
  assert.equal(libraryKey({ kind: 'master' }, article), 'p1');
  assert.equal(libraryKey({ kind: 'project' }, article), 'm1');
  assert.equal(libraryKey({ kind: 'project' }, { ...article, sourceId: null }), null);
});

test('collected prices: priced articles of projects that came from a master', () => {
  const specs = [
    { id: 'm', kind: 'master', title: 'Master', updated: 1 },
    { id: 'p', kind: 'project', title: 'School', updated: 7 },
  ];
  const articles = {
    m: [{ ...blankArticle({ price: 10, unit: 'm' }), id: 'm1' }],
    p: [
      { ...blankArticle({ sourceId: 'm1', price: 12, unit: 'm' }), id: 'p1' },
      { ...blankArticle({ sourceId: 'm1', price: 0, unit: 'm' }), id: 'p2' },
      { ...blankArticle({ price: 30, unit: 'm' }), id: 'p3' },
    ],
  };
  assert.deepEqual(collectPrices(specs, articles), [
    { sourceId: 'm1', specId: 'p', project: 'School', unit: 'm', price: 12, updated: 7 },
  ]);
});

test('local store: the price library comes from the stored projects', async () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const store = createLocalSpecStore({ storage });
  const master = await store.create({ kind: 'master', title: 'Master' });
  await store.saveArticle(master.id, { ...blankArticle({ unit: 'm', price: 5 }), id: 'm1' });
  const project = await store.create({ kind: 'project', title: 'School', masterId: master.id, articleIds: ['m1'] });
  const [copy] = (await store.get(project.id)).articles;
  await store.saveArticle(project.id, { ...copy, price: 8 });
  assert.deepEqual(
    (await store.prices()).map((r) => [r.sourceId, r.project, r.price]),
    [['m1', 'School', 8]],
  );
});
