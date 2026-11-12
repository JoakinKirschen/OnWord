import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { crc32, readZip, writeZip } from '../../src/core/zip.js';

const text = (bytes) => new TextDecoder().decode(bytes);
const hasUnzip = (() => {
  try {
    execFileSync('unzip', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

test('crc32 matches the reference value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('round trip keeps names, order and bytes for compressed and stored entries', async () => {
  const image = Uint8Array.from({ length: 300 }, (_, i) => i % 251);
  const zip = await writeZip([
    { name: '[Content_Types].xml', data: '<a>' + 'x'.repeat(5000) + '</a>' },
    { name: 'word/média/image1.png', data: image },
    { name: 'empty.xml', data: '' },
  ]);
  assert.ok(zip.length < 1000, 'repetitive text is compressed');
  const entries = await readZip(zip);
  assert.deepEqual([...entries.keys()], ['[Content_Types].xml', 'word/média/image1.png', 'empty.xml']);
  assert.equal(text(entries.get('[Content_Types].xml')).length, 5007);
  assert.deepEqual(entries.get('word/média/image1.png'), image);
  assert.equal(entries.get('empty.xml').length, 0);
});

test('rejects data that is not a ZIP archive', async () => {
  await assert.rejects(readZip(new Uint8Array(100)), /Not a ZIP/);
  await assert.rejects(readZip(new Uint8Array(3)), /Not a ZIP/);
});

test('archives are accepted by the system unzip', { skip: !hasUnzip }, async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'onword-')), 'a.zip');
  writeFileSync(file, await writeZip([{ name: 'dir/hello.txt', data: 'hello zip' }]));
  assert.match(execFileSync('unzip', ['-t', file]).toString(), /No errors detected/);
  assert.equal(execFileSync('unzip', ['-p', file, 'dir/hello.txt']).toString(), 'hello zip');
  assert.equal(text((await readZip(readFileSync(file))).get('dir/hello.txt')), 'hello zip');
});
