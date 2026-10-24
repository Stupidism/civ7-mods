import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createMenuNavigation } from '../ui/menu-navigation.js';
import { BridgeSettingsStore } from '../ui/bridge-store.js';

const source = readFileSync(new URL('../ui/menu-navigation-adapter.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export function ', 'function ');
function fixture() {
  const state = { shell: true, panel: false, blocked: false, soft: false };
  const events = [], logs = [], windowEvents = new Map(), engineEvents = new Map();
  let stored = '{}';
  const store = new BridgeSettingsStore({ getItem: () => stored, setItem: (_, value) => { stored = value; } });
  const original = (...args) => events.push(args);
  const handler = { onEngineInput: original };
  const sandbox = vm.createContext({
    createMenuNavigation, ActionHandler: handler,
    Cursor: { get softCursorEnabled() { return state.soft; } },
    ContextManager: { get isEmpty() { return !state.panel; }, getCurrentTarget: () => state.panel ? { tagName: 'PANEL-RADIAL-MENU' } : null },
    InputActionStatuses: { START: 1, UPDATE: 2, FINISH: 3, HOLD: 4 }, InputDeviceType: { Controller: 2 },
    Input: { getActiveDeviceType: () => 2, getActiveContext: () => 0 }, UI: { isInShell: () => state.shell },
    document: { hidden: false, querySelector: () => state.blocked ? {} : null },
    window: { addEventListener: (n, f) => windowEvents.set(n, f), removeEventListener: (n, f) => { if (windowEvents.get(n) === f) windowEvents.delete(n); } },
    engine: { on: (n, f) => engineEvents.set(n, f), off: (n, f) => { if (engineEvents.get(n) === f) engineEvents.delete(n); } },
    console: { warn: x => logs.push(x), error: x => logs.push(x) }
  });
  vm.runInContext(source, sandbox);
  const install = () => sandbox.installMenuNavigation(store);
  install();
  return { state, handler, original, store, install, events, logs, windowEvents, engineEvents };
}

test('shell adapter works before a game loads, follows settings, logs only on request and unloads', () => {
  const f = fixture();
  f.handler.onEngineInput('nav-move', 4, 0, 1);
  assert.deepEqual(f.events.at(-1), ['nav-move', 2, 0, 1]); assert.equal(f.logs.length, 0);
  f.store.save({ ...f.store.load(), showDebug: true });
  f.handler.onEngineInput('nav-move', 4, 0, 1);
  assert.match(f.logs.at(-1), /ControllerBridge:MenuInput.*shell/);
  f.windowEvents.get('blur')(); f.handler.onEngineInput('nav-move', 4, 0, 1);
  assert.equal(f.events.at(-1)[1], 4);
  f.windowEvents.get('focus')();
  f.store.save({ ...f.store.load(), enabled: false }); f.handler.onEngineInput('nav-move', 4, 0, 1);
  assert.equal(f.events.at(-1)[1], 4);
  f.engineEvents.get('BeforeUnload')();
  assert.equal(f.handler.onEngineInput, f.original);
  assert.equal(f.store.listeners.size, 0); assert.equal(f.windowEvents.size, 0); assert.equal(f.engineEvents.size, 0);
});

test('game adapter repairs only panels and respects overlays, soft cursor and repeat installation', () => {
  const f = fixture(); f.state.shell = false;
  f.handler.onEngineInput('nav-move', 4, 0, 1); assert.equal(f.events.at(-1)[1], 4);
  f.state.panel = true;
  f.handler.onEngineInput('nav-move', 4, 0, 1); assert.equal(f.events.at(-1)[1], 2);
  for (const key of ['blocked', 'soft']) {
    f.state[key] = true;
    f.handler.onEngineInput('nav-move', 4, 0, 1); assert.equal(f.events.at(-1)[1], 4);
    f.state[key] = false;
  }
  f.install(); f.install();
  assert.equal(f.store.listeners.size, 1); assert.equal(f.windowEvents.size, 3); assert.equal(f.engineEvents.size, 1);
  const before = f.events.length;
  f.handler.onEngineInput('nav-move', 4, 0, 1);
  assert.equal(f.events.length, before + 1); assert.equal(f.events.at(-1)[1], 2);
});
