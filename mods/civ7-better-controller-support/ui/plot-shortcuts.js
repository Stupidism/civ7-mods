import './controller-bridge.js';
import ActionHandler from '/core/ui/input/action-handler.js';
import InputFilter from '/core/ui/input/input-filter.js';
import { ContextManager } from '/core/ui/context-manager/context-manager.js';
import ViewManager from '/core/ui/views/view-manager.js';
import Cursor from '/core/ui/input/cursor.js';
import { PlotCursor } from '/core/ui/input/plot-cursor.js';
import { InputEngineEvent, InputHandlerState } from '/core/ui/input/input-support.js';
import { InterfaceMode } from '/core/ui/interface-modes/interface-modes.js';
import { ComponentID } from '/core/ui/utilities/utilities-component-id.js';
import { FocusManager } from '/core/ui-next/services/focus-manager.js';
import { IsControllerActive } from '/core/ui-next/services/input.js';
import WorldInput from '/base-standard/ui/world-input/world-input.js';
import { createPlotShortcutAdapter } from './plot-shortcuts-adapter.js';
import { installPlotShortcuts } from './plot-shortcuts-runtime.js';

const KEY = '__civ7PlotShortcuts';
function install() {
  if (UI.isInShell()) return;
  globalThis[KEY]?.dispose();
  let windowFocused = true;
  const adapter = createPlotShortcutAdapter({
    player: UI.Player, units: Units, mapUnits: MapUnits, cities: Cities, districts: Districts,
    mapCities: MapCities, gameplayMap: GameplayMap, revealedStates: RevealedStates,
    worldInput: WorldInput, view: ViewManager, modes: InterfaceMode, context: ContextManager,
    focus: FocusManager.get(), cursor: Cursor, plotCursor: PlotCursor, componentID: ComponentID,
    gameContext: GameContext, game: Game, isController: IsControllerActive, document,
    inputFilter: InputFilter, statuses: InputActionStatuses, handlerStates: InputHandlerState,
    makeInputEvent: (name, status) => new InputEngineEvent(name, status, 0, 0, false, false),
    isBusy: () => !windowFocused || !!globalThis.__civ7BeforeEndTurnV1?.busy
  });
  const runtime = installPlotShortcuts({ actionHandler: ActionHandler, context: ContextManager,
    statuses: InputActionStatuses, handlerStates: InputHandlerState, ...adapter,
    report: error => console.error(`[BetterControllerSupport] Plot shortcut failed: ${error}`) });
  const events = ['view-changed', 'interface-mode-changed', 'active-device-type-changed'];
  for (const name of events) window.addEventListener(name, runtime.invalidate);
  const onBlur = () => { windowFocused = false; runtime.invalidate(); };
  const onFocus = () => { windowFocused = true; };
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  engine.on('BeginFrame', runtime.sync);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const name of events) window.removeEventListener(name, runtime.invalidate);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
    engine.off('BeginFrame', runtime.sync);
    engine.off('BeforeUnload', dispose);
    runtime.dispose();
    if (globalThis[KEY]?.dispose === dispose) delete globalThis[KEY];
  };
  engine.on('BeforeUnload', dispose);
  globalThis[KEY] = { dispose };
}

// Listed after the compatibility bridge so this sees the physical binding
// before Shell X/RB acquire their fallback meanings. Works with native input too.
engine.whenReady.then(install);
