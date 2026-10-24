import test from 'node:test';
import assert from 'node:assert/strict';
import { variant } from './fixtures.mjs';
import { KEYS } from '../tools/native-save.mjs';
import { comparisonFixture } from './comparison-fixture.mjs';
import { captureConfiguration } from '../ui/configuration-snapshot.js';
import { compareConfiguration } from '../ui/compare-configuration.js';

test('matches every expected value, accepting signed 32-bit bridge representations', () => {
  const { expected, actual } = comparisonFixture();
  actual.game[KEYS.randomSeed] |= 0;
  const result = compareConfiguration(expected, actual);
  assert.equal(result.matches, true);
  assert.equal(result.differences.length, 0);
  assert.ok(result.checkedValues >= 9);
});

test('either seed, either memento, or resolved random AI blocks equivalence', () => {
  for (const change of [
    actual => actual.game[KEYS.randomSeed]++, actual => actual.map[KEYS.randomSeed]++,
    actual => actual.players[0].values[KEYS.majorMemento] = 'OTHER',
    actual => actual.players[0].values[KEYS.minorMemento1] = 'OTHER',
    actual => actual.players[1].values[105] = 'LEADER_AMINA',
  ]) {
    const { expected, actual } = comparisonFixture(); change(actual);
    assert.equal(compareConfiguration(expected, actual).matches, false);
  }
});

test('unknown mod settings, nested arrays, missing properties and extra defaults are compared', () => {
  const { expected, actual } = comparisonFixture({ custom: [[200, variant(30, [variant(29, [[201, variant(2, 'custom')]])])]] });
  assert.equal(compareConfiguration(expected, actual).matches, true);
  actual.game[200][0][201] = 'changed';
  assert.deepEqual(compareConfiguration(expected, actual).differences, [{ path: 'game.200[0].201', kind: 'changed' }]);
  delete actual.game[200]; actual.map[999] = 1;
  assert.deepEqual(compareConfiguration(expected, actual).differences.map(d => d.kind), ['missing', 'extra']);
});

test('unsafe 64-bit values, duplicate slots and opaque native types never silently pass', () => {
  const { expected, actual } = comparisonFixture();
  actual.game[102] = Number(actual.game[102]);
  assert.equal(compareConfiguration(expected, actual).matches, false);
  actual.players.push(actual.players[0]);
  assert.ok(compareConfiguration(expected, actual).differences.some(d => d.kind === 'invalid-or-duplicate-slot'));
  const opaque = comparisonFixture({ custom: [[200, variant(32, Buffer.alloc(16))]] });
  assert.equal(compareConfiguration(opaque.expected, opaque.actual).matches, false);
});

test('later-age, non-shell and unexposed root fields cannot earn a full-match result', () => {
  assert.throws(() => comparisonFixture({ laterAge: true }), /current age setup/);
  const { expected, actual } = comparisonFixture();
  actual.inShell = false;
  assert.equal(compareConfiguration(expected, actual).matches, false);
  actual.inShell = true; expected.unexposedRootKeys.push('12345');
  assert.ok(compareConfiguration(expected, actual).differences.some(d => d.kind === 'not-exposed-by-runtime'));
});

test('runtime capture normalizes nested named keys and BigInts without using a global engine', () => {
  const hash = { RandomSeed: 233116467, PlayerID: -1090494134, Mods: 100, ID: 101, Count: 102 };
  const runtime = {
    UI: { isInShell: () => true }, Database: { makeHash: name => hash[name] },
    Configuration: {
      getGame: () => ({ isGameStarted: false, getValues: () => ({ RandomSeed: -1, Mods: [{ ID: 'custom', Count: 9223372036854775800n }] }) }),
      getMap: () => ({ getValues: () => ({ RandomSeed: 0 }) }),
      getPlayer: id => ({ getValues: () => ({ PlayerID: id }) }),
    },
  };
  const result = captureConfiguration(runtime);
  assert.equal(result.game[100][0][102], '9223372036854775800');
  assert.equal(result.keyNames[233116467], 'RandomSeed');
  assert.equal(result.players.length, 64);
  runtime.Configuration.getMap = () => ({ getValues: () => ({ RandomSeed: 1, 233116467: 2 }) });
  assert.throws(() => captureConfiguration(runtime), /Duplicate/);
});

test('unset live bridge fields survive JSON and cannot silently equal null or missing', () => {
  const runtime = {
    UI: { isInShell: () => true }, Database: { makeHash: () => 200 },
    Configuration: {
      getGame: () => ({ isGameStarted: false, getValues: () => ({ Unset: undefined }) }),
      getMap: () => ({ getValues: () => ({}) }),
      getPlayer: () => ({ getValues: () => ({}) }),
    },
  };
  const actual = JSON.parse(JSON.stringify(captureConfiguration(runtime)));
  assert.deepEqual(actual.game[200], { $runtimeValue: 'undefined' });
  const expected = {
    schemaVersion: 1, scope: 'campaign', game: { 200: { type: 0, descriptor: 0, value: null } },
    map: {}, players: actual.players, unexposedRootKeys: [],
  };
  assert.deepEqual(compareConfiguration(expected, actual).differences, [{ path: 'game.200', kind: 'changed' }]);
  delete expected.game[200];
  assert.deepEqual(compareConfiguration(expected, actual).differences, [{ path: 'game.200', kind: 'extra' }]);
});
