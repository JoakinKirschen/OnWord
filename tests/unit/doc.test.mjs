import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { readCompound } from '../../src/core/doc/compound.js';
import { readDoc } from '../../src/core/doc/reader.js';

const fixture = (name) => readFile(new URL(`../fixtures/${name}`, import.meta.url));

test('a Word 97–2003 document is read as paragraphs, with headings by their style', async () => {
  // Written by LibreOffice from a document made with python-docx, with the numbers typed in the headings.
  const paragraphs = readDoc(await fixture('spec-numbered.doc'));
  assert.deepEqual(paragraphs.slice(0, 6), [
    { text: 'Lastenboek standaard', heading: 0 },
    { text: 'Dit lastenboek geldt voor alle werken.', heading: 0 },
    { text: '20 Grondwerken', heading: 1 },
    { text: 'Algemene bepalingen voor alle grondwerken.', heading: 0 },
    { text: '20.1 Uitgravingen', heading: 2 },
    { text: 'Uitgraven tot op de vereiste diepte.', heading: 0 },
  ]);
  assert.deepEqual(
    paragraphs.filter((p) => p.heading).map((p) => [p.heading, p.text]),
    [
      [1, '20 Grondwerken'],
      [2, '20.1 Uitgravingen'],
      [3, '20.1.1 Sleuven voor funderingen'],
      [3, '20.1.2 Putten'],
      [1, '21 Bestrating'],
      [2, '21.1 Betonklinkers'],
    ],
  );
  assert.ok(
    paragraphs.some((p) => p.text === 'Meeteenheid: m³'),
    'characters beyond ASCII survive',
  );
});

test('automatic heading numbers are not part of a .doc file’s text', async () => {
  const headings = readDoc(await fixture('spec-autonumbered.doc')).filter((p) => p.heading);
  assert.deepEqual(
    headings.map((p) => p.text),
    ['Grondwerken', 'Uitgravingen', 'Sleuven voor funderingen', 'Putten', 'Bestrating', 'Betonklinkers'],
  );
});

test('files that are not Word 97–2003 documents are refused', async () => {
  assert.throws(() => readDoc(new Uint8Array(600)), /Not a compound file/);
  const docx = await fixture('spec-numbered.docx');
  assert.throws(() => readDoc(docx), /Not a compound file/);
  const streams = readCompound(await fixture('spec-numbered.doc'));
  assert.ok(streams.has('WordDocument'));
  assert.ok(streams.has('1Table') || streams.has('0Table'));
});
