import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { fixture, variant } from './fixtures.mjs';
import { parseNativeSave, plainProperties, KEYS } from '../ui/save-reader.js';
import { configurationFromInitial, prepareSaveImport, CONFIG_KEYS } from '../ui/save-configuration.js';
import { compareImportedConfiguration } from '../ui/compare-imported.js';

const runtimeSnapshot = parsed => {
  const values = plainProperties(parsed.initial);
  const playerValues = Object.values(values).filter(bag => bag && Object.hasOwn(bag, KEYS.playerId));
  return { schemaVersion: 1, inShell: true, isGameStarted: false,
    game: values[KEYS.game], map: values[KEYS.map],
    players: playerValues.map(values => ({ id: values[KEYS.playerId], values })),
  };
};

test('complete conversion and oracle generation run without host programs, filesystem or browser APIs', async () => {
  const { bytes } = fixture({ custom: [[207, variant(3, '纪念物 🌏')], [208, variant(32, Buffer.alloc(16, 7))]] });
  const scripts = await Promise.all(['save-reader.js', 'save-configuration.js'].map(name => readFile(new URL('../ui/' + name, import.meta.url), 'utf8')));
  const script = scripts.map(source => source.replace(/^import .*;\n/gm, '').replace(/^export /gm, '')).join('\n');
  const result = JSON.parse(vm.runInNewContext(script + `
    for (const name of ['Buffer', 'TextEncoder', 'TextDecoder', 'process', 'require', 'fetch', 'XMLHttpRequest', 'engine', 'Network']) {
      if (typeof globalThis[name] !== 'undefined') throw Error('Unexpected host API: ' + name);
    }
    const result = prepareSaveImport(Uint8Array.from(input));
    JSON.stringify({ ...result, bytes: Array.from(result.bytes) });
  `, { input: Array.from(bytes) }));
  assert.equal(result.expected.players[0].values['105'].value, 'RANDOM');
  assert.equal(result.expected.players[0].values[KEYS.majorMemento].value, 'MEMENTO_FOUNDATION_TRAVELS_MARCO_POLO');
  assert.equal(result.expected.game['102'].value, '-9223372036854775800');
  assert.equal(result.expected.game['207'].value, '纪念物 🌏');
  const parsed = parseNativeSave(Uint8Array.from(result.bytes));
  assert.equal(parsed.contentType, 1);
  assert.equal(parsed.configEnd, result.bytes.length);
  assert.deepEqual(parsed.bytes.subarray(parsed.initial.start, parsed.initial.end), new Uint8Array(fixture({ custom: [[207, variant(3, '纪念物 🌏')], [208, variant(32, Buffer.alloc(16, 7))]] }).initial));
});

test('native setup oracle rejects current-world identities even when both seeds match', () => {
  const input = fixture().bytes;
  const result = prepareSaveImport(input);
  const parsed = parseNativeSave(input);
  const current = runtimeSnapshot({ ...parsed, initial: parsed.current });
  assert.equal(current.game[KEYS.randomSeed], result.source.game[KEYS.randomSeed].value);
  assert.equal(current.map[KEYS.randomSeed], result.source.map[KEYS.randomSeed].value);
  const comparison = compareImportedConfiguration(result.source, current);
  assert.equal(comparison.matches, false);
  assert(comparison.differences.some(row => row.path === 'players[0].105'));
  assert(comparison.differences.some(row => row.path === `players[0].${KEYS.majorMemento}`));
  assert.equal(compareImportedConfiguration(result.expected, runtimeSnapshot(parseNativeSave(result.bytes))).matches, true);
});

test('preparing new-game state retains a distinct unchanged source oracle', () => {
  const originalState = -818482450;
  const input = fixture({ custom: [[CONFIG_KEYS.playState, variant(9, originalState)]] }).bytes;
  const before = Buffer.from(input);
  const result = prepareSaveImport(input);
  assert.equal(result.source.game[CONFIG_KEYS.playState].value, originalState);
  assert.equal(result.expected.game[CONFIG_KEYS.playState].value, -901772834);
  assert.deepEqual(result.changes, [{ field: 'PlayState', reason: 'new-game-setup' }]);
  assert.deepEqual(input, before);
  result.expected.players[0].values['105'].value = 'LEADER_CHANGED';
  result.bytes.fill(0);
  assert.equal(result.source.players[0].values['105'].value, 'RANDOM');
  assert.deepEqual(input, before);
});

test('typed snapshots own nested arrays and opaque values across reset or later mutation', () => {
  const parsed = parseNativeSave(fixture({ custom: [
    [200, variant(9, [1, 2])], [201, variant(32, Buffer.alloc(16, 7))],
    [202, variant(30, [variant(29, [[203, variant(10, ['18446744073709551615'])]])])],
  ] }).bytes);
  const snapshot = configurationFromInitial(parsed);
  const game = parsed.initial.entries[KEYS.game].value;
  game[200].value[0] = 99;
  game[201].value.nativeBytes = '';
  game[202].value[0].value[203].value[0] = '0';
  assert.deepEqual(snapshot.game[200].value, [1, 2]);
  assert.equal(snapshot.game[201].value.nativeBytes, '07'.repeat(16));
  assert.deepEqual(snapshot.game[202].value[0].value[203].value, ['18446744073709551615']);
});

test('offset views and ArrayBuffers produce identical configurations without altering their surroundings', () => {
  const { bytes } = fixture();
  const padded = new Uint8Array(bytes.length + 32).fill(123);
  padded.set(bytes, 16);
  const before = padded.slice();
  const view = padded.subarray(16, -16);
  const one = prepareSaveImport(view), two = prepareSaveImport(view.slice().buffer);
  assert.deepEqual(one, two);
  assert.deepEqual(padded, before);
});

test('only verified UI mod versions change, including growing UTF-16 strings and adjacent native values', () => {
  const mod = (id, versionType, version) => variant(29, [[CONFIG_KEYS.modId, variant(2, id)], [CONFIG_KEYS.modVersion, variant(versionType, version)]]);
  const input = fixture({ custom: [
    [CONFIG_KEYS.enabledMods, variant(30, [mod('ui-a', 3, '9'), mod('ui-b', 2, '99'), mod('gameplay', 9, 4)])],
    [201, variant(32, Buffer.alloc(16, 3))],
  ] }).bytes;
  const result = prepareSaveImport(input, { uiModVersions: {
    'ui-a': { version: 100, affectsSavedGames: false }, 'ui-b': { version: 8, affectsSavedGames: false },
  } });
  const mods = result.expected.game[CONFIG_KEYS.enabledMods].value;
  assert.deepEqual(mods.map(mod => mod.value[CONFIG_KEYS.modVersion].value), ['100', '8', 4]);
  assert.equal(mods[0].value[CONFIG_KEYS.modVersion].type, 3);
  assert.equal(result.expected.game[201].value.nativeBytes, '03'.repeat(16));
  assert.deepEqual(result.source.game[CONFIG_KEYS.enabledMods].value.map(mod => mod.value[CONFIG_KEYS.modVersion].value), ['9', '99', 4]);
  for (const record of [{ version: 5 }, { version: 5, affectsSavedGames: true }, { version: 2147483648, affectsSavedGames: false }]) {
    assert.throws(() => prepareSaveImport(input, { uiModVersions: { gameplay: record } }), /verified UI/);
  }
});

test('unproven versions, truncated saves and later-age snapshots never yield a prepared configuration', () => {
  for (const [input, error] of [
    [fixture({ version: '1.6.0' }).bytes, /1.5.0/],
    [fixture({ laterAge: true }).bytes, /current age setup/],
    [fixture({ configOnly: true }).bytes, /ordinary/],
    [fixture().bytes.subarray(0, 120), /Truncated/],
  ]) assert.throws(() => prepareSaveImport(input), error);
});
