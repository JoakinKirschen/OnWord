/** `sanitize()` relies on the browser's HTML parser, so it is tested in a real browser. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { useApp } from './harness.mjs';

const { openApp } = useApp();
const CASES = [
  ['scripts are removed', '<p>a<script>alert(1)</script></p>', '<p>a</p>'],
  ['event handlers are removed', '<p onclick="x()" onmouseover="y()">a</p>', '<p>a</p>'],
  ['javascript: links lose their address', '<a href="javascript:alert(1)">a</a>', '<a>a</a>'],
  ['obfuscated javascript: links lose their address', '<a href=" JaVaScRiPt:alert(1)">a</a>', '<a>a</a>'],
  ['safe links are kept', '<a href="https://example.com">a</a>', '<a href="https://example.com">a</a>'],
  ['data: images are kept', '<img src="data:image/png;base64,AAAA">', '<img src="data:image/png;base64,AAAA">'],
  ['data: HTML is dropped', '<img src="data:text/html,<script>1</script>">', '<img>'],
  ['ids, classes and data attributes are removed', '<p id="a" class="b" data-c="d">a</p>', '<p>a</p>'],
  ['the page-break class survives', '<hr class="page-break">', '<hr class="page-break">'],
  [
    'checklist classes survive, others on the same element do not',
    '<ul class="checklist x"><li class="checked y">a</li></ul>',
    '<ul class="checklist"><li class="checked">a</li></ul>',
  ],
  ['style with url() is removed', '<p style="background:url(http://x/y)">a</p>', '<p>a</p>'],
  ['harmless style is kept', '<p style="color: red;">a</p>', '<p style="color: red;">a</p>'],
  ['embedded content is removed', '<iframe src="https://x"></iframe><object></object><form><input></form>b', 'b'],
  ['comments are removed', 'a<!-- hidden -->b', 'ab'],
];

test('sanitize()', async (t) => {
  const page = await openApp();
  const sanitize = (input) =>
    page.evaluate(async (value) => (await import('/src/core/html.js')).sanitize(value), input);
  for (const [name, input, expected] of CASES) {
    await t.test(name, async () => assert.equal(await sanitize(input), expected));
  }
});
