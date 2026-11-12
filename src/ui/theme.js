const THEME_KEY = 'onword:theme';

export function createTheme({ root, storage }) {
  const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = storage.getItem(THEME_KEY) || (prefersDark ? 'dark' : 'light');
  return {
    toggle() {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      storage.setItem(THEME_KEY, root.dataset.theme);
    },
  };
}
