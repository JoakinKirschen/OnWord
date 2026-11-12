#!/usr/bin/env node
/**
 * Enforces the rules in CLAUDE.md that can be checked mechanically. No dependencies.
 * Run: node tools/check-architecture.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const MAX_LINES = 250;

/** Layer of a file, from its path relative to src/. */
function layerOf(file) {
  if (file === 'main.js') return 'main';
  if (file.startsWith('editor/features/')) return 'feature';
  return file.split('/')[0]; // core | ui | library | editor
}

/** Which layers each layer may import from. */
const ALLOWED = {
  core: ['core'],
  ui: ['core', 'ui'],
  library: ['core', 'ui', 'library'],
  editor: ['core', 'ui', 'editor', 'feature'], // only editor.js may import features (checked below)
  feature: ['core', 'ui', 'editor'], // never another feature
  main: ['core', 'ui', 'library', 'editor'],
};

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.js') ? [path] : [];
  });

const errors = [];
for (const path of walk(SRC)) {
  const file = relative(SRC, path).split(sep).join('/');
  const source = readFileSync(path, 'utf8');
  const lines = source.split('\n');
  const layer = layerOf(file);
  const fail = (line, message) => errors.push(`src/${file}${line ? ':' + line : ''}  ${message}`);

  if (!ALLOWED[layer]) fail(0, `unknown top-level folder "${layer}" — add it to CLAUDE.md and this script`);
  if (lines.length > MAX_LINES) fail(0, `${lines.length} lines (max ${MAX_LINES}) — split the module`);

  lines.forEach((text, i) => {
    const n = i + 1;
    const imported =
      text.match(/^\s*(?:import|export)\b.*\bfrom\s+['"]([^'"]+)['"]/)?.[1] ??
      text.match(/\bimport\(\s*['"]([^'"]+)['"]/)?.[1];
    if (imported) {
      if (!imported.startsWith('.')) fail(n, `bare import "${imported}" — the app has no dependencies`);
      else {
        const target = posix.normalize(posix.join(posix.dirname(file), imported));
        const targetLayer = layerOf(target);
        if (!ALLOWED[layer]?.includes(targetLayer))
          fail(n, `${layer} must not import from ${targetLayer} ("${imported}")`);
        if (targetLayer === 'feature' && file !== 'editor/editor.js')
          fail(n, 'only editor/editor.js may import a feature');
        if (targetLayer === 'main') fail(n, 'nothing may import main.js');
      }
    }
    if (/^(let|var)\s/.test(text) && layer !== 'main')
      fail(n, 'module-level mutable state — keep state inside a create*/init* function');
    if (/\b(window|globalThis|self)\.[A-Za-z_$][\w$]*\s*=[^=]/.test(text)) fail(n, 'assignment to a global');
    if (/\bdocument\.(getElementById|querySelector(All)?)\(/.test(text))
      fail(n, 'document-wide lookup — use $(selector, root) with the root you were given');
  });
}

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} architecture violation${errors.length === 1 ? '' : 's'}. See CLAUDE.md.`);
  process.exit(1);
}
console.log('Architecture check passed.');
