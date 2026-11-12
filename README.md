# OnWord

A browser-based word processor. Plain HTML, CSS and JavaScript — no dependencies and no build step.

## Features

- Document library with search, rename, duplicate and delete
- Rich text: paragraph styles, fonts, sizes, bold/italic/underline/strikethrough, text and highlight colours,
  alignment, line spacing, lists, indentation, super/subscript
- Links, images (paste, drop or upload, with resizing), tables (add/remove rows and columns, Tab between cells),
  horizontal lines and page breaks
- Find and replace, word and character count, zoom, dark mode
- Autosave to the browser (`localStorage`)
- Import `.txt`, `.md` and `.html`; download as `.html`, `.doc` or `.txt`; print / save as PDF
- Pasted and imported HTML is sanitised

## Run

Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>. Because it is a static site, it can be hosted on any static host
(GitHub Pages, Netlify, …) as-is.

## Limitations

Documents are stored in the browser they were written in: there are no accounts, cloud sync or real-time
collaboration, and browser storage is limited to a few megabytes (large images are scaled down to help).
Use **File → Download** to back up or move a document.

## Keyboard shortcuts

| Action | Shortcut (Ctrl, or ⌘ on Mac) |
| --- | --- |
| Bold / italic / underline | Ctrl+B / I / U |
| Strikethrough | Ctrl+Shift+X |
| Insert link | Ctrl+K |
| Find and replace | Ctrl+F |
| Normal text, Heading 1–3 | Ctrl+Alt+0, 1–3 |
| Numbered / bulleted list | Ctrl+Shift+7 / 8 |
| Align left / centre / right / justify | Ctrl+Shift+L / E / R / J |
| Clear formatting | Ctrl+\ |
| Open a link | Ctrl+click |
