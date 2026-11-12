/* OnWord — a small browser-based word processor. No dependencies, no build step. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const MOD = isMac ? '⌘' : 'Ctrl+';

  const els = {
    home: $('#home'), editorView: $('#editorView'), grid: $('#grid'), empty: $('#empty'), search: $('#search'),
    editor: $('#editor'), paper: $('#paper'), scroller: $('#scroller'), title: $('#title'),
    saveState: $('#saveState'), counts: $('#counts'), toolbar: $('#toolbar'), menubar: $('#menubar'),
    pop: $('#pop'), toast: $('#toast'), imgBar: $('#imgBar'), imgInput: $('#imgInput'), importInput: $('#importInput'),
    findPanel: $('#findPanel'), findInput: $('#findInput'), replaceInput: $('#replaceInput'),
    findCount: $('#findCount'), findCase: $('#findCase'),
    linkDlg: $('#linkDlg'), linkText: $('#linkText'), linkUrl: $('#linkUrl'), linkRemove: $('#linkRemove'),
    tableDlg: $('#tableDlg'), tblRows: $('#tblRows'), tblCols: $('#tblCols'),
  };
  const editor = els.editor;

  /* ───────────── Storage ───────────── */
  const KEY = { index: 'onword:index', theme: 'onword:theme', doc: (id) => 'onword:doc:' + id };
  const EMPTY_DOC = '<p><br></p>';

  const store = {
    index() {
      try { return JSON.parse(localStorage.getItem(KEY.index)) || []; } catch { return []; }
    },
    saveIndex(ix) { localStorage.setItem(KEY.index, JSON.stringify(ix)); },
    meta(id) { return this.index().find((d) => d.id === id); },
    read(id) { return localStorage.getItem(KEY.doc(id)) ?? EMPTY_DOC; },
    /** Writes content + metadata. Returns false when the browser's storage quota is exhausted. */
    write(id, html, patch) {
      try {
        if (html != null) localStorage.setItem(KEY.doc(id), html);
        const ix = this.index();
        const m = ix.find((d) => d.id === id);
        if (m) Object.assign(m, patch, { updated: Date.now() });
        this.saveIndex(ix);
        return true;
      } catch (err) {
        console.error(err);
        toast('Browser storage is full — download this document to keep your changes.', 6000);
        return false;
      }
    },
    create(title = 'Untitled document', html = EMPTY_DOC, snippet = '') {
      const now = Date.now();
      const meta = { id: now.toString(36) + Math.random().toString(36).slice(2, 8), title, created: now, updated: now, snippet };
      const ix = this.index();
      ix.push(meta);
      try {
        localStorage.setItem(KEY.doc(meta.id), html);
        this.saveIndex(ix);
      } catch (err) {
        console.error(err);
        localStorage.removeItem(KEY.doc(meta.id));
        toast('Browser storage is full — delete some documents first.', 6000);
        return null;
      }
      return meta;
    },
    remove(id) {
      localStorage.removeItem(KEY.doc(id));
      this.saveIndex(this.index().filter((d) => d.id !== id));
    },
  };

  /* ───────────── Small UI helpers ───────────── */
  let toastTimer;
  function toast(msg, ms = 2600) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (els.toast.hidden = true), ms);
  }

  function download(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    localStorage.setItem(KEY.theme, t);
  }
  document.documentElement.dataset.theme =
    localStorage.getItem(KEY.theme) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  /** Strip anything executable or app-specific from foreign HTML (paste, import). */
  function sanitize(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    $$('script,style,iframe,frame,object,embed,link,meta,title,base,form,input,button,textarea,select,noscript,svg,math,template,audio,video', doc).forEach((e) => e.remove());
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
    const comments = [];
    while (walker.nextNode()) comments.push(walker.currentNode);
    comments.forEach((c) => c.remove());
    for (const el of $$('*', doc.body)) {
      for (const { name, value } of [...el.attributes]) {
        const n = name.toLowerCase();
        const badUrl = ['href', 'src', 'xlink:href', 'action', 'formaction', 'background'].includes(n) &&
          !/^(https?:|mailto:|tel:|#|data:image\/(png|jpe?g|gif|webp);)/i.test(value.trim());
        if (n.startsWith('on') || n === 'id' || n.startsWith('data-') || n === 'srcset' || n === 'contenteditable' ||
          (n === 'class' && value !== 'page-break') || badUrl ||
          (n === 'style' && /url\s*\(|expression|position\s*:/i.test(value))) {
          el.removeAttribute(name);
        }
      }
    }
    return doc.body.innerHTML;
  }

  const textToHtml = (text) =>
    text.replace(/\r\n?/g, '\n').split('\n').map((l) => `<p>${esc(l) || '<br>'}</p>`).join('') || EMPTY_DOC;

  /* ───────────── Popover (menus + colour pickers) ───────────── */
  let popOwner = null;
  function openPop(anchor, html, cls = '') {
    els.pop.className = 'pop ' + cls;
    els.pop.innerHTML = html;
    els.pop.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = els.pop.offsetWidth, h = els.pop.offsetHeight;
    els.pop.style.left = Math.max(6, Math.min(r.left, innerWidth - w - 6)) + 'px';
    els.pop.style.top = (r.bottom + h + 6 > innerHeight && r.top - h - 4 > 0 ? r.top - h - 4 : r.bottom + 4) + 'px';
    popOwner?.classList.remove('open');
    popOwner = anchor;
    anchor.classList.add('open');
  }
  function closePop() {
    els.pop.hidden = true;
    popOwner?.classList.remove('open');
    popOwner = null;
  }
  const menuHtml = (items) => items.map((it) => it === '-' ? '<div class="sep"></div>'
    : `<button class="item ${it.danger ? 'danger' : ''}" data-act="${it.act}" ${it.arg != null ? `data-arg="${esc(it.arg)}"` : ''}>
         <span>${esc(it.label)}</span>${it.key ? `<kbd>${esc(it.key)}</kbd>` : ''}</button>`).join('');

  /* ───────────── Home ───────────── */
  const fmtDate = (ts) => {
    const d = new Date(ts), today = new Date();
    return d.toDateString() === today.toDateString()
      ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  };

  function renderHome() {
    const q = els.search.value.trim().toLowerCase();
    const all = store.index().sort((a, b) => b.updated - a.updated);
    const docs = q ? all.filter((d) => (d.title + ' ' + (d.snippet || '')).toLowerCase().includes(q)) : all;
    els.grid.replaceChildren(...docs.map((d) => {
      const a = document.createElement('a');
      a.className = 'card';
      a.href = '#/d/' + d.id;
      a.innerHTML = `<div class="thumb"><div class="thumb-page"></div></div>
        <div class="card-meta"><div class="card-title"></div><div class="card-date"></div></div>
        <button class="icon-btn sm card-more" aria-label="Document options" title="Options">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg></button>`;
      $('.thumb-page', a).textContent = d.snippet || '';
      $('.card-title', a).textContent = d.title;
      $('.card-date', a).textContent = 'Edited ' + fmtDate(d.updated);
      $('.card-more', a).addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openPop(e.currentTarget, menuHtml([
          { label: 'Open', act: 'open', arg: d.id },
          { label: 'Rename', act: 'rename', arg: d.id },
          { label: 'Make a copy', act: 'copy', arg: d.id },
          '-',
          { label: 'Delete', act: 'del', arg: d.id, danger: true },
        ]));
      });
      return a;
    }));
    els.empty.hidden = docs.length > 0;
    els.empty.textContent = all.length ? 'No documents match your search.' : 'No documents yet. Create one to get started.';
  }

  /* ───────────── Editor: open / save ───────────── */
  let currentId = null;
  let saveTimer = null;
  let dirty = false;

  function openDoc(id) {
    const meta = store.meta(id);
    if (!meta) return false;
    currentId = id;
    editor.innerHTML = store.read(id);
    els.title.value = meta.title;
    document.title = meta.title + ' – OnWord';
    els.saveState.textContent = '';
    els.home.hidden = true;
    els.editorView.hidden = false;
    els.scroller.scrollTop = 0;
    closeFind();
    hideImgBar();
    updateCounts();
    editor.focus();
    return true;
  }

  function showHome() {
    currentId = null;
    document.title = 'OnWord';
    els.editorView.hidden = true;
    els.home.hidden = false;
    renderHome();
  }

  function saveNow() {
    clearTimeout(saveTimer);
    if (!currentId || !dirty) return;
    const ok = store.write(currentId, editor.innerHTML, {
      title: els.title.value.trim() || 'Untitled document',
      snippet: editor.innerText.trim().slice(0, 500),
    });
    dirty = !ok;
    els.saveState.textContent = ok ? 'Saved' : 'Not saved';
  }

  /** Chrome nests lists (and other blocks) inside <p>, which is invalid and re-parses differently on reload. */
  function tidy() {
    const bad = $$('p > ul, p > ol, p > table, p > blockquote, p > pre, p > hr, p > p', editor);
    if (!bad.length) return;
    const s = getSelection();
    const pos = s.rangeCount ? [s.anchorNode, s.anchorOffset, s.focusNode, s.focusOffset] : null;
    for (const el of bad) {
      const p = el.parentElement;
      if (p?.tagName === 'P') p.replaceWith(...p.childNodes);
    }
    if (pos && editor.contains(pos[0]) && editor.contains(pos[2])) {
      try { s.setBaseAndExtent(...pos); } catch { /* selection no longer valid */ }
    }
  }

  /** Call after any change to the document or its title. */
  function changed() {
    tidy();
    dirty = true;
    els.saveState.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 500);
    updateCounts();
  }

  function updateCounts() {
    const text = editor.innerText;
    const words = (text.match(/\S+/g) || []).length;
    const chars = text.replace(/\n/g, '').length;
    els.counts.textContent = `${words.toLocaleString()} word${words === 1 ? '' : 's'} · ${chars.toLocaleString()} character${chars === 1 ? '' : 's'}`;
  }

  function route() {
    saveNow();
    closePop();
    const m = location.hash.match(/^#\/d\/([\w-]+)$/);
    if (m && openDoc(m[1])) return;
    if (m) history.replaceState(null, '', '#/');
    showHome();
  }

  /* ───────────── Selection + commands ───────────── */
  let savedRange = null;
  let pendingSize = null; // font size chosen with a collapsed caret, applied as the user types

  const selInEditor = () => {
    const s = getSelection();
    return s.rangeCount && editor.contains(s.anchorNode) ? s : null;
  };
  function restoreSel() {
    if (selInEditor()) return;
    editor.focus({ preventScroll: true });
    if (savedRange) {
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(savedRange);
    }
  }
  function exec(cmd, val = null) {
    restoreSel();
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(cmd, false, val);
    changed();
    updateToolbar();
  }
  const anchorEl = () => {
    const s = selInEditor();
    if (!s) return null;
    const n = s.anchorNode;
    return n.nodeType === 1 ? n : n.parentElement;
  };
  const closestIn = (sel) => {
    const el = anchorEl()?.closest(sel);
    return el && editor.contains(el) && el !== editor ? el : null;
  };

  function fixFontSizes(pt) {
    // execCommand can only produce the legacy 1–7 sizes; we apply size 7 as a marker and rewrite it.
    for (const el of $$('font[size="7"], span[style*="xxx-large"]', editor)) {
      let span = el;
      if (el.tagName === 'FONT') {
        span = document.createElement('span');
        span.append(...el.childNodes);
        el.replaceWith(span);
      }
      span.style.fontSize = pt + 'pt';
      $$('[style*="font-size"]', span).forEach((c) => (c.style.fontSize = ''));
    }
  }
  function setFontSize(pt) {
    restoreSel();
    const collapsed = getSelection().isCollapsed;
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('fontSize', false, '7');
    if (collapsed) pendingSize = pt;
    else { fixFontSizes(pt); changed(); }
  }

  function selectedBlocks() {
    const s = selInEditor();
    if (!s) return [];
    const range = s.getRangeAt(0);
    const blocks = $$('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,div', editor).filter((b) => range.intersectsNode(b));
    // keep only the innermost blocks
    return blocks.filter((b) => !blocks.some((o) => o !== b && b.contains(o)));
  }
  function setLineSpacing(v) {
    restoreSel();
    selectedBlocks().forEach((b) => (b.style.lineHeight = v));
    changed();
  }

  /* ───────────── Toolbar ───────────── */
  const ICON = {
    undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
    redo: 'm15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
    print: 'M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z',
    left: 'M3 6h18M3 12h12M3 18h16', center: 'M3 6h18M6 12h12M4 18h16',
    right: 'M3 6h18M9 12h12M5 18h16', justify: 'M3 6h18M3 12h18M3 18h18',
    ul: 'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01',
    ol: 'M10 6h11M10 12h11M10 18h11M3.5 5l1.5-1v5M3.5 15a1.3 1.3 0 1 1 2.3.9L3.5 19H6',
    outdent: 'M21 6H3M21 12H11M21 18H3M7 9l-3 3 3 3', indent: 'M21 6H3M21 12H11M21 18H3M4 9l3 3-3 3',
    link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
    image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01',
    table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14M15 5v14',
    clear: 'M4 7V5h13v2M10.5 5 8 19M5 19h6M15 14l5 5M20 14l-5 5',
    search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM21 21l-4.5-4.5',
  };
  const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[name]}"/></svg>`;
  const FONTS = ['Arial', 'Georgia', 'Times New Roman', 'Garamond', 'Verdana', 'Trebuchet MS', 'Tahoma', 'Courier New', 'Comic Sans MS'];
  const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72];
  const BLOCKS = [['p', 'Normal text'], ['h1', 'Title'], ['h2', 'Heading 1'], ['h3', 'Heading 2'], ['h4', 'Heading 3'], ['blockquote', 'Quote'], ['pre', 'Code block']];
  const COLORS = ['#000000', '#434343', '#666666', '#999999', '#cccccc', '#efefef', '#f3f3f3', '#ffffff',
    '#c0352b', '#e67e22', '#f1c40f', '#27ae60', '#16a085', '#2980b9', '#4338ca', '#8e44ad',
    '#f4c7c3', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#cfe2f3', '#d9d2e9', '#ead1dc'];

  function buildToolbar() {
    const cmd = (c, icon, tip, key) => `<button class="tb" data-cmd="${c}" title="${tip}${key ? ` (${MOD}${key})` : ''}" aria-label="${tip}">${icon}</button>`;
    const act = (a, icon, tip, key) => `<button class="tb" data-act="${a}" title="${tip}${key ? ` (${MOD}${key})` : ''}" aria-label="${tip}">${icon}</button>`;
    const glyph = (t, style = '') => `<span class="glyph" style="${style}">${t}</span>`;
    const sep = '<span class="tb-sep"></span>';
    const opts = (list) => list.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    els.toolbar.innerHTML = [
      cmd('undo', svg('undo'), 'Undo', 'Z'), cmd('redo', svg('redo'), 'Redo', 'Y'), act('print', svg('print'), 'Print', 'P'),
      act('find', svg('search'), 'Find and replace', 'F'), sep,
      `<select id="selBlock" title="Paragraph style" aria-label="Paragraph style">${opts(BLOCKS)}</select>`, sep,
      `<select id="selFont" title="Font" aria-label="Font"><option value="" hidden></option>${opts(FONTS.map((f) => [f, f]))}</select>`, sep,
      `<select id="selSize" title="Font size" aria-label="Font size"><option value="" hidden></option>${opts(SIZES.map((s) => [s, s]))}</select>`, sep,
      cmd('bold', glyph('B', 'font-weight:700'), 'Bold', 'B'), cmd('italic', glyph('I', 'font-style:italic'), 'Italic', 'I'),
      cmd('underline', glyph('U', 'text-decoration:underline'), 'Underline', 'U'),
      cmd('strikeThrough', glyph('S', 'text-decoration:line-through'), 'Strikethrough'),
      `<button class="tb color" data-colors="foreColor" title="Text colour" aria-label="Text colour">${glyph('A')}<span class="swatch-bar" style="background:#c0352b"></span></button>`,
      `<button class="tb color" data-colors="hiliteColor" title="Highlight colour" aria-label="Highlight colour">${glyph('H')}<span class="swatch-bar" style="background:#f1c40f"></span></button>`, sep,
      act('link', svg('link'), 'Insert link', 'K'), act('image', svg('image'), 'Insert image'), act('table', svg('table'), 'Insert table'), sep,
      cmd('justifyLeft', svg('left'), 'Align left'), cmd('justifyCenter', svg('center'), 'Align centre'),
      cmd('justifyRight', svg('right'), 'Align right'), cmd('justifyFull', svg('justify'), 'Justify'), sep,
      `<select id="selSpacing" title="Line spacing" aria-label="Line spacing"><option value="" hidden>Spacing</option>${opts([['1', 'Single'], ['1.15', '1.15'], ['1.5', '1.5'], ['2', 'Double']])}</select>`,
      cmd('insertUnorderedList', svg('ul'), 'Bulleted list'), cmd('insertOrderedList', svg('ol'), 'Numbered list'),
      cmd('outdent', svg('outdent'), 'Decrease indent'), cmd('indent', svg('indent'), 'Increase indent'), sep,
      cmd('removeFormat', svg('clear'), 'Clear formatting'),
    ].join('');

    $('#selBlock').addEventListener('change', (e) => setBlock(e.target.value));
    $('#selFont').addEventListener('change', (e) => exec('fontName', e.target.value));
    $('#selSize').addEventListener('change', (e) => setFontSize(e.target.value));
    $('#selSpacing').addEventListener('change', (e) => { setLineSpacing(e.target.value); e.target.value = ''; });
  }

  function setBlock(tag) {
    restoreSel();
    // Leaving a quote: Chrome nests the new block inside the blockquote unless we unwrap it first.
    const bq = closestIn('blockquote');
    if (bq && tag !== 'blockquote') document.execCommand('outdent');
    exec('formatBlock', `<${tag}>`);
  }

  const STATEFUL = ['bold', 'italic', 'underline', 'strikeThrough', 'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull', 'insertUnorderedList', 'insertOrderedList'];
  function updateToolbar() {
    const el = anchorEl();
    if (!el) return;
    for (const c of STATEFUL) {
      let on = false;
      try { on = document.queryCommandState(c); } catch { /* unsupported */ }
      $(`[data-cmd="${c}"]`, els.toolbar)?.classList.toggle('on', on);
    }
    const block = el.closest('h1,h2,h3,h4,blockquote,pre,p');
    $('#selBlock').value = block && editor.contains(block) ? block.tagName.toLowerCase() : 'p';
    const cs = getComputedStyle(el);
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
    $('#selFont').value = FONTS.find((f) => f.toLowerCase() === fam) || '';
    const pt = Math.round(parseFloat(cs.fontSize) * 0.75);
    $('#selSize').value = SIZES.includes(pt) ? String(pt) : '';
  }

  /* ───────────── Menus ───────────── */
  const MENUS = {
    File: [
      { label: 'New document', act: 'new' }, { label: 'Make a copy', act: 'copy' }, { label: 'Import file…', act: 'import' }, '-',
      { label: 'Download as web page (.html)', act: 'dlHtml' }, { label: 'Download as Word (.doc)', act: 'dlDoc' },
      { label: 'Download as plain text (.txt)', act: 'dlTxt' }, '-',
      { label: 'Print / save as PDF', act: 'print', key: MOD + 'P' }, '-',
      { label: 'Delete document', act: 'del', danger: true },
    ],
    Edit: [
      { label: 'Undo', act: 'cmd', arg: 'undo', key: MOD + 'Z' }, { label: 'Redo', act: 'cmd', arg: 'redo', key: MOD + 'Y' }, '-',
      { label: 'Select all', act: 'cmd', arg: 'selectAll', key: MOD + 'A' },
      { label: 'Find and replace', act: 'find', key: MOD + 'F' },
    ],
    Insert: [
      { label: 'Image…', act: 'image' }, { label: 'Table…', act: 'table' }, { label: 'Link…', act: 'link', key: MOD + 'K' }, '-',
      { label: 'Horizontal line', act: 'cmd', arg: 'insertHorizontalRule' }, { label: 'Page break', act: 'pageBreak' },
      { label: 'Today’s date', act: 'date' },
    ],
    Format: [
      { label: 'Bold', act: 'cmd', arg: 'bold', key: MOD + 'B' }, { label: 'Italic', act: 'cmd', arg: 'italic', key: MOD + 'I' },
      { label: 'Underline', act: 'cmd', arg: 'underline', key: MOD + 'U' }, { label: 'Strikethrough', act: 'cmd', arg: 'strikeThrough', key: MOD + 'Shift+X' },
      { label: 'Superscript', act: 'cmd', arg: 'superscript' }, { label: 'Subscript', act: 'cmd', arg: 'subscript' }, '-',
      { label: 'Clear formatting', act: 'cmd', arg: 'removeFormat', key: MOD + '\\' },
    ],
    Table: [
      { label: 'Insert table…', act: 'table' }, '-',
      { label: 'Insert row above', act: 'tbl', arg: 'rowAbove' }, { label: 'Insert row below', act: 'tbl', arg: 'rowBelow' },
      { label: 'Insert column left', act: 'tbl', arg: 'colLeft' }, { label: 'Insert column right', act: 'tbl', arg: 'colRight' }, '-',
      { label: 'Delete row', act: 'tbl', arg: 'delRow' }, { label: 'Delete column', act: 'tbl', arg: 'delCol' },
      { label: 'Delete table', act: 'tbl', arg: 'delTable', danger: true },
    ],
    View: [
      { label: 'Zoom 75%', act: 'zoom', arg: '0.75' }, { label: 'Zoom 100%', act: 'zoom', arg: '1' },
      { label: 'Zoom 125%', act: 'zoom', arg: '1.25' }, { label: 'Zoom 150%', act: 'zoom', arg: '1.5' }, '-',
      { label: 'Toggle dark mode', act: 'theme' },
    ],
  };
  function buildMenus() {
    els.menubar.innerHTML = Object.keys(MENUS).map((n) => `<button data-menu="${n}">${n}</button>`).join('');
    const open = (b) => openPop(b, menuHtml(MENUS[b.dataset.menu]));
    els.menubar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-menu]');
      if (b) popOwner === b ? closePop() : open(b);
    });
    els.menubar.addEventListener('mouseover', (e) => {
      const b = e.target.closest('[data-menu]');
      if (b && popOwner && popOwner !== b && popOwner.dataset.menu) open(b);
    });
  }

  /* ───────────── Tables ───────────── */
  const newCell = () => { const td = document.createElement('td'); td.innerHTML = '<br>'; return td; };
  function caretInto(node) {
    const r = document.createRange();
    r.selectNodeContents(node);
    r.collapse(true);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }
  function tableOp(op) {
    restoreSel();
    const cell = closestIn('td,th');
    if (!cell) return toast('Place the cursor inside a table first.');
    const row = cell.parentElement, table = cell.closest('table'), col = cell.cellIndex;
    const rows = [...table.rows];
    if (op === 'rowAbove' || op === 'rowBelow') {
      const tr = document.createElement('tr');
      for (let i = 0; i < row.cells.length; i++) tr.append(newCell());
      row[op === 'rowAbove' ? 'before' : 'after'](tr);
    } else if (op === 'colLeft' || op === 'colRight') {
      rows.forEach((r) => {
        const ref = r.cells[Math.min(col, r.cells.length - 1)];
        ref?.[op === 'colLeft' ? 'before' : 'after'](newCell());
      });
    } else if (op === 'delRow') {
      if (rows.length === 1) table.remove(); else { caretInto((row.nextElementSibling || row.previousElementSibling).cells[0]); row.remove(); }
    } else if (op === 'delCol') {
      if (row.cells.length === 1) table.remove(); else { caretInto(cell.nextElementSibling || cell.previousElementSibling); rows.forEach((r) => r.cells[col]?.remove()); }
    } else if (op === 'delTable') table.remove();
    changed();
  }
  /**
   * Insert a block-level node at the caret. Done through the DOM because execCommand('insertHTML')
   * mangles tables that land inside a paragraph.
   */
  function insertBlock(node, focus = (n) => n) {
    restoreSel();
    const s = selInEditor();
    if (!s) return;
    const r = s.getRangeAt(0);
    r.deleteContents();
    const isContainer = (el) => el === editor || /^(TD|TH|LI|BLOCKQUOTE)$/.test(el.tagName);
    let block = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    if (isContainer(block)) r.insertNode(node);
    else {
      while (!isContainer(block.parentElement)) block = block.parentElement;
      block.after(node);
      if (block.tagName === 'P' && !block.textContent && !block.querySelector('img')) block.remove();
    }
    if (!node.nextElementSibling) node.after(Object.assign(document.createElement('p'), { innerHTML: '<br>' }));
    caretInto(focus(node));
    changed();
  }
  function insertTable(rows, cols) {
    const table = document.createElement('table');
    table.style.width = '100%';
    table.innerHTML = '<tbody>' + ('<tr>' + '<td><br></td>'.repeat(cols) + '</tr>').repeat(rows) + '</tbody>';
    insertBlock(table, (t) => t.rows[0].cells[0]);
  }

  /* ───────────── Links ───────────── */
  let linkTarget = null;
  function openLinkDialog() {
    restoreSel();
    const s = selInEditor();
    if (!s) return;
    savedRange = s.getRangeAt(0).cloneRange();
    linkTarget = closestIn('a');
    els.linkText.value = linkTarget ? linkTarget.textContent : savedRange.toString();
    els.linkUrl.value = linkTarget ? linkTarget.getAttribute('href') : '';
    els.linkRemove.hidden = !linkTarget;
    els.linkDlg.returnValue = '';
    els.linkDlg.showModal();
    els.linkUrl.focus();
  }
  function normalizeUrl(u) {
    u = u.trim();
    if (!u) return null;
    if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(u)) return 'mailto:' + u;
    if (!/^(https?:|mailto:|tel:|#)/i.test(u)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(u) && !/^[\w.-]+:\d/.test(u)) return null; // unsupported scheme (javascript:, data:…)
      u = 'https://' + u;
    }
    return u;
  }
  els.linkDlg.addEventListener('close', () => {
    const v = els.linkDlg.returnValue;
    if (v === 'remove' && linkTarget) {
      linkTarget.replaceWith(...linkTarget.childNodes);
      changed();
    } else if (v === 'ok') {
      const url = normalizeUrl(els.linkUrl.value);
      if (!url) return toast('That link address isn’t supported.');
      const text = els.linkText.value || url;
      if (linkTarget) {
        linkTarget.setAttribute('href', url);
        if (linkTarget.textContent !== text) linkTarget.textContent = text;
        changed();
      } else if (!savedRange.collapsed && text === savedRange.toString()) {
        exec('createLink', url);
      } else {
        exec('insertHTML', `<a href="${esc(url)}">${esc(text)}</a>`);
      }
    }
    editor.focus();
  });

  els.tableDlg.addEventListener('close', () => {
    if (els.tableDlg.returnValue === 'ok') {
      insertTable(Math.min(50, Math.max(1, +els.tblRows.value || 1)), Math.min(12, Math.max(1, +els.tblCols.value || 1)));
    }
    editor.focus();
  });

  /* ───────────── Images ───────────── */
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(fr.error);
      fr.onload = () => {
        if (file.size < 350_000) return resolve(fr.result);
        // Large images are scaled down so documents stay within the browser's storage quota.
        const img = new Image();
        img.onerror = () => reject(new Error('Could not read image'));
        img.onload = () => {
          const scale = Math.min(1, 1400 / img.naturalWidth);
          const c = document.createElement('canvas');
          c.width = Math.round(img.naturalWidth * scale);
          c.height = Math.round(img.naturalHeight * scale);
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.85));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  async function insertImages(files) {
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      try {
        exec('insertHTML', `<img src="${await fileToDataUrl(f)}" alt="${esc(f.name || 'image')}">`);
      } catch {
        toast('That image could not be added.');
      }
    }
  }
  els.imgInput.addEventListener('change', () => { insertImages([...els.imgInput.files]); els.imgInput.value = ''; });

  let activeImg = null;
  function showImgBar(img) {
    activeImg = img;
    const r = document.createRange();
    r.selectNode(img);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
    placeImgBar();
  }
  function placeImgBar() {
    if (!activeImg?.isConnected) return hideImgBar();
    const b = activeImg.getBoundingClientRect(), box = els.scroller.getBoundingClientRect();
    if (b.bottom < box.top || b.top > box.bottom) return (els.imgBar.hidden = true);
    els.imgBar.hidden = false;
    els.imgBar.style.left = Math.max(6, Math.min(b.left, innerWidth - els.imgBar.offsetWidth - 6)) + 'px';
    els.imgBar.style.top = Math.max(box.top + 4, b.top - els.imgBar.offsetHeight - 6) + 'px';
  }
  function hideImgBar() { activeImg = null; els.imgBar.hidden = true; }
  els.imgBar.addEventListener('mousedown', (e) => e.preventDefault());
  els.imgBar.addEventListener('click', (e) => {
    const v = e.target.dataset.img;
    if (!v || !activeImg) return;
    if (v === 'remove') { activeImg.remove(); hideImgBar(); } else {
      activeImg.style.width = v + '%';
      activeImg.removeAttribute('height');
      activeImg.style.height = 'auto';
      showImgBar(activeImg);
    }
    changed();
  });

  /* ───────────── Find & replace ───────────── */
  const find = { ranges: [], i: -1 };
  const canHighlight = typeof Highlight !== 'undefined' && !!CSS.highlights;

  function openFind() {
    els.findPanel.hidden = false;
    const s = selInEditor();
    const picked = s && !s.isCollapsed ? s.toString() : '';
    if (picked && !picked.includes('\n')) els.findInput.value = picked;
    els.findInput.focus();
    els.findInput.select();
    runFind();
  }
  function closeFind() {
    els.findPanel.hidden = true;
    find.ranges = [];
    find.i = -1;
    if (canHighlight) { CSS.highlights.delete('ow-find'); CSS.highlights.delete('ow-find-cur'); }
  }
  function runFind(keep) {
    const q = els.findInput.value;
    find.ranges = [];
    if (q) {
      const cs = els.findCase.checked, needle = cs ? q : q.toLowerCase();
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      for (let n; (n = walker.nextNode());) {
        const hay = cs ? n.data : n.data.toLowerCase();
        for (let p = hay.indexOf(needle); p !== -1; p = hay.indexOf(needle, p + needle.length)) {
          const r = document.createRange();
          r.setStart(n, p);
          r.setEnd(n, p + q.length);
          find.ranges.push(r);
        }
      }
    }
    find.i = find.ranges.length ? Math.min(keep ? Math.max(find.i, 0) : 0, find.ranges.length - 1) : -1;
    paintFind(!keep);
  }
  function paintFind(scroll = true) {
    const cur = find.ranges[find.i];
    els.findCount.textContent = `${find.i + 1} of ${find.ranges.length}`;
    if (canHighlight) {
      CSS.highlights.set('ow-find', new Highlight(...find.ranges));
      cur ? CSS.highlights.set('ow-find-cur', new Highlight(cur)) : CSS.highlights.delete('ow-find-cur');
    }
    if (cur && scroll) {
      const r = cur.getBoundingClientRect(), box = els.scroller.getBoundingClientRect();
      if (r.top < box.top + 20 || r.bottom > box.bottom - 20) els.scroller.scrollTop += r.top - box.top - box.height / 3;
    }
  }
  function stepFind(d) {
    if (!find.ranges.length) return;
    find.i = (find.i + d + find.ranges.length) % find.ranges.length;
    paintFind();
  }
  function replaceRange(r, text) {
    r.deleteContents();
    if (text) r.insertNode(document.createTextNode(text));
  }
  function replaceOne() {
    const cur = find.ranges[find.i];
    if (!cur) return;
    replaceRange(cur, els.replaceInput.value);
    editor.normalize();
    changed();
    runFind(true);
  }
  function replaceAll() {
    const n = find.ranges.length;
    if (!n) return;
    for (let i = n - 1; i >= 0; i--) replaceRange(find.ranges[i], els.replaceInput.value);
    editor.normalize();
    changed();
    runFind();
    toast(`Replaced ${n} occurrence${n === 1 ? '' : 's'}.`);
  }
  els.findInput.addEventListener('input', () => runFind());
  els.findCase.addEventListener('change', () => runFind());
  els.findPanel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeFind(); editor.focus(); }
    if (e.key === 'Enter') { e.preventDefault(); e.target === els.replaceInput ? replaceOne() : stepFind(e.shiftKey ? -1 : 1); }
  });

  /* ───────────── Export / import ───────────── */
  const EXPORT_CSS = `body{font:11pt/1.5 Arial,Helvetica,sans-serif;max-width:6.5in;margin:1in auto;padding:0 16px;color:#000;overflow-wrap:break-word}
p{margin:0 0 8pt}h1{font-size:24pt;font-weight:400;margin:18pt 0 8pt;line-height:1.2}h2{font-size:18pt;font-weight:400;margin:16pt 0 6pt}
h3{font-size:14pt;margin:14pt 0 4pt;color:#333}h4{font-size:12pt;margin:12pt 0 4pt;color:#555}
blockquote{margin:0 0 8pt;padding:2pt 0 2pt 14pt;border-left:3px solid #c5c8d4;color:#444}
pre{background:#f3f4f7;padding:10pt 12pt;font:10pt/1.45 "Courier New",monospace;white-space:pre-wrap}
img{max-width:100%;height:auto}table{border-collapse:collapse;margin:0 0 8pt}td,th{border:1px solid #9a9eac;padding:4pt 6pt;vertical-align:top}
hr{border:0;border-top:1px solid #b9bcc8;margin:14pt 0}hr.page-break{border:0;page-break-after:always}`;
  const docTitle = () => els.title.value.trim() || 'Untitled document';
  const fileBase = () => docTitle().replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'document';
  const fullHtml = (extraHead = '', htmlAttrs = '') =>
    `<!doctype html><html lang="en"${htmlAttrs}><head><meta charset="utf-8"><title>${esc(docTitle())}</title>${extraHead}<style>${EXPORT_CSS}</style></head><body>${editor.innerHTML}</body></html>`;

  els.importInput.addEventListener('change', async () => {
    const file = els.importInput.files[0];
    els.importInput.value = '';
    if (!file) return;
    const raw = await file.text();
    const isHtml = /\.html?$/i.test(file.name) || file.type === 'text/html';
    const html = isHtml ? sanitize(raw) || EMPTY_DOC : textToHtml(raw);
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const meta = store.create(file.name.replace(/\.[^.]+$/, '') || 'Imported document', html, tmp.textContent.trim().slice(0, 500));
    if (meta) location.hash = '#/d/' + meta.id;
  });

  /* ───────────── Actions ───────────── */
  const actions = {
    new() { const m = store.create(); if (m) location.hash = '#/d/' + m.id; },
    open(id) { location.hash = '#/d/' + id; },
    import() { els.importInput.click(); },
    copy(id) {
      saveNow();
      const src = store.meta(id || currentId);
      if (!src) return;
      const m = store.create('Copy of ' + src.title, store.read(src.id), src.snippet);
      if (!m) return;
      if (id) { renderHome(); toast('Copy created.'); } else location.hash = '#/d/' + m.id;
    },
    rename(id) {
      const m = store.meta(id);
      const t = m && prompt('Rename document', m.title);
      if (t?.trim()) { store.write(id, null, { title: t.trim().slice(0, 120) }); renderHome(); }
    },
    del(id) {
      const target = store.meta(id || currentId);
      if (!target || !confirm(`Delete “${target.title}”? This can’t be undone.`)) return;
      if (!id) { dirty = false; clearTimeout(saveTimer); currentId = null; }
      store.remove(target.id);
      id ? renderHome() : (location.hash = '#/');
    },
    dlHtml() { download(fileBase() + '.html', fullHtml(), 'text/html'); },
    dlDoc() {
      download(fileBase() + '.doc', '﻿' + fullHtml('<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->',
        ' xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"'), 'application/msword');
    },
    dlTxt() { download(fileBase() + '.txt', editor.innerText, 'text/plain'); },
    print() { saveNow(); closePop(); window.print(); },
    cmd(c) { exec(c); },
    find() { openFind(); },
    findNext() { stepFind(1); }, findPrev() { stepFind(-1); },
    findClose() { closeFind(); editor.focus(); },
    replaceOne, replaceAll,
    image() { restoreSel(); els.imgInput.click(); },
    table() { restoreSel(); els.tableDlg.returnValue = ''; els.tableDlg.showModal(); },
    link() { openLinkDialog(); },
    pageBreak() { insertBlock(Object.assign(document.createElement('hr'), { className: 'page-break' }), (hr) => hr.nextElementSibling); },
    date() { exec('insertText', new Date().toLocaleDateString([], { dateStyle: 'long' })); },
    tbl(op) { tableOp(op); },
    zoom(z) { els.paper.style.zoom = z; },
    theme() { setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); },
    color(value) {
      const c = els.pop.dataset.colorCmd;
      exec(c, value);
      $(`[data-colors="${c}"] .swatch-bar`, els.toolbar).style.background = value === 'transparent' ? 'none' : value;
    },
  };

  /* ───────────── Global event wiring ───────────── */
  // Keep the document selection when clicking chrome (buttons, menus), but let form fields focus.
  document.addEventListener('mousedown', (e) => {
    const inChrome = e.target.closest('.toolbar, .menubar, .pop');
    if (inChrome && !e.target.closest('select, input')) e.preventDefault();
    if (!e.target.closest('.pop') && !(popOwner && popOwner.contains(e.target))) closePop();
  });

  document.addEventListener('click', (e) => {
    const colorBtn = e.target.closest('[data-colors]');
    if (colorBtn) {
      if (popOwner === colorBtn) return closePop();
      const c = colorBtn.dataset.colors;
      openPop(colorBtn, `<div class="swatches">${COLORS.map((col) => `<button data-act="color" data-arg="${col}" style="background:${col}" title="${col}" aria-label="${col}"></button>`).join('')}</div>
        <button class="item" data-act="color" data-arg="${c === 'foreColor' ? '#000000' : 'transparent'}"><span>${c === 'foreColor' ? 'Default colour' : 'No highlight'}</span></button>`, 'colors');
      els.pop.dataset.colorCmd = c;
      return;
    }
    const cmdBtn = e.target.closest('[data-cmd]');
    if (cmdBtn) return exec(cmdBtn.dataset.cmd);
    const actBtn = e.target.closest('[data-act]');
    if (actBtn) {
      const fromPop = els.pop.contains(actBtn);
      const { act, arg } = actBtn.dataset;
      if (fromPop) closePop();
      actions[act]?.(arg);
    }
  });

  document.addEventListener('selectionchange', () => {
    const s = selInEditor();
    if (!s) return;
    savedRange = s.getRangeAt(0).cloneRange();
    updateToolbar();
  });

  editor.addEventListener('input', () => {
    if (pendingSize) { fixFontSizes(pendingSize); }
    if (!editor.firstChild) editor.innerHTML = EMPTY_DOC; // keep at least one paragraph to type into
    changed();
    if (!els.findPanel.hidden) runFind(true);
  });
  editor.addEventListener('mousedown', () => { pendingSize = null; });

  editor.addEventListener('click', (e) => {
    if (e.target.tagName === 'IMG') return showImgBar(e.target);
    hideImgBar();
    const a = e.target.closest('a[href]');
    if (a && (e.ctrlKey || e.metaKey)) window.open(a.href, '_blank', 'noopener');
  });
  els.scroller.addEventListener('scroll', () => { if (activeImg) placeImgBar(); });

  editor.addEventListener('paste', (e) => {
    const cd = e.clipboardData;
    if (!cd) return;
    const images = [...cd.files].filter((f) => f.type.startsWith('image/'));
    const html = cd.getData('text/html');
    if (html) {
      e.preventDefault();
      exec('insertHTML', sanitize(html));
    } else if (images.length) {
      e.preventDefault();
      insertImages(images);
    }
  });
  editor.addEventListener('drop', (e) => {
    const images = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (!images.length) return;
    e.preventDefault();
    const r = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (r) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    insertImages(images);
  });

  editor.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    const cell = closestIn('td,th');
    if (cell) {
      const table = cell.closest('table');
      let cells = $$('td,th', table);
      let i = cells.indexOf(cell) + (e.shiftKey ? -1 : 1);
      if (i >= cells.length) { tableOp('rowBelow'); cells = $$('td,th', table); }
      if (i >= 0) caretInto(cells[i]);
    } else if (closestIn('li')) exec(e.shiftKey ? 'outdent' : 'indent');
    else if (!e.shiftKey) exec('insertText', '    ');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closePop(); hideImgBar(); return; }
    if (!currentId || !(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    const run = (fn) => { e.preventDefault(); fn(); };
    if (e.altKey) {
      const tag = { 0: 'p', 1: 'h2', 2: 'h3', 3: 'h4' }[e.code.replace('Digit', '')];
      if (tag) run(() => setBlock(tag));
    } else if (e.shiftKey) {
      const c = { x: 'strikeThrough', l: 'justifyLeft', e: 'justifyCenter', r: 'justifyRight', j: 'justifyFull' }[k]
        || { Digit7: 'insertOrderedList', Digit8: 'insertUnorderedList' }[e.code];
      if (c) run(() => exec(c));
    } else if (k === 's') run(() => { dirty = true; saveNow(); toast('Saved.', 1200); });
    else if (k === 'k') run(openLinkDialog);
    else if (k === 'f' || k === 'h') run(openFind);
    else if (k === '\\') run(() => exec('removeFormat'));
  });

  els.title.addEventListener('input', () => { document.title = docTitle() + ' – OnWord'; changed(); });
  els.title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); editor.focus(); } });
  els.title.addEventListener('blur', () => { if (!els.title.value.trim()) els.title.value = 'Untitled document'; });

  els.search.addEventListener('input', renderHome);
  addEventListener('hashchange', route);
  addEventListener('beforeunload', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  addEventListener('resize', () => { closePop(); hideImgBar(); });
  // Another tab changed the document list.
  addEventListener('storage', (e) => { if (e.key === KEY.index && !currentId) renderHome(); });

  /* ───────────── Boot ───────────── */
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* not supported */ }
  buildToolbar();
  buildMenus();
  route();
})();
