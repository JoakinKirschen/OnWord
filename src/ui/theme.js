/**
 * Light/dark theme, remembered between visits.
 * @param {{ root: HTMLElement, prefs: import('../core/preferences.js').Preferences }} deps
 */
export function createTheme({ root, prefs }) {
  const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = prefs.get('theme', prefersDark ? 'dark' : 'light');
  return {
    toggle() {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      prefs.set('theme', root.dataset.theme);
    },
  };
}
