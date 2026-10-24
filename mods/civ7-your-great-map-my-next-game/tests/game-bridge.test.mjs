import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createGameBridge } from '../tools/game-bridge.mjs';

function fixture() {
  const state = { shell: true, started: false, conversions: 0, responses: [], deliveryFails: false };
  const connection = { request: null, complete(response) {
    if (state.deliveryFails) throw new Error('view replaced');
    state.responses.push(response); this.request = null;
  } };
  const context = vm.createContext({ __civ7PlayAgainBridge: connection,
    UI: { isInShell: () => state.shell }, Configuration: { getGame: () => ({ isGameStarted: state.started }) } });
  const bridge = createGameBridge({ async convert(data) { state.conversions++; return { fileName: data.fileName + '.Civ7Cfg' }; } }, 'token', expression => vm.runInContext(expression, context));
  const request = (extra = {}) => connection.request = { id: 'one', route: '/convert', token: 'token', data: { fileName: 'test' }, ...extra };
  return { state, bridge, request, connection };
}

test('bridge does nothing without a valid explicit request in the idle shell', async () => {
  const { state, bridge, request } = fixture();
  await bridge.poll();
  request({ token: 'wrong' }); await bridge.poll();
  request(); state.shell = false; await bridge.poll();
  state.shell = true; state.started = true; await bridge.poll();
  assert.equal(state.conversions, 0);
  state.started = false; request({ route: '/arbitrary-command' }); await bridge.poll();
  assert.equal(state.conversions, 0);
  assert.equal(state.responses[0].error, 'Unsupported local operation');
  bridge.stop(); request(); await bridge.poll(); assert.equal(state.conversions, 0);
});

test('bridge permits read-only diagnosis and carries structured failure details', async () => {
  const token = 'token'; const responses = []; let diagnostics = 0;
  const bridgeState = { request: { id: 'check', token, route: '/diagnose', data: { fileName: 'source.Civ7Save' } }, complete: response => { responses.push(response); } };
  const context = vm.createContext({ __civ7PlayAgainBridge: bridgeState, UI: { isInShell: () => true }, Configuration: { getGame: () => ({ isGameStarted: false }) } });
  const report = { required: [{ id: 'required' }], recommended: [{ id: 'ui' }] };
  const bridge = createGameBridge({ diagnose: async () => { diagnostics++; return report; }, convert: async () => { const error = new Error('missing'); error.content = report; throw error; } }, token, expression => vm.runInContext(expression, context));
  await bridge.poll(); assert.equal(diagnostics, 1); assert.equal(responses[0].result.required[0].id, 'required');
  bridgeState.request = { ...bridgeState.request, id: 'convert', route: '/convert' };
  await bridge.poll(); assert.equal(responses[1].content.recommended[0].id, 'ui');
});

test('delivery retry and overlapping polls never export the same request twice', async () => {
  const { state, bridge, request, connection } = fixture();
  request(); state.deliveryFails = true;
  await Promise.all([bridge.poll(), bridge.poll()]);
  assert.equal(state.conversions, 1);
  assert.notEqual(connection.request, null);
  state.deliveryFails = false; await bridge.poll();
  assert.equal(state.conversions, 1); assert.equal(state.responses.length, 1);
  assert.equal(state.responses[0].result.fileName, 'test.Civ7Cfg');
  assert.equal(connection.request, null);
  request({ id: 'two' }); await bridge.poll(); assert.equal(state.conversions, 2);
});

test('clipboard bridge does not read during gameplay and retries delivery without rereading clipboard', async () => {
  let reads = 0, started = true, fail = true;
  const request = { id: 'paste', token: 'token', route: '/ocr/clipboard', data: {} };
  const state = { request, complete() { if (fail) throw new Error('not ready'); this.request = null; } };
  const context = vm.createContext({ __civ7PlayAgainBridge: state, UI: { isInShell: () => true }, Configuration: { getGame: () => ({ isGameStarted: started }) } });
  const bridge = createGameBridge({ async recognizeClipboard() { reads++; return { lines: [] }; } }, 'token', expression => vm.runInContext(expression, context));
  await bridge.poll(); assert.equal(reads, 0);
  started = false; await bridge.poll(); assert.equal(reads, 1);
  fail = false; await bridge.poll(); assert.equal(reads, 1); assert.equal(state.request, null);
});
