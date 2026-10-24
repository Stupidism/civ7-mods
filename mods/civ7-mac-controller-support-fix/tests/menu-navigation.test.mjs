import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createMenuNavigation } from '../ui/menu-navigation.js';
import { createBridge } from '../ui/bridge-runtime.js';

const statuses = { START: 1, UPDATE: 2, FINISH: 3, HOLD: 4 };
const modules = process.env.CIV7_MODULES_DIR || join(homedir(), "Library/Application Support/Steam/steamapps/common/Sid Meier's Civilization VII/CivilizationVII.app/Contents/Resources/Base/modules");
const available = existsSync(join(modules, 'core/ui/input/action-handler.js'));
const navigation = { NONE: 0, UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, NEXT: 16, PREVIOUS: 32 };
class NavEvent extends Event {
  constructor(name, options) { super(name, options); this.detail = options.detail; }
  getDirection() { return this.detail.navigation; }
}
const nativeCode = path => readFileSync(join(modules, path), 'utf8').replace(/^import .*;\r?\n/gm, '');

function fixture(type = 'main') {
  const state = { menu: true, controller: true, softCursor: false, blocked: false, focused: true, scope: type };
  const received = [], engineEvents = new Map(), components = new Map(), reports = [];
  const focus = {}, root = { isSameNode: x => x === root, contains: () => true };
  let consumer;
  const sandbox = vm.createContext({
    InputActionStatuses: statuses, InputNavigationAction: navigation,
    InputDeviceType: { Mouse: 0, Controller: 2 }, InputDeviceLayout: { Unknown: 0 },
    Input: { getActiveDeviceType: () => 2 }, Cursor: { softCursorEnabled: false },
    DebugInput: { sendTunerActionA: () => true, sendTunerActionB: () => true },
    AnalogInput: { deadzoneThreshold: 0.2 }, NavigateInputEvent: NavEvent, NavigateInputEventName: 'navigate-input',
    UpdateGate: class { call() {} }, Component: class {}, Panel: class {},
    Controls: { define(name, info) { components.set(name, info.createInstance); } },
    NavigationRule: {}, NavigationHandlers: {}, styles: {}, RibbonYieldType: {}, registerRadialMenu() {},
    FocusManager: { get: () => ({ setFocus() {} }) },
    Framework: { ContextManager: { handleNavigation(event) {
      received.push(event.detail); if (!state.blocked) consumer.handleNavigation(event);
    } } },
    engine: { on: (name, fn) => engineEvents.set(name, fn), whenReady: { then() {} } },
    window: { dispatchEvent() {} }, UI: { hideCursor() {} }, console
  });
  vm.runInContext(nativeCode('core/ui/input/action-handler.js').replace(/const ActionHandler = ActionHandlerSingleton\.getInstance\(\);[\s\S]*$/, 'globalThis.handler = ActionHandlerSingleton.getInstance();'), sandbox);
  if (type === 'main') {
    vm.runInContext(nativeCode('core/ui/components/fxs-slot.js').replace(/^export .*;\r?\n/gm, ''), sandbox);
    const proto = components.get('fxs-slot').prototype;
    consumer = { Root: root, focusManager: { currentFocus: () => focus }, index: 0,
      lastEventTimeStamp: 0, repeatThreshold: 0,
      resetRepeatThreshold: proto.resetRepeatThreshold,
      navigate(direction) { this.index += direction === navigation.UP ? -1 : 1; return false; },
      handleNavigation: proto.handleNavigation };
  } else {
    vm.runInContext(nativeCode('core/ui/radial-menu/panel-radial-menu.js').replace(/^export .*;\r?\n/gm, ''), sandbox);
    consumer = new (components.get('panel-radial-menu'))(root);
    consumer.menus = [{ items: [{ positionDeg: 0 }, { positionDeg: 90 }, { positionDeg: 180 }, { positionDeg: 270 }] }];
    consumer.currentMenuFocusItemIndex = 0;
  }
  const original = sandbox.handler.onEngineInput;
  const patch = createMenuNavigation({ actionHandler: sandbox.handler, statuses, snapshot: () => ({ ...state }), report: x => reports.push(x) });
  return { state, received, consumer, patch, reports, handler: sandbox.handler, original,
    emit: (...args) => engineEvents.get('InputAction')(...args) };
}

test('native main-menu slot navigates from a held analog sample', { skip: !available }, () => {
  const f = fixture();
  f.emit('nav-move', statuses.START, 0, 1);
  f.emit('nav-move', statuses.HOLD, 0, 1);
  assert.equal(f.consumer.index, -1);
  assert.equal(f.received.at(-1).status, statuses.UPDATE);
});

test('native radial panel selects the left-stick direction behind a suspended map bridge', { skip: !available }, () => {
  const f = fixture('radial');
  createBridge({ actionHandler: f.handler, statuses, contexts: { Shell: 0, World: 1, Unit: 2 },
    input: { getActiveContext: () => 0, setActiveContext() {} }, stopMotion() {},
    snapshot: () => ({ controller: true, viewContext: 1, panelPresent: true, worldAllowed: true, viewAllowed: true }) });
  f.emit('nav-move', statuses.HOLD, 0, 1);
  assert.equal(f.consumer.currentMenuFocusItemIndex, 1);
  f.emit('nav-move', statuses.HOLD, -1, 0);
  assert.equal(f.consumer.currentMenuFocusItemIndex, 2);
});

test('menu normalization does not alter map, buttons, right stick, blockers or normal analog phases', () => {
  const state = { menu: true, controller: true, focused: true };
  const calls = [], handler = { onEngineInput(...args) { calls.push(args); return 'result'; } };
  const patch = createMenuNavigation({ actionHandler: handler, statuses, snapshot: () => state });
  for (const [key, value] of [['menu', false], ['controller', false], ['focused', false], ['blocked', true], ['softCursor', true]]) {
    const old = state[key]; state[key] = value;
    handler.onEngineInput('nav-move', statuses.HOLD, 0, 1);
    assert.deepEqual(calls.at(-1), ['nav-move', statuses.HOLD, 0, 1]); state[key] = old;
  }
  for (const name of ['scroll-pan', 'plot-move', 'camera-pan', 'nav-up', 'nav-down', 'accept', 'cancel']) {
    handler.onEngineInput(name, statuses.HOLD, 0.4, 0.8);
    assert.deepEqual(calls.at(-1), [name, statuses.HOLD, 0.4, 0.8]);
  }
  for (const status of [statuses.START, statuses.UPDATE, statuses.FINISH]) {
    handler.onEngineInput('nav-move', status, 0.4, 0.8);
    assert.deepEqual(calls.at(-1), ['nav-move', status, 0.4, 0.8]);
  }
  handler.onEngineInput('nav-move', statuses.HOLD, 0, 0);
  assert.deepEqual(calls.at(-1), ['nav-move', statuses.UPDATE, 0, 0]);
  patch.setConfig({ enabled: false });
  handler.onEngineInput('nav-move', statuses.HOLD, 0, 1);
  assert.equal(calls.at(-1)[1], statuses.HOLD);
});

test('diagnostics are opt-in, bounded, and cannot replay or block delegated input', () => {
  const reports = [], state = { menu: true, controller: true, scope: 'shell' };
  let calls = 0;
  const original = () => { calls++; throw new Error('delegate acted before throwing'); };
  const handler = { onEngineInput: original };
  const patch = createMenuNavigation({ actionHandler: handler, statuses, snapshot: () => state, report: x => reports.push(x) });
  assert.throws(() => handler.onEngineInput('nav-move', statuses.HOLD, 0, 1), /delegate acted/);
  assert.equal(calls, 1); assert.equal(reports.length, 0);
  patch.setConfig({ showDebug: true });
  for (let i = 0; i < 100; i++) {
    state.scope = String(i);
    assert.throws(() => handler.onEngineInput('nav-move', statuses.HOLD, 0, 1));
  }
  assert.equal(reports.length, 32);
  assert.equal(reports[0].status, statuses.HOLD); assert.equal(reports[0].outputStatus, statuses.UPDATE);
  const retained = handler.onEngineInput;
  const outer = handler.onEngineInput = (...args) => retained(...args);
  patch.dispose();
  assert.equal(handler.onEngineInput, outer);
  assert.throws(() => handler.onEngineInput('nav-move', statuses.HOLD, 0, 1));
  assert.equal(calls, 102);
});
