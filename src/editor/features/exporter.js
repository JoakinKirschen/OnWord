import { DOCX_MIME, writeDocx } from '../../core/docx/writer.js';
import { download } from '../../core/download.js';
import { esc } from '../../core/html.js';
import { toMarkdown } from '../markdown.js';

// Mirrors the `.doc-content` rules in styles/document.css so downloads look like the editor.
const EXPORT_CSS = `body{font:11pt/1.5 Arial,Helvetica,sans-serif;max-width:6.5in;margin:1in auto;padding:0 16px;color:#000;overflow-wrap:break-word}
p{margin:0 0 8pt}h1{font-size:24pt;font-weight:400;margin:18pt 0 8pt;line-height:1.2}h2{font-size:18pt;font-weight:400;margin:16pt 0 6pt}
h3{font-size:14pt;margin:14pt 0 4pt;color:#333}h4{font-size:12pt;margin:12pt 0 4pt;color:#555}
blockquote{margin:0 0 8pt;padding:2pt 0 2pt 14pt;border-left:3px solid #c5c8d4;color:#444}
pre{background:#f3f4f7;padding:10pt 12pt;font:10pt/1.45 "Courier New",monospace;white-space:pre-wrap}
img{max-width:100%;height:auto}table{border-collapse:collapse;margin:0 0 8pt}td,th{border:1px solid #9a9eac;padding:4pt 6pt;vertical-align:top}
hr{border:0;border-top:1px solid #b9bcc8;margin:14pt 0}hr.page-break{border:0;page-break-after:always}
ul.checklist{list-style:none}ul.checklist>li::before{content:'\\2610';margin:0 6pt 0 -16pt}ul.checklist>li.checked::before{content:'\\2611'}`;
/**
 * Download as Word / HTML / Markdown / text, and print.
 * @param {import('../editor.js').EditorContext} ctx
 */
export function initExporter(ctx) {
  const { content, session, commands, popover, toast } = ctx;
  const fileBase = () =>
    session
      .title()
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'document';
  const page = () =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(session.title())}</title><style>${EXPORT_CSS}</style></head><body>${content.innerHTML}</body></html>`;

  commands.register({
    'file.downloadHtml'() {
      download(fileBase() + '.html', page(), 'text/html');
    },
    async 'file.downloadDocx'() {
      try {
        download(fileBase() + '.docx', await writeDocx(content, { page: session.meta()?.page }), DOCX_MIME);
      } catch (err) {
        console.error(err);
        toast('The Word file could not be created.');
      }
    },
    'file.downloadMarkdown'() {
      download(fileBase() + '.md', toMarkdown(content), 'text/markdown');
    },
    'file.downloadText'() {
      download(fileBase() + '.txt', content.innerText, 'text/plain');
    },
    'file.print'() {
      session.saveNow();
      popover.close();
      window.print();
    },
  });
}
