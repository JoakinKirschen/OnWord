import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMPTY_DOC, esc, textToHtml } from '../../src/core/html.js';

test('esc escapes all HTML-significant characters', () => {
  assert.equal(esc(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  assert.equal(esc(42), '42');
});

test('textToHtml makes one paragraph per line and escapes content', () => {
  assert.equal(textToHtml('a\r\n<b>\n\nc'), '<p>a</p><p>&lt;b&gt;</p><p><br></p><p>c</p>');
  assert.equal(textToHtml(''), EMPTY_DOC);
});
