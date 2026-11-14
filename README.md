# OnWord

A browser-based word processor. Plain HTML, CSS and JavaScript — no dependencies and no build step.

## Features

- Optional accounts with server storage, and sharing a document with other accounts (view or edit)
- Specifications (lastenboeken): master specifications and projects built from them, as a tree of
  numbered articles with rich text, measurement lines with formulas, unit prices and a bill of quantities
  (meetstaat) that downloads for Excel. A price library shows what each article cost in your other
  projects and for what quantity, suggests the price to expect for this project's quantity (larger
  quantities usually cost less per unit) and fills in missing prices. Offers that contractors return (the
  filled-in bill of quantities, as Excel or CSV) are imported and compared side by side per article and in
  total; with the server part an AI reader (Claude) also reads PDFs and unusual layouts. A specification
  can be turned into a document for Word or PDF.
- Projects first: the home screen lists the projects and the latest documents. A project keeps its
  specification, bill of quantities, offers, site reviews and documents together; documents are started in
  it from the templates, and generated ones (the specification, site review reports) are filed there
- Document library with search, a filter by project, rename, duplicate, move to a project and delete, plus
  templates (letter, meeting notes, résumé, project brief)
- Word documents: open `.docx` files and download as `.docx`
- Back up every document to one file and restore it in another browser
- Rich text: paragraph styles (Title, Subtitle, Heading 1–4, Quote, Code), fonts, sizes, bold/italic/underline/strikethrough, text and highlight colours,
  alignment, line spacing, lists, checklists, indentation, super/subscript
- Links, images (paste, drop or upload, with resizing and alignment), tables (add/remove rows and columns, Tab between cells),
  horizontal lines and page breaks
- Document outline, find and replace, word and character count, zoom, dark mode
- Markdown shortcuts while typing (`# `, `## `, `- `, `1. `, `[] `, `> `)
- Ruler with draggable left, first-line and right indent markers; Paragraph dialog for alignment,
  indents (first line or hanging) and spacing before/after
- Paged view: the document is shown as separate sheets, with header, footer and page numbers on each
- Table of contents that updates itself, footnotes, merging and splitting of table cells
- Reviewing: comments with a side panel, and tracked changes that can be accepted or rejected
- Page setup per document: paper size, orientation, margins and columns; page boundaries and a page count
- Format painter, change case, special characters, formatting marks (¶), word count dialog, zoom slider
- Version history with restore
- Autosave to the browser (`localStorage`)
- Import `.docx`, `.html`, `.txt` and `.md`; download as `.docx`, `.html`, `.md` or `.txt`; print / save as PDF
- Pasted and imported HTML is sanitised

## Run

The app uses ES modules, so it must be served over HTTP (opening `index.html` from disk will not work):

```bash
npm start
```

Then visit <http://localhost:8000>. Because it is a static site, it can be hosted on any static host
(GitHub Pages, Netlify, …) as-is.

## Deploy to a web host

OnWord runs in two ways, and decides by itself which applies:

- **With accounts and server storage** (shared hosting with PHP 8.1+ and MySQL/MariaDB, such as
  DirectAdmin): people sign in, their documents are stored in the database, and a document can be shared
  with other accounts for viewing or editing.
- **As plain files** (any static host, or `npm start`): no sign-in; documents stay in each visitor's browser.

```bash
npm run package
```

This writes `dist/onword-site.zip`. On DirectAdmin:

1. **Account Manager → MySQL Management → Create new database.** Note the database name, user and password.
2. **File Manager:** go to `domains/<your-domain>/public_html` (or a subfolder), upload the zip and choose
   **Extract**. File managers often hide files that start with a dot; make sure `.htaccess` was extracted.
3. In the extracted `api` folder, copy `config.sample.php` to `config.php` and fill in the three database
   values. The tables are created automatically the first time the site is opened.
4. Open the site and choose **Create an account**.
5. Use HTTPS (**SSL Certificates → Let's Encrypt**): passwords are sent to the server.

Settings in `api/config.php`:

- `allow_registration` — set to `false` once everyone has an account, so strangers cannot sign up.
- `registration_code` — a code people must enter to create an account.
- `max_document_bytes` — largest document accepted (5 MB by default).
- `anthropic_api_key` — turns on the AI reader for contractors' offers (PDFs and unusual spreadsheets).
  Create a key at console.anthropic.com. The offers people import with it are sent to Anthropic's Claude
  API to be read, and each reading is billed to that key. Needs PHP's curl extension; a long offer can take
  a few minutes, so the host must allow requests that long. Leave it empty to keep the feature off.

To update, upload and extract a new zip over the old files; `config.php` is not in the zip, so your
settings stay. Without `config.php` the site shows a setup notice instead of the sign-in screen.

## Develop

The app has no runtime dependencies. Architecture rules and the module layout are in [CLAUDE.md](CLAUDE.md).

```bash
npm install                        # development tools only
npx playwright install chromium    # browser for the end-to-end tests
npm run verify                     # format, lint, types, architecture check, tests
```

CI runs `npm run verify` on every pull request.

## Limitations

Served as plain files, documents are stored in the browser they were written in, and browser storage is
limited to a few megabytes (large images are scaled down to help). With the server part, documents are
stored per account and can be shared, but two people editing the same document at the same time do not
see each other's changes live: whoever saves second is told the document changed elsewhere and has to
reload. There is no password reset by email yet.
Use **File → Download** to move a document, or **Back up** on the Documents page to save all of them.

Word import keeps text, headings, character formatting, lists, tables, links, images and page setup.
Headers and footers, comments, footnotes, tracked changes and merged cells are not carried over.

## Keyboard shortcuts

| Action | Shortcut (Ctrl, or ⌘ on Mac) |
| --- | --- |
| Bold / italic / underline | Ctrl+B / I / U |
| Strikethrough | Ctrl+Shift+X |
| Insert link | Ctrl+K |
| Find and replace | Ctrl+F |
| Normal text, Heading 1–4 | Ctrl+Alt+0, 1–4 |
| Numbered / bulleted list / checklist | Ctrl+Shift+7 / 8 / 9 |
| Align left / centre / right / justify | Ctrl+Shift+L / E / R / J |
| Page break | Ctrl+Enter |
| Clear formatting | Ctrl+\ |
| Open a link | Ctrl+click |
