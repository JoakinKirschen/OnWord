const PATHS = {
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'm15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  print: 'M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z',
  left: 'M3 6h18M3 12h12M3 18h16',
  center: 'M3 6h18M6 12h12M4 18h16',
  right: 'M3 6h18M9 12h12M5 18h16',
  justify: 'M3 6h18M3 12h18M3 18h18',
  ul: 'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01',
  ol: 'M10 6h11M10 12h11M10 18h11M3.5 5l1.5-1v5M3.5 15a1.3 1.3 0 1 1 2.3.9L3.5 19H6',
  outdent: 'M21 6H3M21 12H11M21 18H3M7 9l-3 3 3 3',
  indent: 'M21 6H3M21 12H11M21 18H3M4 9l3 3-3 3',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01',
  table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14M15 5v14',
  clear: 'M4 7V5h13v2M10.5 5 8 19M5 19h6M15 14l5 5M20 14l-5 5',
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM21 21l-4.5-4.5',
};

export const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${PATHS[name]}"/></svg>`;
