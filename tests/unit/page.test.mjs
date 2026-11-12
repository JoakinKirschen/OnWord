import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchPage, normalizePage, pageGeometry } from '../../src/core/page.js';

const BLANK = { text: '', align: 'center' };

test('normalizePage fills defaults and drops unknown values', () => {
  assert.deepEqual(normalizePage(), {
    size: 'letter',
    orientation: 'portrait',
    margin: 'normal',
    columns: 1,
    header: BLANK,
    footer: BLANK,
  });
  const messy = {
    size: 'tabloid',
    orientation: 'sideways',
    margin: 'narrow',
    columns: 9,
    header: { text: 'Hi', align: 'up' },
  };
  assert.deepEqual(normalizePage(messy), {
    size: 'letter',
    orientation: 'portrait',
    margin: 'narrow',
    columns: 3,
    header: { text: 'Hi', align: 'center' },
    footer: BLANK,
  });
  assert.equal(normalizePage({ footer: { text: 'x'.repeat(500), align: 'right' } }).footer.text.length, 200);
});

test('pageGeometry swaps the sides for landscape', () => {
  assert.deepEqual(pageGeometry({ size: 'a4', orientation: 'landscape', margin: 'wide', columns: 2 }), {
    width: 1123,
    height: 794,
    margin: 144,
    bodyHeight: 506,
    css: 'A4',
    orientation: 'landscape',
    columns: 2,
  });
});

test('matchPage picks the nearest supported setup', () => {
  assert.deepEqual(matchPage({ width: 793.7, height: 1122.5, margin: 94 }), {
    size: 'a4',
    orientation: 'portrait',
    margin: 'normal',
  });
  assert.deepEqual(matchPage({ width: 1344, height: 816, margin: 50 }), {
    size: 'legal',
    orientation: 'landscape',
    margin: 'narrow',
  });
});
