import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createDiagnosticRecorder, DIAGNOSTICS_NAMESPACE, DIAGNOSTICS_SCHEMA, sanitizePayload, utf8Bytes, MAX_BYTES } from '../ui/diagnostics-recorder.js';
const source = readFileSync(new URL('../ui/diagnostics-adapter.js', import.meta.url), 'utf8')
  .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\r?\n/gm, '')
  .replace(/export function /g, 'function ')
  .replace(/\ninstallDiagnostics\(\);\s*$/, '\nglobalThis.__backend=createStorageBackend;globalThis.__install=installDiagnostics;');
const config = { version: 1, controller: { enabled: true, swapSticks: true, invertLeftY: false, invertPanY: true, showDebug: false } };
function storageFixture({ blind = false, document = { foreign: { keep: 7 }, 'civ7-map-tools-gamepad': config }, extra = null } = {}) {
  const rows = new Map(document == null ? [] : [['modSettings', JSON.stringify(document)]]); if (extra) rows.set('foreign-row', extra);
  const storage = { get length() { return rows.size; }, getItem(key) { return blind ? [...rows.values()][0] ?? null : rows.get(key) ?? null; }, setItem(key, value) { rows.set(key, value); }, removeItem(key) { rows.delete(key); } };
  return { rows, storage };
}
function load(storage) { const sandbox = { createDiagnosticRecorder, DIAGNOSTICS_NAMESPACE, DIAGNOSTICS_SCHEMA, sanitizePayload, utf8Bytes, MAX_BYTES, localStorage: storage, console, Math, JSON, Date, Promise, TextEncoder, setInterval: () => 1, clearInterval() {}, ContextManager: {}, ViewManager: {}, Cursor: {}, FocusManager: { get: () => ({}) } }; vm.runInNewContext(source, sandbox); return sandbox; }

test('keyed and single-row key-blind storage preserve foreign keys and merge shell/game sessions', async () => {
  for (const blind of [false, true]) {
    const f = storageFixture({ blind }), backend = load(f.storage).__backend(f.storage);
    backend.save({ schema: 1, sessions: [{ id: 'shell', startup: { page: 'shell', started: 1 }, events: [] }] }, 'shell');
    backend.save({ schema: 1, sessions: [{ id: 'game', startup: { page: 'game', started: 2 }, events: [] }] }, 'game');
    const document = JSON.parse(f.rows.get('modSettings'));
    assert.deepEqual(document.foreign, { keep: 7 }); assert.deepEqual(document['civ7-map-tools-gamepad'], config);
    assert.deepEqual(document[DIAGNOSTICS_NAMESPACE].sessions.map(x => x.id), ['shell', 'game']);
  }
});

test('interleaved writers replace only their own session and never replay stale foreign sessions', () => {
  const f = storageFixture(), a = load(f.storage).__backend(f.storage), b = load(f.storage).__backend(f.storage);
  a.save({ schema: 1, sessions: [{ id: 'shell', startup: { page: 'shell', started: 1 }, events: [{ t: 0, kind: 'mark', label: 'old' }], counters: {} }] }, 'shell');
  const staleA = JSON.parse(f.rows.get('modSettings'))[DIAGNOSTICS_NAMESPACE];
  b.save({ schema: 1, sessions: [{ id: 'game', startup: { page: 'game', started: 2 }, events: [{ t: 0, kind: 'mark', label: 'new' }], counters: {} }] }, 'game');
  a.save({ schema: 1, sessions: [{ id: 'shell', startup: { page: 'shell', started: 1 }, events: [{ t: 1, kind: 'mark', label: 'late-shell' }], counters: {} },
    { id: 'game', startup: { page: 'game', started: 2 }, events: [{ t: 0, kind: 'mark', label: 'stale-game' }], counters: {} }] }, 'shell');
  const sessions = JSON.parse(f.rows.get('modSettings'))[DIAGNOSTICS_NAMESPACE].sessions;
  assert.deepEqual(sessions.map(x => x.id), ['shell', 'game']);
  assert.equal(sessions.find(x => x.id === 'game').events[0].label, 'new');
  assert.equal(sessions.find(x => x.id === 'shell').events[0].label, 'late-shell');
});

test('ambiguous key-blind and corrupt shared state refuse writes byte-for-byte', async () => {
  const cases = [storageFixture({ blind: true, extra: '{}' }), storageFixture(), storageFixture({ document: { 'civ7-map-tools-gamepad': { version: 1, controller: { enabled: true } } } }),
    storageFixture({ document: { 'civ7-map-tools-gamepad': config, [DIAGNOSTICS_NAMESPACE]: { schema: 1, sessions: [{ id: 'bad', startup: {}, events: new Array(513).fill({}) }] } } })];
  cases[1].rows.set('modSettings', '{bad');
  const blindForeign = storageFixture({ blind: true, document: null }); blindForeign.rows.set('unrelated-key', JSON.stringify({ foreign: { setting: 1 } })); cases.push(blindForeign);
  for (const f of cases) { const before = [...f.rows], backend = load(f.storage).__backend(f.storage); assert.throws(() => backend.save({ schema: 1, sessions: [{ id: 'x', startup: {}, events: [] }] }, 'x')); assert.deepEqual([...f.rows], before); }
});

test('quota and readback failures are reported without touching unrelated rows', async () => {
  for (const mode of ['quota', 'readback']) {
    const f = storageFixture(); f.rows.set('foreign-row', 'exact bytes'); const beforeForeign = f.rows.get('foreign-row');
    const original = f.storage.setItem;
    f.storage.setItem = mode === 'quota' ? () => { throw new Error('quota'); } : () => {};
    const backend = load(f.storage).__backend(f.storage);
    assert.throws(() => backend.save({ schema: 1, sessions: [{ id: mode, startup: {}, events: [] }] }, mode));
    assert.equal(f.rows.get('foreign-row'), beforeForeign);
    f.storage.setItem = original;
  }
});

test('boot before bridges records missing health and duplicate install disposes exact owners', () => {
  const f = storageFixture(), engineEvents = new Map(), windowEvents = new Map(), timers = new Set(), sandbox = load(f.storage);
  Object.assign(sandbox, { UI: { isInShell: () => true }, BuildInfo: { version: 'fixture' }, InputActionStatuses: { START: 1, UPDATE: 2, FINISH: 3, HOLD: 4 }, Input: { getActiveDeviceType: () => 2, getActiveContext: () => 0 },
    engine: { on: (n, fn) => engineEvents.set(n, fn), off: (n, fn) => { if (engineEvents.get(n) === fn) engineEvents.delete(n); } }, window: { addEventListener: (n, fn) => windowEvents.set(n, fn), removeEventListener: (n, fn) => { if (windowEvents.get(n) === fn) windowEvents.delete(n); } },
    setInterval: fn => { timers.add(fn); return fn; }, clearInterval: fn => timers.delete(fn) });
  sandbox.__install({ root: sandbox, storage: f.storage, engine: sandbox.engine, window: sandbox.window, viewManager: {}, contextManager: {}, cursor: {}, focus: {} }); const first = sandbox.__civ7BetterControllerDiagnosticsV1;
  engineEvents.get('InputAction')('nav-move', 1, .5, 1);
  assert.ok(first.snapshot().sessions.at(-1).events.some(x => x.reason === 'bridge-missing'));
  assert.ok(first.snapshot().sessions.at(-1).events.some(x => x.stage === 'raw-engine'));
  sandbox.__install({ root: sandbox, storage: f.storage, engine: sandbox.engine, window: sandbox.window, viewManager: {}, contextManager: {}, cursor: {}, focus: {} }); assert.equal(timers.size, 1); assert.equal(engineEvents.size, 2); assert.equal(windowEvents.size, 2);
  engineEvents.get('BeforeUnload')(); assert.equal(timers.size, 0); assert.equal(engineEvents.size, 0); assert.equal(windowEvents.size, 0);
});

test('health observes real native state safely and separates persisted from effective calibration', () => {
  const f = storageFixture(), engineEvents = new Map(), windowEvents = new Map(), timers = new Set();
  const sandbox = load(f.storage);
  let focusCalls = 0;
  const focus = () => {
    focusCalls++;
    if (focusCalls === 1) throw new Error('focus unavailable');
    return { isFocusLocked: () => true };
  };
  const root = {
    UI: { isInShell: () => false },
    BuildInfo: { version: 'game-build' },
    InputActionStatuses: { START: 1, UPDATE: 2, FINISH: 3, HOLD: 4 },
    Input: {
      getActiveDeviceType: () => 2,
      getActiveContext: () => 7
    },
    __civ7ControllerBridge: {
      getStatus: () => ({ active: true, fault: null, enabled: true, swapSticks: false,
        invertLeftY: false, invertPanY: false })
    },
    __civ7ControllerMenuNavigation: {
      getStatus: () => { throw new Error('menu status failed'); }
    }
  };
  const viewManager = {
    get current() { return { getName: () => 'WorldView' }; }
  };
  const contextManager = {
    getCurrentTarget: () => ({ tagName: 'PANEL-TEST' })
  };
  const cursor = { get softCursorEnabled() { throw new Error('cursor state failed'); } };
  const engine = { on: (name, fn) => engineEvents.set(name, fn), off: (name, fn) => engineEvents.delete(name) };
  const wind = {
    document: { hidden: true },
    addEventListener: (name, fn) => windowEvents.set(name, fn),
    removeEventListener: (name, fn) => windowEvents.delete(name)
  };
  const timer = callback => { timers.add(callback); return callback; };
  sandbox.__install({ root, storage: f.storage, engine, window: wind, viewManager, contextManager,
    cursor, focus, setInterval: timer, clearInterval: callback => timers.delete(callback), page: 'game' });
  const installed = root.__civ7BetterControllerDiagnosticsV1;
  assert.equal(focusCalls, 1, 'FocusManager is acquired only inside guarded health observation');
  const initial = installed.snapshot().sessions.at(-1).initialHealth;
  assert.equal(initial.view, 'WorldView');
  assert.equal(initial.panel, 'PANEL-TEST');
  assert.equal(initial.device, '2');
  assert.equal(initial.context, '7');
  assert.equal(initial.mapPresent, true);
  assert.equal(initial.menuPresent, true);
  assert.equal(initial.mapFault, undefined);
  assert.equal(initial.menuFault, 'menu status failed');
  assert.equal(initial.persistedSwapSticks, true);
  assert.equal(initial.mapSwapSticks, false);
  assert.equal(initial.menuSwapSticks, undefined);
  assert.ok(String(initial.reason).includes('focus-fault'));

  timers.forEach(callback => callback());
  const latest = installed.snapshot().sessions.at(-1).latestHealth;
  assert.equal(focusCalls, 2);
  assert.equal(latest.focusLocked, true);
  assert.equal(latest.windowHidden, true);
  assert.equal(latest.softCursor, false);
  assert.ok(String(latest.reason).includes('focus-locked'));
  assert.ok(String(latest.reason).includes('window-hidden'));
  assert.ok(!String(latest.reason).includes('focus-fault'));
  assert.equal(latest.persistedSwapSticks, true);
  assert.equal(latest.mapSwapSticks, false);
  installed.dispose();
});

test('throwing optional globals and status getters never stop a later timer tick', () => {
  const f = storageFixture(), engineEvents = new Map(), windowEvents = new Map(), timers = new Set();
  const sandbox = load(f.storage);
  let deviceCalls = 0;
  const root = {
    UI: { isInShell: () => true },
    InputActionStatuses: { START: 1, UPDATE: 2, FINISH: 3, HOLD: 4 },
    Input: {
      getActiveDeviceType: () => {
        deviceCalls++;
        throw new Error(`device getter failed ${deviceCalls}`);
      },
      getActiveContext: () => 0
    },
  };
  Object.defineProperty(root, '__civ7ControllerBridge', {
    get() { throw new Error('presence getter failed'); }, configurable: true
  });
  const engine = { on: (name, fn) => engineEvents.set(name, fn), off: (name, fn) => engineEvents.delete(name) };
  const wind = {
    addEventListener: (name, fn) => windowEvents.set(name, fn),
    removeEventListener: (name, fn) => windowEvents.delete(name)
  };
  const timer = callback => { timers.add(callback); return callback; };
  assert.doesNotThrow(() => sandbox.__install({
    root, storage: f.storage, engine, window: wind, viewManager: {}, contextManager: {}, cursor: {},
    focus: { isFocusLocked: () => false }, setInterval: timer, clearInterval: callback => timers.delete(callback)
  }));
  const installed = root.__civ7BetterControllerDiagnosticsV1;
  assert.doesNotThrow(() => timers.forEach(callback => callback()));
  assert.equal(deviceCalls, 2);
  const health = installed.snapshot().sessions.at(-1).latestHealth;
  assert.ok(String(health.fault).includes('device getter failed'));
  assert.equal(health.mapPresent, false);
  installed.dispose();
});

test('clean storage stays memory-only and still captures initialized evidence', () => {
  const storage = { length: 0, getItem: () => null, setItem: () => { throw new Error('must not write'); }, removeItem: () => {} };
  const sandbox = load(storage);
  const engineEvents = new Map(), windowEvents = new Map(), timers = new Set();
  sandbox.__install({
    root: sandbox, storage, page: 'game',
    engine: { on: (name, fn) => engineEvents.set(name, fn), off: (name, fn) => engineEvents.delete(name) },
    window: { addEventListener: (name, fn) => windowEvents.set(name, fn), removeEventListener: (name, fn) => windowEvents.delete(name) },
    viewManager: {}, contextManager: {}, cursor: {}, focus: {},
    setInterval: callback => { timers.add(callback); return callback; }, clearInterval: callback => timers.delete(callback)
  });
  const installed = sandbox.__civ7BetterControllerDiagnosticsV1;
  const session = installed.snapshot().sessions.at(-1);
  assert.ok(session.events.some(event => String(event.reason).startsWith('startup:')));
  assert.ok(session.initialHealth);
  assert.equal(installed.persistencePaused, true);
  assert.equal(storage.getItem('modSettings'), null);
  installed.dispose();
});

test('throwing localStorage acquisition installs memory-only and still captures raw input', () => {
  const sandbox = load(undefined), engineEvents = new Map(), windowEvents = new Map();
  let storageMutations = 0;
  const root = {
    get localStorage() { throw new Error('storage denied'); },
    set localStorage(value) { storageMutations++; },
    InputActionStatuses: { START: 1 }
  };
  assert.doesNotThrow(() => sandbox.__install({
    root,
    engine: { on: (name, fn) => engineEvents.set(name, fn), off() {} },
    window: { addEventListener: (name, fn) => windowEvents.set(name, fn), removeEventListener() {} },
    viewManager: {}, contextManager: {}, cursor: {}, focus: {},
    setInterval: () => 1, clearInterval() {}
  }));
  engineEvents.get('InputAction')('nav-move', 1, .25, -.5);
  const installed = root.__civ7BetterControllerDiagnosticsV1;
  const session = installed.snapshot().sessions.at(-1);
  assert.equal(storageMutations, 0);
  assert.equal(installed.persistencePaused, true);
  assert.ok(session.events.some(event => String(event.reason).includes('startup:storage denied')));
  assert.ok(session.events.some(event => event.stage === 'raw-engine' && event.action === 'nav-move'));
  installed.dispose();
});

test('malformed status enum and route detail getters cannot escape listeners and later input recovers', () => {
  const f = storageFixture(), sandbox = load(f.storage), engineEvents = new Map(), windowEvents = new Map();
  const statuses = {};
  Object.defineProperty(statuses, 'START', { enumerable: true, get() { throw new Error('enum getter failed'); } });
  const root = { InputActionStatuses: statuses };
  sandbox.__install({
    root, storage: f.storage,
    engine: { on: (name, fn) => engineEvents.set(name, fn), off() {} },
    window: { addEventListener: (name, fn) => windowEvents.set(name, fn), removeEventListener() {} },
    viewManager: {}, contextManager: {}, cursor: {}, focus: {},
    setInterval: () => 1, clearInterval() {}
  });
  assert.doesNotThrow(() => engineEvents.get('InputAction')('nav-move', 1, 0, 1));
  assert.doesNotThrow(() => windowEvents.get('civ7-bcs-diagnostic-route')({
    get detail() { throw new Error('detail failed'); }
  }));
  root.InputActionStatuses = { START: 1 };
  assert.doesNotThrow(() => engineEvents.get('InputAction')('nav-move', 1, 1, 0));
  const events = root.__civ7BetterControllerDiagnosticsV1.snapshot().sessions.at(-1).events;
  assert.ok(events.some(event => event.stage === 'raw-engine' && event.status === '1'));
  assert.ok(events.some(event => event.stage === 'raw-engine' && event.status === 'START'));
  assert.ok(events.some(event => String(event.reason).includes('route:detail failed')));
  root.__civ7BetterControllerDiagnosticsV1.dispose();
});

test('startup status property fault is guarded, timer recovery works, and dispose removes exact listeners', () => {
  const f = storageFixture(), sandbox = load(f.storage), engineEvents = new Map(), windowEvents = new Map(), timers = new Set();
  let broken = true;
  const status = {};
  Object.defineProperty(status, 'active', { get() { if (broken) throw new Error('active failed'); return true; } });
  Object.defineProperty(status, 'fault', { get() { if (broken) throw new Error('fault failed'); return null; } });
  const root = { __civ7ControllerBridge: { getStatus: () => status } };
  const engine = { on: (name, fn) => engineEvents.set(name, fn), off: (name, fn) => { if (engineEvents.get(name) === fn) engineEvents.delete(name); } };
  const wind = { document: {}, addEventListener: (name, fn) => windowEvents.set(name, fn), removeEventListener: (name, fn) => { if (windowEvents.get(name) === fn) windowEvents.delete(name); } };
  assert.doesNotThrow(() => sandbox.__install({
    root, storage: f.storage, engine, window: wind, viewManager: {}, contextManager: {}, cursor: {}, focus: {},
    setInterval: callback => { timers.add(callback); return callback; }, clearInterval: callback => timers.delete(callback)
  }));
  const installed = root.__civ7BetterControllerDiagnosticsV1;
  assert.equal(installed.snapshot().sessions.at(-1).initialHealth.focused, undefined);
  assert.ok(String(installed.snapshot().sessions.at(-1).initialHealth.mapFault).includes('active failed'));
  broken = false;
  timers.forEach(callback => callback());
  assert.equal(installed.snapshot().sessions.at(-1).latestHealth.active, true);
  installed.dispose();
  assert.equal(engineEvents.size, 0);
  assert.equal(windowEvents.size, 0);
  assert.equal(timers.size, 0);
});

test('post-write key-blind ambiguity pauses after one write without rollback or later mutation', () => {
  const f = storageFixture({ blind: true });
  let writes = 0;
  const originalSet = f.storage.setItem;
  f.storage.setItem = (key, value) => {
    writes++;
    originalSet(key, value);
    f.rows.set('foreign-row', 'foreign bytes');
  };
  const sandbox = load(f.storage), engineEvents = new Map();
  sandbox.__install({
    root: sandbox, storage: f.storage,
    engine: { on: (name, fn) => engineEvents.set(name, fn), off() {} },
    window: { addEventListener() {}, removeEventListener() {} },
    viewManager: {}, contextManager: {}, cursor: {}, focus: {}, setInterval: () => 1, clearInterval() {}
  });
  const installed = sandbox.__civ7BetterControllerDiagnosticsV1;
  assert.equal(writes, 1);
  assert.equal(installed.persistencePaused, true);
  assert.equal(f.rows.get('foreign-row'), 'foreign bytes');
  engineEvents.get('InputAction')('nav-move', 1, 0, 1);
  installed.flush();
  assert.equal(writes, 1);
  assert.equal(f.rows.get('foreign-row'), 'foreign bytes');
  installed.dispose();
});
