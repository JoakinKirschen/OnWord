import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { VERSION } from '../../src/core/version.js';

test('the version shown in the app is the one in package.json', async () => {
  const { version } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(VERSION, version);
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});
