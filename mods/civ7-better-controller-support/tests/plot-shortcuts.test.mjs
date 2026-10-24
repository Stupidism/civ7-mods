// Offline replay of the installed native dispatcher/city selection handler.
// No connection to the running game, Steam, Saves or controller devices.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createBridge } from '../ui/bridge-runtime.js';
import { installPlotShortcuts } from '../ui/plot-shortcuts-runtime.js';
import { createPlotShortcutAdapter } from '../ui/plot-shortcuts-adapter.js';

const modules = process.env.CIV7_MODULES_DIR || join(homedir(),
  "Library/Application Support/Steam/steamapps/common/Sid Meier's Civilization VII/CivilizationVII.app/Contents/Resources/Base/modules");
const available = existsSync(join(modules, 'base-standard/ui/world-input/world-input.js'));
const S = { START: 1, UPDATE: 2, FINISH: 3, HOLD: 4 };
const H = { Active: 0, Handled: 1 };
const C = { Shell: 0, World: 1, Unit: 2, INVALID: -1 };
const cid = (id, owner = 0, type = 26) => ({ owner, id, type });
class InputEvent extends Event {
  constructor(name, status, x = 0, y = 0, isTouch = false, isMouse = false) {
    super('engine-input', { cancelable: true });
    this.detail = { name, status, x, y, isTouch, isMouse };
  }
}
class NavEvent extends Event {
  constructor(name, options) { super(name, options); this.detail = options.detail; }
}
function fixture({ bridge = false, selected = false, city = false } = {}) {
  const state = { controller: true, focused: true, locked: false, unitFocus: selected, panel: false,
    world: true, view: true, selecting: true, unitAllowed: true, cityAllowed: true, hidden: false,
    busy: false, revealed: true, mode: selected ? 'INTERFACEMODE_UNIT_SELECTED' : 'INTERFACEMODE_DEFAULT',
    selected: selected ? cid(1) : null, plot: { x: 10, y: 20 }, turn: 49, local: 0,
    activeContext: selected ? C.Unit : C.World, blockNative: false, filter: null, clock: 0,
    city, foreign: false, met: true, independent: false, districtType: 1, onRoute: null };
  const selectedUnits = [], selectedCities = [], events = [], fallback = [], listeners = new Map();
  const units = new Map([1, 2, 3, 4].map(id => [id, { id: cid(id), owner: 0,
    type: ['warrior', 'explorer', 'settler', 'merchant'][id - 1], location: { x: 10, y: 20 },
    movesRemaining: 0, asleep: true }]));
  let mapIDs = [4, 2, 1, 3].map(id => cid(id));
  const player = {
    getHeadSelectedUnit: () => state.selected,
    selectUnit(id) { selectedUnits.push(id.id); state.selected = { ...id }; state.mode = 'INTERFACEMODE_UNIT_SELECTED'; state.unitFocus = true; },
    selectCity(id) { selectedCities.push(id.id); state.mode = 'INTERFACEMODE_CITY_PRODUCTION'; },
    selectNextUnit() { assert.fail('Must not cycle units on other tiles'); },
    selectPreviousUnit() { assert.fail('Must not cycle units on other tiles'); }
  };
  const focus = {
    currentFocus: () => ({ closest: tag => state.unitFocus && tag === 'unit-actions' ? {} : null }),
    isFocusLocked: () => state.locked, isWorldFocused: () => state.focused && !state.unitFocus
  };
  const view = {
    get isWorldInputAllowed() { return state.world; }, get isViewInputAllowed() { return state.view; },
    get isWorldSelectingAllowed() { return state.selecting; },
    get isUnitSelectingAllowed() { return state.unitAllowed; },
    get isCitySelectingAllowed() { return state.cityAllowed; }
  };
  const context = {
    handlers: [], getCurrentTarget: () => state.panel ? {} : null, canUseInput: () => true,
    registerEngineInputHandler(h) { this.handlers.push(h); },
    unregisterEngineInputHandler(h) { this.handlers.splice(this.handlers.indexOf(h), 1); },
    handleInput(e) {
      if (state.blockNative) { e.preventDefault(); return false; }
      state.onRoute?.(e);
      for (const h of this.handlers) if (h.handleInput(e) === H.Handled) return false;
      fallback.push(e.detail); return true;
    },
    handleNavigation(e) { fallback.push(e.detail); return true; }
  };
  const modes = { getCurrent: () => state.mode, isInInterfaceMode: name => state.mode === name };
  const gameContext = { get localPlayerID() { return state.local; } };
  const mapCities = { getDistrict: () => state.city ? cid(100, state.foreign ? 1 : 0, 4) : null };
  const districts = { get: () => ({ cityId: state.independent ? null : cid(200, state.foreign ? 1 : 0, 1),
    type: state.districtType, owner: state.foreign ? 1 : 0 }) };
  const cities = { get: id => ({ id, owner: state.foreign ? 1 : 0 }) };
  const mapUnits = { getUnits: () => mapIDs };
  const unitsAPI = { get: id => units.get(id.id) };
  const plotCursor = { get plotCursorCoords() { return state.plot; } };
  const cursor = { softCursorEnabled: false, hybridCursorEnabled: false };
  const input = { getActiveDeviceType: () => 2, getActiveContext: () => state.activeContext,
    setActiveContext: value => { state.activeContext = value; } };
  const sandbox = vm.createContext({
    Input: input, InputDeviceType: { Controller: 2 }, InputDeviceLayout: { Unknown: 0 },
    InputActionStatuses: S, InputHandlerState: H,
    InputNavigationAction: { NONE: 0, UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, NEXT: 16, PREVIOUS: 32 },
    InputEngineEvent: InputEvent, InputEngineEventName: 'engine-input',
    NavigateInputEvent: NavEvent, NavigateInputEventName: 'navigate-input',
    AnalogInput: { deadzoneThreshold: 0.2 }, UpdateGate: class { call() {} },
    Cursor: cursor, DebugInput: { sendTunerActionA: () => true, sendTunerActionB: () => true },
    Framework: { ContextManager: context }, ContextManager: context, InterfaceMode: modes,
    ViewManager: view, FocusManager: { get: () => focus }, PlotCursor: plotCursor,
    UI: { Player: player, hideCursor() {}, showCursor() {}, sendAudioEvent() {} },
    Audio: { getSoundTag: x => x }, MapUnits: mapUnits, Units: unitsAPI, MapCities: mapCities,
    Districts: districts, DistrictTypes: { CITY_CENTER: 1 }, Cities: cities,
    Players: { get: () => ({ isMajor: !state.independent, isIndependent: state.independent }) },
    GameContext: gameContext, Game: { Diplomacy: { hasMet: () => state.met } },
    RaiseDiplomacyEvent: class extends Event { constructor(owner) { super('diplomacy'); this.owner = owner; } },
    engine: { whenReady: { then() {} }, on: (name, fn) => listeners.set(name, fn) },
    window: { dispatchEvent: e => { events.push(e); return true; } }, console
  });
  const load = (file, replace) => vm.runInContext(readFileSync(join(modules, file), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(...replace), sandbox, { filename: file });
  load('core/ui/utilities/utilities-component-id.js', [/export \{ ComponentID \};/, 'globalThis.cidAPI = ComponentID;']);
  load('base-standard/ui/world-input/world-input.js', [/export \{ WorldInput as default \};/, 'globalThis.world = WorldInput;']);
  load('core/ui/input/action-handler.js', [/const ActionHandler = ActionHandlerSingleton\.getInstance\(\);[\s\S]*$/,
    'globalThis.handler = ActionHandlerSingleton.getInstance();']);
  const adapter = createPlotShortcutAdapter({ player, units: unitsAPI, mapUnits, cities, districts, mapCities,
    gameplayMap: { isValidLocation: p => p.x >= 0 && p.y >= 0, getRevealedState: () => state.revealed ? 1 : 0 },
    revealedStates: { HIDDEN: 0 }, worldInput: sandbox.world, view, modes, context, focus, cursor, plotCursor,
    componentID: sandbox.cidAPI, gameContext, game: { get turn() { return state.turn; } },
    isController: () => state.controller, document: { get hidden() { return state.hidden; }, querySelector: () => null },
    inputFilter: { handleInput: e => state.filter === e.detail.name ? H.Handled : H.Active },
    makeInputEvent: (name, status) => new InputEvent(name, status), statuses: S, handlerStates: H,
    isBusy: () => state.busy });
  const handler = sandbox.handler;
  const compatibility = bridge && createBridge({ actionHandler: handler, input, contexts: C, statuses: S,
    snapshot: () => ({ controller: state.controller, viewContext: state.mode === 'INTERFACEMODE_UNIT_SELECTED' ? C.Unit : C.World,
      mode: state.mode, worldAllowed: state.world, viewAllowed: state.view, worldFocused: true, panelPresent: state.panel }),
    stopMotion() {} });
  const runtime = installPlotShortcuts({ actionHandler: handler, context, statuses: S, handlerStates: H,
    ...adapter, now: () => state.clock, report: e => { throw e; } });
  const emit = (name, status) => listeners.get('InputAction')(name, status, 0, 0);
  const press = name => { emit(name, S.START); emit(name, S.HOLD); emit(name, S.FINISH); };
  return { state, units, player, selectedUnits, selectedCities, events, fallback, context, handler, cursor,
    runtime, adapter, emit, press, compatibility, world: sandbox.world, setIDs: ids => { mapIDs = ids; } };
}
const offline = (name, fn) => test(name, { skip: !available }, fn);

offline('LB/RB cycle all four local unit types in place in native and bridged streams', () => {
  for (const bridge of [false, true]) {
    const f = fixture({ bridge });
    f.press(bridge ? 'nav-next' : 'toggle-radial-menu');
    f.press('nav-next'); f.press('nav-next'); f.press('nav-next'); f.press('nav-next');
    f.press('nav-previous');
    assert.deepEqual(f.selectedUnits, [1, 2, 3, 4, 1, 4]);
    assert.equal(f.fallback.length, 0, 'no global cycling, move or radial input leaks');
    assert.deepEqual(f.state.plot, { x: 10, y: 20 });
  }
  const f = fixture(); f.press('open-lens-panel');
  assert.deepEqual(f.selectedUnits, [4], 'LB can select the last stacked unit before A');
});

offline('foreign, off-map, stale, remote and duplicate units are excluded without readiness filtering', () => {
  const f = fixture({ selected: true });
  f.units.set(5, { id: cid(5, 1), owner: 1, location: { x: 10, y: 20 } });
  f.units.set(6, { id: cid(6), owner: 0, location: { x: 10, y: 20 }, isOffMap: true });
  f.units.set(7, { id: cid(7), owner: 0, location: { x: 11, y: 20 } });
  f.setIDs([cid(8), cid(5, 1), cid(6), cid(7), cid(1), cid(2), cid(2), cid(4), cid(3)]);
  f.press('nav-next'); f.press('nav-next'); f.press('nav-next'); f.press('nav-next');
  assert.deepEqual(f.selectedUnits, [2, 3, 4, 1]);
  f.setIDs([cid(4), cid(3), cid(2), cid(1)]); f.press('nav-next');
  assert.equal(f.selectedUnits.at(-1), 2, 'flag reorder does not reorder the cycle');
});

offline('X opens the settlement through the actual native city handler before or after unit selection', () => {
  for (const bridge of [false, true]) for (const selected of [false, true]) {
    const f = fixture({ bridge, selected, city: true });
    f.press(bridge ? 'shell-action-1' : selected ? 'swap-plot-selection' : 'notification');
    assert.deepEqual(f.selectedCities, [200]);
    assert.deepEqual(f.selectedUnits, []);
    assert.equal(f.fallback.length, 0, 'X never enters movement or opens the wheel over a settlement');
  }
});

offline('foreign and independent settlements retain native diplomacy and contact rules', () => {
  for (const independent of [false, true]) for (const met of [false, true]) {
    const f = fixture({ city: true });
    Object.assign(f.state, { foreign: true, met, independent });
    f.press('notification');
    assert.deepEqual(f.selectedCities, []);
    assert.equal(f.events.filter(e => e.type === 'diplomacy').length, met ? 1 : 0);
  }
});

offline('ordinary rural districts and non-stacks retain original button functions', () => {
  const f = fixture({ city: true }); f.state.districtType = 2;
  f.press('notification'); assert.deepEqual(f.selectedCities, []);
  assert.equal(f.fallback.at(-1).name, 'notification');
  f.setIDs([cid(1)]); f.press('toggle-radial-menu');
  assert.equal(f.fallback.at(-1).name, 'toggle-radial-menu');
  const mac = fixture({ bridge: true, selected: true }); mac.setIDs([cid(1)]);
  mac.press('shell-action-1');
  assert.equal(mac.fallback.at(-1).name, 'unit-move');
});

offline('paired and FINISH-only native presses execute once; held input does not repeat', () => {
  const f = fixture({ selected: true });
  f.emit('nav-next', S.START);
  for (let i = 0; i < 10; i++) f.emit('nav-next', S.HOLD);
  assert.equal(f.selectedUnits.length, 0);
  f.emit('nav-next', S.FINISH); f.emit('nav-next', S.FINISH);
  assert.deepEqual(f.selectedUnits, [2]);
  f.state.clock += 100; f.emit('nav-next', S.FINISH);
  assert.deepEqual(f.selectedUnits, [2, 3], 'a context changing to FINISH-only must not get stuck');
  const endOnly = fixture({ selected: true });
  endOnly.emit('nav-next', S.FINISH); endOnly.emit('nav-next', S.FINISH);
  endOnly.state.clock += 100; endOnly.emit('nav-next', S.FINISH);
  assert.deepEqual(endOnly.selectedUnits, [2, 3]);
});

offline('map, focus, visibility, local-player and selection restrictions block shortcuts', () => {
  const changes = [
    f => { f.state.controller = false; }, f => { f.cursor.softCursorEnabled = true; },
    f => { f.cursor.hybridCursorEnabled = true; }, f => { f.state.hidden = true; },
    f => { f.state.busy = true; }, f => { f.state.locked = true; },
    f => { f.state.focused = false; f.state.unitFocus = false; }, f => { f.state.panel = true; },
    f => { f.state.world = false; }, f => { f.state.view = false; },
    f => { f.state.selecting = false; }, f => { f.state.mode = 'INTERFACEMODE_MOVE_TO'; },
    f => { f.state.local = -1; }, f => { f.state.plot = { x: -1, y: -1 }; },
    f => { f.state.revealed = false; }, f => { f.state.blockNative = true; },
    f => { f.state.filter = 'accept'; }
  ];
  for (const change of changes) {
    const f = fixture({ city: true, selected: true }); change(f);
    f.press('nav-next'); f.press('swap-plot-selection');
    assert.equal(f.selectedUnits.length + f.selectedCities.length, 0, change.toString());
  }
  for (const target of ['unit', 'city']) {
    const f = fixture({ selected: true, city: true });
    f.world[target === 'unit' ? 'canUnitSelect' : 'canCitySelect'] = false;
    f.press(target === 'unit' ? 'nav-next' : 'swap-plot-selection');
    assert.equal(f.selectedUnits.length + f.selectedCities.length, 0);
    const g = fixture({ selected: true, city: true });
    g.state[target === 'unit' ? 'unitAllowed' : 'cityAllowed'] = false;
    g.press(target === 'unit' ? 'nav-next' : 'swap-plot-selection');
    assert.equal(g.selectedUnits.length + g.selectedCities.length, 0);
  }
});

offline('original binding filters and native guards cannot be bypassed by translation', () => {
  const f = fixture({ selected: true }); f.state.filter = 'nav-next';
  f.press('nav-next'); assert.deepEqual(f.selectedUnits, []);
  f.state.filter = null; f.state.blockNative = true;
  f.press('nav-next'); assert.deepEqual(f.selectedUnits, []);
});

offline('target, turn, mode or selection changes between press/release cancel without fallback', () => {
  for (const change of [
    f => { f.state.plot = { x: 11, y: 20 }; }, f => { f.state.turn++; },
    f => { f.state.selected = cid(3); }, f => { f.units.delete(2); },
    f => { f.state.mode = 'INTERFACEMODE_MOVE_TO'; },
    f => { f.state.panel = true; f.runtime.sync(); f.state.panel = false; },
    f => { f.runtime.invalidate(); }
  ]) {
    const f = fixture({ selected: true });
    f.emit('nav-next', S.START); change(f); f.emit('nav-next', S.FINISH);
    assert.deepEqual(f.selectedUnits, [], change.toString());
    assert.deepEqual(f.fallback, [], 'cancelled shortcut must not become a global cycle');
  }
});

offline('a menu-started press cannot become a map shortcut after the menu closes', () => {
  const f = fixture({ selected: true });
  f.state.panel = true; f.emit('nav-next', S.START);
  f.state.panel = false; f.emit('nav-next', S.FINISH);
  assert.deepEqual(f.selectedUnits, []);
});

offline('native input route rechecks targets before executing and never issues unit orders', () => {
  const f = fixture({ selected: true, city: true });
  f.state.onRoute = () => { f.state.city = false; };
  f.press('swap-plot-selection');
  assert.deepEqual(f.selectedCities, []);
  assert.deepEqual(f.fallback, []);
  const g = fixture({ selected: true });
  g.state.onRoute = () => { g.units.delete(2); };
  g.press('nav-next'); assert.deepEqual(g.selectedUnits, []);
});

offline('disposal preserves later hooks and unregisters the private action handler', () => {
  const f = fixture(); const owned = f.handler.onEngineInput;
  const later = (...args) => owned(...args); f.handler.onEngineInput = later;
  f.runtime.dispose(); f.runtime.dispose();
  assert.equal(f.handler.onEngineInput, later);
  assert.equal(f.context.handlers.length, 0);
  f.press('toggle-radial-menu'); assert.equal(f.fallback.at(-1).name, 'toggle-radial-menu');
});
