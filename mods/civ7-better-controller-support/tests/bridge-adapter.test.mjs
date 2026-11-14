import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createBridge } from '../ui/bridge-runtime.js';
import { BridgeSettingsStore } from '../ui/bridge-store.js';

const source = readFileSync(new URL('../ui/controller-bridge.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '');

async function fixture(initial = {}, nativeOnly = false) {
  const engineEvents = new Map(), windowEvents = new Map(), timers = new Set();
  const logs = [], errors = [], children = [];
  const state = { context: 1, blocked: false, rest: false };
  let stored = JSON.stringify(initial);
  const settingsStore = new BridgeSettingsStore({
    getItem: () => stored, setItem: (_key, value) => { stored = value; }
  });
  class Node {
    events = new Map();
    style = {};
    children = [];
    addEventListener(name, fn) { this.events.set(name, fn); }
    appendChild(child) { this.children.push(child); }
    remove() { const index = children.indexOf(this); if (index >= 0) children.splice(index, 1); }
    click() { this.events.get('click')?.({ preventDefault() {}, stopPropagation() {} }); }
  }
  const received = [];
  const originalInput = (...args) => { received.push(args); };
  const actionHandler = { onEngineInput: originalInput };
  const sandbox = vm.createContext({
    NATIVE_INPUT_ONLY: nativeOnly, useStandaloneBridge: false, createBridge, settingsStore, reportSettingsError: error => errors.push(error), ActionHandler: actionHandler,
    Locale: { compose: key => key },
    ContextManager: { isEmpty: true },
    ViewManager: { current: { getInputContext: () => 1 }, isWorldInputAllowed: true, isViewInputAllowed: true },
    Input: { getActiveContext: () => state.context, setActiveContext: x => { state.context = x; } },
    InputContext: { Shell: 0, World: 1, Unit: 2, Dual: 3, INVALID: -1 },
    InputActionStatuses: { START: 1, UPDATE: 2, FINISH: 3, HOLD: 4 },
    InputEngineEvent: class {},
    Cursor: { softCursorEnabled: false, hybridCursorEnabled: false },
    PlotCursor: {},
    CameraController: { onGamepadCameraPan() {} },
    InterfaceMode: { getCurrent: () => 'DEFAULT' },
    FocusManager: { get: () => ({ isWorldFocused: () => true, isFocusLocked: () => state.blocked }) },
    IsControllerActive: () => true,
    UI: { isInShell: () => false },
    localStorage: { getItem: () => stored, setItem: (_key, value) => { stored = value; } },
    document: {
      hidden: false, querySelector: () => state.rest ? {} : null,
      createElement: () => new Node(), body: { appendChild: x => children.push(x) }
    },
    engine: {
      whenReady: Promise.resolve(), on: (n, f) => engineEvents.set(n, f),
      off: (n, f) => { if (engineEvents.get(n) === f) engineEvents.delete(n); }
    },
    window: {
      addEventListener: (n, f) => windowEvents.set(n, f),
      removeEventListener: (n, f) => { if (windowEvents.get(n) === f) windowEvents.delete(n); }
    },
    setInterval: f => { timers.add(f); return f; }, clearInterval: f => timers.delete(f),
    console: { log: value => logs.push(value), warn: value => logs.push(value), error: value => errors.push(value) }
  });
  async function install() { vm.runInContext(`(() => { ${source}\n })()`, sandbox); await Promise.resolve(); }
  await install();
  return { sandbox, install, children, engineEvents, windowEvents, timers, state, errors, received, actionHandler, originalInput, settingsStore,
    stored: () => JSON.parse(stored) };
}

test('actual entry script installs controls, persists toggle, and releases all hooks on unload', async () => {
  const f = await fixture({ showDebug: true });
  assert.deepEqual(f.errors, []);
  assert.equal(f.children.length, 1);
  assert.equal(f.sandbox.__civ7ControllerBridge.getStatus().active, true);
  const [toggle, invert, invertLeft] = f.children[0].children;
  toggle.click();
  assert.equal(f.state.context, 1);
  assert.equal(f.stored().enabled, false);
  invert.click();
  assert.equal(f.stored().invertPanY, false);
  invertLeft.click();
  assert.equal(f.stored().invertLeftY, true);
  assert.equal(f.sandbox.__civ7ControllerBridge.getStatus().invertLeftY, true);
  f.engineEvents.get('BeforeUnload')();
  assert.equal(f.children.length, 0);
  assert.equal(f.engineEvents.size, 0);
  assert.equal(f.windowEvents.size, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.settingsStore.listeners.size, 0);
  assert.equal(f.actionHandler.onEngineInput, f.originalInput);
});

test('actual entry script suspends for Rest Guard and handles reload without duplicate controls', async () => {
  const f = await fixture({ showDebug: true });
  f.state.rest = true; f.engineEvents.get('BeginFrame')();
  assert.equal(f.state.context, 1);
  assert.equal(f.sandbox.__civ7ControllerBridge.getStatus().active, false);
  f.state.rest = false;
  await f.install();
  assert.equal(f.children.length, 1);
  assert.equal(f.timers.size, 1);
  assert.equal(f.settingsStore.listeners.size, 1);
  assert.equal(f.sandbox.__civ7ControllerBridge.getStatus().active, true);
  assert.deepEqual(f.errors, []);
});

test('debug UI defaults hidden for existing users while controller input stays active', async () => {
  const f = await fixture({ enabled: true, invertPanY: false });
  assert.equal(f.children.length, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.sandbox.__civ7ControllerBridge.getStatus().active, true);
  assert.equal(f.sandbox.__civ7ControllerBridge.getStatus().invertPanY, false);
  f.settingsStore.save({ ...f.settingsStore.load(), showDebug: true });
  assert.equal(f.children.length, 1);
  assert.equal(f.timers.size, 1);
  f.settingsStore.save({ ...f.settingsStore.load(), showDebug: false });
  assert.equal(f.children.length, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.sandbox.__civ7ControllerBridge.getStatus().active, true);
  await f.install();
  assert.equal(f.children.length, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.settingsStore.listeners.size, 1);
});

test('settings apply live without enabling debug UI and failed writes leave runtime unchanged', async () => {
  const f = await fixture();
  f.settingsStore.save({ enabled: false, invertLeftY: true, invertPanY: false, showDebug: false });
  assert.equal(f.sandbox.__civ7ControllerBridge.getStatus().invertLeftY, true);
  assert.equal(f.sandbox.__civ7ControllerBridge.getStatus().enabled, false);
  assert.equal(f.state.context, 1);
  assert.equal(f.children.length, 0);
  f.settingsStore.storage.setItem = () => { throw new Error('write failed'); };
  assert.throws(() => f.settingsStore.save({ enabled: true }), /write failed/);
  assert.equal(f.sandbox.__civ7ControllerBridge.getStatus().enabled, false);
});

 test("native input release never installs old axis remapping even with enabled saved settings",async()=>{const f=await fixture({enabled:true},true);assert.equal(f.actionHandler.onEngineInput,f.originalInput);assert.equal(f.engineEvents.size,0);assert.equal(f.children.length,0);});


test('settler lens keeps corrected analog input while its legend owns a stack entry', async () => {
  const f = await fixture({enabled:true, swapSticks:true, invertLeftY:false, invertPanY:false});
  f.sandbox.ViewManager.current.getInputContext = () => 2;
  f.sandbox.InterfaceMode.getCurrent = () => 'INTERFACEMODE_UNIT_SELECTED';
  f.sandbox.ContextManager.isEmpty = false;
  f.sandbox.ContextManager.getCurrentTarget = () => ({tagName:'PANEL-SETTLER-LEGEND'});
  // Native settler legend explicitly selects Unit when it opens/changes its ruler.
  f.state.context = 2;
  f.engineEvents.get('BeginFrame')();
  assert.equal(f.sandbox.__civ7ControllerBridge.getStatus().active,true,
    'a map legend must not turn off the known-good map input compatibility');
  assert.equal(f.state.context,0,'keep the same working Shell mapping as the unit map');
  f.actionHandler.onEngineInput('scroll-pan',4,0,1);
  assert.deepEqual(f.received.at(-1),['plot-move',2,0,1],'configured physical left stick selects plots, not native Unit zoom');
  f.actionHandler.onEngineInput('nav-move',4,0.6,0.8);
  assert.deepEqual(f.received.at(-1),['camera-pan',2,0.6,0.8]);
  f.actionHandler.onEngineInput('shell-action-1',1,0,0);
  f.actionHandler.onEngineInput('shell-action-1',3,0,0);
  assert.deepEqual(f.received.at(-1),['shell-action-1',3,0,0],'legend ruler shortcut must not become unit-move');
  f.engineEvents.get('BeforeUnload')();
  assert.equal(f.state.context,2,'closing compatibility restores the legend Unit context');
});

test('merchant list and dialogs still keep native navigation above a map legend', async () => {
  for (const tagName of ['TRADE-ROUTE-CHOOSER','DIALOG-BOX','PANEL-RADIAL-MENU']) {
    const f = await fixture({enabled:true,swapSticks:true});
    f.sandbox.ViewManager.current.getInputContext = () => 2;
    f.sandbox.ContextManager.isEmpty = false;
    f.sandbox.ContextManager.getCurrentTarget = () => ({tagName});
    f.state.context=0;
    f.engineEvents.get('BeginFrame')();
    assert.equal(f.sandbox.__civ7ControllerBridge.getStatus().active,false,tagName);
    f.actionHandler.onEngineInput('nav-move',2,0,1);
    assert.deepEqual(f.received.at(-1),['nav-move',2,0,1]);
    f.engineEvents.get('BeforeUnload')();
  }
});
