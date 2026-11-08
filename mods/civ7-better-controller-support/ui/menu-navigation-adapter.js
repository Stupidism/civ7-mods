import ActionHandler from '/core/ui/input/action-handler.js';
import Cursor from '/core/ui/input/cursor.js';
import { ContextManager } from '/core/ui/context-manager/context-manager.js';
import ViewManager from '/core/ui/views/view-manager.js';
import { FocusManager } from '/core/ui-next/services/focus-manager.js';
import { createMenuNavigation } from './menu-navigation.js';

import { createScrollNavigation } from './scroll-navigation.js';
import { setInstruction } from './instruction-hints.js';

const KEY = '__civ7ControllerMenuNavigation';

// Called by settings initialization in both shell and game documents. The map
// bridge is game-only; this lightweight hook also covers the main menu.
export function installMenuNavigation(settingsStore) {
  globalThis[KEY]?.dispose();
  let focused = true, patch, unsubscribe, removed = false;
  const sync = () => patch?.sync();
  const blur = () => { focused = false; patch?.suspend(); sync(); };
  const focus = () => { focused = true; sync(); };
  const dispose = () => {
    if (removed) return;
    removed = true;
    unsubscribe?.(); patch?.dispose();
    window.removeEventListener('blur', blur);
    window.removeEventListener('focus', focus);
    window.removeEventListener('unload', dispose);
    engine.off('BeforeUnload', dispose);
    engine.off('BeginFrame', sync);
    engine.off('InputContextChanged', sync);
    if (globalThis[KEY]?.dispose === dispose) delete globalThis[KEY];
  };
  try {
    patch = createMenuNavigation({
      scrollControls: createScrollNavigation({ document, window, focus: FocusManager.get(), statuses: InputActionStatuses,
        root: () => ContextManager.getCurrentTarget() || document, instruction: setInstruction }),
      actionHandler: ActionHandler, statuses: InputActionStatuses, input: Input, contexts: InputContext,
      snapshot: () => {
        const target = ContextManager.getCurrentTarget();
        // A settler legend accompanies map selection. Only the map bridge may
        // calibrate its sticks; two hook orders must never swap them twice.
        const mapOverlay = target?.tagName === 'PANEL-SETTLER-LEGEND';
        const smallNarrative = target?.tagName === 'SMALL-NARRATIVE-EVENT';
        const inShell = UI.isInShell();
        const view = ViewManager.current;
        return {
          // Diplomacy and other harness views host panels outside the popup stack.
          // Use the view's declared context, not the sometimes-stale Mac device context.
          menu: inShell || (!ContextManager.isEmpty && !mapOverlay) || view?.getInputContext() === InputContext.Shell,
          // Calibrate the reported pause and small-event cases. The merchant
          // chooser was reported working on the left; preserve other panels.
          swapRoles: inShell || view?.getName() === 'PauseMenu' || smallNarrative,
          nativeMenuContext: smallNarrative ? InputContext.Dual : undefined,
          panelPresent: !ContextManager.isEmpty,
          viewContext: view?.getInputContext(),
          scope: inShell ? 'shell' : target?.tagName || view?.getName() || 'game-panel',
          inputContext: Input.getActiveContext(),
          controller: Input.getActiveDeviceType() === InputDeviceType.Controller,
          softCursor: Cursor.softCursorEnabled || Cursor.hybridCursorEnabled,
          focused,
          blocked: FocusManager.get().isFocusLocked() || document.hidden === true || !!document.querySelector('.c7r-overlay') ||
            !!globalThis.__civ7BeforeEndTurnV1?.busy
        };
      },
      report: sample => console.warn(`[ControllerBridge:MenuInput] v0.2.0 ${JSON.stringify(sample)}`)
    });
    patch.setConfig(settingsStore.load());
    unsubscribe = settingsStore.subscribe(patch.setConfig);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    window.addEventListener('unload', dispose);
    engine.on('BeforeUnload', dispose);
    engine.on('BeginFrame', sync);
    engine.on('InputContextChanged', sync);
    globalThis[KEY] = { dispose };
  } catch (error) {
    dispose();
    console.error(`[ControllerBridge] Menu input compatibility unavailable: ${error}`);
  }
  return dispose;
}
