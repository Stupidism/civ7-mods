import test from 'node:test';
import assert from 'node:assert/strict';
import { probeConfigurationLoad } from '../tools/menu-config-probe.mjs';

function harness({ inShell = true, started = false, outcome = 'loaded' } = {}) {
  const listeners = new Map(), calls = [];
  const runtime = {
    UI: { isInShell: () => inShell },
    Database: { makeHash: name => ({ RandomSeed: 233116467, PlayerID: -1090494134 })[name] },
    Configuration: {
      getGame: () => ({ isGameStarted: started, getValues: () => ({ RandomSeed: 123 }) }),
      getMap: () => ({ getValues: () => ({ RandomSeed: 456 }) }),
      getPlayer: id => ({ getValues: () => ({ PlayerID: id }) }),
    },
    SaveLocations: { LOCAL_STORAGE: 1 }, SaveTypes: { SINGLE_PLAYER: 2 },
    SaveFileTypes: { GAME_STATE: 0, GAME_CONFIGURATION: 1 },
    ServerType: { SERVER_TYPE_NONE: 0 }, SerializerResult: { RESULT_PENDING: 1, RESULT_OK: 0 },
    engine: {
      on: (name, callback) => listeners.set(name, callback),
      off: (name, callback) => { assert.equal(listeners.get(name), callback); listeners.delete(name); },
    },
    Network: { loadGame: (request, server) => {
      calls.push({ request, server });
      if (outcome === 'throw') throw new Error('native failure');
      if (outcome === 'false') return false;
      if (outcome !== 'timeout') queueMicrotask(() => {
        listeners.get('LoadComplete')({ result: 1 });
        listeners.get('LoadComplete')({ result: outcome === 'loaded' ? 0 : 5 });
      });
      return true;
    } },
  };
  const save = { location: 1, locationCategories: 0, type: 2, contentType: 0, fileName: 'example.Civ7Save', displayName: 'Example', slot: 0, additionalInfo: '' };
  return { runtime, save, calls, listeners };
}

test('manual probe refuses an unapproved or active-game session before any native operation', async () => {
  for (const options of [{}, { inShell: false }, { started: true }]) {
    const h = harness(options);
    await assert.rejects(probeConfigurationLoad(h.runtime, h.save, { allowNativeLoad: Object.keys(options).length > 0 }), /requires|during a game/);
    assert.equal(h.calls.length, 0);
    assert.equal(h.listeners.size, 0);
  }
});

test('pending and timed-out probes cannot overlap or silently retry', async () => {
  const h = harness({ outcome: 'timeout' });
  const first = probeConfigurationLoad(h.runtime, h.save, { allowNativeLoad: true, timeoutMs: 5 });
  await assert.rejects(probeConfigurationLoad(h.runtime, h.save, { allowNativeLoad: true }), /pending or unresolved/);
  assert.equal((await first).status, 'indeterminate-timeout');
  await assert.rejects(probeConfigurationLoad(h.runtime, h.save, { allowNativeLoad: true }), /pending or unresolved/);
  assert.equal(h.calls.length, 1);
});

test('a context change during loading is reported without reading gameplay configuration', async () => {
  const h = harness();
  h.runtime.Network.loadGame = () => {
    h.calls.push('load');
    h.runtime.UI.isInShell = () => false;
    queueMicrotask(() => h.listeners.get('LoadComplete')({ result: 0 }));
    return true;
  };
  const result = await probeConfigurationLoad(h.runtime, h.save, { allowNativeLoad: true });
  assert.equal(result.status, 'unexpected-context');
  assert.equal(result.after, null);
  assert.equal(h.calls.length, 1);
});

test('probe only requests configuration and reports success as needing comparison', async () => {
  const h = harness();
  const result = await probeConfigurationLoad(h.runtime, h.save, { allowNativeLoad: true });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].request.ContentType, h.runtime.SaveFileTypes.GAME_CONFIGURATION);
  assert.equal(h.calls[0].request.FileName, h.save.fileName);
  assert.equal(h.save.contentType, 0);
  assert.equal(result.status, 'loaded-needs-comparison');
  assert.equal(result.after.players.length, 64);
  assert.equal(h.listeners.size, 0);
});

test('failure and timeout never retry or fall back to loading gameplay', async () => {
  for (const [outcome, expected] of [['false', 'not-accepted'], ['rejected', 'rejected'], ['timeout', 'indeterminate-timeout'], ['throw', null]]) {
    const h = harness({ outcome });
    const probe = probeConfigurationLoad(h.runtime, h.save, { allowNativeLoad: true, timeoutMs: 1 });
    if (expected) assert.equal((await probe).status, expected);
    else await assert.rejects(probe, /native failure/);
    assert.equal(h.calls.length, 1);
    assert.equal(h.listeners.size, 0);
  }
});

test('probe refuses cloud, multiplayer, transition, directory and missing-content selections', async () => {
  for (const changes of [{ location: 2 }, { type: 3 }, { contentType: 3 }, { fileName: '' }, { isDirectory: true }, { isCurrentGame: true }, { missingMods: ['missing'] }, { unownedMods: ['dlc'] }]) {
    const h = harness();
    await assert.rejects(probeConfigurationLoad(h.runtime, { ...h.save, ...changes }, { allowNativeLoad: true }), /Select|unavailable/);
    assert.equal(h.calls.length, 0);
  }
});
