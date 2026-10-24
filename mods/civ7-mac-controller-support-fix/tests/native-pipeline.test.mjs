// Runs the installed game's JavaScript dispatcher in a Node VM. It never
// starts the game or calls Steam, and does not redistribute Firaxis source.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createBridge } from '../ui/bridge-runtime.js';

const modules = process.env.CIV7_MODULES_DIR || join(homedir(),
  "Library/Application Support/Steam/steamapps/common/Sid Meier's Civilization VII/CivilizationVII.app/Contents/Resources/Base/modules");
const nativePath = join(modules, 'core/ui/input/action-handler.js');
const available = existsSync(nativePath);
const statuses = { START: 1, UPDATE: 2, FINISH: 3, HOLD: 4, DRAG: 5 };
const contexts = { Shell: 0, World: 1, Unit: 2, Dual: 3, INVALID: -1 };
class InputEvent extends Event {
  constructor(name, status, x, y, isTouch, isMouse) {
    super('engine-input', { cancelable: true });
    this.detail = { name, status, x, y, isTouch, isMouse };
  }
}
class NavigationEvent extends Event {
  constructor(name, options) { super(name, options); this.detail = options.detail; }
}

function pipeline({ nativeCamera = false, nativePlot = false, nativeRadial = false } = {}) {
  const actions = [], navigation = [], globalEvents = [], engineListeners = new Map();
  const pans = [];
  const openedPanels = [], windowListeners = new Map();
  let camera, plot, radial;
  const state = { blocked: false, panel: false, current: contexts.World, viewContext: contexts.World,
    radialAllowed: true, hasCity: true, tutorialDisabled: false };
  const source = readFileSync(nativePath, 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/const ActionHandler = ActionHandlerSingleton\.getInstance\(\);[\s\S]*$/,
      'globalThis.testActionHandler = ActionHandlerSingleton.getInstance();');
  const input = {
    getActiveDeviceType: () => 2, getActiveContext: () => state.current,
    setActiveContext: value => { state.current = value; }
  };
  const sandbox = vm.createContext({
    Input: input, InputDeviceType: { Mouse: 0, Keyboard: 1, Controller: 2, Touch: 3, Hybrid: 4 },
    InputDeviceLayout: { Unknown: 0 },
    InputActionStatuses: statuses,
    InputNavigationAction: { NONE: 0, UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, NEXT: 16, PREVIOUS: 32 },
    InputEngineEvent: InputEvent, InputEngineEventName: 'engine-input',
    NavigateInputEvent: NavigationEvent, NavigateInputEventName: 'navigate-input',
    AnalogInput: { deadzoneThreshold: 0.2 },
    UpdateGate: class { call() {} },
    Cursor: { softCursorEnabled: false },
    DebugInput: { sendTunerActionA: () => true, sendTunerActionB: () => true },
    Framework: { ContextManager: {
      handleInput(event) {
        if (state.blocked) { event.preventDefault(); return false; }
        actions.push(event.detail);
        if (plot && plot.handleInput(event) === 1) return false;
        if (camera && camera.handleInput(event) === 1) return false;
        return true;
      },
      handleNavigation(event) { if (!state.blocked) navigation.push(event.detail); }
    } },
    engine: {
      whenReady: { then() {} }, // Do not run game initialization.
      on: (name, fn) => { engineListeners.set(name, fn); return { clear: () => engineListeners.delete(name) }; }
    },
    UI: { hideCursor() {}, showCursor() {} },
    window: {
      addEventListener(name, fn) { windowListeners.set(name, fn); },
      dispatchEvent(event) { globalEvents.push(event); windowListeners.get(event.type)?.(event); }
    },
    console
  });
  if (nativeCamera) {
    Object.assign(sandbox, {
      InputHandlerState: { Active: 0, Handled: 1 },
      Configuration: { getUser: () => ({ cameraPanningSpeed: 1 }) },
      ViewManager: { get isWorldInputAllowed() { return !state.panel; } },
      IsControllerActive: () => true, IsTouchActive: () => false,
      Camera: { panFocus: value => pans.push({ ...value }) }
    });
    const file = join(modules, 'core/ui/camera/camera-controller.js');
    const code = readFileSync(file, 'utf8').replace(/^import .*;\r?\n/gm, '')
      .replace(/const CameraController = CameraControllerSingleton\.getInstance\(\);[\s\S]*$/,
        'globalThis.testCamera = CameraControllerSingleton.getInstance();');
    vm.runInContext(code, sandbox, { filename: file });
    camera = sandbox.testCamera;
  }
  if (nativePlot) {
    Object.assign(sandbox, {
      CustomEvent: class extends Event {}, Loading: { runWhenLoaded() {} },
      InputHandlerState: { Active: 0, Handled: 1 },
      GameplayMap: { isValidLocation: () => true, getGridHeight: () => 1000 },
      Camera: { getMovementMultiplier: () => 1, panFocus: value => pans.push({ ...value }) },
      WorldUI: {
        getPlotLocation: pos => pos, wrapWorldPosition: pos => pos,
        // Put the cursor at the matching top/bottom edge to exercise native
        // camera-follow. Projection itself is provided by the closed engine.
        getScreenPos: pos => ({ x: 0.5, y: pos.y > 500 ? 0 : 1 }),
        getPlotAt: () => null, releaseMarker() {}
      }
    });
    const file = join(modules, 'core/ui/input/plot-cursor.js');
    const code = readFileSync(file, 'utf8').replace(/^import .*;\r?\n/gm, '')
      .replace(/const PlotCursor = PlotCursorSingleton\.getInstance\(\);[\s\S]*$/,
        'globalThis.testPlot = PlotCursorSingleton.getInstance();');
    vm.runInContext(code, sandbox, { filename: file });
    plot = sandbox.testPlot;
  }
  if (nativeRadial) {
    Object.assign(sandbox, {
      ContextManager: {
        get isEmpty() { return !state.panel; },
        push(name, options) { openedPanels.push({ name, options: { ...options } }); state.panel = true; },
        hasInstanceOf: name => state.panel && name === 'panel-radial-menu',
        pop() { state.panel = false; }
      },
      ViewManager: { get isRadialSelectionAllowed() { return state.radialAllowed; } },
      Configuration: { getUser: () => ({ tutorialLevel: state.tutorialDisabled ? 0 : 2 }) },
      TutorialLevel: { WarningsOnly: 1 }, GameContext: { localObserverID: 0 },
      Players: { get: () => ({ Cities: { getCities: () => state.hasCity ? [1] : [] } }) }
    });
    const file = join(modules, 'core/ui/radial-menu/model-radial-menu.js');
    const code = readFileSync(file, 'utf8').replace(/^import .*;\r?\n/gm, '')
      .replace(/export \{ RadialMenu as default \};/, 'globalThis.testRadial = RadialMenu;');
    vm.runInContext(code, sandbox, { filename: file });
    radial = sandbox.testRadial;
    radial.update();
  }
  vm.runInContext(source, sandbox, { filename: nativePath });
  const handler = sandbox.testActionHandler;
  const emit = (...args) => engineListeners.get('InputAction')(...args);
  const attach = () => createBridge({
    actionHandler: handler, input, statuses, contexts,
    stopMotion(name) {
      if (name === 'camera-pan') camera?.onGamepadCameraPan(statuses.FINISH, { x: 0, y: 0 });
      if (name === 'plot-move') plot?.onMovePlotCursor(new InputEvent(name, statuses.FINISH, 0, 0));
    },
    snapshot: () => ({
      controller: true, viewContext: state.viewContext, mode: 'DEFAULT',
      worldAllowed: true, viewAllowed: true, worldFocused: true,
      panelPresent: state.panel, blocked: false
    })
  });
  return { state, handler, emit, attach, actions, navigation, globalEvents, camera, plot, pans, radial, openedPanels };
}

test('real radial model opens once from Shell RB on the world map', { skip: !available }, () => {
  const f = pipeline({ nativeRadial: true });
  const bridge = f.attach();
  f.emit('nav-next', statuses.START, 0, 0);
  f.emit('nav-next', statuses.HOLD, 0, 0);
  assert.equal(f.openedPanels.length, 0);
  f.emit('nav-next', statuses.FINISH, 0, 0);
  assert.deepEqual(f.openedPanels, [{ name: 'panel-radial-menu', options: { singleton: true, createMouseGuard: true } }]);
  bridge.tick();
  assert.equal(bridge.getStatus().active, false, 'radial panel takes ownership of input');
  f.emit('nav-next', statuses.START, 0, 0);
  f.emit('nav-next', statuses.FINISH, 0, 0);
  assert.equal(f.openedPanels.length, 1, 'RB inside a panel stays menu navigation');
  assert.equal(f.navigation.at(-1).navigation, 16);
  f.state.panel = false;
  f.emit('nav-next', statuses.START, 0, 0);
  f.emit('nav-next', statuses.FINISH, 0, 0);
  assert.equal(f.openedPanels.length, 2, 'RB works again after the panel closes');
});

test('radial shortcut preserves native tutorial, view and input guards', { skip: !available }, () => {
  for (const block of [f => { f.state.blocked = true; }, f => { f.state.radialAllowed = false; },
    f => { f.state.hasCity = false; f.radial.update(); }, f => { f.state.panel = true; },
    f => { f.state.viewContext = contexts.Unit; }]) {
    const f = pipeline({ nativeRadial: true });
    f.attach(); block(f);
    f.emit('nav-next', statuses.START, 0, 0);
    f.emit('nav-next', statuses.FINISH, 0, 0);
    assert.equal(f.openedPanels.length, 0);
    if (f.state.viewContext === contexts.Unit || f.state.panel) assert.equal(f.navigation.at(-1).navigation, 16);
  }
  const f = pipeline({ nativeRadial: true });
  f.attach(); f.state.hasCity = false; f.state.tutorialDisabled = true; f.radial.update();
  f.emit('nav-next', statuses.START, 0, 0); f.emit('nav-next', statuses.FINISH, 0, 0);
  assert.equal(f.openedPanels.length, 1, 'native model allows no-city games with tutorial disabled');
});

test('RB release after a menu transition cannot open the radial menu', { skip: !available }, () => {
  const f = pipeline({ nativeRadial: true });
  const bridge = f.attach();
  f.emit('nav-next', statuses.START, 0, 0);
  f.state.panel = true; bridge.tick();
  f.state.panel = false; bridge.tick();
  f.emit('nav-next', statuses.FINISH, 0, 0);
  assert.equal(f.openedPanels.length, 0);
});

test('real dispatcher: menu nav-move becomes map plot-move only with bridge', { skip: !available }, () => {
  const f = pipeline();
  f.emit('nav-move', statuses.UPDATE, 0.75, 0.5);
  assert.equal(f.actions.length, 0);
  assert.equal(f.navigation.length, 1);
  f.attach();
  f.emit('nav-move', statuses.UPDATE, 0.75, 0.5);
  assert.equal(f.navigation.length, 1);
  assert.equal(f.actions.at(-1).name, 'plot-move');
  assert.equal(f.actions.at(-1).x, 0.75);
  assert.equal(f.actions.at(-1).y, 0.5);
});

test('real PlotCursor camera-follow uses the left-stick setting in both map input streams', { skip: !available }, () => {
  for (const action of ['nav-move', 'plot-move']) {
    const f = pipeline({ nativePlot: true });
    const bridge = f.attach();
    const sample = () => {
      Object.assign(f.plot, { _PlotCursorCoords: { x: 500, y: 500 },
        controllerCursor: { x: 500, y: 500 }, isMoving: true, nudgeDelay: -1, frameDelta: 0.016 });
      f.emit(action, statuses.UPDATE, 0, 1);
      return f.pans.at(-1);
    };
    const normal = sample();
    assert.ok(normal.y > 0, 'positive menu Y must reach native upward camera-follow without a forced flip');
    bridge.setInvertLeftY(true);
    assert.equal(f.plot.isMoving, false, 'changing direction must stop the prior motion');
    const inverted = sample();
    assert.equal(inverted.y, -normal.y);
    assert.equal(inverted.x, normal.x);
    f.emit(action, statuses.FINISH, 0, 0);
    assert.equal(f.plot.isMoving, false);
    assert.equal(f.plot.controllerCursor, undefined);
  }
});

test('real dispatcher: existing ContextManager blockers stop translated inputs before globals', { skip: !available }, () => {
  const f = pipeline();
  f.attach();
  f.state.blocked = true;
  f.emit('nav-move', statuses.UPDATE, 1, 0);
  f.emit('scroll-pan', statuses.UPDATE, 0, 1);
  f.emit('shell-action-2', statuses.START, 0, 0);
  f.emit('shell-action-2', statuses.FINISH, 0, 0);
  assert.equal(f.actions.length, 0);
  assert.equal(f.globalEvents.length, 0);
  f.state.blocked = false;
  f.emit('scroll-pan', statuses.UPDATE, 0, 1);
  assert.equal(f.actions[0].name, 'camera-pan');
});

test('real dispatcher: pause still receives menu navigation and accept exactly once', { skip: !available }, () => {
  const f = pipeline();
  f.attach();
  f.state.panel = true;
  f.emit('nav-move', statuses.UPDATE, 1, 0);
  f.emit('accept', statuses.FINISH, 0, 0);
  assert.equal(f.navigation.length, 1);
  assert.deepEqual(f.actions.map(a => a.name), ['accept']);
});

test('real dispatcher and CameraController pan, release and pause without a running game', { skip: !available }, () => {
  const f = pipeline({ nativeCamera: true });
  const bridge = f.attach();
  f.emit('scroll-pan', statuses.START, 0.8, -0.5);
  f.camera.onUpdateFrame(0.1);
  assert.deepEqual(f.pans, [{ x: 0.8, y: 0.5 }]);
  f.emit('scroll-pan', statuses.FINISH, 0, 0);
  f.camera.onUpdateFrame(0.1);
  assert.equal(f.pans.length, 1);
  f.emit('scroll-pan', statuses.START, 1, 0);
  f.state.panel = true;
  bridge.tick();
  f.state.panel = false;
  f.camera.onUpdateFrame(0.1);
  assert.equal(f.pans.length, 1, 'pause cleanup must not leave an old pan running');
});

test('installed API contract matches adapter imports and cleanup signatures', { skip: !available }, () => {
  const checks = [
    ['core/ui/input/plot-cursor.js', ['onMovePlotCursor(event)', 'InputActionStatuses.FINISH']],
    ['core/ui/camera/camera-controller.js', ['onGamepadCameraPan(status, panDir)', 'CameraController as default']],
    ['core/ui-next/services/focus-manager.js', ['isWorldFocused', 'isFocusLocked']],
    ['core/ui/input/action-handler.js', ['this.onEngineInput(actionName, status, x, y)', 'Framework.ContextManager.handleInput(inputEvent)']]
  ];
  for (const [file, fragments] of checks) {
    const source = readFileSync(join(modules, file), 'utf8');
    for (const fragment of fragments) assert.ok(source.includes(fragment), `${file}: ${fragment}`);
  }
  const adapter = readFileSync(new URL('../ui/controller-bridge.js', import.meta.url), 'utf8');
  for (const [, file] of adapter.matchAll(/from '\/([^']+)'/g)) assert.ok(existsSync(join(modules, file)), file);
  const xml = readFileSync(join(modules, 'core/config/Input.xml'), 'utf8');
  for (const name of ['plot-move', 'camera-pan', 'unit-move', 'toggle-radial-menu', 'next-action']) {
    assert.ok(xml.includes(`ActionId="${name}"`), name);
  }
});
