import { PanelAction } from '/base-standard/ui/action/panel-action.js';
import { ContextManager } from '/core/ui/context-manager/context-manager.js';
import { DialogBoxManager } from '/core/ui/dialog-box/manager-dialog-box.js';
import { SaveGate, installTurnHook } from './save-gate.js';
import DiplomacyManager from '/base-standard/ui/diplomacy/diplomacy-manager.js';
import '/base-standard/ui/diplomacy-peace-deal/panel-diplomacy-peace-deal.js';
import { installDiplomacyHooks } from './diplomacy-hook.js';
import { settingsStore, installSettingsLauncher } from './save-settings.js';

const PREFIX = '[Before End Turn]';
const fileName = kind => kind === 'diplomacy' ? 'BeforeDiplomacy' : 'BeforeEndTurn';
const INSTANCE_KEY = '__civ7BeforeEndTurnV1';

function install() {
  let errorOpen = false;
  let dialogId = null;
  let overlay = null;
  let toast = null;
  let toastTimer = null;

  function context(kind = 'turn') {
    if (!UI.isInGame() || Configuration.getGame().isAnyMultiplayer || Autoplay.isActive ||
        !Players.isValid(GameContext.localPlayerID)) return null;
    const player = Players.get(GameContext.localPlayerID);
    if (!player?.isHuman) return null;
    // Some first-meet responses happen outside the local turn. Let the game
    // handle those normally; a local-turn snapshot cannot safely guard them.
    if (kind === 'diplomacy' && (!player.isTurnActive || GameContext.hasSentTurnComplete())) return null;
    const config = Configuration.getGame();
    return {
      token: `${config.gameSeed}:${GameContext.localPlayerID}:${Game.age}:${Game.turn}`,
      turn: Game.turn,
      active: player.isTurnActive,
      sent: GameContext.hasSentTurnComplete(),
      canSave: ContextManager.canSaveGame()
    };
  }

  function showBusy(visible, kind) {
    if (!visible) {
      overlay?.remove();
      overlay = null;
      return;
    }
    if (overlay || !document.body) return;
    overlay = document.createElement('div');
    overlay.setAttribute('role', 'status');
    overlay.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:10000;background-color:rgba(0,0,0,0.22);display:flex;align-items:center;justify-content:center;pointer-events:auto;';
    const card = document.createElement('div');
    card.textContent = Locale.compose(kind === 'diplomacy' ? 'LOC_SBE_BUSY_DIPLOMACY' : 'LOC_SBE_BUSY_TURN');
    card.className = 'font-body';
    card.style.cssText = 'padding:24px 36px;background-color:rgba(20,27,35,0.96);border:1px solid #c0aa75;color:#f4e6c6;font-size:22px;';
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  function notice(text) {
    console.warn(`${PREFIX} ${text}`);
    toast?.remove();
    clearTimeout(toastTimer);
    if (!document.body) return;
    toast = document.createElement('div');
    toast.textContent = text;
    toast.className = 'font-body';
    toast.setAttribute('role', 'status');
    toast.style.cssText = 'position:fixed;left:25%;bottom:110px;width:50%;padding:12px 18px;background-color:rgba(20,27,35,0.95);color:#f4e6c6;font-size:18px;z-index:9999;text-align:center;pointer-events:none;';
    document.body.appendChild(toast);
    toastTimer = setTimeout(() => { toast?.remove(); toast = null; }, 4500);
  }

  const gate = new SaveGate({
    context,
    enabled: kind => settingsStore.data.config[kind === 'diplomacy' ? 'diplomacyEnabled' : 'turnEnabled'],
    dialogOpen: () => errorOpen,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: id => { if (id !== null) clearTimeout(id); },
    showBusy,
    notice: key => notice(Locale.compose(key)),
    save: kind => Network.saveGame({
      Location: SaveLocations.LOCAL_STORAGE,
      LocationCategories: SaveLocationCategories.NORMAL,
      Type: GameStateStorage.getGameConfigurationSaveType(),
      ContentType: SaveFileTypes.GAME_STATE,
      FileName: fileName(kind),
      Overwrite: true
    }),
    isPending: result => result?.result === SerializerResult.RESULT_PENDING,
    succeeded: result => result?.result === SerializerResult.RESULT_OK,
    matches: result => {
      if (!result || typeof result.options !== 'number') return false;
      const other = SaveLocationCategories.AUTOSAVE | SaveLocationCategories.QUICKSAVE;
      if ((result.options & other) !== 0) return false;
      // NORMAL is a bit flag in this build; also support a zero-valued NORMAL enum.
      if (SaveLocationCategories.NORMAL !== 0 &&
          (result.options & SaveLocationCategories.NORMAL) === 0) return false;
      return true;
    },
    saved: (state, kind) => console.warn(`${PREFIX} Saved ${fileName(kind)} at turn ${state.turn}; submitting ${kind}.`),
    recovering: (state, kind) => console.warn(`${PREFIX} Save completion missing for ${kind} at turn ${state.turn}; native serializer accepted one recovery write. Waiting for fresh completion.`),
    error: (key, retry, kind, ...args) => {
      const message = Locale.compose(key, ...args);
      console.error(`${PREFIX} ${message}`);
      errorOpen = true;
      const done = () => { errorOpen = false; dialogId = null; };
      try {
        dialogId = DialogBoxManager.createDialog_MultiOption({
          title: kind === 'diplomacy' ? 'LOC_SBE_ERROR_TITLE_DIPLOMACY' : 'LOC_SBE_ERROR_TITLE_TURN',
          body: `${message}[N][N]${Locale.compose(kind === 'diplomacy' ? 'LOC_SBE_ERROR_BODY_DIPLOMACY' : 'LOC_SBE_ERROR_BODY_TURN')}`,
          canClose: false,
          options: [
            { label: 'LOC_SBE_RETRY', actions: ['accept'], callback: () => {
              done();
              setTimeout(retry, 0);
            } },
            { label: kind === 'diplomacy' ? 'LOC_SBE_CANCEL_DIPLOMACY' : 'LOC_SBE_CANCEL_TURN', actions: ['cancel', 'keyboard-escape'], callback: done }
          ]
        });
      } catch (error) {
        done();
        notice(`${message} ${Locale.compose('LOC_SBE_RESELECT')}`);
        console.error(`${PREFIX} Could not open error dialog: ${error}`);
      }
    }
  });

  const unhook = installTurnHook(PanelAction.prototype, gate);
  const removeLauncher = installSettingsLauncher();
  let diplomacy;
  try {
    diplomacy = installDiplomacyHooks({
      operations: Game.PlayerOperations, operationTypes: PlayerOperationTypes,
      deals: Game.DiplomacyDeals, dealActions: DiplomacyDealProposalActions,
      manager: DiplomacyManager,
      dealPrototype: Controls.getDefinition('panel-diplomacy-peace-deal')?.createInstance?.prototype,
      gate, localPlayer: () => GameContext.localPlayerID,
      shouldSave: () => settingsStore.data.config.diplomacyEnabled && context('diplomacy') !== null,
      setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: id => { if (id !== null) clearTimeout(id); }
    });
  } catch (error) {
    notice(Locale.compose('LOC_SBE_DIPLOMACY_UNAVAILABLE'));
    console.error(`${PREFIX} Diplomacy hooks unavailable: ${error}`);
  }
  const saveStarted = () => gate.onSaveStart();
  const saveCompleted = result => gate.onSaveComplete(result);
  const invalidate = () => {
    gate.cancel();
    if (dialogId !== null) DialogBoxManager.closeDialogBox(dialogId);
    errorOpen = false;
    dialogId = null;
  };
  engine.on('StartSaveRequest', saveStarted);
  engine.on('SaveComplete', saveCompleted);
  engine.on('LocalPlayerChanged', invalidate);
  engine.on('LoadComplete', invalidate);

  // Freeze input during the asynchronous write: otherwise post-snapshot moves could
  // accidentally be submitted with a backup that predates those moves.
  const consume = event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    return false;
  };
  const previousInput = ContextManager.handleInput;
  const inputHook = function (event) {
    if (gate.busy) return consume(event);
    return previousInput.call(this, event);
  };
  const previousNavigation = ContextManager.handleNavigation;
  const navigationHook = function (event) {
    if (gate.busy) return consume(event);
    return previousNavigation.call(this, event);
  };
  ContextManager.handleInput = inputHook;
  ContextManager.handleNavigation = navigationHook;
  const domGuard = event => { if (gate.busy) consume(event); };
  const events = ['keydown', 'keyup', 'click', 'pointerdown', 'pointerup', 'mousedown', 'mouseup',
    'wheel', 'contextmenu', 'hotkey-next-action', 'action-next-action', 'engine-input'];
  for (const name of events) window.addEventListener(name, domGuard, true);

  function destroy() {
    invalidate();
    gate.dispose();
    diplomacy?.dispose();
    removeLauncher();
    unhook();
    engine.off('StartSaveRequest', saveStarted);
    engine.off('SaveComplete', saveCompleted);
    engine.off('LocalPlayerChanged', invalidate);
    engine.off('LoadComplete', invalidate);
    for (const name of events) window.removeEventListener(name, domGuard, true);
    if (ContextManager.handleInput === inputHook) ContextManager.handleInput = previousInput;
    if (ContextManager.handleNavigation === navigationHook) ContextManager.handleNavigation = previousNavigation;
    clearTimeout(toastTimer);
    toast?.remove();
    window.removeEventListener('unload', destroy);
  }
  window.addEventListener('unload', destroy);
  console.warn(`${PREFIX} Ready. Single-player; BeforeEndTurn and BeforeDiplomacy; independent settings. Diplomacy hooks: ${!!diplomacy}.`);
  return { destroy, get busy() { return gate.busy; }, get saveTracking() { return gate.saveTracking; } };
}

if (!globalThis[INSTANCE_KEY]) globalThis[INSTANCE_KEY] = install();
