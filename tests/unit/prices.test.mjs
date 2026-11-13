import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalSpecStore } from '../../src/core/spec/localStore.js';
import { blankArticle } from '../../src/core/spec/model.js';
import {
  collectPrices,
  deviation,
  expectedPrice,
  fitCurve,
  libraryKey,
  perDoubling,
  priceStats,
  roundPrice,
  suggestedPrice,
} from '../../src/core/spec/prices.js';

const record = (specId, price, more = {}) => ({
  sourceId: 'm1',
  specId,
  project: `P${specId}`,
  unit: 'm²',
  price,
  quantity: 0,
  updated: 0,
  ...more,
});
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);

test('price statistics: range, average, latest, and only for the same article and unit', () => {
  const records = [
    record('a', 40, { updated: 1, quantity: 10 }),
    record('b', 55, { updated: 3 }),
    record('b', 48, { updated: 3, quantity: 200 }),
    record('c', 999, { unit: 'st' }),
    record('d', 999, { sourceId: 'm2' }),
  ];
  const stats = priceStats(records, 'm1', ' M² ');
  assert.deepEqual(
    { ...stats, records: undefined, curve: undefined },
    { records: undefined, curve: undefined, count: 3, projects: 2, min: 40, max: 55, average: 47.67, latest: 55 },
  );
  assert.deepEqual(
    stats.records.map((r) => r.price),
    [48, 40, 55],
    'largest quantity first, unmeasured last',
  );
  assert.equal(priceStats(records, 'm1', 'kg'), null, 'another unit is not comparable');
  assert.equal(priceStats(records, null, 'm²'), null, 'an article without a master article has no library');
  assert.equal(roundPrice(1.005 + 0.001), 1.01);
});

test('the price curve: lower prices for larger quantities, read off for a quantity', () => {
  // 20 for 25 m and 10 for 100 m: the price halves when the quantity is four times as large.
  const records = [record('a', 20, { quantity: 25 }), record('b', 10, { quantity: 100 }), record('c', 99)];
  const curve = fitCurve(records);
  near(curve.exponent, -0.5);
  near(perDoubling(curve), Math.SQRT1_2 - 1);
  assert.deepEqual([curve.lowQuantity, curve.highQuantity].map(Math.round), [25, 100]);

  const stats = priceStats(records, 'm1', 'm²');
  assert.deepEqual(expectedPrice(stats, 50), { price: 14.14, outside: false });
  assert.deepEqual(expectedPrice(stats, 400), { price: 10, outside: true }, 'held at the end, not extrapolated');
  assert.deepEqual(expectedPrice(stats, 5), { price: 20, outside: true });
  assert.equal(expectedPrice(stats, 0), null, 'an unmeasured article has no expected price');
  assert.equal(suggestedPrice(stats, 50), 14.14);
  assert.equal(suggestedPrice(stats, 0), stats.average, 'without a quantity the average is suggested');
});

test('no curve with fewer than two different measured quantities', () => {
  assert.equal(fitCurve([record('a', 20, { quantity: 25 }), record('b', 10, { quantity: 25 })]), null);
  assert.equal(fitCurve([record('a', 20, { quantity: 25 }), record('b', 10, { quantity: Number.NaN })]), null);
  const stats = priceStats([record('a', 20, { quantity: 25 })], 'm1', 'm²');
  assert.equal(expectedPrice(stats, 25), null);
  assert.equal(suggestedPrice(stats, 25), 20);
});

test('deviation from a reference price', () => {
  assert.equal(Math.round(deviation(60, 50) * 100), 20);
  assert.equal(Math.round(deviation(45, 50) * 100), -10);
  assert.equal(deviation(0, 50), null, 'an article without a price is not compared');
  assert.equal(deviation(60, null), null);
});

test('library key: a master files prices under its own articles, a project under their source', () => {
  const article = { ...blankArticle({ sourceId: 'm1' }), id: 'p1' };
  assert.equal(libraryKey({ kind: 'master' }, article), 'p1');
  assert.equal(libraryKey({ kind: 'project' }, article), 'm1');
  assert.equal(libraryKey({ kind: 'project' }, { ...article, sourceId: null }), null);
});

test('collected prices: priced articles of projects that came from a master, with their quantity', () => {
  const specs = [
    { id: 'm', kind: 'master', title: 'Master', updated: 1 },
    { id: 'p', kind: 'project', title: 'School', updated: 7 },
  ];
  const lines = [
    { text: 'north', formula: '2 * 3' },
    { text: 'south', formula: '4' },
  ];
  const articles = {
    m: [{ ...blankArticle({ price: 10, unit: 'm' }), id: 'm1' }],
    p: [
      { ...blankArticle({ sourceId: 'm1', price: 12, unit: 'm', lines }), id: 'p1' },
      { ...blankArticle({ sourceId: 'm1', price: 0, unit: 'm' }), id: 'p2' },
      { ...blankArticle({ price: 30, unit: 'm' }), id: 'p3' },
    ],
  };
  assert.deepEqual(collectPrices(specs, articles), [
    { sourceId: 'm1', specId: 'p', project: 'School', unit: 'm', price: 12, quantity: 10, updated: 7 },
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
  await store.saveArticle(project.id, { ...copy, price: 8, lines: [{ text: '', formula: '120' }] });
  assert.deepEqual(
    (await store.prices()).map((r) => [r.sourceId, r.project, r.price, r.quantity]),
    [['m1', 'School', 8, 120]],
  );
});
