import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeStyles, resolveStyles, setStyle, stylesCss } from '../../src/core/docStyles.js';

test('without overrides every style has the editor’s own look', () => {
  const looks = resolveStyles(null);
  assert.equal(looks.normal.font, 'Arial');
  assert.equal(looks.normal.after, 8);
  assert.equal(looks.heading1.size, 18);
  assert.equal(looks.heading2.bold, true);
  assert.equal(looks.heading4.italic, true);
  assert.equal(looks.quote.color, '#444444');
  assert.equal(stylesCss({}, '#editor'), '');
});

test('styles take the font, colour and line spacing of normal text unless they set their own', () => {
  const looks = resolveStyles({ normal: { font: 'Georgia', color: '#222222', lineHeight: 1.2, after: 4 } });
  assert.equal(looks.title.font, 'Georgia');
  assert.equal(looks.heading1.color, '#222222');
  assert.equal(looks.heading2.color, '#333333'); // set by the heading itself
  assert.equal(looks.heading2.lineHeight, 1.2);
  assert.equal(looks.heading1.lineHeight, 1.25);
  assert.equal(looks.heading1.after, 6); // spacing belongs to paragraphs, not to the document
});

test('normalising drops unknown styles, unknown properties and unusable values', () => {
  assert.deepEqual(
    normalizeStyles({
      heading1: { size: '200', color: 'red', bold: 'yes', align: 'middle', font: 'Comic<script>', extra: 1 },
      bogus: { size: 12 },
      quote: null,
      title: { lineHeight: 'x', before: 3.14159 },
    }),
    { heading1: { size: 96, font: 'Comicscript' }, title: { before: 3.1 } },
  );
  assert.deepEqual(normalizeStyles('nonsense'), {});
});

test('setting a style keeps only what differs from its default and leaves the others alone', () => {
  const start = { title: { size: 30 } };
  const styles = setStyle(start, 'heading1', { ...resolveStyles(start).heading1, color: '#C00000', size: 18 });
  assert.deepEqual(styles, { title: { size: 30 }, heading1: { color: '#c00000' } });
  assert.deepEqual(setStyle(styles, 'heading1', resolveStyles({}).heading1), { title: { size: 30 } });
});

test('the style sheet states only what a document changes, scoped to its container', () => {
  const css = stylesCss(
    { normal: { font: 'Times New Roman', after: 12 }, heading2: { bold: false, before: 20 } },
    '#editor',
  );
  assert.equal(
    css,
    "#editor{font-family:'Times New Roman'}\n" +
      '#editor p:not(.subtitle, .toc p){margin-bottom:12pt}\n' +
      '#editor h3{font-weight:400;margin-top:20pt}\n' +
      '#editor > :first-child{margin-top:0}',
  );
});
