import { FocusManager } from '/core/ui-next/services/focus-manager.js';
import { bindDialogNavigation } from './dialog-navigation.js';
import { ContextManager } from '/core/ui/context-manager/context-manager.js';
import { StartCampaignEvent } from '/core/ui/events/shell-events.js';
import { ComponentRegistry } from '/core/ui-next/services/component-registry.js';
import '/core/ui-next/screens/create-game/create-game-screen.js';
import '/core/ui/components/fxs-textbox.js';
import DialogBoxManager from '/core/ui/dialog-box/manager-dialog-box.js';
import SaveLoadData, { QueryDoneEventName } from '/core/ui/save-load/model-save-load.js';
import { captureConfiguration } from './configuration-snapshot.js';
import { compareImportedConfiguration } from './compare-imported.js';
import { connection as installedConnection } from './local-connection.js';
import { requirementsFromSave, checkContent, renderContentReport } from './content-requirements.js';
import { screenshotCatalog, parseSingleImport, applyScreenshot, setScreenshotPlayerCount } from './screenshot-settings.js';
import { isSetupCode, parseSetupCode } from './setup-code.js';
import { createSetupCodeAdapter } from './setup-code-game.js';

const runtime = { UI, Configuration, Database };
let connection = installedConnection;
let busy = false, unresolvedLoad = false, showHubNext = false, earlyLoadPending = false;
let modal, lastStatus = { phase: 'idle' };
let pendingBridge;
let contentView;
let pasteInput;
let dialogSerial = 0;
const dialogViews = new Map();
globalThis.__civ7PlayAgainBridge = {
  request: null,
  connect(value) {
    if (!UI.isInShell() || Configuration.getGame().isGameStarted || pendingBridge || !/^[a-f0-9]{64}$/.test(value?.token ?? '')) return;
    connection = { token: value.token };
  },
  complete(response) {
    if (!pendingBridge || response.token !== connection?.token || response.id !== pendingBridge.id) return;
    const pending = pendingBridge; pendingBridge = undefined;
    this.request = null; clearTimeout(pending.timer);
    if (response.error) { const error = new Error(response.error); error.content = response.content; pending.reject(error); }
    else pending.resolve(response.result);
  },
};
const idleShell = () => UI.isInShell() && !Configuration.getGame().isGameStarted;
const requireShell = () => { if (!idleShell()) throw new Error('请回到主菜单后使用此功能'); };
export const getPlayAgainStatus = () => lastStatus;

function button(caption, action) {
  const element = document.createElement('fxs-button');
  element.setAttribute('caption', caption);
  element.setAttribute('action-key', 'inline-accept');
  element.style.margin = '6px';
  element.addEventListener('action-activate', event => { event.stopPropagation(); event.preventDefault(); action(); });
  return element;
}
function closeModal() {
  pasteInput = undefined;
  if (modal !== undefined) { const id = modal; modal = undefined; DialogBoxManager.closeDialogBox(id); }
}
function showModal(title, message, actions = [], renderBody) {
  closeModal();
  const body = `play-again-dialog-${++dialogSerial}`;
  dialogViews.set(body, { message, renderBody, content: message === 'play-again-content-report' ? contentView : undefined });
  if (dialogViews.size > 40) dialogViews.delete(dialogViews.keys().next().value);
  modal = DialogBoxManager.createDialog_MultiOption({
    title, body, canClose: false, shouldDarken: true,
    displayHourGlass: actions.length === 0,
    options: actions.map(([label, action], index) => ({
      label, actions: label === '取消' || label === '关闭' || label === '完成' ? ['cancel', 'keyboard-escape'] : index === 0 ? ['accept'] : [],
      // The stock dialog closes AFTER its callback. Wait until it has closed
      // before opening another screen or starting a campaign.
      callback: () => { modal = undefined; setTimeout(action, 0); },
    })),
  });
}
function failure(error) {
  busy = false; lastStatus = { phase: 'failed', message: error.message };
  showModal('尚未开始新游戏', error.message, [['关闭', closeModal]]);
}
function reportContent(content, selected) {
  let requirements = content?.requirements;
  if (!requirements && (Array.isArray(selected?.enabledMods) || Array.isArray(selected?.requiredMods))) requirements = requirementsFromSave(selected);
  if (!requirements) return { checked: false, required: [], recommended: [] };
  if (typeof Modding === 'undefined') return { ...(content?.report ?? { checked: false, required: [], recommended: [] }), note: '无法核对游戏内的 DLC 使用权限。' };
  const mods = Modding.getInstalledMods();
  const installed = { ...(content?.installed ?? {}) };
  for (const item of requirements) {
    const handle = Modding.getModHandle(item.id);
    const mod = mods.find(row => row.id === item.id || (handle != null && row.handle === handle));
    if (!mod) { installed[item.id] = { ...installed[item.id], installed: false }; continue; }
    const disk = installed[item.id] ?? {};
    const packageName = Modding.getModProperty(mod.handle, 'Package');
    installed[item.id] = { ...disk, installed: true, name: mod.name || item.name,
      kind: mod.official ? (packageName === 'BaseGame' || disk.kind === '游戏本体' ? '游戏本体' : 'DLC') : 'MOD',
      version: mod.version ?? disk.version,
      affectsSavedGames: Modding.getModProperty(mod.handle, 'AffectsSavedGames') !== '0',
      owned: mod.allowance === ModAllowance.Full, enabled: mod.enabled };
  }
  return checkContent(requirements, installed, { ignored: Modding.getModulesToExclude(), reportDisabled: true });
}
function showContentReport(report, message, page = 0) {
  const pages = Math.max(1, Math.ceil(((report.required?.length ?? 0) + (report.recommended?.length ?? 0)) / 5));
  contentView = { report, message, page };
  const actions = [];
  if (page > 0) actions.push(['上一页', () => showContentReport(report, message, page - 1)]);
  if (page + 1 < pages) actions.push(['下一页', () => showContentReport(report, message, page + 1)]);
  actions.push(['关闭', () => { contentView = undefined; closeModal(); }]);
  showModal('DLC 和 MOD 检查', 'play-again-content-report', actions);
}
function checkAfterFailure(error, selected) {
  if (!idleShell()) { busy = false; closeModal(); return; }
  let report;
  try { report = reportContent(error.content, selected); }
  catch { report = { checked: false, required: [], recommended: [] }; }
  busy = false;
  // Native save descriptors already contain the content list. No helper,
  // proactive scan, or extra DLC dialog when no concrete mismatch is known.
  if (!report.required.length && !report.recommended.length) { failure(error); return; }
  const message = error.message.split('\n')[0];
  lastStatus = { phase: 'failed', message, content: report };
  showContentReport(report, message);
}
function selectedSource(selected) {
  return { fileName: selected.fileName, locationCategories: selected.locationCategories, contentType: selected.contentType };
}
function service(route, data) {
  if (!connection) return Promise.reject(new Error('请通过 Mac Mod 启动器启用 --play-again 后启动游戏。 / Launch with --play-again enabled.'));
  return new Promise((resolve, reject) => {
    if (pendingBridge) { reject(new Error('上一次转换仍在进行')); return; }
    const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      pendingBridge = undefined; globalThis.__civ7PlayAgainBridge.request = null;
      reject(new Error('未连接到存档工具，请检查启动记录和游戏通信设置。 / Save helper unavailable. Check launcher logs and game bridge settings.'));
    }, route === '/ocr/clipboard' ? 60000 : 20000);
    pendingBridge = { id, timer, resolve, reject };
    globalThis.__civ7PlayAgainBridge.request = { id, route, data, token: connection.token };
  });
}
function findConfig(fileName) {
  return new Promise((resolve, reject) => {
    let queryId;
    const timer = setTimeout(() => { window.removeEventListener(QueryDoneEventName, done); reject(new Error('读取游戏设置列表超时')); }, 10000);
    function done(event) {
      if (event.detail?.queryId !== queryId) return;
      clearTimeout(timer); window.removeEventListener(QueryDoneEventName, done);
      const save = SaveLoadData.saves.find(s => s.fileName === fileName && s.contentType === SaveFileTypes.GAME_CONFIGURATION);
      if (!save) reject(new Error('设置已保存，但游戏尚未找到新文件。请从“读取游戏设置”中重新选择。'));
      else if (save.missingMods?.length || save.unownedMods?.length) reject(new Error('这份设置需要当前未安装或未拥有的内容，暂时无法导入。'));
      else resolve(save);
    }
    window.addEventListener(QueryDoneEventName, done);
    SaveLoadData.querySaveGameList(SaveLocations.LOCAL_STORAGE, SaveTypes.SINGLE_PLAYER, SaveLocationCategories.NORMAL, SaveFileTypes.GAME_CONFIGURATION, { isOverwriteQueryIds: true });
    queryId = SaveLoadData.queryIds[SaveLoadData.queryIds.length - 1];
  });
}
function loadConfig(save) {
  requireShell();
  if (unresolvedLoad) throw new Error('上次读取尚未结束，请重新启动游戏后再试');
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => { unresolvedLoad = true; finish(new Error('读取设置超时；请重新启动游戏后再试。')); }, 15000);
    function finish(error) {
      if (settled) return; settled = true; clearTimeout(timer); engine.off('LoadComplete', completed);
      if (error) reject(error); else resolve();
    }
    function completed({ result }) {
      if (result === SerializerResult.RESULT_PENDING) return;
      finish(result === SerializerResult.RESULT_OK ? null : new Error(`游戏未能读取这份设置（${result}），未开始新局。`));
    }
    engine.on('LoadComplete', completed);
    try {
      const accepted = Network.loadGame({ Location: save.location, LocationCategories: save.locationCategories, Type: save.type,
        ContentType: SaveFileTypes.GAME_CONFIGURATION, FileName: save.fileName, DisplayName: save.displayName, Slot: save.slot, AdditionalInfo: save.additionalInfo }, ServerType.SERVER_TYPE_NONE);
      if (!accepted) finish(new Error('游戏拒绝读取这份设置；文件已保留，可从新建游戏的“读取游戏设置”中选择。'));
    } catch (error) { unresolvedLoad = true; finish(error); }
  });
}

// Keep the stock editor and models; only choose the overview as its first tab
// when importing a prepared setup. Recreating it refreshes memento cards too.
const component = ComponentRegistry.get('create-game-screen');
const originalFactory = component.factory();
component.setFactory(() => props => {
  if (!showHubNext) return originalFactory(props);
  showHubNext = false;
  const screens = props.screenFlow;
  const hub = screens.find(s => s.name === 'create-game-hub');
  return originalFactory({ ...props, screenFlow: [hub, ...screens.filter(s => s !== hub)] });
});
function openHub() {
  requireShell(); closeModal(); ContextManager.popUntil('main-menu');
  const main = document.querySelector('main-menu')?._component;
  if (main) {
    main.clear3DScene(); main.raiseShroud(); main.inSubScreen = true;
    main.Root.classList.add('create', 'hidden');
  }
  showHubNext = true;
  ContextManager.push('create-game-sp', { singleton: true, createMouseGuard: true, attributes: { shouldDarken: false } });
  Network.setMainMenuInviteReady(false);
}
async function handleSave(control) {
  if (busy || !idleShell() || control.currentPanelOperation !== 0) return;
  const selected = control.getSelectedSaveGameInfo();
  if (!selected || selected.location !== SaveLocations.LOCAL_STORAGE || selected.type !== SaveTypes.SINGLE_PLAYER || selected.contentType !== SaveFileTypes.GAME_STATE || selected.isDirectory) return;
  const source = selectedSource(selected);
  busy = true; lastStatus = { phase: 'converting' };
  showModal('提取开局设置', '正在从存档创建新的游戏设置……');
  try {
    const converted = await service('/convert', source);
    requireShell();
    lastStatus = { phase: 'exported', fileName: converted.fileName };
    // Close the stock load screen before the native load: its unconditional
    // LoadComplete handler otherwise tears down the active selection/dialog.
    closeModal(); ContextManager.popUntil('main-menu');
    showModal('读取开局设置', '正在把存档设置填入新建游戏……');
    const save = await findConfig(converted.fileName);
    lastStatus = { phase: 'loading', fileName: converted.fileName };
    await loadConfig(save); requireShell();
    const comparison = compareImportedConfiguration(converted.expected, captureConfiguration(runtime));
    if (!comparison.matches) throw new Error(`导入后有 ${comparison.differences.length} 项设置未能核对一致，未开始游戏。生成的设置文件已保留。`);
    lastStatus = { phase: 'ready', fileName: converted.fileName, comparison };
    const choose = action => {
      if (lastStatus.phase !== 'ready') return;
      try {
        requireShell();
        const check = compareImportedConfiguration(converted.expected, captureConfiguration(runtime));
        if (!check.matches) throw new Error('设置在确认前发生变化，请重新选择存档');
        lastStatus = { phase: action === 'edit' ? 'editing' : 'starting', fileName: converted.fileName };
        closeModal(); busy = false;
        if (action === 'edit') openHub();
        else { window.dispatchEvent(new StartCampaignEvent()); engine.call('startGame'); }
      } catch (error) { failure(error); }
    };
    showModal('开局设置已填好', `来源：${converted.sourceName}\n领袖、文明、纪念物、种子及其余设置已核对。\n可以先微调，也可以直接开始新局。`, [
      ['微调设置', () => choose('edit')], ['直接开始', () => choose('start')],
      ['取消', () => { busy = false; lastStatus = { phase: 'cancelled' }; closeModal(); }],
    ]);
  } catch (error) {
    if (lastStatus.phase === 'loading' || error.content) checkAfterFailure(error, selected);
    else failure(error);
  }
}
function attachSaveScreen(control) {
  if (!control?.actionButtonsContainer || control.Root.querySelector('.play-again-actions')) return;
  const row = document.createElement('fxs-hslot'); row.className = 'play-again-actions';
  row.style.cssText = 'display:flex;flex-direction:row;align-items:center;flex-shrink:0;margin-left:1rem;';
  const start = button('以此设置新建游戏', () => handleSave(control));
  start.style.cssText = 'min-width:13rem;margin:0;';
  row.append(start); control.actionButtonsContainer.appendChild(row);
  const original = control.updateLoadButton;
  function refresh() {
    const normal = (control.Root.getAttribute('menu-type') ?? 'load') === 'load';
    row.style.display = normal && idleShell() ? 'flex' : 'none';
    const selected = control.getSelectedSaveGameInfo();
    const enabled = !busy && control.currentPanelOperation === 0 && selected?.location === SaveLocations.LOCAL_STORAGE && selected?.type === SaveTypes.SINGLE_PLAYER && selected?.contentType === SaveFileTypes.GAME_STATE && !selected?.isDirectory;
    start.setAttribute('disabled', enabled ? 'false' : 'true');
  }
  control.updateLoadButton = function (...args) { const result = original.apply(this, args); refresh(); return result; };
  refresh();
}
function attachEarlyLoad(control) {
  if (!control?.Root || control.Root.querySelector('.play-again-early-load')) return;
  const row = document.createElement('fxs-hslot'); row.className = 'play-again-early-load';
  row.style.cssText = 'position:absolute;right:9rem;top:3.5rem;z-index:50;display:flex;flex-direction:row;align-items:center;';
  const load = button('读取设置文件', () => {
    if (busy || !idleShell()) return;
    earlyLoadPending = true;
    ContextManager.push('screen-save-load', { singleton: true, createMouseGuard: true, attributes: { 'menu-type': 'load_config', 'server-type': ServerType.SERVER_TYPE_NONE, 'save-type': SaveTypes.SINGLE_PLAYER } });
  });
  const paste = button('粘贴配置文字', showPasteInput);
  load.style.cssText = 'min-width:13rem;margin:0;';
  paste.style.cssText = 'min-width:13rem;margin:0 0 0 1rem;';
  row.append(load, paste); control.Root.appendChild(row);
}
function showPasteInput() {
  if (busy || !idleShell()) return;
  const input = { text: '' };
  showModal('粘贴配置文字', '粘贴一组游戏种子、地图说明，或 C7L1 / C7S1 / C7S2 单行复制码。\n例如：1游戏种子：1467319409 宽广盘古大陆 巨大\n1地图种子：1467319429', [
    ['识别并核对', () => {
      if (busy || !idleShell()) return;
      if (input.text.trim()) previewPastedResult({ text: input.text });
      else showTextInputHint('还没有收到文字。请先粘贴种子文字或 C7L1 / C7S1 / C7S2 复制码。');
    }],
    ['生成当前设置码', showCurrentSetupCode],
    ['取消', () => { lastStatus = { phase: 'cancelled' }; closeModal(); }],
  ], body => {
    if (body.querySelector('.play-again-paste-text')) return;
    const textarea = document.createElement('fxs-textbox');
    textarea.className = 'play-again-paste-text';
    textarea.setAttribute('aria-label', '一组游戏设置'); textarea.setAttribute('max-length', '32000');
    textarea.setAttribute('enabled', 'true');
    textarea.setAttribute('consume-keyboard-input', 'true');
    textarea.style.cssText = 'width:100%;min-height:3rem;margin-top:1rem;';
    textarea.setAttribute('value', input.text);
    // fxs-textbox uses the engine's supported input/IME handling. Some game
    // builds omit ClipboardEvent data, so native value changes also work.
    textarea.addEventListener('component-value-changed', event => {
      input.text = String(event.detail?.value ?? textarea.getAttribute('value') ?? '').slice(0, 32000);
    });
    textarea.addEventListener('input', () => { input.text = String(textarea.value ?? textarea.getAttribute('value') ?? '').slice(0, 32000); });
    body.appendChild(textarea);
  });
  pasteInput = input; lastStatus = { phase: 'paste-input' };
}
const getScreenshotCatalog = () => screenshotCatalog(GameSetup, Locale, GameContext.localPlayerID, Configuration, SlotStatus);
const setupCodes = createSetupCodeAdapter({
  GameSetup, Configuration, SlotStatus, GameContext, Locale, assertReady: requireShell,
  GameSetupDomainType: typeof GameSetupDomainType === 'undefined' ? undefined : GameSetupDomainType,
  GameSetupParameterInvalidReason: typeof GameSetupParameterInvalidReason === 'undefined' ? undefined : GameSetupParameterInvalidReason,
  mementoAvailability: () => {
    if (typeof Online === 'undefined' || typeof DisplayType === 'undefined' ||
        !Online.Metaprogression?.getMementoSlotData || !Online.Metaprogression?.getMementosData) return null;
    return { slots: Online.Metaprogression.getMementoSlotData(), items: Online.Metaprogression.getMementosData(), lockedType: DisplayType.DISPLAY_LOCKED };
  },
  settle: () => new Promise(resolve => setTimeout(resolve, 180)),
});
function showCurrentSetupCode() {
  if (busy || !idleShell()) return;
  try {
    const report = setupCodes.captureDetailed(), code = report.code;
    lastStatus = { phase: 'code-exported', included: report.included, omitted: report.omitted };
    showModal('当前设置复制码', `已收录 ${report.included} 项设置，包括可读取的纪念物和高级选项。${report.omitted.length ? `另有 ${report.omitted.length} 项未收录，可点“查看未收录项”。` : ''}\n点击输入框，按 ⌘A / Ctrl+A 全选，再按 ⌘C / Ctrl+C 复制。`, [
      ...(report.omitted.length ? [['查看未收录项', () => showCaptureOmissions(report)]] : []),
      ['返回粘贴', showPasteInput], ['完成', closeModal],
    ], body => {
      const input = document.createElement('fxs-textbox');
      input.className = 'play-again-paste-text';
      input.setAttribute('aria-label', '当前游戏设置复制码');
      input.setAttribute('enabled', 'true'); input.setAttribute('max-length', '32000');
      input.setAttribute('consume-keyboard-input', 'true'); input.setAttribute('value', code);
      input.style.cssText = 'width:100%;min-height:3rem;margin-top:1rem;';
      body.appendChild(input);
    });
  } catch (error) { failure(error); }
}
function showCaptureOmissions(report, page = 0) {
  const pages = Math.ceil(report.omitted.length / 8);
  showModal('未收录的设置', `第 ${page + 1} / ${pages} 页\n${report.omitted.slice(page * 8, page * 8 + 8).join('\n')}`, [
    ...(page > 0 ? [['上一页', () => showCaptureOmissions(report, page - 1)]] : []),
    ...(page + 1 < pages ? [['下一页', () => showCaptureOmissions(report, page + 1)]] : []),
    ['返回复制码', showCurrentSetupCode],
  ]);
}
function previewPastedResult(result) {
  if (!idleShell()) return;
  try {
    const plan = isSetupCode(result.text) ? setupCodes.preview(parseSetupCode(result.text)) : parseSingleImport(result, getScreenshotCatalog());
    showImportPreview(plan);
  }
  catch (error) { failure(error); }
}
function showTextInputHint(message) {
  lastStatus = { phase: 'paste-hint', message };
  showModal('请粘贴配置文字', message, [['重新粘贴', showPasteInput], ['取消', closeModal]]);
}
function showImportPreview(plan) {
    lastStatus = { phase: 'screenshot-preview', plan };
    const preview = plan.fields.map(field => `${field.label}：${field.display}`).join('\n');
    const warnings = plan.warnings.length ? `\n\n${plan.warnings.join('\n')}` : '';
    const note = plan.kind === 'setup-code' ? plan.note : '只填入上面列出的项目。领袖、文明、纪念物等可继续在新建游戏中调整。';
    const body = `${preview || '没有识别到可用设置。请复制种子文字或 C7L1 / C7S1 / C7S2 复制码。'}${warnings}\n\n${note}`;
    const options = [];
    if (plan.fields.length) options.push(['填入设置', () => applyPastedScreenshot(plan)]);
    options.push(['重新粘贴', showPasteInput], ['取消', () => { lastStatus = { phase: 'cancelled' }; closeModal(); }]);
    showModal('请核对识别结果', body, options);
}
async function applyPastedScreenshot(plan) {
  if (busy || lastStatus.phase !== 'screenshot-preview' || lastStatus.plan !== plan) return;
  busy = true;
  showModal('填入游戏设置', '正在填入并核对游戏实际采用的值……');
  try {
    requireShell();
    const result = plan.kind === 'setup-code' ? await setupCodes.apply(plan) : await applyScreenshot(plan, {
      getCatalog: getScreenshotCatalog, assertReady: requireShell,
      setValue: field => field.id === 'PlayerCount' ? setScreenshotPlayerCount(field.value, { Configuration, GameSetup, SlotStatus, playerId: GameContext.localPlayerID }) : field.player ? GameSetup.setPlayerParameterValue(field.playerId, field.id, field.value) : GameSetup.setGameParameterValue(field.id, field.value),
      settle: () => new Promise(resolve => setTimeout(resolve, 180)),
    });
    busy = false; lastStatus = { phase: 'screenshot-applied', ...result };
    openHub();
    const message = `已填入并核对 ${result.applied.length} 项。请在概览中检查纪念物和其他设置，再启动游戏。`;
    if (result.skipped.length) showModal('部分设置需要手动调整', `${message}\n\n${result.skipped.join('\n')}`, [['继续调整', closeModal]]);
    else showModal('游戏设置已填入', message, [['继续调整', closeModal]]);
  } catch (error) { failure(error); }
}
function onScreenshotPaste(event) {
  if (!pasteInput || busy || !idleShell() || event.type !== 'paste') return;
  const data = event.clipboardData;
  // Do not swallow the engine's normal text paste when its event omits data.
  if (!data) return;
  const text = data.getData?.('text/plain');
  const image = Array.from(data.items ?? []).some(item => item.type?.startsWith('image/'));
  if (!text?.trim() && !image) return;
  event.preventDefault(); event.stopPropagation();
  // Plain text is handled entirely by the mod. The textarea also supports
  // engines that paste natively without exposing ClipboardEvent data.
  if (text?.trim()) previewPastedResult({ text });
  else showTextInputHint('这里支持文字。请复制一组种子文字再粘贴；截图识别暂未接入此入口。');
}
window.addEventListener('paste', onScreenshotPaste);
const decorator = attach => control => ({ beforeAttach() {}, afterAttach() { attach(control); }, beforeDetach() {}, afterDetach() {} });
Controls.decorate('screen-save-load', control => ({
  beforeAttach() {
    if (control.Root.getAttribute('menu-type') !== 'load_config') return;
    const openAfterLoad = earlyLoadPending; earlyLoadPending = false;
    // Bind success to this exact load screen. Cancelling destroys its native
    // listener, so a later, unrelated load cannot unexpectedly open the hub.
    const original = control.onLoadComplete;
    control.onLoadComplete = function (event) {
      if (event.result !== SerializerResult.RESULT_OK && event.result !== SerializerResult.RESULT_PENDING && idleShell()) {
        const selected = this.saveToSync ?? this.getSelectedSaveGameInfo?.();
        if (selected) {
          clearTimeout(this.panelOperationTimeout); this.currentPanelOperation = 0;
          setTimeout(() => { checkAfterFailure(new Error(`游戏未能读取这份设置（${event.result}），未开始新局。`), selected); this.updateLoadButton?.(); }, 0);
          return;
        }
      }
      const result = original.call(this, event);
      if (openAfterLoad && event.result === SerializerResult.RESULT_OK) setTimeout(() => { if (idleShell() && !busy) openHub(); }, 0);
      return result;
    };
  },
  afterAttach() { attachSaveScreen(control); }, beforeDetach() {}, afterDetach() {},
}));
Controls.decorate('create-game-sp', decorator(attachEarlyLoad));
function decorateImportDialog(control) {
  const view = dialogViews.get(control.Root.getAttribute('body'));
  if (!view) return;
  if (!control.playAgainNavigationCleanup) {
    control.playAgainNavigationCleanup = bindDialogNavigation(control.Root, {
      focus: FocusManager.get(), statuses: InputActionStatuses, directions: InputNavigationAction,
      activate: target => target.dispatchEvent(new CustomEvent('action-activate', { bubbles: true, cancelable: true })),
    });
  }
  const frame = control.Root.querySelector('.screen-dialog-box__dialog-wrapper');
  if (frame) frame.style.cssText = 'width:44rem;max-width:92vw;max-height:94vh;';
  // Cohtml stores the stock body's `role` as a JS property, without an HTML
  // role attribute. Its stock body classes remain queryable in the live UI.
  const body = control.Root.querySelector('[role="paragraph"]') ?? control.Root.querySelector('.font-body.text-base');
  if (body) {
    body.style.cssText = 'white-space:pre-wrap;line-height:1.45;margin:0 0 0.75rem;padding:1rem 0;max-height:40vh;overflow-y:auto;';
    if (view.content) renderContentReport(body, view.content.report, view.content.message, view.content.page, document);
    else if (!view.renderBody || !body.querySelector('.play-again-paste-text')) {
      body.textContent = view.message;
      view.renderBody?.(body);
    }
  }
  if (control.buttonContainer) {
    control.buttonContainer.style.cssText = 'display:flex;flex-direction:column;align-items:stretch;align-self:center;width:32rem;max-width:100%;padding:0;';
    const buttons = control.buttonContainer.querySelectorAll('fxs-button');
    for (let index = 0; index < buttons.length; index++) {
      buttons[index].setAttribute('action-key', 'inline-accept');
      buttons[index].style.cssText = `width:100%;flex-shrink:0;margin:0;${index ? 'margin-top:0.75rem;' : ''}`;
    }
  }
}
Controls.decorate('screen-dialog-box', control => ({
  beforeAttach() {
    // Native options are added after attachment. Style after setOptions too,
    // otherwise the stock horizontal margins return on its vertical group.
    const original = control.setOptions;
    control.setOptions = function (...args) { const result = original.apply(this, args); decorateImportDialog(this); return result; };
  },
  afterAttach() { decorateImportDialog(control); }, beforeDetach() {},
  afterDetach() { control.playAgainNavigationCleanup?.(); dialogViews.delete(control.Root.getAttribute('body')); },
}));
// Also cover hot-installed development builds without changing game files.
for (const root of document.querySelectorAll('screen-save-load')) attachSaveScreen(root._component);
for (const root of document.querySelectorAll('create-game-sp')) attachEarlyLoad(root._component);
