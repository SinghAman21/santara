import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProtocolLine } from './protocol.mjs';

test('parses a show event with negative multi-monitor coordinates', () => {
  assert.deepEqual(parseProtocolLine('{"type":"show","mode":"convert","x":-1920,"y":140}'), {
    type: 'show', mode: 'convert', x: -1920, y: 140,
  });
});

test('accepts move and hide events for each declared mode', () => {
  for (const type of ['move', 'hide']) {
    for (const mode of ['convert', 'tools', 'actions']) {
      assert.deepEqual(parseProtocolLine(JSON.stringify({ type, mode, x: 1, y: 2 })), {
        type, mode, x: 1, y: 2,
      });
    }
  }
});

test('rejects malformed JSON and non-object values', () => {
  for (const line of ['{', 'null', '[]', '"event"']) {
    assert.throws(() => parseProtocolLine(line));
  }
});

test('rejects unknown event types and modes', () => {
  assert.throws(() => parseProtocolLine('{"type":"drop","mode":"convert","x":1,"y":2}'));
  assert.throws(() => parseProtocolLine('{"type":"show","mode":"unknown","x":1,"y":2}'));
});

test('rejects missing, extra, or non-integer coordinates', () => {
  for (const event of [
    { type: 'show', mode: 'convert', x: 1 },
    { type: 'show', mode: 'convert', x: 1, y: 2, path: 'secret' },
    { type: 'show', mode: 'convert', x: 1.5, y: 2 },
    { type: 'show', mode: 'convert', x: Number.MAX_SAFE_INTEGER + 1, y: 2 },
  ]) {
    assert.throws(() => parseProtocolLine(JSON.stringify(event)));
  }
});
