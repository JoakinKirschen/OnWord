#!/usr/bin/env node
/**
 * Collects the files a web host needs into dist/onword-site.zip, ready to upload and extract in the
 * site's public folder. Nothing is transformed: the app has no build step.
 * Run: npm run package
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeZip } from '../src/core/zip.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'dist', 'onword-site.zip');
/** Everything the browser loads, plus the server configuration. */
const SHIPPED = ['index.html', '.htaccess', 'styles', 'src'];

const walk = (path) =>
  statSync(path).isDirectory()
    ? readdirSync(path)
        .sort()
        .flatMap((name) => walk(join(path, name)))
    : [path];

const files = SHIPPED.flatMap((entry) => walk(join(ROOT, entry))).map((path) => ({
  name: relative(ROOT, path).split(sep).join('/'),
  data: new Uint8Array(readFileSync(path)),
}));

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, await writeZip(files));
const kilobytes = Math.round(statSync(OUTPUT).size / 1024);
console.log(`${relative(ROOT, OUTPUT)}: ${files.length} files, ${kilobytes} kB`);
