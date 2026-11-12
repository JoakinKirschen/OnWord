import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCommands } from '../../src/core/commands.js';
import { createEmitter } from '../../src/core/events.js';

test('commands run by name and return the handler result', () => {
  const commands = createCommands();
  commands.register({ 'math.double': (n) => n * 2 });
  assert.equal(commands.run('math.double', 4), 8);
});

test('registering a duplicate command throws', () => {
  const commands = createCommands();
  commands.register({ 'a.b': () => {} });
  assert.throws(() => commands.register({ 'a.b': () => {} }), /already registered/);
});

test('running an unknown command warns and returns undefined', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  assert.equal(createCommands().run('nope'), undefined);
  assert.equal(warn.mock.callCount(), 1);
});

test('emitter delivers payloads and unsubscribes', () => {
  const events = createEmitter();
  const seen = [];
  const off = events.on('ping', (value) => seen.push(value));
  events.emit('ping', 1);
  events.emit('other', 2);
  off();
  events.emit('ping', 3);
  assert.deepEqual(seen, [1]);
});
