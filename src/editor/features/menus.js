import { $, hit } from '../../core/dom.js';
import { MOD } from '../../core/platform.js';
import { menuHtml } from '../../ui/popover.js';

const exec = (label, arg, key) => ({ label, act: 'edit.exec', arg, key });

/** Menu bar contents. Every item names a registered command; add new entries here. */
const MENUS = {
  File: [
    { label: 'New document', act: 'library.new' },
    { label: 'Make a copy', act: 'file.copy' },
    { label: 'Import file…', act: 'library.import' },
    '-',
    { label: 'Download as Word (.docx)', act: 'file.downloadDocx' },
    { label: 'Download as web page (.html)', act: 'file.downloadHtml' },
    { label: 'Download as Markdown (.md)', act: 'file.downloadMarkdown' },
    { label: 'Download as plain text (.txt)', act: 'file.downloadText' },
    '-',
    { label: 'Version history…', act: 'history.open' },
    { label: 'Header and footer…', act: 'page.headerFooter' },
    { label: 'Page setup…', act: 'page.setup' },
    { label: 'Print / save as PDF', act: 'file.print', key: MOD + 'P' },
    '-',
    { label: 'Delete document', act: 'file.delete', danger: true },
  ],
  Edit: [
    exec('Undo', 'undo', MOD + 'Z'),
    exec('Redo', 'redo', MOD + 'Y'),
    '-',
    exec('Select all', 'selectAll', MOD + 'A'),
    { label: 'Find and replace', act: 'find.open', key: MOD + 'F' },
  ],
  Insert: [
    { label: 'Image…', act: 'image.pick' },
    { label: 'Table…', act: 'table.dialog' },
    { label: 'Link…', act: 'link.edit', key: MOD + 'K' },
    '-',
    exec('Horizontal line', 'insertHorizontalRule'),
    { label: 'Page break', act: 'insert.pageBreak', key: MOD + 'Enter' },
    { label: 'Table of contents', act: 'insert.toc' },
    { label: 'Footnote', act: 'insert.footnote' },
    { label: 'Page numbers', act: 'page.numbers' },
    { label: 'Header and footer…', act: 'page.headerFooter' },
    { label: 'Special characters…', act: 'insert.symbols' },
    { label: 'Today’s date', act: 'insert.date' },
  ],
  Format: [
    exec('Bold', 'bold', MOD + 'B'),
    exec('Italic', 'italic', MOD + 'I'),
    exec('Underline', 'underline', MOD + 'U'),
    exec('Strikethrough', 'strikeThrough', MOD + 'Shift+X'),
    exec('Superscript', 'superscript'),
    exec('Subscript', 'subscript'),
    '-',
    { label: 'Paragraph…', act: 'format.paragraph' },
    { label: 'Styles…', act: 'format.styles' },
    { label: 'Update style to match selection', act: 'format.updateStyle' },
    '-',
    { label: 'UPPERCASE', act: 'format.case', arg: 'upper' },
    { label: 'lowercase', act: 'format.case', arg: 'lower' },
    { label: 'Title Case', act: 'format.case', arg: 'title' },
    { label: 'Sentence case', act: 'format.case', arg: 'sentence' },
    '-',
    exec('Clear formatting', 'removeFormat', MOD + '\\'),
  ],
  Table: [
    { label: 'Insert table…', act: 'table.dialog' },
    '-',
    { label: 'Insert row above', act: 'table.edit', arg: 'rowAbove' },
    { label: 'Insert row below', act: 'table.edit', arg: 'rowBelow' },
    { label: 'Insert column left', act: 'table.edit', arg: 'colLeft' },
    { label: 'Insert column right', act: 'table.edit', arg: 'colRight' },
    '-',
    { label: 'Merge with cell to the right', act: 'table.merge', arg: 'right' },
    { label: 'Merge with cell below', act: 'table.merge', arg: 'down' },
    { label: 'Split cell', act: 'table.merge', arg: 'split' },
    '-',
    { label: 'Delete row', act: 'table.edit', arg: 'delRow' },
    { label: 'Delete column', act: 'table.edit', arg: 'delCol' },
    { label: 'Delete table', act: 'table.edit', arg: 'delTable', danger: true },
  ],
  Review: [
    { label: 'Add comment…', act: 'review.comment' },
    { label: 'Show / hide comments', act: 'review.comments' },
    '-',
    { label: 'Track changes on / off', act: 'review.track' },
    { label: 'Accept change', act: 'review.accept' },
    { label: 'Reject change', act: 'review.reject' },
    { label: 'Accept all changes', act: 'review.acceptAll' },
    { label: 'Reject all changes', act: 'review.rejectAll' },
  ],
  View: [
    { label: 'Zoom 75%', act: 'view.zoom', arg: '0.75' },
    { label: 'Zoom 100%', act: 'view.zoom', arg: '1' },
    { label: 'Zoom 125%', act: 'view.zoom', arg: '1.25' },
    { label: 'Zoom 150%', act: 'view.zoom', arg: '1.5' },
    '-',
    { label: 'Show / hide ruler', act: 'view.ruler' },
    { label: 'Show / hide outline', act: 'view.outline' },
    { label: 'Formatting marks (¶)', act: 'view.marks' },
    { label: 'Word count…', act: 'view.wordCount' },
    { label: 'Toggle dark mode', act: 'app.theme' },
  ],
};

/** @param {import('../editor.js').EditorContext} ctx */
export function initMenus(ctx) {
  const { root, popover } = ctx;
  const bar = $('#menubar', root);
  bar.innerHTML = Object.keys(MENUS)
    .map((name) => `<button data-menu="${name}">${name}</button>`)
    .join('');
  const html = (button) => menuHtml(MENUS[button.dataset.menu]);

  bar.addEventListener('click', (e) => {
    const button = hit(e, '[data-menu]');
    if (button) popover.toggle(button, html(button));
  });
  // With one menu open, hovering a neighbour switches to it.
  bar.addEventListener('mouseover', (e) => {
    const button = hit(e, '[data-menu]');
    if (button && popover.owner?.dataset.menu && popover.owner !== button) popover.open(button, html(button));
  });
}
