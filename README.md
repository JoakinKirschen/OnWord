# OnWord

A browser-based word processor. Plain HTML, CSS and JavaScript — no dependencies and no build step.

## Features

- Document library with search, rename, duplicate and delete, plus templates (letter, meeting notes,
  résumé, project brief)
- Word documents: open `.docx` files and download as `.docx`
- Back up every document to one file and restore it in another browser
- Rich text: paragraph styles, fonts, sizes, bold/italic/underline/strikethrough, text and highlight colours,
  alignment, line spacing, lists, checklists, indentation, super/subscript
- Links, images (paste, drop or upload, with resizing and alignment), tables (add/remove rows and columns, Tab between cells),
  horizontal lines and page breaks
- Document outline, find and replace, word and character count, zoom, dark mode
- Markdown shortcuts while typing (`# `, `## `, `- `, `1. `, `[] `, `> `)
- Page setup per document: paper size, orientation and margins
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

## Develop

The app has no runtime dependencies. Architecture rules and the module layout are in [CLAUDE.md](CLAUDE.md).

```bash
npm install                        # development tools only
npx playwright install chromium    # browser for the end-to-end tests
npm run verify                     # format, lint, types, architecture check, tests
```

CI runs `npm run verify` on every pull request.

## Limitations

Documents are stored in the browser they were written in: there are no accounts, cloud sync or real-time
collaboration, and browser storage is limited to a few megabytes (large images are scaled down to help).
Use **File → Download** to move a document, or **Back up** on the home screen to save all of them.

Word import keeps text, headings, character formatting, lists, tables, links, images and page setup.
Headers and footers, comments, footnotes, tracked changes and merged cells are not carried over.

## Keyboard shortcuts

| Action | Shortcut (Ctrl, or ⌘ on Mac) |
| --- | --- |
| Bold / italic / underline | Ctrl+B / I / U |
| Strikethrough | Ctrl+Shift+X |
| Insert link | Ctrl+K |
| Find and replace | Ctrl+F |
| Normal text, Heading 1–3 | Ctrl+Alt+0, 1–3 |
| Numbered / bulleted list / checklist | Ctrl+Shift+7 / 8 / 9 |
| Align left / centre / right / justify | Ctrl+Shift+L / E / R / J |
| Clear formatting | Ctrl+\ |
| Open a link | Ctrl+click |
