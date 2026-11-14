import assert from 'node:assert/strict';
import { test } from 'node:test';
import { draftArticles, placeChosen, splitNumber, toArticles, unitIn } from '../../src/core/spec/articleImport.js';

const heading = (level, text) => ({ level, text, html: `<h${level + 1}>${text}</h${level + 1}>` });
const para = (text) => ({ level: 0, text, html: `<p>${text}</p>` });
const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};
const outline = (articles) =>
  articles.map((a) => [a.number, a.title, articles.find((p) => p.id === a.parentId)?.number ?? null]);

test('a title is split into its number and the rest', () => {
  assert.deepEqual(splitNumber('20.31.10. Betonklinkers'), { number: '20.31.10', title: 'Betonklinkers' });
  assert.deepEqual(splitNumber('  21 Bestrating '), { number: '21', title: 'Bestrating' });
  assert.deepEqual(splitNumber('Algemeen'), { number: '', title: 'Algemeen' });
  assert.deepEqual(splitNumber('2024 werken'), { number: '2024', title: 'werken' });
});

test('the unit is read from the line that names it, in Dutch, French or English', () => {
  assert.equal(unitIn('Sleuven graven.\nMeeteenheid: m2'), 'm²');
  assert.equal(unitIn('- meeteenheid: per m³, volgens plan'), 'm³');
  assert.equal(unitIn('Unité de mesure : pièce'), 'st');
  assert.equal(unitIn('Unit: kg'), 'kg');
  assert.equal(unitIn('Eenheid: FH'), 'FH', 'other units are taken as written');
  assert.equal(unitIn('De eenheidsprijs omvat alles.'), '');
});

test('every heading is an article with the text up to the next heading', () => {
  const drafts = draftArticles([
    para('Title page'),
    heading(1, '20 Grondwerken'),
    para('Algemeen.'),
    heading(2, '20.1 Sleuven'),
    para('Graven.'),
    para('Meeteenheid: m³'),
    heading(1, ''),
  ]);
  assert.deepEqual(drafts, [
    { number: '20', title: 'Grondwerken', unit: '', html: '<p>Algemeen.</p>', level: 1 },
    { number: '20.1', title: 'Sleuven', unit: 'm³', html: '<p>Graven.</p><p>Meeteenheid: m³</p>', level: 2 },
  ]);
});

test('without headings, short numbered paragraphs are the titles', () => {
  const drafts = draftArticles([
    para('Lastenboek'),
    para('20 Grondwerken'),
    para('1. De aannemer controleert de maten.'),
    para('20.1 Sleuven'),
    para('Meeteenheid: m'),
  ]);
  assert.deepEqual(
    drafts.map((d) => [d.number, d.title, d.level, d.unit]),
    [
      ['20', 'Grondwerken', 1, ''],
      ['20.1', 'Sleuven', 2, 'm'],
    ],
  );
  assert.equal(drafts[0].html, '<p>1. De aannemer controleert de maten.</p>', 'a numbered sentence is text');
});

test('articles nest by their numbers, else by their heading levels, and missing numbers are given', () => {
  const drafts = draftArticles([
    heading(1, '20 Grondwerken'),
    heading(1, '20.1 Sleuven'), // a heading level that disagrees with the number: the number wins
    heading(3, '20.1.1 Smal'),
    heading(1, 'Bijlagen'),
    heading(2, 'Plannen'),
    heading(2, 'Foto’s'),
  ]);
  const existing = [{ id: 'old', parentId: null, number: '21', title: 'Bestaand' }];
  const articles = toArticles(drafts, { existing, newId: ids() });
  assert.deepEqual(outline(articles), [
    ['20', 'Grondwerken', null],
    ['20.1', 'Sleuven', '20'],
    ['20.1.1', 'Smal', '20.1'],
    ['22', 'Bijlagen', null],
    ['22.1', 'Plannen', '22'],
    ['22.2', 'Foto’s', '22'],
  ]);
  assert.equal(articles[0].html, '<p><br></p>', 'an article without text gets an empty paragraph');
  assert.deepEqual([articles[0].lines, articles[0].price, articles[0].sourceId], [[], 0, null]);
});

test('what is not chosen is left out, and what is under it moves up or joins the article already there', () => {
  const found = toArticles(
    draftArticles([heading(1, '20 Grondwerken'), heading(2, '20.1 Sleuven'), heading(3, '20.1.1 Smal')]),
    { existing: [], newId: ids() },
  );
  const existing = [{ id: 'old20', parentId: null, number: '20', title: 'Grondwerken' }];
  assert.deepEqual(
    placeChosen(found, new Set(['id2', 'id3']), existing).map((a) => [a.number, a.parentId]),
    [
      ['20.1', 'old20'],
      ['20.1.1', 'id2'],
    ],
  );
  assert.deepEqual(
    placeChosen(found, new Set(['id1', 'id3']), []).map((a) => [a.number, a.parentId]),
    [
      ['20', null],
      ['20.1.1', 'id1'],
    ],
  );
});
