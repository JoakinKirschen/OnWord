# OnWord — working agreement

OnWord is a browser-based word processor: plain HTML, CSS and ES modules, **no runtime dependencies and
no build step**, with an optional server part in plain PHP (`api/`) for accounts and shared storage. It will grow a lot. These rules exist so it stays easy to navigate; follow them even when
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

## One shared branch — everything is merged by the end of every session

The owner's standing instruction: **all work lives on one branch, `claude/compassionate-lamport-6oah12`**
(the repository's default branch; there is no `main`). Several sessions work on this repository, often
at the same time, each on a branch of its own. Nothing may be left only on a session branch.

At the start of a session:

1. `git fetch origin` and start from the latest `claude/compassionate-lamport-6oah12`.
2. Look at the open pull requests and at the other `claude/*` branches with commits the shared branch does
   not have. Do not start work that one of them already covers; build on it once it is merged instead.

At the end of every session — not only when a feature is finished:

1. Merge the latest shared branch into your branch (`git merge origin/claude/compassionate-lamport-6oah12`)
   and resolve any conflicts. Never rebase or force-push: other sessions may have pulled your commits.
2. Run `npm run verify`; it must pass.
3. Push, open a pull request into `claude/compassionate-lamport-6oah12` (or update the open one), wait for
   CI to pass, and merge it with **squash**. If your session's branch *is* the shared branch, push to it
   and check that CI passes on that push.
4. Confirm nothing is left behind: `git fetch origin` and check that each `claude/*` branch you touched has
   no changes the shared branch lacks (`git diff origin/claude/compassionate-lamport-6oah12 <branch>`
   shows only what later merges added).
5. If something prevents merging (CI fails for a reason outside your change, a conflict needs the owner,
   a schema change collides with another session's), do not leave silently: tell the owner what is
   unmerged, where, and why.

Schema changes need extra care because two sessions can each claim the next `SCHEMA_VERSION` with
different tables. Fetch immediately before bumping it, and merge a schema change as soon as it passes.

## Layout

```
index.html              static markup for both screens; no inline scripts or handlers
.htaccess               Apache settings for the web host: MIME type, security policy, caching
api/                    server part (PHP 8.1+, PDO; MySQL/MariaDB in production, SQLite in tests)
  index.php             the entry point: route table, session, CSRF check, error handling
  sso.php               where single sign-on providers send people back (runs index.php)
  lib/                  http (JSON, session, CSRF), db (connection, schema), auth, sso (single sign-on
                        with OpenID Connect: Microsoft 365, Google), documents, specs,
                        prices, offers, reviews (site reviews and their photos), ai (the AI reader:
                        calls the Claude API)
  config.sample.php     copied to config.php on the host; config.php is never committed or packaged
styles/                 one stylesheet per area, linked from index.html (base, library, editor, document,
                        account, specs, offers, reviews (site reviews), overlays, outline, ruler,
                        page, find, images, history, review (comments, changes), print)
src/
  main.js               composition root: creates services, wires them, routes. Nothing imports it.
  core/                 no UI, no knowledge of screens: dom, events, commands, html (escape/sanitise),
                        storage (documents in the browser), remoteStore (documents on the server,
                        same interface), api (server client), preferences, page (page setup model and
                        geometry), docStyles (paragraph style definitions), units, tableGrid (merged cells), zip, xlsx (reading Excel
                        workbooks), csv, base64, download, platform, ids
    spec/               specifications: model (articles, tree, numbering, quantities), formula
                        (measurement arithmetic), output (document and CSV), prices (price library),
                        offers (reading, matching and comparing contractors' offers), aiReader
                        (client of the server's AI reader), reviews (site reviews: visits with
                        observations and photos), reviewOutput (a review as a report document),
                        localStore, remoteStore
    docx/               Word import/export: reader (+ runs, styles, xml) and writer (+ inline,
                        parts); paragraph, section, docStyles (styles.xml), numbering (lists), tables (+ cells: widths,
                        borders, padding) and notes (footnotes, comments, table of contents) convert
                        in both directions
  ui/                   reusable widgets shared by screens: popover, toast, theme
  library/              the document list screen: library, templates (the built-in ones), templateBand
                        (the templates band: using, creating and managing templates), importer (files),
                        backup, sharing
  account/              the sign-in / create-account screen
  reviews/              the site review screen, for phones and tablets: review (the screen), templates
                        (its markup), photos (shrinking photos before they are stored)
  specs/                the specification screens: list (+ new-project dialog), workspace (article
                        tree, article form, bill of quantities), articleText (editing an article's
                        text), masterPicker (a project's Master / Project sidebar tabs), articleChanges
                        (+ removal: taking articles out, with its warning, and bringing them in),
                        outputs (CSV, document), views (the workspace's tabs), siteReviews (a
                        project's list of site reviews), templates (their markup), prices
                        (price library note and view), offers (comparison of offers) and
                        offerImport (the import dialog), saver (saving the open specification)
  editor/
    editor.js           composition root of the editor: builds `ctx`, initialises every feature
    session.js          the open document: load, autosave, title, counts
    selection.js        caret/selection utilities
    blocks.js           block-level insertion, DOM repair, selected paragraphs and their indents
    metrics.js          page, word, character and paragraph counts; geometry of the paged view
    pagination.js       pure page-break arithmetic (unit-tested)
    markdown.js         document → Markdown conversion
    icons.js            toolbar icons
    features/           one file per feature: toolbar, menus, shortcuts; formatting, styles, paragraph, listStyles, textCase,
                        formatPainter, autoformat, checklist; tables, tableMerge, links, images,
                        symbols, clipboard, toc, footnotes; comments, trackChanges; ruler, pageSetup,
                        pagination, headerFooter, view, outline; find, wordCount, history, exporter,
                        fileCommands
tests/
  unit/                 node:test, no browser — pure logic in core/ (including core/spec/) and
                        editor/pagination.js
  e2e/                  node:test + Playwright, one file per area; harness.mjs holds shared setup
  fixtures/             files written by other programs for import tests: .docx (python-docx, pandoc;
                        styled-letter.docx is hand-written after a Google Docs export), .xlsx (openpyxl)
tools/                  development scripts (not shipped): architecture check, site packaging
```

## Dependency rules (enforced by `npm run check`)

| Layer | May import from |
| --- | --- |
| `core/` | `core/` only |
| `ui/` | `core/`, `ui/` |
| `library/` | `core/`, `ui/`, `library/` |
| `account/` | `core/`, `ui/`, `account/` |
| `specs/` | `core/`, `ui/`, `specs/` |
| `reviews/` | `core/`, `ui/`, `reviews/` |
| `editor/*.js` | `core/`, `ui/`, `editor/` |
| `editor/features/*` | `core/`, `ui/`, `editor/*.js` — **never another feature** |
| `main.js` | anything; nothing imports `main.js` |

- `library/`, `account/`, `specs/`, `reviews/` and `editor/` never import each other. Only `editor/editor.js` imports features.
- Dependencies point downwards only. If two features need the same code, move it down a layer
  (`editor/` helper, `ui/`, or `core/`); do not import sideways.

## How modules talk to each other

Features are decoupled. They share exactly three channels:

1. **Commands** (`core/commands.js`) — named actions such as `table.dialog` or `find.open`. A feature
   registers its commands; anything can run them with `commands.run(name, arg)`. Any element with
   `data-act="name"` (optional `data-arg`) runs that command on click — that is how buttons and menu items
   are wired, so never add per-button click handlers for actions.
   Names are `area.verb`: `app.*`, `library.*`, `file.*`, `edit.*`, `format.*`, `insert.*`, `table.*`,
   `link.*`, `image.*`, `find.*`, `view.*`, `history.*`, `page.*`, `review.*` (comments and tracked
   changes), `account.*`, `spec.*`, `site.*` (site reviews). Registering a duplicate name throws.
2. **Events** (`ctx.events`) — notifications a feature may react to: `open`, `input`, `change`,
   `selection`, `dismiss`, `layout`, `pages`. They are documented at the top of `editor/editor.js`; add new ones there.
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

## Server part (`api/`)

Plain PHP with no framework or Composer packages, so it runs on shared hosting as uploaded.

- `index.php` is the only file meant to be requested, apart from `sso.php`, the return address for single
  sign-on (providers do not accept a query string there). A route is `"METHOD name" => [handler, signed in?]`
  in its `ROUTES` table, addressed as `api/index.php?r=name`. Reads are GET; everything that changes data
  is POST with a JSON body. No PUT/DELETE and no URL rewriting, which some hosts block.
- A handler is a function `(PDO $db, ?array $user, array $in, array $config): array` in `lib/`; it returns
  the response data or calls `fail(status, code, message)`. `code` is a stable identifier the client may
  branch on; `message` is shown to the user. Never echo, never expose exception details.
- Every POST must pass `require_csrf()` (done centrally in `index.php`). Every document handler starts
  with `doc_access()` or `require_owner()`; a document the user may not see answers exactly like a
  missing one (404).
- SQL goes through `run()` with placeholders only — no values, and no request data of any kind, in the
  SQL text. Keep statements portable between MySQL and SQLite; driver differences live in
  `ensure_schema()`. A schema change bumps `SCHEMA_VERSION` and must upgrade an existing database.
- Validate every input field (`text_field()`, `doc_id()`, `doc_fields()`), including lengths.
- Tests: `tests/e2e/server.test.mjs` starts PHP's built-in server with a temporary SQLite database and
  drives the real UI. Set `ONWORD_TEST_CONFIG` to a config file to run them against MySQL/MariaDB. Any new
  route gets a test there, including what a user without access gets.
- Single sign-on (`lib/sso.php`) uses OpenID Connect: the authorization code flow with PKCE, a nonce and
  state kept in the session, and the ID token's RS256 signature checked against the provider's published
  keys (`rsa_pem()` turns a JWK into a key openssl reads), as well as its issuer, audience, times and nonce.
  Providers are listed in `config.php` (`sso`); `auth/me` names them and, once, why the last sign-on failed
  (`ssoError`). An account is found by `users.sso_subject` (issuer|sub), else by the verified address,
  which links it; a new one is made only for an address in the provider's `domains`, or, without domains,
  when registration is open without a code. `allow_passwords: false` leaves single sign-on only. The
  server tests run a fake provider (`tests/e2e/fakeOidc.mjs`) that signs real tokens.
- Besides sign-on providers, the only outside service is the Claude API, used by the AI reader (`lib/ai.php`) through PHP's curl
  extension. Its key lives in `config.php` and never reaches the browser; without a key the feature is off
  and `auth/me` says so (`ai: false`). Tests point `anthropic_base_url` at a fake API in the test process,
  so they need no key and no network.

## Types

Types are JSDoc comments checked by `tsc`; there are no `.ts` files and nothing is compiled.

- Every exported function documents its parameters. Features take
  `@param {import('../editor.js').EditorContext} ctx`; factories describe their `deps` object.
- A module that returns an API exports its type as `@typedef {ReturnType<typeof createX>} X`, and consumers
  refer to it with `import('...').X`. Type imports obey the same layer rules as code imports.
- `$`/`$$`/`hit` return `any` on purpose (an element's subtype cannot be inferred from a selector). That is
  the only sanctioned `any`; do not widen types elsewhere to silence the checker.

## Testing

- **Unit** (`tests/unit/`): logic that needs no browser — everything in `core/` except `sanitize()` and the
  readers that parse XML with the browser's `DOMParser` (Word, Excel). Use a fake `Storage`, never the real
  one.
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
- The site runs in one of two modes, decided at start-up in `main.js` by asking `api/index.php` who is
  signed in. If that answers, documents live on the server and a sign-in screen comes first. If it does
  not (the files are served without PHP, as in `npm start` and most tests), documents live in
  `localStorage`, a few MB per browser. Features never know which: both stores implement the interface
  defined in `core/storage.js`, and anything added to one must be added to the other.
- The store interface is synchronous. `core/remoteStore.js` achieves that with an in-memory copy: reads
  come from it, writes update it at once and are sent in the background, one request per document at a
  time with later changes merged. Consequences: a document's content must be `load()`ed before it is
  opened (the router does this), `write()` returning true means accepted, not stored (`syncState()` and
  `onStatus()` tell the rest), and ids are generated in the browser. Every update carries the revision
  it is based on; the server refuses a stale one (`conflict`) rather than overwrite newer work.
- Accounts (`api/lib/auth.php`): passwords are bcrypt hashes of at least 10 characters and at most 72
  bytes, refused when common, built on a common word, or containing the user's name or address. Failed
  sign-ins are limited per address *and* connection (8 in 15 minutes), so nobody can lock someone else
  out, and per connection (30), so one machine cannot try address after address; an address without an
  account is checked against a stand-in hash so it answers as fast as a wrong password. Attempts to
  create an account are limited per connection and hour (`max_registrations_per_hour`), wrong codes
  included. The connection is `client_ip()`: REMOTE_ADDR, or the header `client_ip_header` names behind a
  proxy; the server tests set it to `HTTP_X_TEST_IP` and give every browser its own address
  (`ONWORD_TEST_CONFIG` files need the same setting). `.htaccess` sends plain http to https and sets HSTS.
- HTML that arrives from the server is foreign, because another account may have written it: it goes
  through `sanitize()` in `remoteStore.load()`. The server stores it as it is given.
- Version snapshots are capped at 10 per document in both stores.
- A template is a document with `template: true` in its metadata (column `documents.template` on the
  server), so it is edited, renamed, shared, backed up and deleted like any document; the library lists
  it in the templates band instead of with the documents, and the editor shows a "Template" badge. Using
  it creates an ordinary document from its content, page setup and styles (`library.new` with its id;
  on a server store it is `load()`ed first). The built-in templates (`library/templates.js`) cannot be
  changed or deleted; "Edit a copy" makes a stored template of one. "Save as template" is
  `duplicate(id, { title, template: true })`; a copy of a template is a template. A server copy is
  queued under both ids, so the copy is not loaded, saved or copied before the server has made it.
- Specifications (`core/spec/`) are a separate kind of data from documents, with their own store
  interface (`SpecStore` in `core/spec/model.js`), which is asynchronous: every call goes to the store,
  and the workspace keeps the open specification in memory and saves changed articles after a short
  pause. Same two implementations as documents: browser (`localStore.js`) and server (`remoteStore.js`).
- A specification is a `master` (reference text) or a `project`. A project's articles are copies of the
  chosen master articles; `sourceId` remembers the original so the workspace can show where a project
  differs and reset an article to the master text. Copies keep the tree even when a level in between was
  not chosen (`copyArticles()` in the browser, `copy_master_articles()` on the server — keep them alike).
  Later, the Master tab of a project's sidebar changes which master articles the project has: its boxes
  are ticked where the project has a copy, ticking also ticks what is under an article and the articles
  above it, unticking unticks what is under it, and "Apply" adds and removes in one go.
- Removing articles always takes what is under them and shows the warning in `removal.js`, which lists
  every article that goes. `planRemoval()` decides: an article from the master, and one the user added
  under a master article that goes as well, is kept with `removed: true` (column `articles.removed` on the
  server) so that ticking it again brings it back with its text, measurements and price
  (`bringIn()`, which re-hangs it under the copy of its nearest master ancestor and copies the rest);
  anything else is deleted. The workspace keeps removed articles apart from those in use; they are
  saved like the others but never shown, measured, priced or put in the price library.
- Articles form a tree through `parentId`. Numbers are free text set by the user; siblings are shown in
  natural number order ("2" before "10"). An article with a unit is measured: its quantity is the sum of
  its measurement lines, each an arithmetic formula (`core/spec/formula.js`, no `eval`). Only measured
  articles appear in the bill of quantities.
- On the server every account can read every master; only the owner changes a specification, and
  projects are visible to their owner only. Sharing projects with other accounts is not built yet.
- Offers are the bills of quantities contractors fill in and send back, stored per project (`offers()` on
  the spec store; table `offers` on the server, owner only). The browser reads the file (`.xlsx` via
  `core/xlsx.js`, CSV via `core/csv.js`), finds the heading row and columns by their names in Dutch,
  French or English (`detectColumns()`; the user can correct them), and matches lines to articles by
  number, then by a title only one article has. Lines that match nothing are kept with the offer and
  shown, never dropped silently. Amounts are compared for the project's own quantities; a contractor's
  different quantity is marked. "Use prices" copies an offer's unit prices into the project.
- Site reviews are visits to a project's site (`core/spec/reviews.js`), stored per project like offers
  (`reviews()` / `saveReview()` on the spec store; table `reviews` on the server, owner only). A review
  holds the visit (date, attendees, weather, notes) and observations: location, status (OK, remark,
  defect), text, an optional project article, photos and follow-up (action, due date, done). A new review
  takes over the open observations (not OK, not done) of the latest one, without their photos, and
  remembers in `from` the review that first noted them. Photos are shrunk in the browser
  (`reviews/photos.js`) to JPEG data URLs and stored apart from the review (`savePhoto()` / `photos()`;
  table `review_photos`), each once, before the review refers to it; saving a review drops the photos
  it no longer refers to. Anything shown as a photo must pass `isPhotoData()` (JPEG or PNG data URL), and
  the server accepts nothing else. The review screen (`#/r/<project>/<review>`) is laid out for a phone:
  one column, 44px targets, 16px fields (larger ones keep phones from zooming in), actions fixed at the
  bottom. "Create report" makes an ordinary document (`reviewToHtml()`) with smaller copies of the
  photos, which then has the editor's Word, PDF and HTML export.
- The AI reader is for what the spreadsheet reader cannot do: PDFs and unusual layouts. The browser sends
  the file (a PDF as base64, a sheet as tab-separated text) to `ai/read`; the server adds the project's
  articles from the database and asks Claude for the priced lines as JSON (structured outputs), each with
  the id of the matching article. Ids the project does not have are discarded on the server. The result
  goes through the same `matchLines()` and import dialog as a spreadsheet, so the user checks it before
  it is stored. It is only offered when the site runs with its server part and a key is configured.
- The price library is not stored separately: it is every unit price the user gave an article taken
  from a master, in their own projects (`prices()` on the spec store; `collectPrices()` in the browser,
  `prices_list()` on the server — keep them alike). Prices are filed under the master article and only
  compared for the same unit. A master shows the prices of all projects; a project those of the others.
- A price is only meaningful with its quantity: larger quantities get lower unit prices. Each price record
  carries the measured quantity of its article (the server sends the measurement lines; the browser
  evaluates them, so formulas are evaluated in one place). `fitCurve()` fits price = a × quantityᵇ by least
  squares on logarithms once two different quantities are known; `expectedPrice()` reads it off for an
  article's quantity, held at the ends of the quantities seen rather than extrapolated. Suggestions use the
  expected price where there is one and the average otherwise.
- "Create document" turns a specification into an ordinary document (`specToHtml()`), which then has
  the editor's Word, PDF (print) and HTML export. The document is a snapshot: later changes to the
  specification do not flow into it.
- The look of a document is defined in four places that must change together: `styles/document.css`
  (editor), `EXPORT_CSS` in `features/exporter.js` (HTML download), `stylesXml()` in
  `core/docx/docStyles.js` (Word download) and the defaults in `core/docStyles.js`, which describe that
  look in numbers. `BODY` in `core/docx/parts.js` is the plain paragraph's part of those defaults, which
  the Word reader compares against.
- Document styles (Format → Styles…, "Update style to match selection") let a document change what
  Normal text, Title, Subtitle, Heading 1–4 and Quote look like. Only the changes are stored, in the
  document's metadata (`meta.styles`, type `StyleOverrides`; column `documents.styles` on the server);
  always pass them through `normalizeStyles()`. `stylesCss()` turns them into rules scoped to the
  document's container: `features/styles.js` puts them in a `<style>` outside `#editor` (and emits
  `layout`), the HTML download appends them for `body`, and the Word writer builds styles.xml from them.
  Paragraphs are not touched, so direct formatting still wins over the style, as in Word. Normal text's
  font, size, colour and line spacing are set on the container and inherited by everything in it; its
  alignment and spacing apply to paragraphs only. The Word reader turns a file's Title, Subtitle,
  Heading 1–4 and Quote styles into overrides; its Normal style stays inline on the paragraphs, as
  described below.
- Word support is hand-written (`core/zip.js` + `core/docx/`) because the app takes no dependencies. It
  covers what the editor can produce: headings, character and paragraph formatting, lists, checklists,
  tables with merged cells, links, embedded images, rules, page breaks, page setup, header and footer,
  table of contents, footnotes, comments and tracked changes. Anything else in an imported file
  (endnotes, text boxes, floating shapes, section-specific layouts, formatting changes in tracked
  revisions) is dropped or flattened. When the editor gains a block or format, add it to the writer, the reader and
  the round-trip test in `tests/e2e/docx.test.mjs` in the same change.
- The Word reader follows Word's style cascade (`core/docx/styles.js`): document defaults, then the table
  style, the paragraph style (along its `basedOn` chain), character styles and finally direct formatting.
  Plain paragraphs, list items and table cells state in inline style only where the result differs from
  the editor's plain paragraph (`BODY`); the paragraph mark's size and font go on the block, runs state
  only their differences. Headings, quotes and code keep the editor's look and take only direct
  formatting. Word's "single" line spacing is the font's own line height, about 1.15 em, so Word line
  multiples are scaled by 1.15 in both directions (`SINGLE_LINE_CSS`); exact heights become `pt`.
- Imported tables keep their geometry as inline styles: column widths as `<colgroup>` percentages
  (`features/tables.js` keeps them in step when columns are added or removed), the table's width as a
  percentage, and per cell borders (`none` where Word has none), padding, shading and vertical alignment —
  only where they differ from the editor's default cell. The writer turns them back into `w:tblGrid`,
  `w:tcBorders`, `w:tcMar`, `w:shd` and `w:vAlign`, and writes the editor's own padding as the table's
  cell margins so plain tables round-trip unchanged.
- A list's bullet or numbering style is an inline `list-style-type` on its `<ul>`/`<ol>`
  (`features/listStyles.js`); without one the browser's own applies (bullets change with nesting,
  numbers stay decimal), and the Word writer writes exactly that. A styled list gets a numbering of its
  own in Word, with its style at every level; the reader sets a style only where Word's differs from what
  the browser would draw. Chrome's list commands leave the caret at the start of the new item, so
  `ctx.exec` puts it back (`selection.offsets()`).
- A paragraph becomes a checklist item only when it is indented and starts with ☐/☑, as the writer
  writes them; a ballot box in ordinary text (a form's options in a table) stays text.
- The app's "Title" is `<h1>`, "Subtitle" is `<p class="subtitle">` and "Heading 1–4" are `<h2>`–`<h5>`;
  Word's Title/Subtitle/Heading 1–4 styles map to those in both directions.
- The ruler follows Word's: numbers every inch (Letter, Legal) or centimetre (A4) counted outwards from
  the left margin, ticks every ⅛ in or ¼ cm, and Word's four markers — first line, hanging (moves the
  other lines, the first stays), the left indent box (moves both) and right. Markers snap to the ticks;
  Alt drags freely. Indents are stored to 1/100 px so centimetre positions survive as whole twips.
- Paragraph formatting lives in the block's inline style: `text-align`, `line-height`, `margin-left` /
  `margin-right` / `text-indent` in px (the ruler's unit) and `margin-top` / `margin-bottom` in pt. Use
  `selectedBlocks()`, `indentsOf()` and `setIndents()` from `editor/blocks.js` rather than
  `execCommand('indent')`, which wraps paragraphs in a blockquote.
- Everything about the page is one object in the document's metadata (`meta.page`, type `PageSetup` in
  `core/page.js`): size, orientation, margin, columns, header and footer. Always pass it through
  `normalizePage()`, and when saving a part of it spread the current value first so the rest survives.
  `pageSetup.js` publishes the geometry as CSS custom properties on `#sheet` and emits `layout`.
- The paged view never changes the document. `features/pagination.js` measures the top-level blocks (and
  the items of top-level lists), `editor/pagination.js` decides which start a new page, and the result is
  applied as generated `margin-top` rules in a `<style>` outside `#editor`. A block moves as a whole, so a
  paragraph is never split between two sheets, and a block taller than a page runs over the gap. Printing
  is paginated by the browser instead and may break at slightly different places. Pagination runs
  synchronously on every `change` and `layout` and then emits `pages`; anything that depends on page
  numbers (counts, header/footer bands, table of contents) listens for `pages`, not `change`.
- Features that keep generated content inside the document (table of contents, footnote numbers) rebuild
  it in an event handler without calling `ctx.changed()` again; they must only touch the DOM when the
  result differs, or they would loop.
- Headers and footers are a single line of plain text in a left, centre and right part (`RunningText`),
  with `{page}` / `{pages}` tokens, printed through the `@page` margin boxes of the same names (the only
  place CSS exposes page counters; Chromium 131+). With `firstPage` set, the first page shows
  `firstHeader` / `firstFooter` instead (`@page :first`, empty parts as `content: none`). In Word the
  parts are separated by tabs at a centre and a right tab stop, as Word's own Header style does, and the
  first page's are `type="first"` references with `<w:titlePg/>`; the reader fills the parts in tab
  order, and puts text without tabs where its paragraph is aligned. `normalizePage()` still reads the
  older `{ text, align }` form.
- State that is a view preference, not document content (formatting marks, painter cursor), goes in a
  class on `#editor` itself — never inside it, where it would be saved with the document.
- Classes, ids and `data-*` attributes are stripped from foreign HTML except those listed in
  `core/html.js` (`ALLOWED_CLASSES`, `ALLOWED_ID`, `ALLOWED_DATA`). A feature that stores state in one must
  add it there. Current uses: checklists and styles (classes), footnotes (`fnref-x` / `fn-x` ids tie a
  reference to its note), comments (`span.comment` with the text in `title`) and tracked changes
  (`<ins>` / `<del>`), the last two carrying `data-author` and `data-date`.
- Track changes intercepts `beforeinput` and edits the DOM itself for typing and deleting only; pasting,
  formatting and paragraph breaks are not tracked.
- The site is deployed to an Apache host with PHP and MySQL. `npm run package` zips exactly what is
  served (`index.html`, `.htaccess`, `styles/`, `src/`, `api/` without `config.php`). The end-to-end tests send the Content-Security-Policy
  from `.htaccess`, so anything it would block (inline scripts, third-party scripts) fails in tests.
  Adding a new kind of resource means updating that policy.
