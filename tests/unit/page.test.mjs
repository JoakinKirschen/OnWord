import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchPage, normalizePage, pageGeometry } from '../../src/core/page.js';

test('normalizePage fills defaults and drops unknown values', () => {
  assert.deepEqual(normalizePage(), { size: 'letter', orientation: 'portrait', margin: 'normal' });
  assert.deepEqual(normalizePage({ size: 'tabloid', orientation: 'sideways', margin: 'narrow' }), {
    size: 'letter',
    orientation: 'portrait',
    margin: 'narrow',
  });
});

test('pageGeometry swaps the sides for landscape', () => {
  assert.deepEqual(pageGeometry({ size: 'a4', orientation: 'landscape', margin: 'wide' }), {
    width: 1123,
    height: 794,
    margin: 144,
    css: 'A4',
    orientation: 'landscape',
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
