import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { RestSession } from '../ui/rest-session.js';
import { normalizeConfig } from '../ui/rest-model.js';

const source = fs.readFileSync(new URL('../ui/rest-runtime.js', import.meta.url), 'utf8')
  .replace(/^\uFEFF/, '').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const memory = () => {
  const m = new Map();
  return { getItem: k => m.get(k), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k), data: m };
};
function harness(storage = memory(), now = 0, scope = 'shell', state = 0, inGame = scope === 'game') {
  const clock = { now };
  const events = new Map();
  const loading = { state, inGame, curtain: null };
  const network = { loadGame: () => true, loadAgeTransition: () => true };
  const engine = { on: (k, f) => events.set(k, f), call: (name, value) => value };
  const sandbox = { RestSession, window: { addEventListener: (k, f) => events.set(k, f) },
    document: { querySelector: selector => selector === '#loading-curtain' ? loading.curtain : null },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; }
      observe(parent) { parent.changed = this.callback; }
      disconnect() {}
    },
    localStorage: storage, Network: network, Date: { now: () => clock.now }, console: { warn() {} },
    engine, SerializerResult: { RESULT_OK: 0 }, UI: { getGameLoadingState: () => loading.state, isInGame: () => loading.inGame },
    UIGameLoadingState: { NotStarted: 0, WaitingForGameplayData: 1, WaitingForLoadingCurtain: 2,
      WaitingForConfiguration: 3, WaitingForGameCore: 4, WaitingForVisualization: 5,
      WaitingForUIReady: 6, WaitingForGameUnloadScreenReady: 9, WaitingToStart: 7, GameStarted: 8 },
  };
  vm.runInNewContext(source + '\nglobalThis.api = {get session() { return session; }, checkpoint, installLoadingHooks};', sandbox);
  sandbox.api.installLoadingHooks(scope);
  return { ...sandbox.api, clock, events, storage, loading, network, engine };
}

test('native load persists one handoff; the new game document consumes it and excludes loading', () => {
  const storage = memory();
  const first = harness(storage);
  first.network.loadGame();
  assert.equal(storage.data.size, 1);
  const loaded = harness(storage, 120000, 'game', 8);
  assert.equal(loaded.session.elapsed(120000), 0);
  assert.equal(loaded.session.loading, false);
  assert.equal(loaded.session.idle(120000), 0);
  assert.equal(storage.data.size, 0);
});

test('normal gameplay checkpoints write no runtime records', () => {
  const h = harness(memory(), 0, 'game', 8);
  const current = { context: 'a', token: 'a:4', turn: 4 };
  for (let t = 0; t < 60000; t += 250) {
    h.session.activity(current, normalizeConfig({ nightEnabled: false, intervals: [5, 4, 3, 2, 1] }), t);
    h.checkpoint();
  }
  assert.equal(h.storage.data.size, 0);
});

test('return to main menu resumes; a fresh startup discards interrupted game handoff', () => {
  const storage = memory();
  const game = harness(storage, 0, 'game', 8);
  game.session.requestTurn({ context: 'a', turn: 10, token: 'a:10' }, normalizeConfig({ nightEnabled: false, intervals: [5, 4, 3, 2, 1] }), 0);
  game.clock.now = 120000;
  assert.equal(game.engine.call('exitToMainMenu', 'unchanged'), 'unchanged');
  const menu = harness(storage, 120001);
  assert.equal(menu.session.elapsed(120001), 120000);
  assert.equal(menu.session.turnCount, 1);
  menu.network.loadGame();
  // A new process enters the shell, not the requested game destination.
  const fresh = harness(storage, 130000);
  assert.equal(fresh.session.startedAt, null);
  assert.equal(fresh.session.turnCount, 0);
  assert.equal(storage.data.size, 0);
});

test('desktop exit clears only the temporary handoff; unload cannot recreate it', () => {
  const storage = memory();
  storage.setItem('other', 'keep');
  const h = harness(storage);
  h.network.loadGame();
  h.engine.call('exitToDesktop');
  h.events.get('unload')();
  assert.deepEqual([...storage.data], [['other', 'keep']]);
});

test('loading events cover new games and age transition with read-only native load methods', () => {
  const h = harness();
  Object.defineProperty(h.network, 'loadGame', { writable: false });
  h.installLoadingHooks('shell');
  h.loading.state = 4;
  h.events.get('UIGameLoadingStateChanged')();
  assert.equal(h.session.loading, true);
  const loaded = harness(h.storage, 120000, 'game', 8);
  assert.equal(loaded.session.elapsed(120000), 0);
});

test('pending break and accumulated turns survive a load without resetting duration', () => {
  const first = harness(memory(), 0, 'game', 8);
  const current = { context: 'a', token: 'a:4', turn: 4 };
  first.session.reset(current, 0);
  for (const turn of [5, 6, 7, 8]) first.session.requestTurn({ ...current, turn, token: `a:${turn}` }, normalizeConfig({ nightEnabled: false, intervals: [5, 4, 3, 2, 1] }), 0);
  const later = { ...current, turn: 9, token: 'a:9' };
  first.session.requestTurn(later, normalizeConfig({ nightEnabled: false, intervals: [5, 4, 3, 2, 1] }), 60000);
  first.clock.now = 60000;
  first.network.loadGame();
  const second = harness(first.storage, 120000, 'game', 8);
  assert.equal(second.session.pending.reason, 'turn');
  assert.equal(second.session.remaining(120000), 240000);
  assert.equal(second.session.turnCount, 5);
});

test('a failed asynchronous load preserves played time and turn deduplication', () => {
  const h = harness(memory(), 0, 'game', 8);
  const current = { context: 'a', token: 'a:10', turn: 10 };
  h.session.requestTurn(current, normalizeConfig({ nightEnabled: false, intervals: [5, 4, 3, 2, 1] }), 0);
  h.network.loadGame();
  h.clock.now = 120000;
  h.events.get('LoadComplete')({ result: 1 });
  assert.equal(h.session.loading, false);
  assert.equal(h.session.elapsed(120000), 0);
  h.session.requestTurn(current, normalizeConfig({ nightEnabled: false, intervals: [5, 4, 3, 2, 1] }), 120000);
  assert.equal(h.session.turnCount, 1);
  assert.equal(h.storage.data.size, 0);
});

test('loading uses one top-level storage key and preserves saved switches and other mods', () => {
  const storage = memory();
  const settings = { 'civ7-rest-guard': { version: 3, config: { ...normalizeConfig({ nightEnabled: false, intervals: [5, 4, 3, 2, 1] }), timeEnabled: false } }, otherMod: { enabled: false } };
  storage.setItem('modSettings', JSON.stringify(settings));
  const first = harness(storage);
  first.network.loadGame();
  assert.equal(storage.data.size, 1, 'Civ VII breaks storage reads when a second top-level key is added');
  const loaded = harness(storage, 60000, 'game', 8);
  assert.equal(loaded.session.elapsed(60000), 0);
  assert.deepEqual(JSON.parse(storage.getItem('modSettings')), settings);
});



test('load handoff retains the live counter without adding destination turns', () => {
  const first = harness(memory(), 0, 'game', 8);
  const config = normalizeConfig({ nightEnabled: false, intervals: [5, 4, 3, 2, 1] });
  for (const turn of [10, 11]) first.session.requestTurn({ context: 'a', turn, token: `a:${turn}` }, config, 0);
  first.network.loadGame();
  const second = harness(first.storage, 1000, 'game', 8);
  second.session.tick({ context: 'a', turn: 80, token: 'a:80' }, config, 1000);
  assert.equal(second.session.turnCount, 2);
  assert.equal(second.session.pending, null);
  assert.equal(second.storage.data.size, 0);
});


test('load curtain and WaitingToStart do not consume the remaining minute of play', () => {
  const first = harness(memory(), 0, 'game', 8);
  const config = normalizeConfig({ nightEnabled: false });
  const current = { turn: 49, token: 'a:49', context: 'a' };
  first.session.start(0);
  first.session.lastInputAt = 24 * 60000;
  first.clock.now = 24 * 60000; first.network.loadGame();
  const waiting = harness(first.storage, 30 * 60000, 'game', 7);
  waiting.session.tick(current, config, waiting.clock.now);
  assert.equal(waiting.session.elapsed(waiting.clock.now), 24 * 60000);
  assert.equal(waiting.session.pending, null);
  waiting.clock.now = 40 * 60000; waiting.loading.state = 8;
  waiting.events.get('UIGameLoadingStateChanged')();
  waiting.session.activity(current, config, waiting.clock.now);
  assert.equal(waiting.session.elapsed(waiting.clock.now), 24 * 60000);
  assert.equal(waiting.session.pending, null);
  waiting.clock.now += 60000;
  waiting.session.activity(current, config, waiting.clock.now);
  assert.equal(waiting.session.pending?.reason, 'time');
});


test('main-menu waiting and a failed menu load remain outside play time', () => {
  const game = harness(memory(), 0, 'game', 8); game.session.start(0);
  game.clock.now = 60000; game.engine.call('exitToMainMenu');
  const menu = harness(game.storage, 120000);
  menu.clock.now = 300000; menu.network.loadGame();
  menu.clock.now = 400000; menu.events.get('LoadComplete')({ result: 1 });
  assert.equal(menu.session.elapsed(500000), 60000);
  menu.clock.now = 600000; menu.network.loadGame();
  const loaded = harness(menu.storage, 700000, 'game', 8);
  assert.equal(loaded.session.elapsed(700000), 60000);
  assert.equal(loaded.session.loading, false);
});


test('late GameStarted notification cannot cancel an already confirmed main-menu handoff', () => {
  const game = harness(memory(), 0, 'game', 8); game.session.start(0);
  game.clock.now = 60000; game.engine.call('exitToMainMenu');
  game.events.get('UIGameLoadingStateChanged')(); game.events.get('unload')();
  const menu = harness(game.storage, 120000);
  assert.equal(menu.session.elapsed(180000), 60000);
  assert.equal(menu.session.loading, true);
});

test('T55 game entry while isInGame is false resumes on GameStarted and enforces one minute', () => {
  const first = harness(memory(), 0, 'game', 8);
  const config = normalizeConfig({ playMinutes: 1, nightEnabled: false });
  const current = { turn: 55, token: 'a:55', context: 'a' };
  first.session.requestTurn(current, config, 0);
  first.clock.now = 10000;
  first.network.loadGame();

  const map = harness(first.storage, 20000, 'game', 6, false);
  map.clock.now = 220000;
  map.loading.state = 7;
  map.events.get('UIGameLoadingStateChanged')();
  assert.equal(map.session.loading, true);
  map.loading.inGame = true;
  map.loading.state = 8;
  map.events.get('UIGameLoadingStateChanged')();
  assert.equal(map.session.loading, false);
  assert.equal(map.session.elapsed(map.clock.now), 10000);
  assert.equal(map.session.turnCount, 1);
  map.session.activity(current, config, map.clock.now + 49999);
  assert.equal(map.session.pending, null);
  map.session.tick(current, config, map.clock.now + 50000);
  assert.equal(map.session.pending?.reason, 'time');
});

test('GameStarted holds play time until the native Start Game curtain is actually removed', () => {
  const h = harness(memory(), 0, 'game', 7);
  const parentNode = {};
  const curtain = { parentNode, isConnected: true };
  h.loading.curtain = curtain;
  h.clock.now = 10000;
  h.loading.state = 8;
  h.events.get('UIGameLoadingStateChanged')();
  h.clock.now += 26 * 60000;
  parentNode.changed();
  assert.equal(h.session.elapsed(h.clock.now), 0);
  assert.equal(h.session.loading, true);
  curtain.isConnected = false;
  h.loading.curtain = null;
  parentNode.changed();
  assert.equal(h.session.loading, false);
  assert.equal(h.session.elapsed(h.clock.now + 60000), 60000);
});
