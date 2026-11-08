import { setInstruction } from './instruction-hints.js';
import './plot-shortcuts.js';
import ActionHandler from '/core/ui/input/action-handler.js';
import InputFilter from '/core/ui/input/input-filter.js';
import { InputEngineEvent, InputHandlerState } from '/core/ui/input/input-support.js';
import { ContextManager } from '/core/ui/context-manager/context-manager.js';
import ViewManager from '/core/ui/views/view-manager.js';
import { InterfaceMode } from '/core/ui/interface-modes/interface-modes.js';
import { FocusManager } from '/core/ui-next/services/focus-manager.js';
import { IsControllerActive } from '/core/ui-next/services/input.js';
import Cursor from '/core/ui/input/cursor.js';
import { ComponentID } from '/core/ui/utilities/utilities-component-id.js';
import { installForceTurn } from './force-turn-runtime.js';

const KEY = '__civ7ForceTurn';
function install() {
  if (UI.isInShell()) return;
  globalThis[KEY]?.dispose();
  let windowFocused = true, disposed = false;
  const indicator = document.createElement('div');
  indicator.className = 'font-body';
  indicator.setAttribute('role', 'status');
  // Give the flex label a definite width: Gameface can otherwise shrink this
  // fixed, auto-sized card to its glyph and wrap the instruction vertically.
  indicator.style.cssText = 'position:fixed;bottom:110px;left:50%;transform:translateX(-50%);z-index:1000;pointer-events:none;padding:10px 16px;background:#142332ee;color:#f4e6c6;border:1px solid #bca472;width:680px;max-width:80%;box-sizing:border-box;';
  const label = document.createElement('div');
  const bar = document.createElement('div');
  bar.style.cssText = 'height:3px;margin-top:6px;background:#d4b879;transform-origin:left;';
  indicator.append(label, bar);
  let lastLabel = '';
  function progress(value) {
    if (value === null) { indicator.remove(); return; }
    const key = value < 1 ? 'LOC_MTG_FORCE_TURN_HOLD' : 'LOC_MTG_FORCE_TURN_RELEASE';
    if (lastLabel !== key) { setInstruction(label, key, 'shell-action-5', { singleLine: true }); lastLabel = key; }
    bar.style.transform = `scaleX(${value})`;
    if (!indicator.isConnected) document.body.appendChild(indicator);
  }
  function snapshot() {
    const mode = InterfaceMode.getCurrent(), focus = FocusManager.get();
    const local = GameContext.localPlayerID;
    const player = Number.isInteger(local) && local >= 0 ? Players.get(local) : null;
    const config = Configuration.getGame();
    const eligible = windowFocused && !document.hidden && IsControllerActive() &&
      !Cursor.softCursorEnabled && !Cursor.hybridCursorEnabled &&
      (mode === 'INTERFACEMODE_DEFAULT' || mode === 'INTERFACEMODE_UNIT_SELECTED') &&
      (focus.isWorldFocused() || (mode === 'INTERFACEMODE_UNIT_SELECTED' &&
        !!focus.currentFocus()?.closest?.('unit-actions'))) &&
      !focus.isFocusLocked() && !ContextManager.getCurrentTarget() &&
      ViewManager.isWorldInputAllowed && ViewManager.isViewInputAllowed &&
      ContextManager.canUseInput('world-input', 'action-next-action') &&
      UI.isInGame() && !config.isPaused && !Autoplay.isActive &&
      Number.isInteger(local) && local >= 0 && player?.isHuman && player.isTurnActive &&
      !GameContext.hasSentTurnComplete() && !globalThis.__civ7BeforeEndTurnV1?.busy &&
      !document.querySelector('.c7r-overlay') &&
      ['shell-action-5', 'force-end-turn'].every(name => InputFilter.handleInput(
        new InputEngineEvent(name, InputActionStatuses.FINISH, 0, 0, false, false)
      ) !== InputHandlerState.Handled);
    return { eligible: !!eligible,
      scope: `${config.gameSeed}:${local}:${Game.age}:${Game.turn}:${mode}:${ComponentID.toString(UI.Player.getHeadSelectedUnit())}` };
  }
  const runtime = installForceTurn({ actionHandler: ActionHandler, statuses: InputActionStatuses,
    snapshot, progress, report: error => console.error(`[BetterControllerSupport] Force turn: ${error}`) });
  const onBlur = () => { windowFocused = false; runtime.cancel(); };
  const onFocus = () => { windowFocused = true; };
  const events = ['view-changed', 'interface-mode-changed', 'active-device-type-changed'];
  for (const name of events) window.addEventListener(name, runtime.cancel);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  engine.on('BeginFrame', runtime.tick);
  engine.on('PlayerTurnActivated', runtime.cancel);
  engine.on('GameStarted', runtime.cancel);
  function dispose() {
    if (disposed) return;
    disposed = true;
    runtime.dispose();
    for (const name of events) window.removeEventListener(name, runtime.cancel);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
    engine.off('BeginFrame', runtime.tick);
    engine.off('PlayerTurnActivated', runtime.cancel);
    engine.off('GameStarted', runtime.cancel);
    engine.off('BeforeUnload', dispose);
    if (globalThis[KEY]?.dispose === dispose) delete globalThis[KEY];
  }
  engine.on('BeforeUnload', dispose);
  globalThis[KEY] = { dispose };
}
engine.whenReady.then(install);
