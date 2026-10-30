import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { fixture, variant } from './fixtures.mjs';
import { parseNativeSave, extractSetupValues } from '../ui/save-reader.js';

test('save extraction runs without Node, Buffer, TextDecoder, crypto or filesystem access', async () => {
  const { bytes } = fixture({ custom: [[207, variant(3, '纪念物 🌏')], [208, variant(2, '汉字 🌏')]] });
  const source = (await readFile(new URL('../ui/save-reader.js', import.meta.url), 'utf8')).replace(/^export /gm, '');
  const context = vm.createContext({ input: Array.from(bytes) });
  const result = JSON.parse(vm.runInContext(source + `
    if (typeof Buffer !== 'undefined' || typeof TextDecoder !== 'undefined' || typeof process !== 'undefined') throw Error('Nonportable test environment');
    const parsed = parseNativeSave(Uint8Array.from(input));
    JSON.stringify({ setup: extractSetupValues(parsed), types: parsed.initial.entries[KEYS.game].value[102].type });
  `, context));
  assert.equal(result.setup.game['102'], '-9223372036854775800');
  assert.equal(result.types, 11);
  assert.equal(result.setup.game['207'], '纪念物 🌏');
  assert.equal(result.setup.game['208'], '汉字 🌏');
  assert.equal(result.setup.players[0].values['105'], 'RANDOM');
  assert.equal(result.setup.seeds.map, 3768267051);
});

test('strict decoding rejects malformed UTF-8 and UTF-16 instead of changing names silently', () => {
  const badUtf8 = variant(2, 'ABC');
  badUtf8[16] = 0xc0; badUtf8[17] = 0x80;
  const badUtf16 = variant(3, 'ab');
  badUtf16.writeUInt16LE(0xd800, 16);
  for (const data of [badUtf8, badUtf16]) {
    assert.throws(() => parseNativeSave(fixture({ custom: [[207, data]] }).bytes), /Invalid string encoding/);
  }
});

test('portable reader handles offset views and ArrayBuffers while leaving source bytes untouched', () => {
  const { bytes } = fixture();
  const padded = new Uint8Array(bytes.length + 20); padded.set(bytes, 10);
  const view = padded.subarray(10, -10);
  const before = padded.slice();
  const parsed = parseNativeSave(view);
  assert.deepEqual(padded, before);
  assert.deepEqual(extractSetupValues(parsed), extractSetupValues(parseNativeSave(view.slice().buffer)));
  parsed.bytes[0] = 0;
  assert.deepEqual(padded, before);
});
