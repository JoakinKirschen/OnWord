import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reviewToHtml } from '../../src/core/spec/reviewOutput.js';
import { blankObservation, isPhotoData, newReview, normalizeReview, photoIds } from '../../src/core/spec/reviews.js';

const observation = (id, more = {}) => ({ ...blankObservation(id), ...more });

test('a new review is numbered after the others and takes over the open items of the latest one', () => {
  let n = 0;
  const makeId = () => `id${++n}`;
  const first = newReview([], makeId, '2026-11-01');
  assert.deepEqual([first.number, first.date, first.observations], [1, '2026-11-01', []]);
  const earlier = {
    ...first,
    number: 2,
    observations: [
      observation('a', { status: 'defect', location: 'Kitchen', photos: [{ id: 'p', caption: 'crack' }] }),
      observation('b', { status: 'ok' }),
      observation('c', { status: 'remark', done: true }),
      observation('d', { status: 'remark', from: 1 }),
    ],
  };
  const next = newReview([first, earlier], makeId, '2026-11-14');
  assert.equal(next.number, 3);
  assert.deepEqual(
    next.observations.map((o) => [o.location, o.status, o.photos.length, o.from]),
    [
      ['Kitchen', 'defect', 0, 2],
      ['', 'remark', 0, 1], // keeps the review it was first noted in
    ],
  );
  assert.ok(
    next.observations.every((o) => !['a', 'd'].includes(o.id)),
    'copies get ids of their own',
  );
});

test('a review from storage is reduced to its fields and limits', () => {
  const review = normalizeReview({
    id: 'r1',
    number: 'two',
    date: 'yesterday',
    notes: 'x'.repeat(6000),
    extra: true,
    observations: [{ id: 'o1', status: 'broken', due: '2026-12-01', done: 'yes', photos: [{ id: 'p1' }, 'junk'] }],
  });
  assert.equal(review.number, 1);
  assert.equal(review.date, '');
  assert.equal(review.notes.length, 5000);
  assert.ok(!('extra' in review));
  const [o] = review.observations;
  assert.deepEqual(
    [o.status, o.due, o.done, o.photos],
    [
      'remark',
      '2026-12-01',
      false,
      [{ id: 'p1', caption: '' }], // an entry without an id is dropped
    ],
  );
  assert.deepEqual([...photoIds(review)], ['p1']);
});

test('only JPEG and PNG data URLs count as photos', () => {
  assert.ok(isPhotoData('data:image/jpeg;base64,/9j/4AAQ=='));
  assert.ok(isPhotoData('data:image/png;base64,iVBORw0KGgo='));
  assert.ok(!isPhotoData('data:image/svg+xml;base64,PHN2Zz4='));
  assert.ok(!isPhotoData('javascript:alert(1)'));
  assert.ok(!isPhotoData('data:image/png;base64,"><script>'));
});

test('the report escapes what people typed and lists the open items', () => {
  const review = {
    ...newReview([], () => 'r', '2026-11-14'),
    attendees: 'Ann <architect>',
    observations: [
      observation('a', {
        location: 'Hall & stairs',
        status: 'defect',
        articleId: 'w',
        action: 'Fix',
        photos: [{ id: 'p', caption: 'a "crack"' }],
      }),
      observation('b', { location: 'Roof', status: 'ok' }),
    ],
  };
  const html = reviewToHtml({ title: 'School <B>' }, review, {
    articles: [{ id: 'w', number: '1', title: 'Walls' }],
    photos: new Map([['p', 'data:image/jpeg;base64,AAAA']]),
  });
  assert.match(html, /<p class="subtitle">School &lt;B&gt; — /);
  assert.match(html, /Ann &lt;architect&gt;/);
  assert.match(html, /<h3>1\. Hall &amp; stairs — Defect<\/h3><p><i>Article 1 Walls<\/i><\/p>/);
  assert.match(html, /<img src="data:image\/jpeg;base64,AAAA" alt="a &quot;crack&quot;"/);
  assert.match(html, /<h3>2\. Roof — OK<\/h3>/);
  const openItems = html.slice(html.indexOf('<h2>Open items</h2>'));
  assert.match(openItems, /Hall &amp; stairs/);
  assert.doesNotMatch(openItems, /Roof/, 'an OK observation is not open');
});
