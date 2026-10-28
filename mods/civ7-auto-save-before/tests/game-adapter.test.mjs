// Uses the locally installed game's actual PanelAction code with a mocked native
// bridge. This tests wiring; it is NOT an in-game save/load test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { SaveGate, installTurnHook } from '../ui/save-gate.js';
import { installDiplomacyHooks } from '../ui/diplomacy-hook.js';

const gameRoot = process.env.CIV7_GAME_DIR || "D:/Program Files (x86)/Steam/steamapps/common/Sid Meier's Civilization VII";
const panelPath = join(gameRoot, 'Base/modules/base-standard/ui/action/panel-action.js');
const restRoot = process.env.CIV7_REST_GUARD_DIR || fileURLToPath(new URL('../../civ7-no-more-turn/', import.meta.url));
const skip = !existsSync(panelPath);

test('native adapter exposes recovery tracking for the rest saver', { skip }, () => {
  const h = harness();
  h.panel.sendEndTurn();
  const bridge = h.context.__civ7BeforeEndTurnV1;
  assert.equal(bridge.saveTracking.recovery, null);
  h.flush(5000);
  assert.equal(bridge.saveTracking.recovery.source, 'civ7-before-end-turn');
  assert.equal(bridge.saveTracking.recovery.kind, 'turn');
  assert.equal(bridge.saveTracking.inFlight, 1);
  h.complete(1); h.flush(0);
  assert.equal(bridge.saveTracking.inFlight, 0);
  bridge.destroy();
  assert.equal(bridge.saveTracking, null);
});
const withoutImports = text => text.replace(/^import .*;\r?$/gm, '');
const modSource = withoutImports(readFileSync(new URL('../ui/before-end-turn.js', import.meta.url), 'utf8'));

function harness({ withRest = false } = {}) {
  const calls = [], listeners = new Map(), timers = new Map(), domListeners = new Map();
  let timerId = 0, sent = false, now = 0;
  const config = { gameSeed: 31337, isAnyMultiplayer: false };
  const player = { isHuman: true, isTurnActive: true };
  function node() {
    return { style: {}, classList: { contains: () => false, add() {}, remove() {} },
      setAttribute() {}, appendChild() {}, remove() {}, contains: () => false };
  }
  const context = vm.createContext({
    SaveGate, installTurnHook, installDiplomacyHooks,
    Locale: { compose: (key, ...args) => [key, ...args].join(' ') },
    settingsStore: { data: { config: { turnEnabled: true, diplomacyEnabled: true } } },
    installSettingsLauncher: () => () => {},
    DiplomacyManager: { closeCurrentDiplomacyDialog() {}, closeCurrentDiplomacyDeal() {}, closeCurrentDiplomacyProject() {}, startWarFromMap() {} },
    PlayerOperationTypes: { DECLARE_WAR: 1, FORM_ALLIANCE: 2, BASIC_PROJECT_DIPLOMATIC_ACTION: 3, BUILD: 4 },
    DiplomacyDealProposalActions: { PROPOSED: 1, ACCEPTED: 2, REJECTED: 3, ADJUSTED: 4, INSPECT: 5 },
    console: { warn() {}, error(message) { calls.push(['error-log', message]); } },
    document: { body: node(), createElement: node, querySelector: () => null },
    window: {
      addEventListener: (name, fn) => { if (!domListeners.has(name)) domListeners.set(name, new Set()); domListeners.get(name).add(fn); },
      removeEventListener: (name, fn) => domListeners.get(name)?.delete(fn)
    },
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id), setInterval: () => ++timerId, clearInterval() {},
    Date: class extends Date { static now() { return now; } },
    engine: {
      on: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
      off: (name, fn) => listeners.get(name)?.delete(fn), call() {}
    },
    Panel: class {}, ImageCache: class {}, styles: '',
    Controls: { define() {}, decorate() {}, loadStyle() {}, getDefinition: () => ({ createInstance: class {
      proposeCurrentDeal() {} acceptDeal() {} rejectDeal() {}
    } }) },
    Audio: { playSound() {}, getSoundTag: value => value },
    UI: { isInGame: () => true, Player: { deselectAllUnits: () => calls.push(['deselect']) }, sendAudioEvent() {} },
    WorldUI: { pushGaussianBlurFilter() {} },
    InterfaceMode: { isInInterfaceMode: () => false },
    InputActionStatuses: { FINISH: 2 },
    Configuration: { getGame: () => config },
    GameContext: { localPlayerID: 0, hasSentTurnComplete: () => sent,
      sendTurnComplete: () => { sent = true; calls.push(['turn']); } },
    Game: { age: 0, turn: 4, AgeProgressManager: { isAgeOver: false },
      PlayerOperations: { sendRequest: (...args) => calls.push(['diplomacy', ...args]) },
      DiplomacyDeals: { sendWorkingDeal: (...args) => calls.push(['deal', ...args]) } },
    Players: { isValid: () => true, get: () => player }, Autoplay: { isActive: false },
    GameStateStorage: { getGameConfigurationSaveType: () => 1 },
    SaveLocations: { LOCAL_STORAGE: 1 },
    SaveLocationCategories: { NORMAL: 1, AUTOSAVE: 4, QUICKSAVE: 2 },
    SaveFileTypes: { GAME_STATE: 0 },
    SerializerResult: { RESULT_OK: 0, RESULT_PENDING: 1 },
    ContextManager: { canSaveGame: () => true, handleInput: () => 'input', handleNavigation: () => 'nav' },
    DialogBoxManager: { createDialog_MultiOption: params => { calls.push(['dialog', params]); return 99; }, closeDialogBox() {} },
    Network: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, Cursor: {}
  });
  function emit(name, result) { for (const fn of [...(listeners.get(name) || [])]) fn(result); }
  context.Network.saveGame = params => { calls.push(['save', params]); emit('StartSaveRequest'); return true; };
  const gameCode = withoutImports(readFileSync(panelPath, 'utf8')).replace('export { PanelAction };', 'globalThis.PanelAction = PanelAction;');
  vm.runInContext(gameCode, context, { filename: panelPath });
  const evaluate = source => vm.runInContext(`(function () { ${source}\n})();`, context);
  const getRest = withRest ? installRest(context, evaluate) : () => null;
  vm.runInContext(`(function () { ${modSource}\n})();`, context);
  const panel = Object.create(context.PanelAction.prototype);
  panel.canUnreadyTurn = () => false;
  panel.canEndTurn = () => true;
  panel.setEndTurnWaiting = () => calls.push(['waiting']);
  return {
    context, panel, config, calls, emit, getRest,
    complete: (options = 65) => emit('SaveComplete', { options, result: 0 }),
    flush(ms = 0) { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.fn(); } },
    nextTurn() { sent = false; context.Game.turn++; },
    advanceTime(ms) { now += ms; },
    evaluate,
    dispose: () => context.__civ7BeforeEndTurnV1.destroy()
  };
}

for (const method of ['onActionButton', 'onNextActionHotkey', 'onActionNextAction', 'onEngineInput', 'sendEndTurn']) {
  test(`installed game ${method}: native turn submission happens after the save`, { skip }, () => {
    const h = harness();
    h.panel[method]({ detail: { status: 2, name: 'force-end-turn' }, preventDefault() {}, stopPropagation() {} });
    assert.equal(h.calls.filter(x => x[0] === 'save').length, 1);
    assert.equal(h.calls.some(x => x[0] === 'turn' || x[0] === 'waiting' || x[0] === 'deselect'), false);
    h.complete(); h.flush();
    assert.deepEqual(h.calls.map(x => x[0]), ['save', 'waiting', 'deselect', 'turn']);
    h.dispose();
  });
}

for (const turnEnabled of [true, false]) for (const diplomacyEnabled of [true, false]) {
  test(`independent switches: turn=${turnEnabled}, diplomacy=${diplomacyEnabled}`, { skip }, () => {
    const h = harness();
    Object.assign(h.context.settingsStore.data.config, { turnEnabled, diplomacyEnabled });
    h.context.Game.PlayerOperations.sendRequest(0, 1, { Player2: 4 });
    if (diplomacyEnabled) {
      assert.equal(h.calls.some(x => x[0] === 'diplomacy'), false);
      assert.equal(h.calls.find(x => x[0] === 'save')[1].FileName, 'BeforeDiplomacy');
      h.complete(); h.flush();
    }
    assert.equal(h.calls.filter(x => x[0] === 'diplomacy').length, 1);
    h.calls.length = 0;
    h.panel.onActionButton();
    if (turnEnabled) {
      assert.equal(h.calls.some(x => x[0] === 'turn'), false);
      assert.equal(h.calls.find(x => x[0] === 'save')[1].FileName, 'BeforeEndTurn');
      h.complete(); h.flush();
    }
    assert.equal(h.calls.filter(x => x[0] === 'turn').length, 1);
    h.dispose();
  });
}

test('adapter uses the same normal local overwrite slot on consecutive turns', { skip }, () => {
  const h = harness();
  h.panel.onActionButton(); h.complete(); h.flush(); h.nextTurn();
  h.panel.onActionButton(); h.complete(); h.flush();
  const saves = h.calls.filter(x => x[0] === 'save').map(x => JSON.parse(JSON.stringify(x[1])));
  const expected = { Location: 1, LocationCategories: 1, Type: 1, ContentType: 0, FileName: 'BeforeEndTurn', Overwrite: true };
  assert.deepEqual(saves, [expected, expected]);
  h.dispose();
});

test('adapter blocks engine input while saving and restores it afterwards', { skip }, () => {
  const h = harness(); let prevented = 0;
  const event = { preventDefault: () => prevented++, stopImmediatePropagation() {} };
  h.panel.onActionButton();
  assert.equal(h.context.ContextManager.handleInput(event), false);
  assert.equal(h.context.ContextManager.handleNavigation(event), false);
  assert.equal(prevented, 2);
  h.complete(); h.flush();
  assert.equal(h.context.ContextManager.handleInput(event), 'input');
  h.dispose();
});

test('adapter rejects autosave completion and exposes a failed write without advancing', { skip }, () => {
  const h = harness(); h.panel.onActionButton();
  h.emit('SaveComplete', { options: 4, result: 0 }); h.flush();
  assert.equal(h.calls.some(x => x[0] === 'turn'), false);
  h.emit('SaveComplete', { options: 65, result: 42 }); h.flush();
  assert.equal(h.calls.some(x => x[0] === 'turn'), false);
  assert.equal(h.calls.filter(x => x[0] === 'dialog').length, 1);
  const dialog = h.calls.find(x => x[0] === 'dialog')[1];
  dialog.options[1].callback();
  h.panel.sendEndTurn(); // Automatic attempts stay suppressed.
  assert.equal(h.calls.filter(x => x[0] === 'save').length, 1);
  h.panel.onActionButton(); // Explicit retry is accepted.
  assert.equal(h.calls.filter(x => x[0] === 'save').length, 2);
  h.complete(); h.flush();
  assert.equal(h.calls.filter(x => x[0] === 'turn').length, 1);
  h.dispose();
});

test('multiplayer bypasses the mod without creating a save', { skip }, () => {
  const h = harness(); h.config.isAnyMultiplayer = true;
  h.panel.onActionButton();
  assert.equal(h.calls.some(x => x[0] === 'save'), false);
  assert.equal(h.calls.some(x => x[0] === 'turn'), true);
  h.dispose();
});

test('captured missing completion: fresh overwrite finishes before actual turn submission', { skip }, () => {
  const h = harness(); h.panel.onActionButton();
  // Native StartSaveRequest happened and the file was written, but the completion
  // was missing. Replay that observed boundary through the actual adapter.
  h.flush(5000);
  assert.equal(h.calls.filter(x => x[0] === 'save').length, 2);
  assert.equal(h.calls.some(x => x[0] === 'turn'), false);
  h.emit('SaveComplete', { result: 0, type: 1, options: 65, fileType: 0 }); h.flush();
  assert.equal(h.calls.filter(x => x[0] === 'turn').length, 1);
  h.dispose();
});

function installRest(context, evaluate) {
  // UI-only dependencies are inert; retain the real turn/save/rest controllers.
  Object.assign(context, {
    getRadialMenus: () => [], registerRadialMenu() {}, registerRadialMenuItem() {}, NavigationType: { FOCUS: 'focus' },
    FocusManager: { get: () => ({ currentFocus: () => null, setFocus() {} }) },
    InputNavigationAction: { UP: 1, DOWN: 2, LEFT: 3, RIGHT: 4, PREVIOUS: 5, NEXT: 6 },
  });
  const read = name => withoutImports(readFileSync(join(restRoot, 'ui', name), 'utf8')).replace(/^export /gm, '');
  context.DEFAULTS = evaluate(`${read('defaults.js')}\nreturn DEFAULTS;`);
  Object.assign(context, evaluate(`${read('rest-model.js')}\nreturn { RestGate, normalizeConfig, scheduleAt, STAGE_LENGTH, nightWindow };`));
  context.RestSession = evaluate(`${read('rest-session.js')}\nreturn RestSession;`);
  context.activityActive = evaluate(`${read('rest-activity.js')}\nreturn activityActive;`);
  context.UIGameLoadingState = { GameStarted: 9 };
  context.UI.getGameLoadingState = () => 9;
  Object.assign(context, evaluate(`${read('rest-runtime.js')}\nreturn { session, checkpoint, installLoadingHooks };`));
  context.Game.turn = 5;
  // Use an explicit user configuration; this integration checks ordering, not release defaults.
  const restConfig = { nightEnabled: false, intervals: [5, 4, 3, 2, 1] };
  // Four real end actions in this live session; loading turn 5 alone is not due.
  for (const turn of [1, 2, 3, 4]) context.session.requestTurn({
    turn, context: 'prior', token: `prior:${turn}`,
  }, context.normalizeConfig(restConfig), context.Date.now());
  Object.assign(context, evaluate(`${read('rest-retention.js')}\nreturn { createRestRetention };`));
  Object.assign(context, evaluate(`${read('rest-save.js')}\nreturn { createRestSaver, newRestSave };`));
  context.RestStore = evaluate(`${read('rest-store.js')}\nreturn RestStore;`);
  // Current Rest Guard shares its store with the settings UI. The settings UI
  // itself is outside this test; exercise the real controller and store.
  context.restSettingsStore = new context.RestStore();
  Object.assign(context.restSettingsStore.data.config, restConfig);
  context.subscribeSettings = () => () => {};
  context.isSettingsOpen = () => false;
  context.openSettings = () => {};
  context.RestView = class {
    constructor(callbacks) { this.callbacks = callbacks; this.root = { style: {} }; }
    close() { this.mode = null; } showRest() { this.mode = 'rest'; }
    showIdleRest() { this.mode = 'idle'; } updateIdleRest() {}
    showNight() { this.mode = 'night'; }
    updateSaveStatus() {} updateRest() {} updateLauncher() {} destroy() {} setVisible() {}
  };
  return evaluate(`const settingsStore = globalThis.restSettingsStore;\n${read('rest-guard.js')}\nreturn () => controller;`);
}

test('manifest loads the save wrapper after Rest Guard so saving precedes turn rest', () => {
  const order = (file, id) => Number(readFileSync(file, 'utf8').match(new RegExp(`<ActionGroup id="${id}"[^>]*>[\\s\\S]*?<LoadOrder>(\\d+)</LoadOrder>`))[1]);
  assert.ok(order(new URL('../before-end-turn.modinfo', import.meta.url), 'before-end-turn-game') >
    order(join(restRoot, 'rest-guard.modinfo'), 'rest-guard-game'));
});

for (const method of ['onActionButton', 'onNextActionHotkey', 'onActionNextAction', 'onEngineInput', 'sendEndTurn']) {
  test(`${method} with Rest Guard: save succeeds, then rest, then exactly one turn submission`, { skip }, () => {
    const h = harness({ withRest: true });
    h.panel[method]({ detail: { status: 2, name: 'force-end-turn' }, preventDefault() {}, stopPropagation() {} });
    assert.equal(h.calls.filter(x => x[0] === 'save' && x[1].FileName === 'BeforeEndTurn').length, 1);
    assert.notEqual(h.getRest().view.mode, 'rest');
    assert.equal(h.calls.some(x => ['turn', 'waiting', 'deselect'].includes(x[0])), false);
    h.complete(); // Wait for the deferred completion, not just the native event.
    assert.notEqual(h.getRest().view.mode, 'rest');
    h.flush();
    assert.equal(h.getRest().view.mode, 'rest');
    assert.equal(h.context.session.pending.reason, 'turn');
    const restSave = h.calls.filter(x => x[0] === 'save' && x[1].FileName.startsWith('RestGuard_'));
    assert.equal(restSave.length, 1, 'a separate rest snapshot follows the pre-turn save');
    assert.equal(restSave[0][1].Overwrite, false);
    assert.equal(restSave[0][1].LocationCategories, h.context.SaveLocationCategories.AUTOSAVE);
    h.complete(h.context.SaveLocationCategories.AUTOSAVE);
    assert.equal(h.context.session.restSave.status, 'saved');
    for (let i = 0; i < 3; i++) h.panel.sendEndTurn();
    h.getRest().view.callbacks.resume(); // Too early: cannot release the turn.
    assert.equal(h.calls.filter(x => x[0] === 'save' && x[1].FileName === 'BeforeEndTurn').length, 1);
    assert.equal(h.calls.some(x => ['turn', 'waiting', 'deselect'].includes(x[0])), false);
    h.advanceTime(300001);
    h.getRest().view.callbacks.resume();
    h.getRest().view.callbacks.resume();
    assert.equal(h.calls.filter(x => x[0] === 'save' && x[1].FileName === 'BeforeEndTurn').length, 1);
    assert.equal(h.calls.filter(x => x[0] === 'turn').length, 1);
    assert.equal(h.getRest().view.mode, null);
    h.dispose();
  });
}

test('failed save does not start turn rest; retry must save successfully first', { skip }, () => {
  const h = harness({ withRest: true });
  h.panel.onActionButton();
  h.emit('SaveComplete', { options: 65, result: 42 }); h.flush();
  assert.equal(h.context.session.pending, null);
  assert.equal(h.context.session.turnCount, 4, 'failed save must not count the requested turn');
  assert.equal(h.calls.some(x => x[0] === 'turn'), false);
  h.calls.find(x => x[0] === 'dialog')[1].options[0].callback(); h.flush();
  assert.equal(h.calls.filter(x => x[0] === 'save' && x[1].FileName === 'BeforeEndTurn').length, 2);
  assert.equal(h.context.session.pending, null);
  h.complete(); h.flush();
  assert.equal(h.getRest().view.mode, 'rest');
  h.advanceTime(300001); h.getRest().resume();
  assert.equal(h.calls.filter(x => x[0] === 'turn').length, 1);
  h.dispose();
});

test('pending turn save defers a time break until after successful completion', { skip }, () => {
  const h = harness({ withRest: true });
  h.context.Game.turn = 4;
  h.context.restSettingsStore.data.config.playMinutes = 1;
  h.panel.onActionButton();
  h.advanceTime(60001);
  h.getRest().tick(); h.getRest().activity();
  assert.equal(h.context.session.pending, null);
  assert.equal(h.context.session.isIdleBreak, false);
  h.complete(); h.flush();
  assert.equal(h.context.session.pending.reason, 'time');
  assert.equal(h.calls.some(x => x[0] === 'turn'), false);
  h.advanceTime(300001); h.getRest().resume();
  assert.equal(h.calls.filter(x => x[0] === 'save' && x[1].FileName === 'BeforeEndTurn').length, 1);
  assert.equal(h.calls.filter(x => x[0] === 'turn').length, 1);
  h.dispose();
});

test('voluntary rest and settings block autosaves; disabling turn saves still allows turn rest', { skip }, () => {
  const h = harness({ withRest: true });
  h.context.isSettingsOpen = () => true;
  h.panel.sendEndTurn();
  assert.equal(h.calls.some(x => x[0] === 'save'), false);
  h.context.isSettingsOpen = () => false;
  h.advanceTime(60000); h.getRest().tick();
  assert.equal(h.getRest().view.mode, 'idle');
  h.panel.sendEndTurn();
  assert.equal(h.calls.some(x => x[0] === 'save' && x[1].FileName === 'BeforeEndTurn'), false);
  h.complete();
  h.getRest().resume();
  h.context.settingsStore.data.config.turnEnabled = false;
  h.panel.onActionButton();
  assert.equal(h.calls.some(x => x[0] === 'save' && x[1].FileName === 'BeforeEndTurn'), false);
  assert.equal(h.getRest().view.mode, 'rest');
  h.advanceTime(300001); h.getRest().resume();
  assert.equal(h.calls.filter(x => x[0] === 'turn').length, 1);
  h.dispose();
});

test('disabling rest preserves save-before-turn behavior', { skip }, () => {
  const h = harness({ withRest: true });
  Object.assign(h.context.restSettingsStore.data.config, { turnEnabled: false, timeEnabled: false });
  h.panel.onActionButton();
  assert.equal(h.calls.filter(x => x[0] === 'save' && x[1].FileName === 'BeforeEndTurn').length, 1);
  assert.equal(h.calls.some(x => x[0] === 'turn'), false);
  h.complete(); h.flush();
  assert.equal(h.calls.filter(x => x[0] === 'turn').length, 1);
  assert.notEqual(h.getRest().view.mode, 'rest');
  h.dispose();
});

for (const kind of ['turn', 'diplomacy']) {
  test(`completion identity when native supplies it: ${kind}`, { skip }, () => {
    const h = harness();
    if (kind === 'turn') h.panel.sendEndTurn();
    else h.context.Game.PlayerOperations.sendRequest(0, 1, { Player2: 4 });
    const fileName = kind === 'turn' ? 'BeforeEndTurn' : 'BeforeDiplomacy';
    for (const extra of [{ fileName: 'OtherMod' }, { fileName: kind === 'turn' ? 'BeforeDiplomacy' : 'BeforeEndTurn' }, { type: 9 }, { fileType: 9 }]) {
      h.emit('SaveComplete', { options: 65, result: 0, ...extra }); h.flush();
      assert.equal(h.calls.some(x => x[0] === 'turn' || x[0] === 'diplomacy'), false);
    }
    h.emit('SaveComplete', { options: 65, result: 0, fileName, type: 1, fileType: 0 }); h.flush();
    assert.equal(h.calls.filter(x => x[0] === (kind === 'turn' ? 'turn' : 'diplomacy')).length, 1);
    h.dispose();
  });
}
