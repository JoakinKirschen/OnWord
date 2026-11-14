import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate } from '../../src/core/spec/formula.js';
import { createLocalSpecStore } from '../../src/core/spec/localStore.js';
import {
  amountOf,
  blankArticle,
  bringIn,
  copyArticles,
  differsFromSource,
  outline,
  planRemoval,
  quantityOf,
  subtree,
  suggestNumber,
} from '../../src/core/spec/model.js';
import { quantitiesCsv, specToHtml } from '../../src/core/spec/output.js';

const article = (id, number, parentId = null, more = {}) => ({
  ...blankArticle(),
  id,
  number,
  parentId,
  title: `T${id}`,
  ...more,
});
const TREE = [
  article('a', '10'),
  article('b', '2'),
  article('c', '10.20', 'a'),
  article('d', '10.3', 'a'),
  article('e', '10.3.1', 'd'),
];

test('formulas: arithmetic with precedence, parentheses and decimal commas', () => {
  assert.equal(evaluate('2 + 3 * 4'), 14);
  assert.equal(evaluate('(2 + 3) * 4'), 20);
  assert.equal(evaluate('2,5 * 4'), 10);
  assert.equal(evaluate('-3 + 10 / 4'), -0.5);
  assert.equal(evaluate('2 * -(1 + 1)'), -4);
  assert.equal(evaluate(''), 0);
  for (const bad of ['2 +', '(2', '2 3', 'abc', '1/0', 'alert(1)', '2 ** 3'])
    assert.ok(Number.isNaN(evaluate(bad)), bad);
});

test('outline orders siblings by number, numerically', () => {
  assert.deepEqual(
    outline(TREE).map(({ article: a, depth }) => `${a.number}@${depth}`),
    ['2@0', '10@0', '10.3@1', '10.3.1@2', '10.20@1'],
  );
});

test('an article whose parent is missing is kept at the top level', () => {
  assert.deepEqual(
    outline([article('x', '5', 'gone')]).map(({ depth }) => depth),
    [0],
  );
});

test('subtree collects an article and everything under it', () => {
  assert.deepEqual([...subtree(TREE, 'a')].sort(), ['a', 'c', 'd', 'e']);
  assert.deepEqual([...subtree(TREE, 'b')], ['b']);
});

test('suggestNumber continues the siblings or starts below the parent', () => {
  assert.equal(suggestNumber(TREE, null), '11');
  assert.equal(suggestNumber(TREE, 'a'), '10.21');
  assert.equal(suggestNumber(TREE, 'e'), '10.3.1.1');
  assert.equal(suggestNumber([], null), '1');
  assert.equal(suggestNumber([article('z', '09')], null), '10');
});

test('copyArticles keeps the structure across gaps and remembers the source', () => {
  let n = 0;
  const copies = copyArticles(TREE, ['a', 'e'], () => `new${++n}`);
  assert.deepEqual(
    copies.map((c) => [c.id, c.parentId, c.sourceId]),
    [
      ['new1', null, 'a'],
      ['new2', 'new1', 'e'],
    ],
  );
});

test('copyArticles adds to a project: under earlier copies, and nothing twice', () => {
  let n = 0;
  const project = [{ ...article('p1', '10'), sourceId: 'a' }];
  const copies = copyArticles(TREE, ['a', 'c', 'e', 'b'], () => `new${++n}`, project);
  assert.deepEqual(
    copies.map((c) => [c.id, c.parentId, c.sourceId]),
    [
      ['new1', null, 'b'],
      ['new2', 'p1', 'c'],
      ['new3', 'p1', 'e'],
    ],
  );
});

test('quantities and amounts', () => {
  const measured = article('m', '1', null, {
    unit: 'm²',
    price: 12.5,
    lines: [
      { text: 'room', formula: '4 * 3' },
      { text: 'hall', formula: '2,5' },
    ],
  });
  assert.equal(quantityOf(measured), 14.5);
  assert.equal(amountOf(measured), 181.25);
  const broken = { ...measured, lines: [{ text: '', formula: '4 *' }] };
  assert.ok(Number.isNaN(quantityOf(broken)));
  assert.equal(amountOf(broken), 0);
});

test('differsFromSource compares what the master defines', () => {
  const source = article('s', '1');
  assert.equal(differsFromSource({ ...source, number: '9', price: 3 }, source), false);
  assert.equal(differsFromSource({ ...source, html: '<p>changed</p>' }, source), true);
  assert.equal(differsFromSource(source, undefined), false);
});

test('a specification becomes a document with a heading per article', () => {
  const spec = {
    id: 's',
    kind: 'project',
    title: 'School <A>',
    masterId: null,
    phase: 'Tender',
    lot: '2',
    updated: 0,
    mine: true,
  };
  const html = specToHtml(spec, [
    article('a', '10', null, { title: 'Earthworks', html: '<p>Dig.</p>' }),
    article('b', '10.1', 'a', { title: 'Trench' }),
  ]);
  assert.equal(
    html,
    '<h1>School &lt;A&gt;</h1><p class="subtitle">Phase: Tender · Lot: 2</p><h2>10 Earthworks</h2><p>Dig.</p><h3>10.1 Trench</h3>',
  );
});

test('the bill of quantities exports measured articles as CSV for Excel', () => {
  const rows = [
    article('a', '10', null, { title: 'Earthworks' }),
    article('b', '10.1', 'a', { title: 'Trench; deep', unit: 'm', price: 2.5, lines: [{ text: '', formula: '10' }] }),
  ];
  const csv = quantitiesCsv(rows);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.deepEqual(csv.slice(1).trim().split('\r\n'), [
    'Number;Article;Unit;Quantity;Unit price;Amount',
    '10.1;"Trench; deep";m;10;2,5;25',
    ';Total;;;;25',
  ]);
});

test('local store: masters, projects built from chosen articles, removal of a branch', async () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const store = createLocalSpecStore({ storage });
  const master = await store.create({ kind: 'master', title: 'Master' });
  for (const a of TREE) await store.saveArticle(master.id, a);
  const project = await store.create({ kind: 'project', title: 'School', masterId: master.id, articleIds: ['a', 'd'] });
  const loaded = await store.get(project.id);
  assert.equal(loaded.spec.masterId, master.id);
  assert.deepEqual(
    loaded.articles.map((a) => a.sourceId),
    ['a', 'd'],
  );

  await store.removeArticle(master.id, 'a');
  assert.deepEqual(
    (await store.get(master.id)).articles.map((a) => a.id),
    ['b'],
  );
  await store.update(project.id, { title: 'School 2' });
  assert.deepEqual(
    (await store.list()).map((s) => s.title),
    ['Master', 'School 2'],
  );
  await store.remove(project.id);
  assert.equal(await store.get(project.id), null);
});

test('planRemoval keeps what can come back from the master and deletes the rest', () => {
  const project = [
    { ...article('p', '10'), sourceId: 'a' },
    { ...article('q', '10.1', 'p'), sourceId: 'c' },
    article('own', '10.2', 'p'), // the user's, under a master article
    article('mine', '20'), // the user's, at the top
    article('sub', '20.1', 'mine'),
  ];
  const all = planRemoval(project, ['p', 'mine']);
  assert.deepEqual([...all.gone].sort(), ['mine', 'own', 'p', 'q', 'sub']);
  assert.deepEqual(
    all.kept.map((a) => a.id),
    ['p', 'q', 'own'],
    'the own article goes with its master article',
  );
  assert.deepEqual(all.deleted, ['mine'], 'one deletion takes what is under it along');
  const alone = planRemoval(project, ['own']);
  assert.deepEqual([alone.kept, alone.deleted], [[], ['own']], 'nothing would bring it back while p stays');
});

test('bringIn restores removed copies as they were, under the right parent, and copies the rest', () => {
  let n = 0;
  const removed = [
    { ...article('q', '10.3', 'gone-parent'), sourceId: 'd', removed: true, html: '<p>edited</p>' },
    { ...article('own', '10.3.9', 'q'), removed: true },
  ];
  const kept = [{ ...article('p', '10'), sourceId: 'a' }];
  const { restored, copies } = bringIn(TREE, ['d', 'e'], () => `new${++n}`, { articles: kept, removed });
  assert.deepEqual(
    restored.map((a) => [a.id, a.parentId, a.removed, a.html]),
    [
      ['q', 'p', false, '<p>edited</p>'],
      ['own', 'q', false, '<p><br></p>'],
    ],
  );
  assert.deepEqual(
    copies.map((c) => [c.id, c.parentId, c.sourceId]),
    [['new1', 'q', 'e']],
  );
});
