import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { bindDialogNavigation } from '../ui/dialog-navigation.js';
import { comparisonFixture } from './comparison-fixture.mjs';
import { compareImportedConfiguration } from '../ui/compare-imported.js';
import { requirementsFromSave, checkContent, renderContentReport } from '../ui/content-requirements.js';
import { screenshotCatalog, parseSingleImport, applyScreenshot, setScreenshotPlayerCount } from '../ui/screenshot-settings.js';
import { isSetupCode, parseSetupCode } from '../ui/setup-code.js';
import { createSetupCodeAdapter } from '../ui/setup-code-game.js';

// Execute the shipped adapter with SDK boundaries replaced. These checks do
// not establish native UI layout, real engine loading, or first-turn behavior.
const source = (await readFile(new URL('../ui/play-again.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
class Element {
  attributes = {}; children = []; events = {}; style = {};
  classList = { add() {} };
  setAttribute(key, value) { this.attributes[key] = value; }
  getAttribute(key) { return this.attributes[key]; }
  addEventListener(name, callback) { this.events[name] = callback; }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); }
  querySelector() { return null; }
  querySelectorAll() { return this.children; }
}
function harness({ mismatch = false, loadResult = 0, content, nativeMods = [], mapOptions = false, codeOptions = false, advancedOptions = false } = {}) {
  const { expected, actual } = comparisonFixture();
  if (mismatch) actual.map[233116467]++;
  const state = { shell: true, started: false, starts: 0, loads: 0, diagnoses: 0, pushes: [], dialogs: [], decorators: {} };
  state.parameterValues = { GameRandomSeed: 0, MapRandomSeed: 0 }; state.parameterWrites = 0;
  state.parameterOrder = [];
  const mapChoices = mapOptions || codeOptions ? {
    Map: [{ value: '{base-standard}maps/pangaea-plus.js', name: '宽广盘古大陆（经典）' }],
    MapSize: [{ value: 'MAPSIZE_HUGE', name: '巨大' }],
  } : {};
  state.players = Array.from({ length: 8 }, (_, id) => ({ status: id === 0 ? 2 : id === 1 ? 1 : 0, PlayerLeader: 'RANDOM', PlayerCivilization: 'RANDOM' }));
  if (codeOptions) {
    mapChoices.Age = [{ value: 'AGE_ANTIQUITY', name: '古典' }, { value: 'AGE_EXPLORATION', name: '探索' }];
    state.parameterValues.Age = 'AGE_ANTIQUITY';
    state.parameterValues.Map = '{base-standard}maps/pangaea-plus.js'; state.parameterValues.MapSize = 'MAPSIZE_HUGE';
  }
  if (advancedOptions) {
    state.parameterValues.NoCivUnlocks = true; state.parameterValues.Crises = ['CRISIS_PLAGUE'];
    for (const player of state.players) player.PlayerMementoMajorSlot = 'NONE';
  }
  const extraGameParameter = id => advancedOptions && ['NoCivUnlocks', 'Crises'].includes(id) ? {
    ID: id, name: id, array: id === 'Crises', uxHint: id === 'Crises' ? 'InvertSelection' : undefined,
    value: { value: state.parameterValues[id] }, values: id === 'Crises' ? state.parameterValues[id].map(value => ({ value })) : undefined,
    domain: { type: id === 'Crises' ? 'Select' : 'Boolean', possibleValues: id === 'Crises' ? [{ value: 'CRISIS_PLAGUE', name: '瘟疫' }] : undefined },
  } : undefined;
  const timers = new Map(); let nextTimer = 0;
  const events = new Map(), nativeEvents = new Map();
  const main = { clear3DScene() {}, raiseShroud() {}, Root: new Element() };
  const save = { fileName: 'test.Civ7Save', location: 0, type: 1, contentType: 0, locationCategories: 0,
    enabledMods: (content?.requirements ?? []).map(m => ({ ID: m.id, version: m.version, title: m.name })),
    requiredMods: (content?.requirements ?? []).filter(m => m.required).map(m => ({ ID: m.id, version: m.version, title: m.name })) };
  const control = { Root: new Element(), actionButtonsContainer: new Element(), currentPanelOperation: 0, getSelectedSaveGameInfo: () => save, updateLoadButton() {} };
  const context = vm.createContext({
    UI: { isInShell: () => state.shell }, Configuration: { getGame: () => ({ isGameStarted: state.started }), getMap: () => ({ maxMajorPlayers: 8 }), getPlayer: id => ({ slotStatus: state.players[id].status }),
      editPlayer: id => ({ setSlotStatus: value => { state.players[id].status = value; }, setAsMajorCiv() {} }) }, Database: {},
    installedConnection: { token: 'private' }, captureConfiguration: () => actual, compareImportedConfiguration,
    requirementsFromSave, checkContent, renderContentReport, screenshotCatalog, parseSingleImport, applyScreenshot, setScreenshotPlayerCount,
    isSetupCode, parseSetupCode, createSetupCodeAdapter, bindDialogNavigation,
    FocusManager: { get: () => ({ currentFocus: () => null, setFocus() {} }) },
    InputActionStatuses: { START: 0, FINISH: 1 },
    InputNavigationAction: { UP: 1, DOWN: 2, PREVIOUS: 3, NEXT: 4 },
    SlotStatus: { SS_CLOSED: 0, SS_COMPUTER: 1, SS_TAKEN: 2, SS_OPEN: 3 },
    GameContext: { localPlayerID: 0 }, Locale: { compose: text => text },
    DisplayType: { DISPLAY_LOCKED: 9 }, Online: { Metaprogression: {
      getMementoSlotData: () => [{ mementoTypeId: 'PlayerMementoMajorSlot', displayType: 0 }],
      getMementosData: () => [{ mementoTypeId: 'MEMENTO_FOUNDATION_IMAGO_MUNDI', displayType: 0 }],
    } },
    GameSetup: { findPlayerParameter: (id, key) => codeOptions ? { ID: key, value: { value: state.players[id][key] }, domain: { possibleValues: (key === 'PlayerMementoMajorSlot' ? ['NONE', 'MEMENTO_FOUNDATION_IMAGO_MUNDI'] : key === 'PlayerLeader' ? ['RANDOM', 'LEADER_ISABELLA', 'LEADER_AMINA'] : ['RANDOM', 'CIVILIZATION_ROME', 'CIVILIZATION_GREECE']).map(value => ({ value, name: value })) } } : undefined,
      setPlayerParameterValue(id, key, value) { state.parameterWrites++; state.players[id][key] = value; },
      resolveString: value => value,
      findGameParameter: id => extraGameParameter(id) ?? (id.endsWith('RandomSeed') || mapChoices[id] ? { value: { value: state.parameterValues[id] }, domain: { possibleValues: mapChoices[id] ?? [] } } : undefined),
      getGameParameters: () => advancedOptions ? ['NoCivUnlocks', 'Crises'].map(extraGameParameter) : [],
      getPlayerParameters(id) { return advancedOptions && id === 0 ? [this.findPlayerParameter(id, 'PlayerMementoMajorSlot')] : []; },
      setGameParameterValue(id, value) {
        state.parameterWrites++; state.parameterOrder.push(id);
        if (mapChoices[id]) { state.parameterValues.GameRandomSeed = 0; state.parameterValues.MapRandomSeed = 0; }
        state.parameterValues[id] = value;
      } },
    ModAllowance: { Full: 1 }, Modding: { getInstalledMods: () => nativeMods, getModHandle: id => nativeMods.find(mod => mod.id === id)?.handle,
      getModProperty: (handle, key) => nativeMods.find(mod => mod.handle === handle)?.[key], getModulesToExclude: () => [] },
    document: { createElement: () => new Element(), querySelector: name => name === 'main-menu' ? { _component: main } : null, querySelectorAll: () => [] },
    window: { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name), dispatchEvent() {} },
    engine: { on: (name, fn) => nativeEvents.set(name, fn), off: name => nativeEvents.delete(name), call: name => { assert.equal(name, 'startGame'); state.starts++; } },
    Network: { setMainMenuInviteReady() {}, loadGame(request) { state.loads++; assert.equal(request.ContentType, 1); nativeEvents.get('LoadComplete')({ result: loadResult }); return true; } },
    SaveLoadData: { queryIds: [], saves: [], querySaveGameList() {
      this.queryIds.push(42);
      // A closing save screen can finish an old query first. It must not
      // consume the new query's listener or report that the file is missing.
      queueMicrotask(() => {
        events.get('query-done')({ detail: { queryId: 41 } });
        this.saves = [{ ...save, fileName: 'new.Civ7Cfg', contentType: 1 }];
        events.get('query-done')({ detail: { queryId: 42 } });
      });
    } },
    QueryDoneEventName: 'query-done', SaveLocations: { LOCAL_STORAGE: 0 }, SaveTypes: { SINGLE_PLAYER: 1 }, SaveFileTypes: { GAME_STATE: 0, GAME_CONFIGURATION: 1 },
    SaveLocationCategories: { NORMAL: 1 }, ServerType: { SERVER_TYPE_NONE: 0 }, SerializerResult: { RESULT_OK: 0, RESULT_PENDING: 1 },
    StartCampaignEvent: class {}, ContextManager: { popUntil() {}, push(name) { state.pushes.push(name); } },
    ComponentRegistry: { get: () => ({ factory: () => props => props, setFactory() {} }) },
    Controls: { decorate(name, decorator) { state.decorators[name] = decorator; } },
    DialogBoxManager: { createDialog_MultiOption(dialog) { state.dialogs.push(dialog); return state.dialogs.length; }, closeDialogBox() {} },
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(source + '\nglobalThis.testAdapter = { handleSave, getPlayAgainStatus, attachEarlyLoad, reportContent };', context);
  const adapter = context.testAdapter;
  async function importSave() {
    const pending = adapter.handleSave(control);
    const bridge = context.__civ7PlayAgainBridge;
    bridge.complete({ token: 'private', id: bridge.request.id, result: { expected, fileName: 'new.Civ7Cfg', sourceName: 'test' } });
    for (let i = 0; i < 30; i++) {
      await Promise.resolve();
      if (bridge.request?.route === '/diagnose') {
        state.diagnoses++;
        bridge.complete({ token: 'private', id: bridge.request.id, result: content ?? { requirements: [], installed: {} } });
      }
    }
    await pending;
  }
  function flushActions(delay = 0) {
    for (const [id, timer] of timers) if (timer.delay === delay) { timers.delete(id); timer.fn(); }
  }
  return { state, adapter, control, importSave, flushActions, events, bridge: context.__civ7PlayAgainBridge };
}

test('shipped one-click adapter verifies settings and starts only once after an explicit choice', async () => {
  const h = harness(); await h.importSave();
  assert.equal(h.adapter.getPlayAgainStatus().phase, 'ready');
  assert.equal(h.state.loads, 1); assert.equal(h.state.starts, 0);
  const start = h.state.dialogs.at(-1).options.find(option => option.label === '直接开始');
  start.callback(); start.callback(); h.flushActions();
  assert.equal(h.state.starts, 1);
});

test('edit opens the stock editor without starting a game', async () => {
  const h = harness(); await h.importSave();
  h.state.dialogs.at(-1).options.find(option => option.label === '微调设置').callback(); h.flushActions();
  assert.deepEqual(h.state.pushes, ['create-game-sp']); assert.equal(h.state.starts, 0);

});

test('changed settings, cancellation and active gameplay cannot launch from a stale choice', async () => {
  const failed = harness({ mismatch: true }); await failed.importSave();
  assert.equal(failed.adapter.getPlayAgainStatus().phase, 'failed'); assert.equal(failed.state.starts, 0);
  const h = harness(); await h.importSave();
  const options = h.state.dialogs.at(-1).options;
  options.find(option => option.label === '取消').callback(); h.flushActions();
  options.find(option => option.label === '直接开始').callback(); h.flushActions();
  assert.equal(h.state.starts, 0);
  const active = harness(); await active.importSave(); active.state.started = true;
  active.state.dialogs.at(-1).options.find(option => option.label === '直接开始').callback(); active.flushActions();
  assert.equal(active.state.starts, 0);
});

test('early config-load completion belongs to the exact opened load screen', () => {
  const h = harness(); const screen = { Root: new Element() };
  h.adapter.attachEarlyLoad(screen);
  screen.Root.children[0].children[0].events['action-activate']({ stopPropagation() {}, preventDefault() {} });
  assert.equal(h.state.dialogs.length, 0); // Direct first-page entry, no source chooser.
  let stockCalls = 0;
  const requested = { Root: new Element(), onLoadComplete() { stockCalls++; } };
  requested.Root.setAttribute('menu-type', 'load_config');
  h.state.decorators['screen-save-load'](requested).beforeAttach();
  const unrelated = { Root: new Element(), onLoadComplete() {} };
  unrelated.Root.setAttribute('menu-type', 'load_config');
  const original = unrelated.onLoadComplete;
  h.state.decorators['screen-save-load'](unrelated).beforeAttach();
  assert.notEqual(unrelated.onLoadComplete, original); // Failure checks cover every config loader.
  requested.onLoadComplete({ result: 0 }); h.flushActions();
  assert.equal(stockCalls, 1); assert.deepEqual(h.state.pushes, ['screen-save-load', 'create-game-sp']);
});

test('image paste at the text-only entry explains the supported input without requesting a helper', () => {
  const h = harness(); const screen = { Root: new Element() };
  const paste = { type: 'paste', clipboardData: { items: [{ type: 'image/png' }] }, stopPropagation() {}, preventDefault() {} };
  h.events.get('paste')(paste); assert.equal(h.bridge.request, null);
  h.adapter.attachEarlyLoad(screen);
  screen.Root.children[0].children[1].events['action-activate'](paste);
  assert.equal(h.bridge.request, null);
  h.events.get('paste')(paste);
  assert.equal(h.bridge.request, null);
  assert.equal(h.adapter.getPlayAgainStatus().phase, 'paste-hint');
  assert.match(h.adapter.getPlayAgainStatus().message, /支持文字/);
  assert.equal(h.state.starts, 0); assert.equal(h.state.loads, 0);
  h.state.dialogs.at(-1).options.find(option => option.label === '取消').callback(); h.flushActions();
  h.events.get('paste')(paste); assert.equal(h.bridge.request, null);
  assert.equal(h.state.parameterWrites, 0);
});

test('confirmed text fills and verifies seeds, refreshes overview and never starts a world automatically', async () => {
  const h = harness(), screen = { Root: new Element() };
  h.adapter.attachEarlyLoad(screen);
  screen.Root.children[0].children[1].events['action-activate']({ stopPropagation() {}, preventDefault() {} });
  h.events.get('paste')({ type: 'paste', clipboardData: { getData: () => 'Game Seed 4294967295\nMap Seed 0' }, stopPropagation() {}, preventDefault() {} });
  assert.equal(h.bridge.request, null);
  assert.equal(h.state.parameterWrites, 0);
  const apply = h.state.dialogs.at(-1).options.find(option => option.label === '填入设置');
  apply.callback(); apply.callback(); h.flushActions();
  for (let i = 0; i < 12; i++) { h.flushActions(180); await Promise.resolve(); }
  assert.equal(h.state.parameterWrites, 2);
  assert.deepEqual(h.state.parameterValues, { GameRandomSeed: -1, MapRandomSeed: 0 });
  assert.equal(h.adapter.getPlayAgainStatus().phase, 'screenshot-applied');
  assert.deepEqual(h.state.pushes, ['create-game-sp']); assert.equal(h.state.starts, 0);
});

test('multiple seed pairs are rejected without a group picker, helper or settings writes', () => {
  const h = harness(), screen = { Root: new Element() };
  h.adapter.attachEarlyLoad(screen);
  screen.Root.children[0].children[1].events['action-activate']({ stopPropagation() {}, preventDefault() {} });
  h.events.get('paste')({ type: 'paste', clipboardData: { getData: () => '1游戏种子: 100\n1地图种子: 101\n2游戏种子: 200\n2地图种子: 201' }, stopPropagation() {}, preventDefault() {} });
  assert.equal(h.bridge.request, null);
  assert.equal(h.adapter.getPlayAgainStatus().phase, 'failed');
  assert.match(h.adapter.getPlayAgainStatus().message, /一次只处理一组/);
  assert.equal(h.state.parameterWrites, 0);
  assert.equal(h.state.dialogs.at(-1).options.length, 1);

});

test('only our dialogs get literal wrapped text and equal-width spaced buttons after native setOptions', () => {
  const h = harness(), screen = { Root: new Element() };
  h.adapter.attachEarlyLoad(screen);
  screen.Root.children[0].children[1].events['action-activate']({ stopPropagation() {}, preventDefault() {} });
  const definition = h.state.dialogs.at(-1);
  const root = new Element(), frame = new Element(), body = new Element(), buttons = new Element();
  root.setAttribute('body', definition.body);
  root.querySelector = selector => selector.includes('dialog-wrapper') ? frame : selector.includes('font-body') ? body : null;
  const control = { Root: root, buttonContainer: buttons, setOptions() { buttons.append(new Element(), new Element(), new Element()); } };
  const decorator = h.state.decorators['screen-dialog-box'](control);
  decorator.beforeAttach(); decorator.afterAttach(); control.setOptions();
  assert(body.textContent.includes('粘贴一组游戏种子'));
  assert(body.children.some(child => child.className === 'play-again-paste-text'));
  assert(body.style.cssText.includes('white-space:pre-wrap'));
  assert(frame.style.cssText.includes('width:44rem'));
  assert(buttons.children.every(button => button.style.cssText.includes('width:100%')));
  assert(buttons.children[1].style.cssText.includes('margin-top:0.75rem'));
  const other = { Root: new Element(), buttonContainer: new Element(), setOptions() {} };
  h.state.decorators['screen-dialog-box'](other).afterAttach();
  assert.equal(other.buttonContainer.style.cssText, undefined);
});

test('native load failure uses game content metadata for red/yellow details without a helper request', async () => {
  const content = { requirements: [{ id: 'dlc', name: '测试文明', version: '1', required: true }, { id: 'ui', name: '界面工具', version: '2', required: false }], installed: {} };
  const h = harness({ loadResult: 5, content, nativeMods: [
    { id: 'dlc', handle: 1, name: '测试文明', version: 1, official: true, allowance: 0 },
    { id: 'ui', handle: 2, name: '界面工具', version: 1, official: false, allowance: 1 },
  ] });
  await h.importSave();
  assert.equal(h.state.diagnoses, 0); assert.equal(h.state.starts, 0);
  const status = h.adapter.getPlayAgainStatus();
  assert.equal(status.phase, 'failed');
  assert.equal(status.content.required[0].status, 'unowned');
  assert.equal(status.content.recommended[0].status, 'version');
  assert.equal(h.state.dialogs.at(-1).title, 'DLC 和 MOD 检查');
  const root = new Element(), body = new Element();
  root.setAttribute('body', h.state.dialogs.at(-1).body);
  root.querySelector = selector => selector === '.font-body.text-base' ? body : null;
  h.state.decorators['screen-dialog-box']({ Root: root }).afterAttach();
  assert(body.children.some(row => row.style.cssText.includes('#ff7777') && row.textContent.includes('测试文明')));
  assert(body.children.some(row => row.style.cssText.includes('#f4cc62') && row.textContent.includes('界面工具')));
});

test('native config failure with no detected DLC issue shows only the original failure', () => {
  const h = harness(); let stockCalls = 0, refreshes = 0;
  const screen = { Root: new Element(), currentPanelOperation: 4, onLoadComplete() { stockCalls++; },
    saveToSync: { fileName: 'actual.Civ7Cfg', contentType: 1, locationCategories: 1 },
    getSelectedSaveGameInfo: () => ({ fileName: 'different.Civ7Cfg' }), updateLoadButton() { refreshes++; } };
  screen.Root.setAttribute('menu-type', 'load_config');
  h.state.decorators['screen-save-load'](screen).beforeAttach();
  screen.onLoadComplete({ result: 1 }); h.flushActions();
  assert.equal(h.bridge.request, null); assert.equal(stockCalls, 1);
  screen.onLoadComplete({ result: 5 }); h.flushActions();
  assert.equal(h.bridge.request, null);
  assert.equal(screen.currentPanelOperation, 0); assert.equal(refreshes, 1);
  assert.equal(h.state.starts, 0); assert.equal(h.adapter.getPlayAgainStatus().phase, 'failed');
  assert.equal(h.state.dialogs.at(-1).title, '尚未开始新游戏');
});

test('plain text paste previews without contacting any helper, and native paste remains available', () => {
  const h = harness(), screen = { Root: new Element() };
  h.adapter.attachEarlyLoad(screen);
  assert.deepEqual(screen.Root.children[0].children.map(button => button.getAttribute('caption')), ['读取设置文件', '粘贴配置文字']);
  screen.Root.children[0].children[1].events['action-activate']({ stopPropagation() {}, preventDefault() {} });
  h.events.get('paste')({ type: 'paste', preventDefault() { assert.fail('native text paste must not be swallowed'); } });
  h.events.get('paste')({ type: 'paste', clipboardData: { getData: () => '游戏种子: 123\n地图种子: 456' }, stopPropagation() {}, preventDefault() {} });
  assert.equal(h.bridge.request, null); assert.equal(h.state.parameterWrites, 0);
  assert.equal(h.adapter.getPlayAgainStatus().phase, 'screenshot-preview');
  assert.equal(h.adapter.getPlayAgainStatus().plan.fields[0].value, 123);
});

test('native textbox changes apply the requested four settings even without ClipboardEvent data', async () => {
  const h = harness({ mapOptions: true }), screen = { Root: new Element() };
  h.adapter.attachEarlyLoad(screen);
  screen.Root.children[0].children[1].events['action-activate']({ stopPropagation() {}, preventDefault() {} });
  const dialog = h.state.dialogs.at(-1), root = new Element(), body = new Element();
  root.setAttribute('body', dialog.body);
  root.querySelector = selector => selector === '.font-body.text-base' ? body : null;
  h.state.decorators['screen-dialog-box']({ Root: root }).afterAttach();
  const textbox = body.children.find(child => child.className === 'play-again-paste-text');
  textbox.events['component-value-changed']({ detail: { value: '1游戏种子：1467319409 宽广盘古大陆 巨大1地图种子：1467319429。' } });
  dialog.options.find(option => option.label === '识别并核对').callback(); h.flushActions();
  assert.equal(h.bridge.request, null);
  assert.equal(h.adapter.getPlayAgainStatus().plan.fields.length, 4);
  assert.equal(h.state.parameterWrites, 0);
  h.state.dialogs.at(-1).options.find(option => option.label === '填入设置').callback(); h.flushActions();
  for (let i = 0; i < 24; i++) { h.flushActions(180); await Promise.resolve(); }
  assert.deepEqual(h.state.parameterOrder, ['Map', 'MapSize', 'GameRandomSeed', 'MapRandomSeed']);
  assert.deepEqual(h.state.parameterValues, {
    GameRandomSeed: 1467319409, MapRandomSeed: 1467319429,
    Map: '{base-standard}maps/pangaea-plus.js', MapSize: 'MAPSIZE_HUGE',
  });
  assert.equal(h.adapter.getPlayAgainStatus().applied.length, 4);
  assert.equal(h.state.dialogs.at(-1).title, '游戏设置已填入');
  assert.equal(h.bridge.request, null);
  assert.equal(h.state.starts, 0); assert.equal(h.state.loads, 0);
});

test('empty text does not silently start a clipboard helper request', () => {
  const h = harness(), screen = { Root: new Element() };
  h.adapter.attachEarlyLoad(screen);
  screen.Root.children[0].children[1].events['action-activate']({ stopPropagation() {}, preventDefault() {} });
  h.state.dialogs.at(-1).options.find(option => option.label === '识别并核对').callback(); h.flushActions();
  assert.equal(h.bridge.request, null);
  assert.equal(h.state.parameterWrites, 0);
  assert.match(h.adapter.getPlayAgainStatus().message, /还没有收到文字/);
});

test('the shipped paste entry recognizes C7S1 and fills its four settings without helper or game load', async () => {
  const h = harness({ mapOptions: true }), screen = { Root: new Element() };
  h.adapter.attachEarlyLoad(screen);
  screen.Root.children[0].children[1].events['action-activate']({ stopPropagation() {}, preventDefault() {} });
  h.events.get('paste')({ type: 'paste', clipboardData: { getData: () => 'C7S1;MAP={base-standard}maps/pangaea-plus.js;SIZE=HUGE;GAMESEED=1467319409;MAPSEED=1467319429' }, stopPropagation() {}, preventDefault() {} });
  assert.equal(h.adapter.getPlayAgainStatus().plan.kind, 'setup-code');
  h.state.dialogs.at(-1).options.find(option => option.label === '填入设置').callback(); h.flushActions();
  for (let i = 0; i < 60; i++) { h.flushActions(180); await Promise.resolve(); }
  assert.equal(h.adapter.getPlayAgainStatus().phase, 'screenshot-applied');
  assert.equal(h.adapter.getPlayAgainStatus().applied.length, 4);
  assert.equal(h.state.parameterValues.GameRandomSeed, 1467319409);
  assert.equal(h.state.parameterValues.MapRandomSeed, 1467319429);
  assert.equal(h.bridge.request, null); assert.equal(h.state.loads, 0); assert.equal(h.state.starts, 0);
});

test('C7L1 roster import and current-code generation are both wired into the actual dialogs', async () => {
  const h = harness({ codeOptions: true }), screen = { Root: new Element() };
  h.adapter.attachEarlyLoad(screen);
  const open = () => screen.Root.children[0].children[1].events['action-activate']({ stopPropagation() {}, preventDefault() {} });
  open();
  h.events.get('paste')({ type: 'paste', clipboardData: { getData: () => 'C7L1;ANTIQUITY;H:ISABELLA:ROME;A:AMINA:GREECE' }, stopPropagation() {}, preventDefault() {} });
  h.state.dialogs.at(-1).options.find(option => option.label === '填入设置').callback(); h.flushActions();
  for (let i = 0; i < 80; i++) { h.flushActions(180); await Promise.resolve(); }
  assert.equal(h.state.players[0].PlayerLeader, 'LEADER_ISABELLA');
  assert.equal(h.state.players[1].PlayerCivilization, 'CIVILIZATION_GREECE');
  assert.equal(h.state.dialogs.at(-1).title, '游戏设置已填入');
  open();
  h.state.dialogs.at(-1).options.find(option => option.label === '生成当前设置码').callback(); h.flushActions();
  const dialog = h.state.dialogs.at(-1), root = new Element(), body = new Element();
  assert.equal(dialog.title, '当前设置复制码');
  root.setAttribute('body', dialog.body);
  root.querySelector = selector => selector === '.font-body.text-base' ? body : null;
  h.state.decorators['screen-dialog-box']({ Root: root }).afterAttach();
  const text = body.children.find(child => child.className === 'play-again-paste-text').getAttribute('value');
  const plan = parseSetupCode(text);
  assert.equal(plan.format, 'C7S2'); assert.equal(plan.players[0].leader, 'LEADER_ISABELLA');
  assert.equal(plan.players[1].civilization, 'CIVILIZATION_GREECE');
  assert.equal(plan.settings.GameRandomSeed, 0);
  assert.equal(h.bridge.request, null); assert.equal(h.state.starts, 0); assert.equal(h.state.loads, 0);
});

test('save page adds only one action and none in the configuration browser', () => {
  const h = harness();
  h.state.decorators['screen-save-load'](h.control).afterAttach();
  const row = h.control.actionButtonsContainer.children[0];
  assert.equal(row.children.length, 1);
  assert.equal(row.children[0].getAttribute('caption'), '以此设置新建游戏');
  h.control.Root.setAttribute('menu-type', 'load_config'); h.control.updateLoadButton();
  assert.equal(row.style.display, 'none');
  h.control.Root.setAttribute('menu-type', 'load'); h.control.updateLoadButton();
  assert.equal(row.style.display, 'flex');
  h.state.started = true; h.control.updateLoadButton();
  assert.equal(row.style.display, 'none');
});

test('shipped dialogs import and export C7S2 mementos, disabled switches and empty excluded lists', async () => {
  const h = harness({ codeOptions: true, advancedOptions: true }), screen = { Root: new Element() };
  h.adapter.attachEarlyLoad(screen);
  const open = () => screen.Root.children[0].children[1].events['action-activate']({ stopPropagation() {}, preventDefault() {} });
  open();
  const code = 'C7S2;H:RANDOM:RANDOM;A:RANDOM:RANDOM;G:NoCivUnlocks=false;G:Crises=%5B%5D;P:0:PlayerMementoMajorSlot=%22MEMENTO_FOUNDATION_IMAGO_MUNDI%22';
  h.events.get('paste')({ type: 'paste', clipboardData: { getData: () => code }, stopPropagation() {}, preventDefault() {} });
  assert.equal(h.adapter.getPlayAgainStatus().plan.parameters.length, 3);
  h.state.dialogs.at(-1).options.find(option => option.label === '填入设置').callback(); h.flushActions();
  for (let i = 0; i < 100; i++) { h.flushActions(180); await Promise.resolve(); }
  assert.equal(h.state.dialogs.at(-1).title, '游戏设置已填入');
  assert.equal(h.state.parameterValues.NoCivUnlocks, false);
  assert.deepEqual(h.state.parameterValues.Crises, []);
  assert.equal(h.state.players[0].PlayerMementoMajorSlot, 'MEMENTO_FOUNDATION_IMAGO_MUNDI');
  open(); h.state.dialogs.at(-1).options.find(option => option.label === '生成当前设置码').callback(); h.flushActions();
  const dialog = h.state.dialogs.at(-1), root = new Element(), body = new Element();
  root.setAttribute('body', dialog.body); root.querySelector = selector => selector === '.font-body.text-base' ? body : null;
  h.state.decorators['screen-dialog-box']({ Root: root }).afterAttach();
  const plan = parseSetupCode(body.children[0].getAttribute('value'));
  assert.equal(plan.parameters.find(field => field.id === 'NoCivUnlocks').value, false);
  assert.deepEqual(plan.parameters.find(field => field.id === 'Crises').value, []);
  assert.equal(plan.parameters.find(field => field.id === 'PlayerMementoMajorSlot').value, 'MEMENTO_FOUNDATION_IMAGO_MUNDI');
  assert(dialog.options.some(option => option.label === '查看未收录项'));
  assert.equal(h.bridge.request, null); assert.equal(h.state.starts, 0); assert.equal(h.state.loads, 0);
});
