import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures.mjs';
import { parseNativeSave, extractSetup, KEYS } from '../tools/native-save.mjs';
import { expectedConfiguration } from '../tools/expected-configuration.mjs';
import { createPlayAgainFlow } from '../ui/play-again-flow.js';

function harness() {
  const parsed = parseNativeSave(fixture().bytes), setup = extractSetup(parsed);
  const expected = expectedConfiguration(parsed);
  const current = { schemaVersion: 1, inShell: true, isGameStarted: false, game: setup.game, map: setup.map, players: setup.players };
  const calls = [];
  const adapters = {
    canUseShell: () => true,
    prepare: async () => { calls.push('prepare'); return { expected, loaded: current }; },
    readCurrent: async () => current,
    openEditor: async () => { calls.push('edit'); },
    startGame: async () => { calls.push('start'); },
  };
  return { current, expected, calls, adapters, create: () => createPlayAgainFlow(adapters) };
}
const save = { displayName: 'Test save' };

test('verified direct start happens once, and micro-adjustment opens only the editor', async () => {
  for (const action of ['start', 'adjust']) {
    const h = harness(), flow = h.create();
    assert.equal(await flow.prepare(save), true);
    assert.equal(flow.state.phase, 'ready');
    const first = flow[action]();
    assert.equal(await flow[action](), false);
    assert.equal(await first, true);
    assert.deepEqual(h.calls, ['prepare', action === 'start' ? 'start' : 'edit']);
  }
});

test('an apparently successful load with changed mementos cannot open or launch', async () => {
  const h = harness(); h.current.players[0].values[KEYS.majorMemento] = 'OTHER';
  const flow = h.create();
  assert.equal(await flow.prepare(save), false);
  assert.equal(flow.state.phase, 'blocked');
  assert.equal(await flow.start(), false);
  assert.equal(await flow.adjust(), false);
  assert.deepEqual(h.calls, ['prepare']);
});

test('changes after preparation and mutation of an external oracle cannot bypass the final comparison', async () => {
  const h = harness(), flow = h.create(); await flow.prepare(save);
  h.current.map[KEYS.randomSeed] = 7;
  h.expected.map[KEYS.randomSeed].value = 7;
  assert.equal(await flow.start(), false);
  assert.equal(flow.state.phase, 'blocked');
  assert.deepEqual(h.calls, ['prepare']);
});

test('leaving the main menu never invokes prepare, edit or start', async () => {
  const h = harness(); h.adapters.canUseShell = () => false;
  const flow = h.create(); assert.equal(await flow.prepare(save), false);
  assert.deepEqual(h.calls, []);
  const next = harness(), ready = next.create(); await ready.prepare(save);
  next.adapters.canUseShell = () => false; // Captured adapters remain bound; change snapshot context instead.
  next.current.inShell = false;
  assert.equal(await ready.start(), false);
  assert.deepEqual(next.calls, ['prepare']);
});

test('cancelling pending preparation discards its result and prevents repeated loads', async () => {
  const h = harness(); let resolve;
  h.adapters.prepare = () => { h.calls.push('prepare'); return new Promise(done => { resolve = done; }); };
  const flow = h.create(), first = flow.prepare(save);
  assert.equal(await flow.prepare(save), false);
  assert.equal(flow.cancel(), true);
  resolve({ expected: h.expected, loaded: h.current });
  assert.equal(await first, false);
  assert.equal(flow.state.phase, 'cancelled');
  assert.equal(await flow.start(), false);
  assert.deepEqual(h.calls, ['prepare']);
});

test('native failures or refusal never auto-retry, and ready-state cancellation can select again', async () => {
  const h = harness(); h.adapters.startGame = () => { h.calls.push('start'); return false; };
  const flow = h.create(); await flow.prepare(save);
  assert.equal(await flow.start(), false);
  assert.equal(flow.state.phase, 'failed');
  assert.equal(await flow.start(), false);
  assert.deepEqual(h.calls, ['prepare', 'start']);
  const next = harness(), cancelled = next.create(); await cancelled.prepare(save);
  cancelled.cancel();
  assert.equal(await cancelled.prepare({ displayName: 'Another' }), true);
  assert.equal(cancelled.state.sourceName, 'Another');
});
