import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paginate } from '../../src/editor/pagination.js';

// A page holds 100 units of text; consecutive pages are 150 apart (text + margins + gap).
const METRICS = { start: 10, body: 100, pitch: 150 };
const stack = (...heights) => {
  let top = METRICS.start;
  return heights.map((height) => ({ top: (top += height) - height, height }));
};

test('content that fits stays on one page', () => {
  assert.deepEqual(paginate(stack(40, 40, 20), METRICS), { breaks: [], pages: 1 });
  assert.deepEqual(paginate([], METRICS), { breaks: [], pages: 1 });
});

test('a block that does not fit moves to the next page as a whole', () => {
  // The third block would end at 130 > 110; page 2 starts at 160, so it moves from 90 to 160.
  assert.deepEqual(paginate(stack(40, 40, 40, 10), METRICS), { breaks: [{ index: 2, extra: 70 }], pages: 2 });
});

test('later breaks account for earlier shifts', () => {
  const { breaks, pages } = paginate(stack(60, 60, 60, 60), METRICS);
  assert.equal(pages, 4);
  assert.deepEqual(breaks, [
    { index: 1, extra: 90 }, // 70 → 160
    { index: 2, extra: 90 }, // 130 + 90 = 220 → 310
    { index: 3, extra: 90 },
  ]);
});

test('an explicit break moves the next block even when it would fit', () => {
  const blocks = stack(20, 20);
  blocks[1].forced = true;
  assert.deepEqual(paginate(blocks, METRICS), { breaks: [{ index: 1, extra: 130 }], pages: 2 });
  blocks[0].forced = true; // nothing precedes the first block on its page
  assert.equal(paginate(blocks, METRICS).breaks.length, 1);
});

test('a block taller than a page runs over the following pages', () => {
  assert.deepEqual(paginate(stack(250), METRICS), { breaks: [], pages: 2 }); // 10–260 covers page 1 and page 2 (160–260)
  const { breaks, pages } = paginate(stack(50, 250, 10), METRICS);
  assert.deepEqual(breaks[0], { index: 1, extra: 100 });
  assert.equal(pages, 4);
});
