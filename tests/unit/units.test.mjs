import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cssPx, pxToPt } from '../../src/core/units.js';

test('cssPx converts absolute lengths and rejects everything else', () => {
  assert.equal(cssPx('48px'), 48);
  assert.equal(cssPx('0.5in'), 48);
  assert.equal(cssPx('6pt'), 8);
  assert.equal(cssPx('-24px'), -24);
  assert.equal(Math.round(cssPx('2.54cm')), 96);
  for (const value of ['', null, undefined, 'auto', '2em', '50%']) assert.equal(cssPx(value), 0);
});

test('pxToPt', () => {
  assert.equal(pxToPt(16), 12);
});
