import { $, hit } from '../../core/dom.js';
import { MOD } from '../../core/platform.js';
import { menuHtml } from '../../ui/popover.js';
import { icon } from '../icons.js';

const FONTS = [
  'Arial',
  'Georgia',
  'Times New Roman',
  'Garamond',
  'Verdana',
  'Trebuchet MS',
  'Tahoma',
  'Courier New',
  'Comic Sans MS',
];
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72];
const BLOCKS = [
  ['p', 'Normal text'],
  ['h1', 'Title'],
  ['subtitle', 'Subtitle'],
  ['h2', 'Heading 1'],
  ['h3', 'Heading 2'],
  ['h4', 'Heading 3'],
  ['h5', 'Heading 4'],
  ['blockquote', 'Quote'],
  ['pre', 'Code block'],
];
const SPACINGS = [
  ['1', 'Single'],
  ['1.15', '1.15'],
  ['1.5', '1.5'],
  ['2', 'Double'],
];
const COLORS = [
  '#000000',
  '#434343',
  '#666666',
  '#999999',
  '#cccccc',
  '#efefef',
  '#f3f3f3',
  '#ffffff',
  '#c0352b',
  '#e67e22',
  '#f1c40f',
  '#27ae60',
  '#16a085',
  '#2980b9',
  '#4338ca',
  '#8e44ad',
  '#f4c7c3',
  '#fce5cd',
  '#fff2cc',
  '#d9ead3',
  '#d0e0e3',
  '#cfe2f3',
  '#d9d2e9',
  '#ead1dc',
];
const listStyle = (/** @type {string} */ label, /** @type {string} */ type) => ({
  label,
  act: 'format.listStyle',
  arg: type,
});
const LIST_STYLES_HTML = menuHtml([
  listStyle('• Bullets', 'disc'),
  listStyle('○ Hollow bullets', 'circle'),
  listStyle('■ Square bullets', 'square'),
  '-',
  listStyle('1. 2. 3.', 'decimal'),
  listStyle('a. b. c.', 'lower-alpha'),
  listStyle('A. B. C.', 'upper-alpha'),
  listStyle('i. ii. iii.', 'lower-roman'),
  listStyle('I. II. III.', 'upper-roman'),
]);
const STATEFUL = [
  'bold',
  'italic',
  'underline',
  'strikeThrough',
  'justifyLeft',
  'justifyCenter',
  'justifyRight',
  'justifyFull',
  'insertUnorderedList',
  'insertOrderedList',
];

const SEP = '<span class="tb-sep"></span>';
const tip = (label, key) => `title="${label}${key ? ` (${MOD}${key})` : ''}" aria-label="${label}"`;
/** Button running a browser editing command. */
const cmd = (name, inner, label, key) => `<button class="tb" data-cmd="${name}" ${tip(label, key)}>${inner}</button>`;
/** Button running a registered app command, optionally with an argument and a shortcut hint. */
const act = (name, inner, label, { key = '', arg = '' } = {}) =>
  `<button class="tb" data-act="${name}" ${arg && `data-arg="${arg}"`} ${tip(label, key)}>${inner}</button>`;
const glyph = (text, style = '') => `<span class="glyph" style="${style}">${text}</span>`;
const select = (id, label, options, placeholder = '') =>
  `<select id="${id}" title="${label}" aria-label="${label}"><option value="" hidden>${placeholder}</option>${options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
const colorButton = (command, letter, label, color) =>
  `<button class="tb color" data-colors="${command}" ${tip(label)}>${glyph(letter)}<span class="swatch-bar" style="background:${color}"></span></button>`;

const TOOLBAR_HTML = [
  cmd('undo', icon('undo'), 'Undo', 'Z'),
  cmd('redo', icon('redo'), 'Redo', 'Y'),
  act('file.print', icon('print'), 'Print', { key: 'P' }),
  act('find.open', icon('search'), 'Find and replace', { key: 'F' }),
  act('format.painter', icon('painter'), 'Format painter'),
  SEP,
  select('selBlock', 'Paragraph style', BLOCKS),
  SEP,
  select(
    'selFont',
    'Font',
    FONTS.map((f) => [f, f]),
  ),
  SEP,
  select(
    'selSize',
    'Font size',
    SIZES.map((s) => [s, s]),
  ),
  SEP,
  cmd('bold', glyph('B', 'font-weight:700'), 'Bold', 'B'),
  cmd('italic', glyph('I', 'font-style:italic'), 'Italic', 'I'),
  cmd('underline', glyph('U', 'text-decoration:underline'), 'Underline', 'U'),
  cmd('strikeThrough', glyph('S', 'text-decoration:line-through'), 'Strikethrough'),
  colorButton('foreColor', 'A', 'Text colour', '#c0352b'),
  colorButton('hiliteColor', 'H', 'Highlight colour', '#f1c40f'),
  SEP,
  act('link.edit', icon('link'), 'Insert link', { key: 'K' }),
  act('image.pick', icon('image'), 'Insert image'),
  act('table.dialog', icon('table'), 'Insert table'),
  SEP,
  cmd('justifyLeft', icon('left'), 'Align left'),
  cmd('justifyCenter', icon('center'), 'Align centre'),
  cmd('justifyRight', icon('right'), 'Align right'),
  cmd('justifyFull', icon('justify'), 'Justify'),
  SEP,
  select('selSpacing', 'Line spacing', SPACINGS, 'Spacing'),
  cmd('insertUnorderedList', icon('ul'), 'Bulleted list'),
  cmd('insertOrderedList', icon('ol'), 'Numbered list'),
  `<button class="tb narrow" data-lists ${tip('Bullet and numbering styles')}>${glyph('▾')}</button>`,
  act('format.checklist', icon('checklist'), 'Checklist'),
  act('format.indent', icon('outdent'), 'Decrease indent', { arg: 'out' }),
  act('format.indent', icon('indent'), 'Increase indent'),
  SEP,
  cmd('removeFormat', icon('clear'), 'Clear formatting'),
].join('');

const colorsHtml = (command) => `<div class="swatches">${COLORS.map(
  (c) =>
    `<button data-act="format.color" data-arg="${command}:${c}" style="background:${c}" title="${c}" aria-label="${c}"></button>`,
).join('')}</div>
  <button class="item" data-act="format.color" data-arg="${command}:${command === 'foreColor' ? '#000000' : 'transparent'}">
    <span>${command === 'foreColor' ? 'Default colour' : 'No highlight'}</span></button>`;

/**
 * The formatting toolbar: renders the controls and mirrors the caret's formatting.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initToolbar(ctx) {
  const { root, content, selection, events, commands, popover } = ctx;
  const bar = $('#toolbar', root);
  bar.innerHTML = TOOLBAR_HTML;
  const selBlock = $('#selBlock', bar),
    selFont = $('#selFont', bar),
    selSize = $('#selSize', bar),
    selSpacing = $('#selSpacing', bar);

  selBlock.addEventListener('change', () => commands.run('format.block', selBlock.value));
  selFont.addEventListener('change', () => commands.run('format.font', selFont.value));
  selSize.addEventListener('change', () => commands.run('format.size', selSize.value));
  selSpacing.addEventListener('change', () => {
    commands.run('format.spacing', selSpacing.value);
    selSpacing.value = '';
  });

  bar.addEventListener('click', (e) => {
    const listsBtn = hit(e, '[data-lists]');
    if (listsBtn) return popover.toggle(listsBtn, LIST_STYLES_HTML);
    const colorBtn = hit(e, '[data-colors]');
    if (colorBtn) return popover.toggle(colorBtn, colorsHtml(colorBtn.dataset.colors), 'colors');
    const cmdBtn = hit(e, '[data-cmd]');
    if (cmdBtn) ctx.exec(cmdBtn.dataset.cmd);
  });

  commands.register({
    'format.color'(arg) {
      const [command, value] = arg.split(':');
      ctx.exec(command, value);
      $(`[data-colors="${command}"] .swatch-bar`, bar).style.background = value === 'transparent' ? 'none' : value;
    },
  });

  events.on('selection', () => {
    const el = selection.anchorElement();
    if (!el) return;
    for (const name of STATEFUL) {
      let on = false;
      try {
        on = content.ownerDocument.queryCommandState(name);
      } catch {
        /* unsupported */
      }
      $(`[data-cmd="${name}"]`, bar)?.classList.toggle('on', on);
    }
    const block = el.closest('h1,h2,h3,h4,h5,blockquote,pre,p');
    const tag = block && content.contains(block) ? block.tagName.toLowerCase() : 'p';
    selBlock.value = block?.classList.contains('subtitle') ? 'subtitle' : tag;
    const style = getComputedStyle(el);
    const family = style.fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
    selFont.value = FONTS.find((f) => f.toLowerCase() === family) || '';
    const pt = Math.round(parseFloat(style.fontSize) * 0.75);
    selSize.value = SIZES.includes(pt) ? String(pt) : '';
  });
}
