import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { RestGate, normalizeConfig, nightWindow } from '../ui/rest-model.js';
import { RestStore } from '../ui/rest-store.js';
import { RestSession } from '../ui/rest-session.js';
import { activityActive } from '../ui/rest-activity.js';

const source = fs.readFileSync(new URL('../ui/rest-guard.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '');

function harness({ turn = 5, multiplayer = false, readonlyNative = false, storage, savedSession, playedTurns = 0, autoSave = true, idleSaveEnabled = false, nightEnabled = false, startTime = 100000 } = {}) {
  const calls = { restSaves: [], saveQueries: 0, saveDeletes: 0, menuOpens: 0, queueSuspends: 0, queueResumes: 0, submits: 0, panelEffects: 0, inputs: 0, navigation: 0, writes: 0, exitPrompts: 0, exits: [] };
  const clock = { now: startTime };
  const session = new RestSession(savedSession);
  for (let i = 0; i < playedTurns; i++) {
    const previous = turn - playedTurns + i;
    session.requestTurn({ turn: previous, context: 'game:123:player:0:age:age1',
      token: `game:123:player:0:age:age1:turn:${previous}` }, normalizeConfig({ nightEnabled, intervals: [5, 4, 3, 2, 1] }), startTime);
  }
  const timers = [];
  const events = new Map();
  const saveEvents = new Map();
  const emitSave = (name, data) => { for (const fn of saveEvents.get(name) ?? []) fn(data); };
  let view;
  let nativeSettingsOpen = false;
  const nativeScreens = new Map();
  let exitConfirmation = null;
  const respondToExit = action => {
    const dialog = exitConfirmation;
    exitConfirmation = null;
    nativeScreens.delete('screen-dialog-box');
    dialog?.callback(action);
  };
  const ctx = { hasSentTurnComplete: () => false, localPlayerID: 0,
    sendTurnComplete() { calls.submits++; } };
  if (readonlyNative) Object.defineProperty(ctx, 'sendTurnComplete', { writable: false });
  class PanelAction { sendEndTurn() { calls.panelEffects++; ctx.sendTurnComplete(); } }
  class View {
    constructor(callbacks) { this.callbacks = callbacks; this.root = { style: {} }; this.mode = null; view = this; }
    close() { this.mode = null; }
    setVisible(visible) { this.root.style.display = visible ? '' : 'none'; }
    showRest(pending) { this.mode = 'rest'; this.pending = pending; }
    updateRest(remaining) { this.remaining = remaining; }
    showNight(night) { this.mode = 'night'; this.night = night; }
    showIdleRest() { this.mode = 'idle'; }
    updateIdleRest(elapsed, rested) { this.idleElapsed = elapsed; this.rested = rested; }
    updateLauncher(current) { this.turn = current.turn; }
    activateFocused() { this.callbacks.resume(); }
    navigate(step) { calls.lastNavigationStep = step; }
    activate(target) { if (target === 'continue') this.callbacks.resume(); }
    destroy() {}
  }
  const data = new Map();
  const localStorage = storage || { getItem: k => data.get(k), setItem: (k, v) => { calls.writes++; data.set(k, v); } };
  const ContextManager = {
    canSaveGame: () => true,
    hasInstanceOf: name => nativeScreens.has(name),
    handleInput(event) {
      calls.inputs++;
      if (exitConfirmation) {
        if (['accept', 'keyboard-enter'].includes(event.detail.name)) respondToExit(1);
        else if (['cancel', 'keyboard-escape'].includes(event.detail.name)) respondToExit(2);
      } else if (event.detail.name === 'keyboard-escape') nativeSettingsOpen = false;
      return true;
    },
    handleNavigation() { calls.navigation++; return true; },
  };
  const sandbox = {
    getRadialMenus: () => [], registerRadialMenu() {}, registerRadialMenuItem() {}, NavigationType: { FOCUS: 'focus' },
    RestGate, RestStore, normalizeConfig, nightWindow, activityActive, RestView: View, PanelAction,
    settingsStore: new RestStore(localStorage), subscribeSettings: () => () => {},
    openSettings() { nativeSettingsOpen = true; }, isSettingsOpen: () => nativeSettingsOpen,
    session, checkpoint() {}, installLoadingHooks() {},
    FocusManager: { get: () => ({ currentFocus: () => null, setFocus() {} }) },
    InputNavigationAction: { UP: 1, DOWN: 2, LEFT: 3, RIGHT: 4, PREVIOUS: 5, NEXT: 6 },
    DisplayQueueManager: {
      suspended: false,
      isSuspended() { return this.suspended; },
      suspend() { this.suspended = true; calls.queueSuspends++; },
      resume() { this.suspended = false; calls.queueResumes++; },
    },
    InterfaceMode: {
      mode: 'INTERFACEMODE_DEFAULT',
      isInInterfaceMode(name) { return this.mode === name; },
      switchTo(name) { this.mode = name; calls.menuOpens++; return true; },
    },
    ContextManager, Cursor: { target: null }, localStorage,
    DialogBoxAction: { Confirm: 1, Cancel: 2 },
    DialogBoxManager: { createDialog_ConfirmCancel(params) {
      calls.exitPrompts++;
      exitConfirmation = params;
      const dialog = { contains: target => target === dialog };
      nativeScreens.set('screen-dialog-box', dialog);
    } },
    engine: { call: name => calls.exits.push(name),
      on(name, fn) { if (!saveEvents.has(name)) saveEvents.set(name, new Set()); saveEvents.get(name).add(fn); },
      off(name, fn) { saveEvents.get(name)?.delete(fn); } },
    Network: { saveGame(params) {
      calls.restSaves.push(params); emitSave('StartSaveRequest');
      if (autoSave) emitSave('SaveComplete', { options: params.LocationCategories, result: 0 });
      return true;
    }, deleteSaveGame() { calls.saveDeletes++; } },
    GameStateStorage: { getGameConfigurationSaveType: () => 1, querySaveGameList: () => { calls.saveQueries++; return 99; }, closeFileListQuery() {} },
    SaveLocations: { LOCAL_STORAGE: 1 }, SaveLocationCategories: { NORMAL: 1, AUTOSAVE: 4, QUICKSAVE: 2 },
    SaveFileTypes: { GAME_STATE: 0 }, SerializerResult: { RESULT_OK: 0, RESULT_PENDING: 1 },
    Game: { turn, age: 'age1' }, GameContext: ctx,
    UI: { isInGame: () => true },
    Configuration: { getGame: () => ({ isAnyMultiplayer: multiplayer, gameSeed: 123 }) },
    Players: { isValid: () => true, get: () => ({ isHuman: true, isTurnActive: true }) },
    InputActionStatuses: { FINISH: 1 },
    document: { body: {}, querySelector: selector => selector === 'panel-action' ? {} :
      selector.split(',').map(name => nativeScreens.get(name.trim())).find(Boolean) ?? null,
      elementFromPoint: () => null },
    window: { addEventListener: (type, fn) => events.set(type, fn), removeEventListener() {} },
    Controls: { loadStyle() {}, decorate() {} }, console: { log() {}, warn() {} },
    setInterval: fn => { timers.push(fn); return timers.length; }, clearInterval() {},
    Date: class extends Date { static now() { return clock.now; } },
  };
  // Fixed short intervals keep interaction scenarios independent of product defaults.
  sandbox.settingsStore.data.config.intervals = [5, 4, 3, 2, 1];
  sandbox.settingsStore.data.config.nightEnabled = nightEnabled;
  sandbox.settingsStore.data.config.idleSaveEnabled = idleSaveEnabled;
  vm.runInNewContext(source, sandbox);
  timers[0](); // The bootstrap interval observes an already attached panel.
  return { calls, clock, timers, events, sandbox, storage: localStorage, session,
    respondToExit, emitSave,
    showNativeScreen(name) {
      const screen = { contains: target => target === screen };
      nativeScreens.set(name, screen);
      return screen;
    },
    hideNativeScreen: name => nativeScreens.delete(name),
    settingsOpen: () => nativeSettingsOpen,
    panel: new PanelAction(), view: () => view,
    input(name, target = null) {
      sandbox.Cursor.target = target;
      return ContextManager.handleInput({ detail: { name, status: 1 }, preventDefault() {}, stopImmediatePropagation() {} });
    } };
}

test('exit confirmation receives keyboard, pointer and navigation while forced rest remains pending', () => {
  const h = harness({ playedTurns: 4 });
  h.panel.sendEndTurn();
  const dialog = h.showNativeScreen('screen-dialog-box');
  assert.equal(h.input('accept'), true, 'native exit confirmation must receive confirm input');
  assert.equal(h.input('mousebutton-left', dialog), true);
  assert.equal(h.sandbox.ContextManager.handleNavigation({ preventDefault() {} }), true);
  assert.equal(h.calls.inputs, 2);
  assert.equal(h.calls.navigation, 1);
  assert.equal(h.view().mode, 'rest');
  assert.equal(h.calls.submits, 0);
  h.hideNativeScreen('screen-dialog-box');
  assert.equal(h.input('force-end-turn'), false);
  assert.equal(h.calls.submits, 0);
});

test('exit confirmation DOM clicks and Enter are not swallowed by the rest capture guard', () => {
  const h = harness({ playedTurns: 4 });
  h.panel.sendEndTurn();
  const dialog = h.showNativeScreen('screen-dialog-box');
  for (const type of ['pointerdown', 'pointerup', 'click', 'keydown', 'keyup']) {
    let blocked = false;
    h.events.get(type)({ type, key: 'Enter', target: dialog, preventDefault() { blocked = true; }, stopImmediatePropagation() {} });
    assert.equal(blocked, false, `native dialog ${type} must remain usable`);
  }
  assert.equal(h.view().mode, 'rest');
  assert.equal(h.calls.submits, 0);
});

test('exit shortcut shows confirmation and cancel preserves the break', () => {
  const h = harness({ playedTurns: 4 });
  h.panel.sendEndTurn();
  const deadline = h.session.pending.deadline;
  h.input('keyboard-escape');
  assert.equal(h.calls.exitPrompts, 1);
  assert.deepEqual(h.calls.exits, []);
  h.input('cancel');
  assert.equal(h.session.pending.deadline, deadline);
  assert.equal(h.view().mode, 'rest');
  h.input('cancel');
  h.clock.now += 300000;
  h.input('accept');
  assert.deepEqual(h.calls.exits, ['exitToDesktop']);
  assert.equal(h.calls.submits, 0, 'confirming exit must never submit the queued turn, even after the timer ends');
});

test('Escape opens native exit confirmation during both forced and voluntary rest', () => {
  for (const mode of ['rest', 'idle']) {
    const h = harness({ turn: 4, playedTurns: 4 });
    if (mode === 'rest') { h.sandbox.Game.turn = 5; h.panel.sendEndTurn(); }
    else { h.clock.now += 60000; h.timers[0](); }
    h.input('keyboard-escape');
    assert.equal(h.calls.exitPrompts, 1);
    h.input('keyboard-escape');
    assert.equal(h.calls.exitPrompts, 1, 'Escape cancels the existing dialog instead of opening another');
    assert.equal(h.view().mode, mode);
    assert.deepEqual(h.calls.exits, []);
    assert.equal(h.calls.submits, 0);
  }
});

test('four previously played turns plus one end action triggers rest exactly once', () => {
  const h = harness({ turn: 4, playedTurns: 3 });
  h.panel.sendEndTurn();
  assert.equal(h.calls.submits, 1);
  h.sandbox.Game.turn = 5;
  h.panel.sendEndTurn();
  h.panel.sendEndTurn(); // repeated hotkey or auto-end-turn
  assert.equal(h.calls.submits, 1);
  assert.equal(h.calls.panelEffects, 1);
  assert.equal(h.view().mode, 'rest');
});
test('escape, next-turn and pointer input cannot bypass a rest; continue submits once', () => {
  const h = harness({ playedTurns: 4 });
  h.panel.sendEndTurn();
  for (const name of ['keyboard-escape', 'force-end-turn', 'mousebutton-right', 'keyboard-enter']) {
    assert.equal(h.input(name), false);
    if (name === 'keyboard-escape') h.respondToExit(2);
  }
  assert.equal(h.calls.submits, 0);
  assert.equal(h.calls.inputs, 0);
  h.clock.now += 300000;
  h.input('mousebutton-left', 'continue');
  assert.equal(h.calls.submits, 1);
  assert.equal(h.calls.panelEffects, 1);
  assert.equal(h.view().mode, null);
});
test('HUD opens native settings; native input works while auto-end-turn is blocked', () => {
  const h = harness({ turn: 3 });
  h.panel.sendEndTurn();
  h.view().callbacks.openSettings();
  h.panel.sendEndTurn();
  assert.equal(h.calls.submits, 1);
  assert.equal(h.settingsOpen(), true);
  assert.equal(h.view().mode, null);
  h.input('keyboard-escape');
  assert.equal(h.settingsOpen(), false);
  h.panel.sendEndTurn();
  assert.equal(h.calls.submits, 2);
});

test('a time break starting in native options leaves confirm/cancel and controller navigation available', () => {
  const h = harness({ turn: 3 });
  h.view().callbacks.openSettings();
  for (let i = 0; i < 25; i++) { h.clock.now += 60000; h.input('mousebutton-left'); }
  const deadline = h.session.pending.deadline;
  assert.equal(h.view().root.style.display, 'none');
  assert.equal(h.input('accept'), true);
  assert.equal(h.sandbox.ContextManager.handleNavigation({}), true);
  h.panel.sendEndTurn();
  assert.equal(h.input('keyboard-escape'), true);
  assert.equal(h.settingsOpen(), false);
  assert.equal(h.input('force-end-turn'), false);
  assert.equal(h.session.pending.deadline, deadline);
  assert.equal(h.calls.submits, 0);
});

test('a break starting in a player-opened pause menu leaves the native menu interactive', () => {
  const h = harness({ turn: 3 });
  h.sandbox.InterfaceMode.mode = 'INTERFACEMODE_PAUSE_MENU';
  h.showNativeScreen('#screen-pause-menu');
  for (let i = 0; i < 25; i++) { h.clock.now += 60000; h.input('mousebutton-left'); }
  assert.ok(h.session.pending);
  assert.equal(h.view().root.style.display, 'none');
  assert.equal(h.input('accept'), true);
  h.hideNativeScreen('#screen-pause-menu'); h.sandbox.InterfaceMode.mode = 'INTERFACEMODE_DEFAULT';
  assert.equal(h.input('force-end-turn'), false);
  assert.equal(h.view().root.style.display, '');
});
test('native direct submission is guarded when engine allows wrapping', () => {
  const h = harness({ playedTurns: 4 });
  h.sandbox.GameContext.sendTurnComplete();
  assert.equal(h.calls.submits, 0);
  h.clock.now += 300000;
  h.view().callbacks.resume();
  assert.equal(h.calls.submits, 1);
});
test('required panel guard works when native API is read-only', () => {
  const h = harness({ readonlyNative: true, playedTurns: 4 });
  h.panel.sendEndTurn();
  assert.equal(h.calls.submits, 0);
  h.clock.now += 300000;
  h.view().callbacks.resume();
  assert.equal(h.calls.submits, 1);
});
test('reload transfers the same break, with remaining duration and no settings writes', () => {
  const h = harness({ playedTurns: 4 });
  h.panel.sendEndTurn();
  assert.equal(h.calls.writes, 0);
  const reloaded = harness({ storage: h.storage, savedSession: h.session.export(), startTime: h.clock.now + 60000 });
  assert.equal(reloaded.view().mode, 'rest');
  assert.equal(reloaded.view().remaining, 240000);
  assert.equal(reloaded.calls.submits, 0);
});

test('time limit interrupts a normal turn without needing an end-turn action', () => {
  const h = harness({ turn: 4 });
  for (let i = 0; i < 25; i++) { h.clock.now += 60000; h.input('mousebutton-left'); }
  assert.equal(h.view().mode, 'rest');
  assert.equal(h.view().pending.reason, 'time');
  h.clock.now += 300000;
  h.view().callbacks.resume();
  assert.equal(h.view().mode, null);
  assert.equal(h.calls.submits, 0);
  h.sandbox.Game.turn = 5;
  h.panel.sendEndTurn();
  assert.equal(h.calls.submits, 1);
  assert.equal(h.calls.writes, 0);
});

test('mouse motion counts as activity; a five-minute idle resets both triggers', () => {
  const h = harness({ turn: 4 });
  h.clock.now += 59000;
  h.events.get('mousemove')();
  assert.equal(h.session.lastInputAt, h.clock.now);
  h.clock.now += 300000;
  h.timers[0]();
  assert.equal(h.session.idleRested, true);
  assert.equal(h.view().mode, 'idle');
  h.input('mousebutton-left', 'continue');
  assert.equal(h.view().mode, null);
  assert.equal(h.session.elapsed(h.clock.now), 0);
  h.sandbox.Game.turn = 5;
  h.panel.sendEndTurn();
  assert.equal(h.calls.submits, 1);
});

test('idle overlay appears after one minute and survives motion, navigation and escape', () => {
  const h = harness({ turn: 4 });
  h.clock.now += 59999;
  h.timers[0]();
  assert.equal(h.view().mode, null);
  h.clock.now++;
  h.timers[0]();
  assert.equal(h.view().mode, 'idle');
  assert.equal(h.view().idleElapsed, 60000);
  h.events.get('mousemove')();
  h.input('keyboard-escape');
  h.respondToExit(2);
  h.sandbox.ContextManager.handleNavigation({ preventDefault() {} });
  assert.equal(h.view().mode, 'idle');
  assert.equal(h.calls.inputs, 0);
  assert.equal(h.calls.navigation, 0);
  h.input('mousebutton-left', 'continue');
  assert.equal(h.view().mode, null);
  assert.equal(h.calls.submits, 0);
  assert.equal(h.session.turnsRemaining({ turn: 4, context: 'game:123:player:0:age:age1' }, normalizeConfig({ intervals: [5, 4, 3, 2, 1] })), 5);
});

test('idle continue supports keyboard, controller and DOM Enter without passing input to the game', () => {
  for (const input of ['keyboard-enter', 'accept', 'DOM Enter']) {
    const h = harness({ turn: 4 });
    h.clock.now += 60000;
    h.timers[0]();
    if (input === 'DOM Enter') {
      let prevented = false;
      h.events.get('keydown')({ type: 'keydown', key: 'Enter', preventDefault() { prevented = true; }, stopImmediatePropagation() {} });
      assert.equal(prevented, true);
    } else assert.equal(h.input(input), false);
    assert.equal(h.view().mode, null);
    assert.equal(h.calls.inputs, 0);
    assert.equal(h.calls.submits, 0);
  }
});

test('automatic turn requests during idle rest are discarded rather than submitted on continue', () => {
  const h = harness({ turn: 5, playedTurns: 4 });
  h.clock.now += 60000;
  h.timers[0]();
  h.panel.sendEndTurn();
  h.sandbox.GameContext.sendTurnComplete();
  h.input('mousebutton-left', 'continue');
  assert.equal(h.view().mode, null);
  assert.equal(h.calls.submits, 0);
  assert.equal(h.calls.panelEffects, 0);
  h.panel.sendEndTurn();
  assert.equal(h.view().mode, 'rest');
  assert.equal(h.view().pending.reason, 'turn');
});

test('returning before the next timer update credits idle rest and keeps the game usable', () => {
  const h = harness({ turn: 4 });
  h.clock.now += 300000;
  assert.equal(h.input('mousebutton-left'), true);
  assert.equal(h.view().mode, null);
  assert.equal(h.session.elapsed(h.clock.now), 0);
});

test('time feature off and loading do not open an idle overlay', () => {
  for (const scenario of ['disabled', 'loading']) {
    const h = harness({ turn: 4 });
    if (scenario === 'disabled') h.sandbox.settingsStore.data.config.timeEnabled = false;
    else h.session.beginLoading(h.clock.now);
    h.clock.now += 360000;
    h.timers[0]();
    assert.equal(h.view().mode, null);
    assert.equal(h.session.idleRested, false);
  }
});

test('idle rest waits behind native settings and can be dismissed after the options close', () => {
  const h = harness({ turn: 4 });
  h.view().callbacks.openSettings();
  h.clock.now += 60000;
  h.timers[0]();
  assert.equal(h.view().mode, 'idle');
  assert.equal(h.view().root.style.display, 'none');
  assert.equal(h.input('keyboard-escape'), true);
  assert.equal(h.settingsOpen(), false);
  h.input('mousebutton-left', 'continue');
  assert.equal(h.view().mode, null);
  assert.equal(h.calls.submits, 0);
});
test('age reset changes interval without writing turn or timer data', () => {
  const h = harness({ turn: 80, playedTurns: 1 });
  h.panel.sendEndTurn();
  assert.equal(h.calls.submits, 0);
  h.clock.now += 300000;
  h.view().callbacks.resume();
  assert.equal(h.calls.submits, 1);
  h.sandbox.Game.age = 'age2';
  h.sandbox.Game.turn = 0;
  for (const tick of h.timers) tick();
  assert.equal(h.view().turn, 0);
  h.panel.sendEndTurn();
  assert.equal(h.calls.submits, 2);
  assert.equal(h.calls.writes, 0);
});
test('multiplayer bypasses all mod UI and submission handling', () => {
  const h = harness({ multiplayer: true });
  h.panel.sendEndTurn();
  assert.equal(h.calls.submits, 1);
  assert.equal(h.view(), undefined);
  assert.equal(h.input('force-end-turn'), true);
});


test('a loaded turn number alone never counts; panel and native hooks count one end action', () => {
  const h = harness({ turn: 10 });
  assert.equal(h.session.turnCount, 0);
  for (const turn of [10, 11, 12, 13]) {
    h.sandbox.Game.turn = turn;
    h.panel.sendEndTurn();
  }
  assert.equal(h.session.turnCount, 4);
  assert.equal(h.calls.submits, 4);
  h.sandbox.Game.turn = 14;
  h.panel.sendEndTurn();
  assert.equal(h.session.turnCount, 5);
  assert.equal(h.view().mode, 'rest');
  assert.equal(h.calls.submits, 4);
  h.clock.now += 300000;
  h.view().callbacks.resume();
  assert.equal(h.calls.submits, 5);
  assert.equal(h.session.turnCount, 0);
  assert.equal(h.calls.writes, 0);
});


test('all break triggers, refreshes and legacy save opt-ins never save, query or delete files', () => {
  for (const mode of ['turn', 'time', 'idle', 'night']) {
    const h = harness({ playedTurns: mode === 'turn' ? 4 : 0, idleSaveEnabled: true,
      nightEnabled: mode === 'night', startTime: localTime(mode === 'night' ? 23 : 12) });
    if (mode === 'turn') h.panel.sendEndTurn();
    else if (mode === 'time') {
      for (let i = 0; i < 25; i++) { h.clock.now += 60000; h.input('mousebutton-left'); }
    } else if (mode === 'idle') { h.clock.now += 60000; h.timers[0](); }
    for (let i = 0; i < 10; i++) { h.timers[0](); h.events.get('mousemove')(); }
    h.emitSave('SaveComplete', { options: 4, result: 0 });
    assert.equal(h.view().mode, mode === 'turn' || mode === 'time' ? 'rest' : mode);
    assert.deepEqual(h.calls.restSaves, []);
    assert.equal(h.calls.saveQueries, 0); assert.equal(h.calls.saveDeletes, 0);
    assert.equal(h.calls.submits, 0);
  }
});

test('native menu permits saving and options without dismissing or completing a required break', () => {
  const h = harness({ playedTurns: 4 }); h.panel.sendEndTurn();
  const deadline = h.session.pending.deadline;
  h.input('sys-menu');
  assert.equal(h.calls.menuOpens, 1);
  assert.equal(h.view().root.style.display, 'none');
  assert.equal(h.view().callbacks.hasDialog(), true, 'timer cannot steal menu focus');
  for (const name of ['screen-save-load', 'screen-options']) {
    const screen = h.showNativeScreen(name);
    assert.equal(h.input('mousebutton-left', screen), true);
    assert.equal(h.input('keyboard-enter'), true);
    assert.equal(h.sandbox.ContextManager.handleNavigation({}), true);
    for (const type of ['click', 'keydown', 'keyup', 'pointerdown', 'wheel']) {
      h.events.get(type)({ type, key: 'x', target: screen,
        preventDefault() { assert.fail(`native menu ${type} was blocked`); }, stopImmediatePropagation() {} });
    }
    h.hideNativeScreen(name);
  }
  h.panel.sendEndTurn(); h.sandbox.GameContext.sendTurnComplete();
  assert.equal(h.panel.sendEndTurn.c7rCanRequestTurn(), false);
  let blocked = false;
  h.events.get('hotkey-next-action')({ type: 'hotkey-next-action', preventDefault() { blocked = true; }, stopImmediatePropagation() {} });
  assert.equal(blocked, true);
  h.clock.now += 60000; h.timers[0]();
  assert.equal(h.view().remaining, 240000);
  assert.equal(h.session.pending.deadline, deadline);
  h.sandbox.InterfaceMode.mode = 'INTERFACEMODE_DEFAULT';
  assert.equal(h.input('force-end-turn'), false, 'first world input reactivates the guard');
  assert.equal(h.view().root.style.display, '');
  h.view().callbacks.resume(); assert.equal(h.calls.submits, 0);
  h.view().callbacks.openGameMenu();
  h.clock.now += 300000; h.timers[0]();
  h.view().callbacks.resume();
  assert.equal(h.calls.submits, 0, 'deadline and stale Continue actions must not submit while saving');
  h.sandbox.InterfaceMode.mode = 'INTERFACEMODE_DEFAULT'; h.timers[0]();
  h.view().callbacks.resume(); assert.equal(h.calls.submits, 1);
  assert.deepEqual(h.calls.restSaves, []);
});

test('night and idle menus remain usable and returning never submits a turn', () => {
  for (const mode of ['night', 'idle']) {
    const h = harness({ nightEnabled: mode === 'night', startTime: localTime(23) });
    if (mode === 'idle') { h.clock.now += 60000; h.timers[0](); }
    h.view().callbacks.openGameMenu();
    assert.equal(h.input('quicksave'), true);
    h.sandbox.InterfaceMode.mode = 'INTERFACEMODE_DEFAULT'; h.timers[0]();
    assert.equal(h.view().root.style.display, '');
    assert.equal(h.view().mode, mode);
    h.view().callbacks.resume();
    assert.equal(h.view().mode, mode === 'night' ? 'night' : null);
    assert.equal(h.calls.submits, 0);
  }
});

test('menu activation failure restores the rest overlay and input lock', () => {
  const h = harness({ playedTurns: 4 }); h.panel.sendEndTurn();
  h.sandbox.InterfaceMode.switchTo = () => { throw new Error('unavailable'); };
  h.view().callbacks.openGameMenu();
  assert.equal(h.view().root.style.display, '');
  assert.equal(h.input('force-end-turn'), false);
  assert.equal(h.calls.submits, 0);
});

test('native pause view rejection keeps the overlay even if the mode already changed', () => {
  const h = harness({ playedTurns: 4 }); h.panel.sendEndTurn();
  h.sandbox.InterfaceMode.switchTo = name => { h.sandbox.InterfaceMode.mode = name; return false; };
  h.view().callbacks.openGameMenu();
  assert.equal(h.view().root.style.display, '');
  assert.equal(h.input('force-end-turn'), false);
  assert.equal(h.calls.submits, 0);
});

const localTime = (h, m = 0, day = 22) => new Date(2026, 9, day, h, m).getTime();

test('night restriction blocks all turn and continue routes but preserves exit confirmation', () => {
  const h = harness({ nightEnabled: true, startTime: localTime(23) });
  assert.equal(h.view().mode, 'night');
  assert.equal(h.calls.restSaves.length, 0);
  assert.equal(h.panel.sendEndTurn.c7rCanRequestTurn(), false);
  h.panel.sendEndTurn(); h.sandbox.GameContext.sendTurnComplete();
  for (const input of ['accept', 'keyboard-enter', 'force-end-turn', 'mousebutton-left']) h.input(input, 'continue');
  h.view().callbacks.resume();
  assert.equal(h.calls.submits, 0);
  assert.equal(h.calls.restSaves.length, 0);
  h.input('keyboard-escape'); assert.equal(h.calls.exitPrompts, 1);
  h.input('cancel'); assert.equal(h.view().mode, 'night');
  h.input('cancel'); h.input('accept');
  assert.deepEqual(h.calls.exits, ['exitToDesktop']);
});

test('22:00 blocks the first input without waiting for the periodic tick; 07:00 never auto-submits', () => {
  const h = harness({ nightEnabled: true, startTime: localTime(21, 59) });
  h.sandbox.settingsStore.data.config.turnEnabled = false;
  h.sandbox.settingsStore.data.config.timeEnabled = false;
  assert.equal(h.view().mode, null);
  h.clock.now = localTime(22);
  assert.equal(h.panel.sendEndTurn.c7rCanRequestTurn(), false);
  h.panel.sendEndTurn();
  assert.equal(h.view().mode, 'night'); assert.equal(h.calls.submits, 0);
  h.clock.now = localTime(7, 0, 23); h.timers[0]();
  assert.equal(h.view().mode, null); assert.equal(h.calls.submits, 0);
  h.panel.sendEndTurn(); assert.equal(h.calls.submits, 1);
});

test('night interrupts a queued ordinary break and discards its pending turn submission', () => {
  const h = harness({ playedTurns: 4, nightEnabled: true, startTime: localTime(21, 59) });
  h.panel.sendEndTurn(); assert.equal(h.view().mode, 'rest');
  h.clock.now = localTime(22); h.timers[0]();
  assert.equal(h.view().mode, 'night');
  h.clock.now = localTime(7, 0, 23); h.view().callbacks.resume();
  assert.equal(h.calls.submits, 0); assert.equal(h.session.pending, null);
});

test('night disable is independent of other triggers, and loaded night does not save twice', () => {
  const disabled = harness({ nightEnabled: false, startTime: localTime(23) });
  assert.equal(disabled.view().mode, null);
  disabled.panel.sendEndTurn(); assert.equal(disabled.calls.submits, 1);
  const h = harness({ nightEnabled: true, startTime: localTime(23) });
  const loaded = harness({ nightEnabled: true, startTime: localTime(23, 1), savedSession: h.session.export() });
  assert.equal(loaded.view().mode, 'night'); assert.equal(loaded.calls.restSaves.length, 0);
});

test('recording bypasses every gate at night without settings changes, saves, or a queued submit', () => {
  const h = harness({nightEnabled:true,startTime:localTime(21,59),playedTurns:4});
  h.panel.sendEndTurn();
  const before = JSON.stringify(h.sandbox.settingsStore.data.config);
  const writesBefore = h.calls.restSaves.length;
  const now=localTime(23);
  h.storage.setItem('modSettings',JSON.stringify({'civ7-rest-guard.activity.v1':{
    capture:{kind:'recording',issuedAt:now,expiresAt:now+90000}
  }}));
  h.clock.now=now;
  h.timers[0]();
  assert.equal(h.view().mode,null);
  assert.equal(h.view().root.style.display,'none');
  assert.equal(h.input('mousebutton-left'),true);
  assert.equal(h.panel.sendEndTurn.c7rCanRequestTurn(),true);
  h.panel.sendEndTurn();
  assert.equal(h.calls.submits,1);
  assert.equal(h.calls.restSaves.length,writesBefore);
  assert.equal(JSON.stringify(h.sandbox.settingsStore.data.config),before);
  h.clock.now+=90001;
  h.timers[0]();
  assert.equal(h.view().mode,'night');
  assert.equal(h.panel.sendEndTurn.c7rCanRequestTurn(),false);
  assert.equal(h.calls.submits,1,'ending capture never replays an old end-turn');
});

test('controller direction steps once on release and stays behind native dialogs',()=>{
  const h=harness({playedTurns:4});h.panel.sendEndTurn();
  const send=status=>h.sandbox.ContextManager.handleNavigation({detail:{navigation:2,status},preventDefault(){},stopImmediatePropagation(){}});
  send(0);assert.equal(h.calls.lastNavigationStep,undefined);
  send(1);assert.equal(h.calls.lastNavigationStep,1);assert.equal(h.calls.navigation,0);
  h.showNativeScreen('screen-dialog-box');h.calls.lastNavigationStep=null;
  send(1);assert.equal(h.calls.lastNavigationStep,null);assert.equal(h.calls.navigation,1);
});

test('default idle breaks never autosave, and Continue restores native manual-save input', () => {
  const h = harness();
  h.clock.now += 60000;
  for (let i = 0; i < 10; i++) h.timers[0]();
  assert.equal(h.view().mode, 'idle');
  assert.equal(h.calls.restSaves.length, 0);
  h.view().callbacks.resume();
  assert.equal(h.view().mode, null);
  assert.equal(h.input('quicksave'), true);
  assert.equal(h.calls.restSaves.length, 0);
  assert.equal(h.calls.submits, 0);
  h.clock.now += 60000; h.timers[0]();
  assert.equal(h.calls.restSaves.length, 0, 'later idle breaks also stay unsaved');
});


test('diplomatic breaks use the full native pause menu, even if suspending the queue refreshes the UI', () => {
  for (const mode of ['INTERFACEMODE_DIPLOMACY_PROJECT_REACTION', 'INTERFACEMODE_PEACE_DEAL',
    'INTERFACEMODE_DIPLOMACY_DIALOG', 'INTERFACEMODE_DIPLOMACY_HUB']) {
    const h = harness({ playedTurns: 4 }); h.panel.sendEndTurn();
    const deadline = h.session.pending.deadline;
    h.sandbox.InterfaceMode.mode = mode;
    h.sandbox.DisplayQueueManager.suspend = function () {
      this.suspended = true; h.timers[0]();
    };
    h.view().callbacks.openGameMenu();
    assert.equal(h.sandbox.InterfaceMode.mode, 'INTERFACEMODE_PAUSE_MENU');
    assert.equal(h.sandbox.DisplayQueueManager.suspended, true);
    assert.equal(h.settingsOpen(), false);
    assert.equal(h.view().root.style.display, 'none');
    assert.equal(h.input('accept'), true);
    h.sandbox.DisplayQueueManager.resume(); h.sandbox.InterfaceMode.mode = mode;
    h.timers[0]();
    assert.equal(h.input('force-end-turn'), false);
    assert.equal(h.view().root.style.display, '');
    assert.equal(h.session.pending.deadline, deadline);
    assert.equal(h.calls.restSaves.length + h.calls.submits, 0);
  }
});

test('failed pause entry restores only the display suspension owned by this action', () => {
  for (const alreadySuspended of [false, true]) for (const throws of [false, true]) {
    const h = harness({ playedTurns: 4 }); h.panel.sendEndTurn();
    h.sandbox.DisplayQueueManager.suspended = alreadySuspended;
    h.sandbox.InterfaceMode.switchTo = () => { if (throws) throw new Error('view unavailable'); return false; };
    h.view().callbacks.openGameMenu();
    assert.equal(h.sandbox.DisplayQueueManager.isSuspended(), alreadySuspended);
    assert.equal(h.calls.queueResumes, alreadySuspended ? 0 : 1);
    assert.equal(h.view().root.style.display, '');
    assert.equal(h.input('force-end-turn'), false);
  }
});

test('the native Start Game curtain owns pointer, accept and navigation even with a pending rest', () => {
  const h = harness({ playedTurns: 4 });
  h.panel.sendEndTurn();
  const deadline = h.session.pending.deadline;
  const curtain = h.showNativeScreen('#loading-curtain');
  h.timers[0]();
  assert.equal(h.input('mousebutton-left', curtain), true);
  assert.equal(h.input('accept'), true);
  assert.equal(h.sandbox.ContextManager.handleNavigation({preventDefault() {}}), true);
  h.events.get('click')({ type: 'click', target: curtain, preventDefault() { assert.fail('Start Game click swallowed'); } });
  assert.equal(h.view().root.style.display, 'none');
  h.panel.sendEndTurn();
  assert.equal(h.calls.submits, 0);
  h.hideNativeScreen('#loading-curtain');
  h.timers[0]();
  assert.equal(h.input('accept'), false);
  assert.equal(h.session.pending.deadline, deadline);
});
