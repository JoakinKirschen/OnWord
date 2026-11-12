/** Converts document content (a DOM subtree) to Markdown. */

const wrap = (/** @type {string} */ text, /** @type {string} */ mark) => {
  const inner = text.trim();
  if (!inner) return text;
  const start = text.length - text.trimStart().length;
  return text.slice(0, start) + mark + inner + mark + text.slice(start + inner.length);
};

/** Marks implied by inline styles, which is how the editor stores most formatting. */
function styleMarks(/** @type {HTMLElement} */ el) {
  const { fontWeight, fontStyle, textDecorationLine, textDecoration } = el.style;
  const marks = [];
  if (fontWeight === 'bold' || Number(fontWeight) >= 600) marks.push('**');
  if (fontStyle === 'italic') marks.push('*');
  if ((textDecorationLine || textDecoration).includes('line-through')) marks.push('~~');
  return marks;
}

const TAG_MARKS = { B: '**', STRONG: '**', I: '*', EM: '*', S: '~~', STRIKE: '~~', DEL: '~~', CODE: '`' };

/** @param {Node} node @returns {string} */
function inline(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.replace(/\s+/g, ' ');
  if (!(node instanceof HTMLElement)) return '';
  const { tagName } = node;
  if (tagName === 'BR') return '\n';
  if (tagName === 'UL' || tagName === 'OL') return ''; // nested lists are emitted by list()
  if (tagName === 'IMG') return `![${node.getAttribute('alt') || ''}](${node.getAttribute('src') || ''})`;
  const text = [...node.childNodes].map(inline).join('');
  if (tagName === 'A') return `[${text}](${node.getAttribute('href') || ''})`;
  if (tagName in TAG_MARKS) return wrap(text, TAG_MARKS[tagName]);
  return styleMarks(node).reduce(wrap, text);
}

/** @param {Element} listEl @param {number} depth @returns {string[]} */
function list(listEl, depth) {
  const lines = [];
  let number = 0;
  for (const child of listEl.children) {
    if (child.matches('ul, ol')) {
      lines.push(...list(child, depth + 1)); // Chrome nests indented lists directly inside the list
      continue;
    }
    number++;
    const marker = listEl.tagName === 'OL' ? `${number}. ` : '- ';
    lines.push('  '.repeat(depth) + marker + inline(child).trim().replace(/\n/g, ' '));
    for (const nested of child.querySelectorAll(':scope > ul, :scope > ol')) lines.push(...list(nested, depth + 1));
  }
  return lines;
}

function table(/** @type {HTMLTableElement} */ tableEl) {
  const rows = [...tableEl.rows].map((row) =>
    [...row.cells].map((cell) => inline(cell).trim().replace(/\n/g, ' ').replace(/\|/g, '\\|')),
  );
  if (!rows.length) return '';
  const line = (/** @type {string[]} */ cells) => `| ${cells.join(' | ')} |`;
  return [line(rows[0]), line(rows[0].map(() => '---')), ...rows.slice(1).map(line)].join('\n');
}

/** @param {Node} node @returns {string} */
function block(node) {
  if (!(node instanceof HTMLElement)) return inline(node).trim();
  const heading = node.tagName.match(/^H([1-6])$/);
  if (heading) return '#'.repeat(Number(heading[1])) + ' ' + inline(node).trim();
  switch (node.tagName) {
    case 'UL':
    case 'OL':
      return list(node, 0).join('\n');
    case 'TABLE':
      return table(/** @type {HTMLTableElement} */ (node));
    case 'HR':
      return '---';
    case 'PRE':
      return '```\n' + node.innerText.replace(/\n$/, '') + '\n```';
    case 'BLOCKQUOTE':
      return toMarkdown(node)
        .trim()
        .split('\n')
        .map((l) => ('> ' + l).trimEnd())
        .join('\n');
    default:
      return inline(node).trim();
  }
}

/** @param {Element} root */
export function toMarkdown(root) {
  return [...root.childNodes].map(block).filter(Boolean).join('\n\n') + '\n';
}
