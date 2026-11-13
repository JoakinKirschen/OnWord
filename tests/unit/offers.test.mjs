import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCsv } from '../../src/core/csv.js';
import { createLocalSpecStore } from '../../src/core/spec/localStore.js';
import { blankArticle } from '../../src/core/spec/model.js';
import {
  compareOffers,
  detectColumns,
  headingField,
  matchLines,
  parseAmount,
  readLines,
} from '../../src/core/spec/offers.js';
import { columnIndex, columnName } from '../../src/core/xlsx.js';

const article = (id, number, title, more = {}) => ({ ...blankArticle({ number, title, unit: 'm', ...more }), id });
const measured = (formula) => ({ lines: [{ text: '', formula }] });

test('amounts as contractors write them', () => {
  assert.equal(parseAmount(12.5), 12.5);
  assert.equal(parseAmount('12,50'), 12.5);
  assert.equal(parseAmount('€ 1.234,56'), 1234.56);
  assert.equal(parseAmount('1,234.56'), 1234.56);
  assert.equal(parseAmount('1.234.567'), 1234567);
  assert.equal(parseAmount('12.5'), 12.5, 'a single dot is a decimal point');
  assert.equal(parseAmount('1 250,00'), 1250);
  assert.ok(Number.isNaN(parseAmount('')));
  assert.ok(Number.isNaN(parseAmount('n.v.t.')));
});

test('column headings in Dutch, French and English', () => {
  const fields = (headings) => headings.map(headingField);
  assert.deepEqual(fields(['Post', 'Omschrijving', 'Eenheid', 'Hoeveelheid', 'Eenheidsprijs', 'Totaal']), [
    'number',
    'title',
    'unit',
    'quantity',
    'price',
    'amount',
  ]);
  assert.deepEqual(fields(['N°', 'Désignation', 'Unité', 'Quantité', 'Prix unitaire', 'Montant']), [
    'number',
    'title',
    'unit',
    'quantity',
    'price',
    'amount',
  ]);
  assert.deepEqual(
    fields(['Number', 'Article', 'Unit', 'Quantity', 'Unit price', 'Amount']),
    ['number', 'title', 'unit', 'quantity', 'price', 'amount'],
    'the bill of quantities OnWord itself exports',
  );
  assert.equal(headingField('E.P.'), 'price');
  assert.equal(headingField('Opmerking'), undefined);
});

test('reading the priced lines under the headings', () => {
  const rows = [
    ['Meetstaat'],
    [],
    ['Post', 'Omschrijving', 'Eenheid', 'Hoeveelheid', 'Eenheidsprijs', 'Totaal'],
    ['1', 'Grondwerken'],
    ['1.1', 'Sleuf graven', 'm', 40, 18.5, 740],
    ['1.2', 'Aanvullen', 'm³', '12,5', '', '250'],
    ['', 'Subtotaal', '', '', '', 990],
    ['', 'Totaal', '', '', 5, 990],
  ];
  const layout = detectColumns(rows);
  assert.deepEqual(layout, {
    header: 2,
    columns: { number: 0, title: 1, unit: 2, quantity: 3, price: 4, amount: 5 },
  });
  assert.deepEqual(readLines(rows, layout), [
    { number: '1.1', title: 'Sleuf graven', unit: 'm', quantity: 40, price: 18.5 },
    { number: '1.2', title: 'Aanvullen', unit: 'm³', quantity: 12.5, price: 20 },
  ]);
  assert.equal(detectColumns([['Naam', 'Adres']]), null, 'no headings, no layout');
});

test('matching lines to articles: by id, number, then a title only one article has', () => {
  const articles = [article('a', '1.1', 'Trench'), article('b', '2', 'Paving'), article('c', '3', 'Paving')];
  const line = (more) => ({ number: '', title: '', unit: 'm', quantity: NaN, price: 10, ...more });
  const { prices, unmatched } = matchLines(
    [
      line({ number: ' 1.1. ', price: 18 }),
      line({ number: '99', title: 'TRENCH' }),
      line({ title: 'Paving' }),
      line({ number: '77', articleId: 'c', price: 30 }),
      line({ number: '5', articleId: 'unknown' }),
    ],
    articles,
  );
  assert.deepEqual(prices, { a: { price: 18, quantity: NaN }, c: { price: 30, quantity: NaN } });
  assert.deepEqual(
    unmatched.map((l) => l.number || l.title),
    ['99', 'Paving', '5'],
    'a second line for an article, and an ambiguous title, stay unmatched',
  );
});

test('comparing offers for the project’s own quantities', () => {
  const articles = [
    article('a', '1', 'Trench', measured('100')),
    article('b', '2', 'Paving', { unit: 'm²', ...measured('10') }),
  ];
  const offer = (id, prices) => ({ id, contractor: id, date: 0, prices, unmatched: [] });
  const { rows, totals, lowestTotal } = compareOffers(articles, [
    offer('X', { a: { price: 10, quantity: 100 }, b: { price: 50, quantity: 12 } }),
    offer('Y', { a: { price: 12, quantity: NaN }, b: { price: 40, quantity: 10 } }),
    offer('Z', { a: { price: 9, quantity: 100 } }),
  ]);
  assert.deepEqual(
    rows.map((r) => [r.lowest, r.cells.map((c) => c && [c.price, c.amount, c.theirQuantity])]),
    [
      [
        9,
        [
          [10, 1000, null],
          [12, 1200, null],
          [9, 900, null],
        ],
      ],
      [40, [[50, 500, 12], [40, 400, null], null]],
    ],
  );
  assert.deepEqual(totals, [
    { amount: 1500, missing: 0 },
    { amount: 1600, missing: 0 },
    { amount: 900, missing: 1 },
  ]);
  assert.equal(lowestTotal, 1500, 'an offer with missing prices does not count as the lowest');
});

test('CSV with the separator Excel uses, quotes and a byte-order mark', () => {
  assert.deepEqual(parseCsv('﻿Number;Article;Unit price\r\n1.1;"Trench; deep";12,5\r\n2;"Say ""hi""";3\n'), [
    ['Number', 'Article', 'Unit price'],
    ['1.1', 'Trench; deep', '12,5'],
    ['2', 'Say "hi"', '3'],
  ]);
  assert.deepEqual(parseCsv('a,b\n1,"2,5"'), [
    ['a', 'b'],
    ['1', '2,5'],
  ]);
  assert.deepEqual(parseCsv('a\tb\n1\t2'), [
    ['a', 'b'],
    ['1', '2'],
  ]);
});

test('spreadsheet column letters', () => {
  assert.deepEqual(['A1', 'Z9', 'AA1', 'AB12'].map(columnIndex), [0, 25, 26, 27]);
  assert.deepEqual([0, 25, 26, 27, 701, 702].map(columnName), ['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
});

test('local store: offers belong to their project and go with it', async () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const store = createLocalSpecStore({ storage });
  const project = await store.create({ kind: 'project', title: 'School' });
  const offer = { id: 'o1', contractor: 'Peeters', date: 1, prices: { a: { price: 5, quantity: 2 } }, unmatched: [] };
  await store.saveOffer(project.id, offer);
  await store.saveOffer(project.id, { ...offer, contractor: 'Peeters NV' });
  assert.deepEqual(
    (await store.offers(project.id)).map((o) => o.contractor),
    ['Peeters NV'],
  );
  await store.removeOffer(project.id, 'o1');
  assert.deepEqual(await store.offers(project.id), []);
  await store.saveOffer(project.id, offer);
  await store.remove(project.id);
  assert.deepEqual(await store.offers(project.id), []);
});
