import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { installForceTurn } from '../ui/force-turn-runtime.js';

const S = { START: 1, UPDATE: 2, FINISH: 3, HOLD: 4 };
const BACK = 'shell-action-5';
function fixture() {
  const state = { eligible: true, scope: 'game:0:49:DEFAULT', time: 0 };
  const calls = [], progress = [], errors = [];
  const original = (...args) => calls.push(args);
  const handler = { onEngineInput: original };
  const runtime = installForceTurn({ actionHandler: handler, statuses: S, snapshot: () => state,
    now: () => state.time, progress: value => progress.push(value), report: e => errors.push(e) });
  return { state, calls, progress, errors, handler, runtime, original,
    emit: (status, name = BACK) => handler.onEngineInput(name, status, 0, 0) };
}

test('short View/Back press dispatches the original social action once', () => {
  const f = fixture(); f.emit(S.START); f.state.time = 999; f.emit(S.FINISH); f.emit(S.FINISH);
  assert.deepEqual(f.calls, [[BACK, S.FINISH, 0, 0]]);
  assert.equal(f.progress.at(-1), null);
});
test('one second arms the shortcut; only a matching release sends force-end-turn once', () => {
  const f = fixture(); f.emit(S.START); f.state.time = 1000; f.emit(S.HOLD); f.runtime.tick();
  assert.equal(f.progress.at(-1), 1); assert.equal(f.calls.length, 0);
  f.state.time = 5000; f.runtime.tick(); assert.equal(f.calls.length, 0);
  f.emit(S.FINISH); f.emit(S.FINISH); f.emit(S.HOLD);
  assert.deepEqual(f.calls, [['force-end-turn', S.FINISH, 0, 0]]);
});
test('missing press/release phases never guess a long press', () => {
  const f = fixture(); f.state.time = 5000; f.emit(S.HOLD); f.emit(S.FINISH);
  assert.ok(f.calls.every(c => c[0] === BACK));
  f.calls.length = 0; f.emit(S.START); f.state.time = 60000; f.runtime.tick();
  assert.equal(f.calls.length, 0, 'lost release cannot submit a turn from a timer');
});
test('scope changes and transient blockers cancel both force and short fallback', () => {
  for (const interrupt of [
    f => { f.state.scope = 'game:0:50:DEFAULT'; },
    f => { f.state.eligible = false; },
    f => { f.state.eligible = false; f.runtime.tick(); f.state.eligible = true; },
    f => f.runtime.cancel()
  ]) {
    const f = fixture(); f.emit(S.START); f.state.time = 1200; interrupt(f); f.emit(S.FINISH);
    assert.deepEqual(f.calls, []); assert.equal(f.progress.at(-1), null);
  }
});
test('menu-started press stays native; next fresh map press can use the shortcut', () => {
  const f = fixture(); f.state.eligible = false; f.emit(S.START);
  f.state.eligible = true; f.state.time = 1500; f.emit(S.FINISH);
  assert.ok(f.calls.every(c => c[0] === BACK));
  f.calls.length = 0; f.emit(S.START); f.state.time = 2500; f.emit(S.FINISH);
  assert.deepEqual(f.calls, [['force-end-turn', S.FINISH, 0, 0]]);
});
test('unrelated controls and later wrappers survive; disposal hides the indicator', () => {
  const f = fixture(); f.emit(S.FINISH, 'shell-action-2');
  assert.equal(f.calls[0][0], 'shell-action-2');
  const owned = f.handler.onEngineInput, later = (...args) => owned(...args);
  f.handler.onEngineInput = later; f.emit(S.START); f.runtime.dispose();
  assert.equal(f.handler.onEngineInput, later); assert.equal(f.progress.at(-1), null);
  f.emit(S.FINISH); assert.equal(f.calls.at(-1)[0], BACK);
});
test('a delegate throwing after submission is never replayed', () => {
  let submits = 0, time = 0; const errors = [];
  const h = { onEngineInput() { submits++; throw Error('after submission'); } };
  installForceTurn({ actionHandler: h, statuses: S, snapshot: () => ({ eligible: true, scope: '49' }),
    now: () => time, report: e => errors.push(e) });
  h.onEngineInput(BACK, S.START); time = 1000; h.onEngineInput(BACK, S.FINISH);
  h.onEngineInput(BACK, S.FINISH);
  assert.equal(submits, 1); assert.equal(errors.length, 1);
});

const modules = process.env.CIV7_MODULES_DIR || join(homedir(),
  "Library/Application Support/Steam/steamapps/common/Sid Meier's Civilization VII/CivilizationVII.app/Contents/Resources/Base/modules");
const nativeAvailable = existsSync(join(modules, 'base-standard/ui/action/panel-action.js'));
class InputEvent extends Event {
  constructor(name, status, x, y, isTouch, isMouse) {
    super('engine-input', { cancelable: true }); this.detail = { name, status, x, y, isTouch, isMouse };
  }
}
test('native dispatcher reaches the original panel and its end-turn wrappers; blockers stop it', { skip: !nativeAvailable }, () => {
  let time = 0, blocked = false, sent = false;
  const order = [], listeners = new Map();
  const sandbox = vm.createContext({
    Panel: class {}, ImageCache: class {}, InputEngineEvent: InputEvent,
    InputDeviceType: { Controller: 2 }, InputDeviceLayout: { Unknown: 0 }, InputActionStatuses: S,
    InputNavigationAction: { NONE: 0 }, UpdateGate: class { call() {} },
    Input: { getActiveDeviceType: () => 2 }, Cursor: { softCursorEnabled: false },
    engine: { on: (n, f) => listeners.set(n, f), whenReady: { then() {} } },
    Framework: { ContextManager: { handleInput(e) { if (blocked) { e.preventDefault(); return false; } return true; } } },
    InterfaceMode: { isInInterfaceMode: () => false },
    GameContext: { hasSentTurnComplete: () => sent, sendTurnComplete() { sent = true; order.push('submit'); } },
    Game: { AgeProgressManager: { isAgeOver: false } },
    UI: { Player: { deselectAllUnits() { order.push('deselect'); } }, sendAudioEvent() {} },
    Audio: { getSoundTag: x => x }, window: { dispatchEvent: e => sandbox.panel.onEngineInput(e) }, console
  });
  const load = f => readFileSync(join(modules, f), 'utf8').replace(/^import .*;\r?\n/gm, '');
  vm.runInContext(load('base-standard/ui/action/panel-action.js')
    .replace(/Controls.define\("panel-action",[\s\S]*$/, 'globalThis.panel = Object.create(PanelAction.prototype);'), sandbox);
  sandbox.panel.setEndTurnWaiting = () => order.push('waiting');
  const native = sandbox.panel.sendEndTurn;
  sandbox.panel.sendEndTurn = function () { order.push('autosave/rest guard'); return native.call(this); };
  vm.runInContext(load('core/ui/input/action-handler.js')
    .replace(/const ActionHandler = ActionHandlerSingleton.getInstance\(\);[\s\S]*$/, 'globalThis.handler = ActionHandlerSingleton.getInstance();'), sandbox);
  installForceTurn({ actionHandler: sandbox.handler, statuses: S, now: () => time,
    snapshot: () => ({ eligible: true, scope: '49' }) });
  const emit = s => listeners.get('InputAction')(BACK, s, 0, 0);
  emit(S.START); time = 1000; blocked = true; emit(S.FINISH); assert.deepEqual(order, []);
  blocked = false; emit(S.START); time = 2000; emit(S.FINISH);
  assert.deepEqual(order, ['autosave/rest guard', 'waiting', 'deselect', 'submit']);
  emit(S.FINISH); assert.equal(order.filter(x => x === 'submit').length, 1);
});

async function entryFixture() {
  const state = { controller: true, turn: 49, active: true, human: true, sent: false, paused: false,
    mode: 'INTERFACEMODE_DEFAULT', hidden: false, locked: false, top: null, rest: false, world: true,
    view: true, filtered: false, time: 0, shell: false };
  const children = [], calls = [], engineEvents = new Map(), windowEvents = new Map();
  class Node {
    get textContent(){return (this._text||'')+this.children.map(n=>n.textContent||'').join('');}
    set textContent(v){this._text=v;this._html=v;this.children=[];}
    get innerHTML(){return this._html||'';}
    set innerHTML(v){this._html=v;this._text=v.replace(/<[^>]*>/g,'');this.children=[];}

    style = {}; isConnected = false; children = []; classList={add(){}};
    setAttribute() {} append(...nodes) { this.children.push(...nodes); }
    remove() { this.isConnected = false; const i = children.indexOf(this); if (i >= 0) children.splice(i, 1); }
  }
  const handler = { onEngineInput: (...args) => calls.push(args) };
  const focus = { isWorldFocused: () => true, isFocusLocked: () => state.locked, currentFocus: () => null };
  const sandbox = vm.createContext({ installForceTurn: args => installForceTurn({ ...args, now: () => state.time }),
    ActionHandler: handler, InputActionStatuses: S, InputHandlerState: { Handled: 1 }, InputEngineEvent: InputEvent,
    InputFilter: { handleInput: () => state.filtered ? 1 : 0 },
    ContextManager: { getCurrentTarget: () => state.top, canUseInput: () => true },
    ViewManager: { get isWorldInputAllowed() { return state.world; }, get isViewInputAllowed() { return state.view; } },
    InterfaceMode: { getCurrent: () => state.mode }, FocusManager: { get: () => focus },
    IsControllerActive: () => state.controller, Cursor: {}, ComponentID: { toString: () => '' },
    UI: { isInShell: () => state.shell, isInGame: () => true, Player: { getHeadSelectedUnit: () => null } },
    Players: { get: () => ({ isHuman: state.human, isTurnActive: state.active }) },
    GameContext: { localPlayerID: 0, hasSentTurnComplete: () => state.sent },
    Configuration: { getGame: () => ({ isPaused: state.paused, gameSeed: 1 }) },
    Game: { age: 1, get turn() { return state.turn; } }, Autoplay: { isActive: false },
    Locale: { compose: key => key, stylize:key=>key },
    document: { get hidden() { return state.hidden; }, querySelector: () => state.rest ? {} : null,
      createElement: () => new Node(), body: { appendChild: n => { children.push(n); n.isConnected = true; } } },
    engine: { whenReady: Promise.resolve(), on: (n, f) => engineEvents.set(n, f),
      off: (n, f) => { if (engineEvents.get(n) === f) engineEvents.delete(n); } },
    window: { addEventListener: (n, f) => windowEvents.set(n, f),
      removeEventListener: (n, f) => { if (windowEvents.get(n) === f) windowEvents.delete(n); } }, console
  });
  vm.runInContext(readFileSync(new URL('../ui/instruction-hints.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,''),sandbox);
  vm.runInContext(readFileSync(new URL('../ui/force-turn.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, ''), sandbox);
  await Promise.resolve();
  return { state, children, calls, engineEvents, windowEvents, sandbox,
    emit: s => handler.onEngineInput(BACK, s, 0, 0) };
}
test('actual entry gates local turn, menus, rest, focus and filters; all cancellations require a fresh press', async () => {
  for (const patch of [{ controller: false }, { active: false }, { human: false }, { sent: true },
    { paused: true }, { mode: 'INTERFACEMODE_MOVE_TO' }, { mode: 'INTERFACEMODE_HOTSEAT' },
    { hidden: true }, { locked: true }, { top: {} }, { rest: true }, { world: false }, { view: false }, { filtered: true }]) {
    const f = await entryFixture(); f.emit(S.START); Object.assign(f.state, patch);
    f.state.time = 1100; f.engineEvents.get('BeginFrame')(); f.emit(S.FINISH);
    assert.deepEqual(f.calls, [], JSON.stringify(patch)); assert.equal(f.children.length, 0);
  }
});
test('actual entry shows hold/release hints and cleans up on unload; blur cancels without submitting', async () => {
  const f = await entryFixture(); f.emit(S.START);
  assert.equal(f.children[0].children[0].textContent, 'LOC_MTG_FORCE_TURN_HOLD');
  f.state.time = 1000; f.engineEvents.get('BeginFrame')();
  assert.equal(f.children[0].children[0].textContent, 'LOC_MTG_FORCE_TURN_RELEASE');
  f.windowEvents.get('blur')(); f.windowEvents.get('focus')(); f.emit(S.FINISH);
  assert.deepEqual(f.calls, []); assert.equal(f.children.length, 0);
  f.emit(S.START); f.state.time = 2000; f.emit(S.FINISH);
  assert.equal(f.calls.at(-1)[0], 'force-end-turn');
  f.emit(S.START); f.engineEvents.get('BeforeUnload')();
  assert.equal(f.children.length, 0); assert.equal(f.engineEvents.size, 0); assert.equal(f.windowEvents.size, 0);
});
test('shell database update requests all Back phases without rewriting gestures or gameplay data', () => {
  const config = readFileSync(new URL('../config/controller-input.xml', import.meta.url), 'utf8');
  assert.match(config, /<Where ActionId="shell-action-5"\s*\/>/);
  assert.match(config, /<Set EventType="All"\s*\/>/);
  assert.equal((config.match(/<Update>/g) || []).length, 4);
  assert.match(config, /<Where ActionId="shell-action-3"\s*\/>/);
  assert.doesNotMatch(config, /InputActionDefaultGestures|<Row|<Delete/);
  const mod = readFileSync(new URL('../map-tools-gamepad.modinfo', import.meta.url), 'utf8');
  assert.match(mod, /scope="shell"[\s\S]*?<UpdateDatabase>\s*<Item>config\/controller-input.xml<\/Item>/);
});
