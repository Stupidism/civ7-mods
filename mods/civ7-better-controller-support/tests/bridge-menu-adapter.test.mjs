import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createMenuNavigation } from '../ui/menu-navigation.js';
import { createBridge } from '../ui/bridge-runtime.js';
import { BridgeSettingsStore } from '../ui/bridge-store.js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import {
  exportedFunctionNames,
  menuNavigationAdapterSource
} from './helpers/native-navigation-tray.mjs';

const modules = process.env.CIV7_MODULES_DIR || join(homedir(), "Library/Application Support/Steam/steamapps/common/Sid Meier's Civilization VII/CivilizationVII.app/Contents/Resources/Base/modules");
const narrativeFile = join(modules, 'base-standard/ui-next/screens/narrative-events/small-narrative-event.js');

const source = menuNavigationAdapterSource();
function fixture(initial = {}) {
  const state = { shell: true, panel: false, tagName: 'PANEL-RADIAL-MENU', blocked: false, soft: false, viewContext: 1, context: 0 };
  const events = [], logs = [], windowEvents = new Map(), engineEvents = new Map();
  let stored = JSON.stringify(initial);
  const store = new BridgeSettingsStore({ getItem: () => stored, setItem: (_, value) => { stored = value; } });
  const original = (...args) => events.push(args);
  const handler = { onEngineInput: original };
  const sandbox = vm.createContext({
    createScrollNavigation: () => undefined, setInstruction: () => {}, createMenuNavigation, ActionHandler: handler,
    NavTray: null,
    Cursor: { get softCursorEnabled() { return state.soft; } },
    ContextManager: { get isEmpty() { return !state.panel; }, getCurrentTarget: () => state.panel ? { tagName: state.tagName } : null },
    InputContext: { Shell: 0, World: 1, Unit: 2, Dual: 3 },
    ViewManager: { current: { getInputContext: () => state.viewContext, getName: () => state.viewName || (state.viewContext === 0 ? 'Diplomacy' : 'World') } },
    FocusManager: { get: () => ({ isFocusLocked: () => !!state.focusLocked }) },
    InputActionStatuses: { START: 1, UPDATE: 2, FINISH: 3, HOLD: 4 }, InputDeviceType: { Controller: 2 },
    Input: { getActiveDeviceType: () => 2, getActiveContext: () => state.context, setActiveContext: value => { state.context = value; } }, UI: { isInShell: () => state.shell },
    document: { hidden: false, querySelector: () => state.blocked ? {} : null },
    window: { addEventListener: (n, f) => windowEvents.set(n, f), removeEventListener: (n, f) => { if (windowEvents.get(n) === f) windowEvents.delete(n); } },
    engine: { on: (n, f) => engineEvents.set(n, f), off: (n, f) => { if (engineEvents.get(n) === f) engineEvents.delete(n); } },
    console: { warn: x => logs.push(x), error: x => logs.push(x) }
  });
  vm.runInContext(source, sandbox, { filename: menuNavigationAdapterSource.name });
  const install = () => sandbox.installMenuNavigation(store);
  install();
  return { state, handler, original, store, install, events, logs, windowEvents, engineEvents, sandbox };
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

test('offline adapter loader handles every exported declaration in the current multi-export source', () => {
  const names = exportedFunctionNames(readFileSync(new URL('../ui/menu-navigation-adapter.js', import.meta.url), 'utf8'));
  assert.ok(names.includes('createNavigationTrayAdapter') && names.includes('installMenuNavigation'));
  assert.doesNotMatch(source, /(^|\n)\s*export\s+/);
  const sandbox = vm.createContext({ NavTray: null });
  vm.runInContext(source, sandbox);
  for (const name of names) assert.equal(typeof sandbox[name], 'function', name);
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
  assert.equal(f.store.listeners.size, 1); assert.equal(f.windowEvents.size, 3); assert.equal(f.engineEvents.size, 3);
  const before = f.events.length;
  f.handler.onEngineInput('nav-move', 4, 0, 1);
  assert.equal(f.events.length, before + 1); assert.equal(f.events.at(-1)[1], 2);
});

test('stackless Shell views normalize holds, preserve buttons and D-pad, and release back to World', () => {
  const f = fixture(); f.state.shell = false; f.state.viewContext = 0;
  f.handler.onEngineInput('nav-move', 4, 1, 0);
  assert.deepEqual(f.events.at(-1), ['nav-move', 2, 1, 0]);
  for (const name of ['accept', 'cancel', 'nav-left', 'nav-right']) {
    f.handler.onEngineInput(name, 3, 0, 0);
    assert.deepEqual(f.events.at(-1), [name, 3, 0, 0]);
  }
  f.state.blocked = true; f.handler.onEngineInput('nav-move', 4, 1, 0);
  assert.equal(f.events.at(-1)[1], 4);
  f.state.blocked = false; f.state.viewContext = 1;
  // Active device context remains Shell, but the actual view is now World.
  f.handler.onEngineInput('nav-move', 4, 1, 0);
  assert.equal(f.events.at(-1)[1], 4);
});

test('saved stick swap reaches shell and pause navigation while inversion, buttons and guards stay native', () => {
  const f = fixture({ enabled: true, swapSticks: true, invertLeftY: true, invertPanY: true });
  for (const shell of [true, false]) {
    Object.assign(f.state, { shell, panel: false, viewName: 'PauseMenu', viewContext: 0 });
    for (const status of [1, 2, 3, 4]) {
      f.handler.onEngineInput('scroll-pan', status, 0, 1);
      assert.deepEqual(f.events.at(-1), ['nav-move', status === 4 ? 2 : status, 0, 1]);
      f.handler.onEngineInput('nav-move', status, 0, -1);
      assert.deepEqual(f.events.at(-1), ['scroll-pan', status, 0, -1]);
    }
    for (const name of ['accept', 'cancel', 'nav-left', 'nav-right']) {
      f.handler.onEngineInput(name, 3, 0, 0);
      assert.deepEqual(f.events.at(-1), [name, 3, 0, 0]);
    }
  }
  for (const key of ['blocked', 'soft']) {
    f.state[key] = true;
    f.handler.onEngineInput('scroll-pan', 4, 0, 1);
    assert.deepEqual(f.events.at(-1), ['scroll-pan', 4, 0, 1]);
    f.state[key] = false;
  }
  f.windowEvents.get('blur')();
  f.handler.onEngineInput('scroll-pan', 4, 0, 1);
  assert.deepEqual(f.events.at(-1), ['scroll-pan', 4, 0, 1]);
  f.windowEvents.get('focus')();
  f.store.save({ ...f.store.load(), enabled: false });
  f.handler.onEngineInput('scroll-pan', 4, 0, 1);
  assert.deepEqual(f.events.at(-1), ['scroll-pan', 4, 0, 1]);
  f.store.save({ ...f.store.load(), enabled: true, swapSticks: false });
  f.handler.onEngineInput('nav-move', 4, 0, 1);
  assert.deepEqual(f.events.at(-1), ['nav-move', 2, 0, 1]);
  f.engineEvents.get('BeforeUnload')();
});

test('native small narrative Dual context yields to calibrated menu sticks and D-pad', { skip: !existsSync(narrativeFile) }, () => {
  const f = fixture({ enabled: true, swapSticks: true });
  Object.assign(f.state, { shell: false, panel: true, tagName: 'SMALL-NARRATIVE-EVENT', viewName: 'World', viewContext: 1 });
  // Replay the real component registration: its factory sets Dual, not Shell.
  Object.assign(f.sandbox, { defineLegacyComponent: (_name, _attrs, factory) => factory(),
    createComponent: () => {}, SmallNarrativeEventAnchor: () => {} });
  const native = readFileSync(narrativeFile, 'utf8');
  vm.runInContext(native.slice(native.indexOf('defineLegacyComponent("small-narrative-event"'), native.indexOf('ComponentRegistry.register')), f.sandbox);
  assert.equal(f.state.context, 3);
  f.handler.onEngineInput('scroll-pan', 4, 0, 1);
  assert.equal(f.state.context, 0, 'choice popup must use Shell instead of leaving map/camera Dual controls active');
  assert.deepEqual(f.events.at(-1), ['nav-move', 2, 0, 1]);
  for (const name of ['nav-up', 'nav-down', 'nav-left', 'nav-right']) {
    f.handler.onEngineInput(name, 1, 0, 0);
    f.handler.onEngineInput(name, 3, 0, 0);
    assert.deepEqual(f.events.at(-1), [name, 3, 0, 0]);
  }
  f.store.save({ ...f.store.load(), enabled: false });
  assert.equal(f.state.context, 3, 'turning compatibility off restores native narrative input');
  f.engineEvents.get('BeforeUnload')();
});

test('narrative context ownership respects locks, new panels, device changes and map return', () => {
  const f = fixture({ enabled: true, swapSticks: true });
  Object.assign(f.state, { shell: false, panel: true, tagName: 'SMALL-NARRATIVE-EVENT', viewContext: 1, context: 3 });
  const tick = () => f.engineEvents.get('BeginFrame')();
  for (const key of ['focusLocked', 'blocked', 'soft']) {
    f.state[key] = true; tick();
    assert.equal(f.state.context, 3, key);
    f.state[key] = false; tick();
    assert.equal(f.state.context, 0);
    f.state[key] = true; tick();
    assert.equal(f.state.context, 3, `${key} restores the native context`);
    f.state[key] = false;
  }
  tick();
  f.windowEvents.get('blur')();
  assert.equal(f.state.context, 3);
  f.windowEvents.get('focus')();
  assert.equal(f.state.context, 0);
  f.sandbox.Input.getActiveDeviceType = () => 0;
  tick(); assert.equal(f.state.context, 3);
  f.sandbox.Input.getActiveDeviceType = () => 2;
  tick(); assert.equal(f.state.context, 0);
  f.state.tagName = 'DIALOG-BOX'; tick();
  assert.equal(f.state.context, 0, 'do not restore Dual over the next dialog');
  f.state.tagName = 'SMALL-NARRATIVE-EVENT'; tick();
  f.state.panel = false; tick();
  assert.equal(f.state.context, 1, 'restore World on return to an empty stack');
  assert.equal(f.events.length, 0, 'context changes never activate a choice');
  f.engineEvents.get('BeforeUnload')();
});

test('map and menu hooks apply stick swap once in either order, including settler and merchant panels', () => {
  const contexts = { Shell: 0, World: 1, Unit: 2, INVALID: -1 };
  for (const menuFirst of [true, false]) {
    const f = fixture({ enabled: true, swapSticks: true });
    if (!menuFirst) f.engineEvents.get('BeforeUnload')();
    const bridge = createBridge({
      actionHandler: f.handler, input: f.sandbox.Input, contexts,
      statuses: { START: 1, UPDATE: 2, FINISH: 3, HOLD: 4 },
      enabled: true, swapSticks: true, invertLeftY: false, invertPanY: false,
      stopMotion() {}, snapshot: () => ({
        controller: true, viewContext: f.state.viewContext, mode: 'UNIT_SELECTED',
        panelPresent: f.state.panel, mapOverlay: f.state.panel && f.state.tagName === 'PANEL-SETTLER-LEGEND',
        panelContext: contexts.Unit, worldAllowed: true, viewAllowed: true, worldFocused: true
      })
    });
    if (!menuFirst) f.install();
    for (const [tagName, viewContext, viewName, leftSource, leftName, rightName] of [
      [null, 1, 'World', 'scroll-pan', 'plot-move', 'camera-pan'],
      [null, 0, 'PauseMenu', 'scroll-pan', 'nav-move', 'scroll-pan'],
      ['SCREEN-OPTIONS', 0, 'PauseMenu', 'scroll-pan', 'nav-move', 'scroll-pan'],
      ['TRADE-ROUTE-CHOOSER', 2, 'UnitSelected', 'nav-move', 'nav-move', 'scroll-pan'],
      ['PANEL-SETTLER-LEGEND', 2, 'UnitSelected', 'scroll-pan', 'plot-move', 'camera-pan'],
      ['SMALL-NARRATIVE-EVENT', 1, 'World', 'scroll-pan', 'nav-move', 'scroll-pan'],
      ['DIALOG-BOX', 2, 'UnitSelected', 'nav-move', 'nav-move', 'scroll-pan'],
      [null, 0, 'Diplomacy', 'nav-move', 'nav-move', 'scroll-pan'],
      [null, 1, 'World', 'scroll-pan', 'plot-move', 'camera-pan']
    ]) {
      Object.assign(f.state, { shell: false, panel: !!tagName, tagName, viewContext, viewName });
      f.state.context = leftName === 'nav-move' ? contexts.Shell : viewContext;
      bridge.tick();
      const before = f.events.length;
      f.handler.onEngineInput(leftSource, 4, 0, 1);
      f.handler.onEngineInput(leftSource === 'scroll-pan' ? 'nav-move' : 'scroll-pan', 4, 0.6, 0.8);
      assert.deepEqual(f.events.slice(before), [[leftName, 2, 0, 1],
        [rightName, rightName === 'scroll-pan' ? 4 : 2, 0.6, 0.8]], `${menuFirst}:${tagName}:${viewContext}`);
      f.handler.onEngineInput(leftSource, 3, 0, 0);
      f.handler.onEngineInput(leftSource === 'scroll-pan' ? 'nav-move' : 'scroll-pan', 3, 0, 0);
    }
    bridge.dispose();
    f.engineEvents.get('BeforeUnload')();
  }
});
