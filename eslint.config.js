import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/** Rules shared by app code and tooling. Formatting is Prettier's job, not ESLint's. */
const rules = {
  'no-var': 'error',
  'prefer-const': 'error',
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  'no-implicit-globals': 'error',
  'no-shadow': 'error',
  'no-param-reassign': 'error',
  'no-else-return': 'error',
  complexity: ['error', 15],
  'max-depth': ['error', 4],
  'max-params': ['error', 4],
};

export default [
  { ignores: ['node_modules/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.browser },
    rules: {
      ...rules,
      // Persistence goes through core/storage.js and core/preferences.js; main.js injects the real storage.
      'no-restricted-globals': ['error', 'localStorage', 'sessionStorage', 'event', 'name', 'status'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['src/main.js'],
    rules: { 'no-restricted-globals': ['error', 'sessionStorage', 'event', 'name', 'status'] },
  },
  {
    files: ['tests/**/*.mjs', 'tools/**/*.mjs', '*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules,
  },
  prettier,
];
