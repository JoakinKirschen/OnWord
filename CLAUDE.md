# OnWord — working agreement

OnWord is a browser-based word processor: plain HTML, CSS and ES modules, **no runtime dependencies and
no build step**. It will grow a lot. These rules exist so it stays easy to navigate; follow them even when
a shortcut looks harmless, and update this file in the same change whenever the structure changes.

## Before you finish any change

```bash
npm run verify
```

This runs, in order: `format:check` (Prettier), `lint` (ESLint), `typecheck` (`tsc --checkJs` over JSDoc
types), `check` (`tools/check-architecture.mjs`: import boundaries, file size, globals) and `test` (unit
tests, then end-to-end tests in headless Chromium). All must pass; CI runs the same command on every pull
request. Fix the cause of a failure — do not loosen a rule, add an `eslint-disable`, or cast to `any` to
get past one. `npm run format` fixes formatting.

Every user-facing change comes with a test in the same change (see Testing).

The app must be served over HTTP (`npm start`); ES modules do not load from `file://`.

## Layout

```
index.html              static markup for both screens; no inline scripts or handlers
styles/                 one stylesheet per area, linked from index.html (base, library, editor, document,
                        overlays, outline, ruler, page, find, images, history, print)
src/
  main.js               composition root: creates services, wires them, routes. Nothing imports it.
  core/                 no UI, no knowledge of screens: dom, events, commands, html (escape/sanitise),
                        storage (documents + versions), preferences, page (page setup model and
                        geometry), units, zip, download, platform
    docx/               Word import/export: reader (+ runs, xml) and writer (+ inline, parts);
                        paragraph and section convert in both directions
  ui/                   reusable widgets shared by screens: popover, toast, theme
  library/              the document list screen: library, templates, importer (files), backup
  editor/
    editor.js           composition root of the editor: builds `ctx`, initialises every feature
    session.js          the open document: load, autosave, title, counts
    selection.js        caret/selection utilities
    blocks.js           block-level insertion, DOM repair, selected paragraphs and their indents
    metrics.js          page, word, character and paragraph counts
    markdown.js         document → Markdown conversion
    icons.js            toolbar icons
    features/           one file per feature: toolbar, menus, shortcuts; formatting, paragraph, textCase,
                        formatPainter, autoformat, checklist; tables, links, images, symbols,
                        clipboard; ruler, pageSetup, headerFooter, view, outline; find, wordCount,
                        history, exporter, fileCommands
tests/
  unit/                 node:test, no browser — pure logic in core/
  e2e/                  node:test + Playwright, one file per area; harness.mjs holds shared setup
  fixtures/             .docx files written by other programs (python-docx, pandoc) for import tests
tools/                  development scripts (not shipped)
```

## Dependency rules (enforced by `npm run check`)

| Layer | May import from |
| --- | --- |
| `core/` | `core/` only |
| `ui/` | `core/`, `ui/` |
| `library/` | `core/`, `ui/`, `library/` |
| `editor/*.js` | `core/`, `ui/`, `editor/` |
| `editor/features/*` | `core/`, `ui/`, `editor/*.js` — **never another feature** |
| `main.js` | anything; nothing imports `main.js` |

- `library/` and `editor/` never import each other. Only `editor/editor.js` imports features.
- Dependencies point downwards only. If two features need the same code, move it down a layer
  (`editor/` helper, `ui/`, or `core/`); do not import sideways.

## How modules talk to each other

Features are decoupled. They share exactly three channels:

1. **Commands** (`core/commands.js`) — named actions such as `table.dialog` or `find.open`. A feature
   registers its commands; anything can run them with `commands.run(name, arg)`. Any element with
   `data-act="name"` (optional `data-arg`) runs that command on click — that is how buttons and menu items
   are wired, so never add per-button click handlers for actions.
   Names are `area.verb`: `app.*`, `library.*`, `file.*`, `edit.*`, `format.*`, `insert.*`, `table.*`,
   `link.*`, `image.*`, `find.*`, `view.*`, `history.*`, `page.*`. Registering a duplicate name throws.
2. **Events** (`ctx.events`) — notifications a feature may react to: `open`, `input`, `change`,
   `selection`, `dismiss`, `layout`. They are documented at the top of `editor/editor.js`; add new ones there.
3. **`ctx`** — the context object every feature receives: `root`, `content`, `scroller`, `selection`,
   `session`, `store`, `prefs`, `commands`, `events`, `popover`, `toast`, `navigate`, `exec`, `changed`.
   Its type is `EditorContext` in `editor/editor.js`; keep that typedef in step with the object.
   Add to `ctx` only for things most features need; otherwise use a command.

Call `ctx.changed()` after every programmatic change to the document (it tidies, autosaves, recounts and
emits `change`). Use `ctx.exec(command, value)` for browser editing commands.

## No globals, no hidden state

- No assignments to `window`/`globalThis`, no inline `onclick`, no scripts other than `src/main.js`.
- **No module-level mutable state.** Module scope holds only imports, constants and pure functions.
  State lives in closures inside `createX(deps)` / `initX(ctx)` functions.
- **Dependencies are passed in, never reached for.** A module gets its services and its root element as
  parameters. Look elements up with `$(selector, root)` inside the root you were given;
  `document.querySelector`/`getElementById` are banned outside `main.js`.
- Persistence goes through the store (`core/storage.js`) for document data and `prefs`
  (`core/preferences.js`) for per-browser settings. No feature touches `localStorage` directly (ESLint
  forbids it), so the backend can be replaced in one place.
- Event delegation uses `hit(event, selector)` / `targetOf(event)` from `core/dom.js`, not `event.target`.
- Any HTML that did not originate in the editor (paste, import, future sync) passes through `sanitize()`.
  Interpolated text in markup goes through `esc()`.

## Adding a feature

1. Create `src/editor/features/<name>.js` exporting `init<Name>(ctx)`. One feature, one file, one
   responsibility; start the file with a one-line doc comment saying what it owns.
2. Register its commands inside `init`, keep its state in the closure, add its listeners there.
3. Add `init<Name>` to the `FEATURES` list in `editor/editor.js`.
4. Expose it to users by adding a menu entry in `features/menus.js`, a button in `features/toolbar.js`,
   or a key in `features/shortcuts.js` — each just names the command.
5. Static markup goes in `index.html` inside the screen that owns it. Styles go in the stylesheet for that
   area; a feature with more than a few rules gets its own `styles/<name>.css`, linked from `index.html`.
6. Add an end-to-end test, and update the layout section above if you added a file or folder.

A new screen follows the `library/` pattern: its own folder, a `createX({ root, ...services })` factory,
wired in `main.js`.

## Types

Types are JSDoc comments checked by `tsc`; there are no `.ts` files and nothing is compiled.

- Every exported function documents its parameters. Features take
  `@param {import('../editor.js').EditorContext} ctx`; factories describe their `deps` object.
- A module that returns an API exports its type as `@typedef {ReturnType<typeof createX>} X`, and consumers
  refer to it with `import('...').X`. Type imports obey the same layer rules as code imports.
- `$`/`$$`/`hit` return `any` on purpose (an element's subtype cannot be inferred from a selector). That is
  the only sanctioned `any`; do not widen types elsewhere to silence the checker.

## Testing

- **Unit** (`tests/unit/`): logic that needs no browser — everything in `core/` except `sanitize()`. Use a
  fake `Storage`, never the real one.
- **End-to-end** (`tests/e2e/`): behaviour as a user sees it, driven through the real UI. Each test opens a
  fresh browser context (empty storage) via `useApp()` from `harness.mjs`, so tests never depend on each
  other. Add to the file for the area you touched, or create `<area>.test.mjs`. Anything relying on the
  browser's HTML parser (`sanitize()`) is tested here too.
- Assert on the document (`html(page)`, `text(page)`) or visible UI, not on implementation details, and end
  UI tests with `assert.deepEqual(page.errors, [])`.
- A bug fix starts with a test that fails without the fix.

## Size and style

- Formatting is Prettier's (`npm run format`); do not hand-format against it.
- Files stay under 250 lines (enforced). Approaching the limit means the module has two jobs: split it by
  responsibility, not arbitrarily.
- Functions do one thing; prefer early returns over nesting. ESLint caps complexity (15), nesting depth
  (4) and parameters (4) — pass an options object beyond that. Name things for what they are, not how they
  are used.
- Factories are `createX` when they return an API and `initX` when they only wire behaviour.
- Constants (`UPPER_CASE`) at the top of the module that owns them; no magic numbers inline.
- Comments explain *why* (browser quirks, non-obvious constraints), not what the code says.
- No new runtime dependencies or build tooling without the owner's agreement.
- Do not leave dead code, commented-out code, or TODOs without an owner.

## Known constraints

- Editing is built on `contenteditable` and `document.execCommand`. Chrome produces invalid nesting
  (blocks inside `<p>`); `tidy()` in `editor/blocks.js` repairs it, and block-level inserts go through
  `insertBlock()` instead of `insertHTML`.
- Documents live in `localStorage` (a few MB). There is no server, sync or collaboration yet. Version
  snapshots share that quota, so the store keeps at most 10 per document and drops old ones silently when
  space runs out.
- The look of a document is defined in three places that must change together: `styles/document.css`
  (editor), `EXPORT_CSS` in `features/exporter.js` (HTML download) and `STYLES` in `core/docx/parts.js`
  (Word download).
- Word support is hand-written (`core/zip.js` + `core/docx/`) because the app takes no dependencies. It
  covers what the editor can produce: headings, character formatting, alignment, line spacing, lists,
  checklists, tables, links, embedded images, rules, page breaks and page setup. Anything else in an
  imported file (headers/footers, comments, tracked deletions, footnotes, merged cells, floating shapes)
  is dropped or flattened. When the editor gains a block or format, add it to the writer, the reader and
  the round-trip test in `tests/e2e/docx.test.mjs` in the same change.
- The app's "Title" is `<h1>`, "Subtitle" is `<p class="subtitle">` and "Heading 1–4" are `<h2>`–`<h5>`;
  Word's Title/Subtitle/Heading 1–4 styles map to those in both directions.
- Paragraph formatting lives in the block's inline style: `text-align`, `line-height`, `margin-left` /
  `margin-right` / `text-indent` in px (the ruler's unit) and `margin-top` / `margin-bottom` in pt. Use
  `selectedBlocks()`, `indentsOf()` and `setIndents()` from `editor/blocks.js` rather than
  `execCommand('indent')`, which wraps paragraphs in a blockquote.
- Everything about the page is one object in the document's metadata (`meta.page`, type `PageSetup` in
  `core/page.js`): size, orientation, margin, columns, header and footer. Always pass it through
  `normalizePage()`, and when saving a part of it spread the current value first so the rest survives.
  `pageSetup.js` publishes the geometry as CSS custom properties on `#sheet` and emits `layout`.
- There is no real pagination: the document is one continuous page. Page boundaries are a background
  drawn every printable-page height and the page count is an estimate (`countPages`); explicit page
  breaks and columns are not accounted for. Printing is exact because the browser paginates.
- Headers and footers are a single line of plain text with `{page}` / `{pages}` tokens, printed through
  `@page` margin boxes (the only place CSS exposes page counters; Chromium 131+).
- State that is a view preference, not document content (formatting marks, painter cursor), goes in a
  class on `#editor` itself — never inside it, where it would be saved with the document.
- Classes are stripped from foreign HTML except the ones in `ALLOWED_CLASSES` (`core/html.js`). A feature
  that stores state in a class (as checklists do) must add it there.
