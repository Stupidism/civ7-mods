import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createMenuNavigation } from '../ui/menu-navigation.js';
import { createBridge } from '../ui/bridge-runtime.js';
import { createNativeNavigationTray, menuNavigationAdapterSource } from './helpers/native-navigation-tray.mjs';

const statuses = { START: 1, UPDATE: 2, FINISH: 3, HOLD: 4 };
const modules = process.env.CIV7_MODULES_DIR || join(homedir(), "Library/Application Support/Steam/steamapps/common/Sid Meier's Civilization VII/CivilizationVII.app/Contents/Resources/Base/modules");
const available = existsSync(join(modules, 'core/ui/input/action-handler.js'));
const navigation = { NONE: 0, UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, NEXT: 16, PREVIOUS: 32 };
class NavEvent extends Event {
  constructor(name, options) { super(name, options); this.detail = options.detail; }
  getDirection() { return this.detail.navigation; }
}
class EngineEvent extends Event {
  constructor(name, status, x, y) {
    super('engine-input', { cancelable: true });
    this.detail = { name, status, x, y };
  }
}
const nativeCode = path => readFileSync(join(modules, path), 'utf8').replace(/^import .*;\r?\n/gm, '');

function fixture(type = 'main') {
  const state = { menu: true, swapRoles: type === 'main' || type === 'pause', controller: true, softCursor: false, blocked: false, focused: true, scope: type };
  const received = [], actions = [], engineEvents = new Map(), components = new Map(), reports = [];
  const focus = {}, root = { isSameNode: x => x === root, contains: () => true };
  let consumer;
  const sandbox = vm.createContext({
    InputActionStatuses: statuses, InputNavigationAction: navigation,
    InputDeviceType: { Mouse: 0, Controller: 2 }, InputDeviceLayout: { Unknown: 0 },
    Input: { getActiveDeviceType: () => 2 }, Cursor: { softCursorEnabled: false },
    DebugInput: { sendTunerActionA: () => true, sendTunerActionB: () => true },
    AnalogInput: { deadzoneThreshold: 0.2 }, NavigateInputEvent: NavEvent, NavigateInputEventName: 'navigate-input',
    InputEngineEvent: EngineEvent, InputEngineEventName: 'engine-input',
    UpdateGate: class { call() {} }, Component: class {}, Panel: class {},
    Controls: { define(name, info) { components.set(name, info.createInstance); } },
    NavigationRule: {}, NavigationHandlers: {}, styles: {}, RibbonYieldType: {}, registerRadialMenu() {},
    FocusManager: { get: () => ({ setFocus() {}, isFocusLocked: () => false }) },
    Framework: { ContextManager: { handleNavigation(event) {
      received.push(event.detail); if (!state.blocked) consumer.handleNavigation(event);
    }, handleInput(event) { actions.push(event.detail); return false; } } },
    engine: { on: (name, fn) => engineEvents.set(name, fn), whenReady: { then() {} } },
    window: { dispatchEvent() {} }, UI: { hideCursor() {} }, console
  });
  vm.runInContext(nativeCode('core/ui/input/action-handler.js').replace(/const ActionHandler = ActionHandlerSingleton\.getInstance\(\);[\s\S]*$/, 'globalThis.handler = ActionHandlerSingleton.getInstance();'), sandbox);
  if (type === 'narrative') {
    // The screenshot uses the Solid Panel, whose START/UPDATE/FINISH handling
    // differs from legacy slots. Execute that exact installed handler offline.
    const source = nativeCode('core/ui-next/components/panel.js');
    const start = source.indexOf('  function onNavigate(');
    const end = source.indexOf('  function onEngineInput(', start);
    assert.ok(start > 0 && end > start);
    state.clock = 1000;
    Object.assign(sandbox, { Date: { now: () => state.clock },
      hotkeyProvider: { onInput: () => false },
      focusProvider: { index: 1, navigate(direction) {
        this.index = Math.max(0, Math.min(1, this.index + (direction === navigation.UP ? -1 : 1)));
        return true;
      } } });
    vm.runInContext('const NAV_REPEAT_INITIAL_THRESHOLD = 400, NAV_REPEAT_THRESHOLD = 150;\n' +
      'let navRepeatThreshold = 0, navRepeatTimestamp = 0;\n' + source.slice(start, end) +
      '\nglobalThis.nativePanelNavigate = onNavigate;', sandbox);
    consumer = { get index() { return sandbox.focusProvider.index; }, handleNavigation: sandbox.nativePanelNavigate };
  } else if (['main', 'pause', 'merchant', 'diplomacy'].includes(type)) {
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
  let patch;
  if (['diplomacy', 'pause', 'narrative'].includes(type)) {
    Object.assign(sandbox, { createScrollNavigation: () => undefined, setInstruction: () => {}, createMenuNavigation, ActionHandler: sandbox.handler,
      InputContext: { Shell: 0, World: 1, Unit: 2, Dual: 3 },
      ContextManager: { isEmpty: true, getCurrentTarget: () => null },
      ViewManager: { current: null, addHandler(view) { this.current = view; } },
      document: { hidden: false, querySelector: () => state.blocked ? {} : null } });
    state.context = type === 'narrative' ? 3 : 0;
    sandbox.Input.getActiveContext = () => state.context;
    sandbox.Input.setActiveContext = value => { state.context = value; };
    sandbox.UI.isInShell = () => false;
    sandbox.window.addEventListener = () => {};
    sandbox.window.removeEventListener = () => {};
    sandbox.engine.off = () => {};
    if (type === 'narrative') {
      sandbox.ContextManager.isEmpty = false;
      sandbox.ContextManager.getCurrentTarget = () => ({ tagName: 'SMALL-NARRATIVE-EVENT' });
      sandbox.ViewManager.current = { getInputContext: () => 1, getName: () => 'World' };
    } else {
      const viewFile = type === 'pause' ? 'view-pause-menu.js' : 'view-diplomacy.js';
      vm.runInContext(nativeCode(`base-standard/ui/views/${viewFile}`).replace(/^export .*;\r?\n/gm, ''), sandbox);
    }
    sandbox.NavTray = createNativeNavigationTray();
    vm.runInContext(menuNavigationAdapterSource(), sandbox);
    let configListener;
    const dispose = sandbox.installMenuNavigation({load:()=>({enabled:true}),subscribe:fn=>{configListener=fn;return()=>{};}});
    patch = { dispose, setConfig: config => configListener(config) };
  } else patch = createMenuNavigation({ actionHandler: sandbox.handler, statuses, snapshot: () => ({ ...state }), report: x => reports.push(x) });
  return { state, received, actions, consumer, patch, reports, handler: sandbox.handler, original,
    emit: (...args) => engineEvents.get('InputAction')(...args) };
}

test('native main-menu slot navigates from a held analog sample', { skip: !available }, () => {
  const f = fixture();
  f.emit('nav-move', statuses.START, 0, 1);
  f.emit('nav-move', statuses.HOLD, 0, 1);
  assert.equal(f.consumer.index, -1);
  assert.equal(f.received.at(-1).status, statuses.UPDATE);
});

test('stick-role swap moves native menu focus with the calibrated left stream, not the right', { skip: !available }, () => {
  for (const type of ['main', 'pause']) {
    const f = fixture(type);
    f.patch.setConfig({ enabled: true, swapSticks: true, invertLeftY: true, invertPanY: true });
    // With the user's reversed device roles, physical left arrives as scroll-pan.
    f.emit('scroll-pan', statuses.START, 0, 1);
    f.emit('scroll-pan', statuses.HOLD, 0, 1);
    assert.equal(f.consumer.index, -1, `${type}: calibrated left must move focus upward`);
    f.emit('scroll-pan', statuses.FINISH, 0, 0);
    const count = f.received.length;
    f.emit('nav-move', statuses.START, 0, -1);
    f.emit('nav-move', statuses.HOLD, 0, -1);
    f.emit('nav-move', statuses.FINISH, 0, 0);
    assert.equal(f.consumer.index, -1, `${type}: physical right must not move focus`);
    assert.equal(f.received.length, count);
    assert.equal(f.actions.at(-1).name, 'scroll-pan', 'right keeps native scrolling semantics');
    f.patch.dispose();
  }
});

test('native narrative Panel navigates with calibrated left stick and D-pad without choosing or zooming', { skip: !available }, () => {
  const f = fixture('narrative');
  f.patch.setConfig({ enabled: true, swapSticks: true });
  assert.equal(f.state.context, 0);
  f.emit('scroll-pan', statuses.START, 0, 1);
  f.state.clock += 450;
  f.emit('scroll-pan', statuses.HOLD, 0, 1);
  assert.equal(f.consumer.index, 0, 'held left stream navigates through actual Solid Panel timing');
  f.emit('scroll-pan', statuses.FINISH, 0, 0);
  f.emit('nav-down', statuses.START, 0, 0);
  f.emit('nav-down', statuses.FINISH, 0, 0);
  assert.equal(f.consumer.index, 1, 'D-pad down changes the choice focus');
  f.emit('nav-up', statuses.START, 0, 0);
  f.emit('nav-up', statuses.FINISH, 0, 0);
  assert.equal(f.consumer.index, 0, 'D-pad up changes focus back');
  for (const name of ['camera-zoom-in', 'camera-zoom-out', 'camera-pan', 'plot-move']) {
    f.emit(name, statuses.START, 1, 1);
    f.emit(name, statuses.HOLD, 1, 1);
  }
  f.emit('camera-zoom-in', statuses.FINISH, 1, 0);
  f.emit('camera-zoom-out', statuses.FINISH, 1, 0);
  assert.equal(f.actions.length, 0, 'no world motion or narrative choice action is emitted');
  const count = f.received.length;
  f.emit('nav-move', statuses.START, 0, -1);
  f.emit('nav-move', statuses.HOLD, 0, -1);
  f.emit('nav-move', statuses.FINISH, 0, 0);
  assert.equal(f.received.length, count, 'right stream cannot also select an option');
  assert.equal(f.consumer.index, 0);
  f.patch.dispose();
  assert.equal(f.state.context, 3);
});

test('stick swap preserves merchant and radial navigation that already uses the left stream', { skip: !available }, () => {
  for (const type of ['merchant', 'radial']) {
    const f = fixture(type);
    f.patch.setConfig({ enabled: true, swapSticks: true });
    f.emit('nav-move', statuses.HOLD, 0, 1);
    if (type === 'merchant') assert.equal(f.consumer.index, -1);
    else assert.equal(f.consumer.currentMenuFocusItemIndex, 1);
    f.emit('scroll-pan', statuses.HOLD, 0, 1);
    assert.equal(f.received.length, 1, 'scrolling must not also move focus');
    f.patch.dispose();
  }
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

test('changed calibration, blur, and disposal neutralize only scrolling started by swapped input', () => {
  for (const stop of [p => p.setConfig({ enabled: false, swapSticks: true }),
    p => p.setConfig({ enabled: true, swapSticks: false }), p => p.suspend(), p => p.dispose()]) {
    const calls = [], handler = { onEngineInput: (...args) => calls.push(args) };
    const patch = createMenuNavigation({ actionHandler: handler, statuses,
      snapshot: () => ({ menu: true, swapRoles: true, controller: true, scope: 'PauseMenu' }) });
    patch.setConfig({ enabled: true, swapSticks: true });
    handler.onEngineInput('nav-move', statuses.START, 0, 1);
    stop(patch);
    assert.deepEqual(calls, [['scroll-pan', statuses.START, 0, 1], ['scroll-pan', statuses.FINISH, 0, 0]]);
    patch.dispose();
    assert.equal(calls.length, 2, 'cleanup cannot repeat or synthesize a focus step');
  }
});


test('native Diplomacy view with no ContextManager popup routes held stick to its response slot', { skip: !available }, () => {
  const f = fixture('diplomacy');
  f.emit('nav-move', statuses.START, 1, 0);
  f.emit('nav-move', statuses.HOLD, 1, 0);
  assert.equal(f.consumer.index, 1, 'support must move to the next response on a left stick held toward the right');
  assert.equal(f.received.at(-1).status, statuses.UPDATE);
  f.patch.dispose();
});
