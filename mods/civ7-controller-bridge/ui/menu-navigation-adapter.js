import ActionHandler from '/core/ui/input/action-handler.js';
import Cursor from '/core/ui/input/cursor.js';
import { ContextManager } from '/core/ui/context-manager/context-manager.js';
import { createMenuNavigation } from './menu-navigation.js';

const KEY = '__civ7ControllerMenuNavigation';

// Called by settings initialization in both shell and game documents. The map
// bridge is game-only; this lightweight hook also covers the main menu.
export function installMenuNavigation(settingsStore) {
  globalThis[KEY]?.dispose();
  let focused = true, patch, unsubscribe, removed = false;
  const blur = () => { focused = false; };
  const focus = () => { focused = true; };
  const dispose = () => {
    if (removed) return;
    removed = true;
    unsubscribe?.(); patch?.dispose();
    window.removeEventListener('blur', blur);
    window.removeEventListener('focus', focus);
    window.removeEventListener('unload', dispose);
    engine.off('BeforeUnload', dispose);
    if (globalThis[KEY]?.dispose === dispose) delete globalThis[KEY];
  };
  try {
    patch = createMenuNavigation({
      actionHandler: ActionHandler, statuses: InputActionStatuses,
      snapshot: () => ({
        menu: UI.isInShell() || !ContextManager.isEmpty,
        scope: UI.isInShell() ? 'shell' : ContextManager.getCurrentTarget()?.tagName || 'game-panel',
        inputContext: Input.getActiveContext(),
        controller: Input.getActiveDeviceType() === InputDeviceType.Controller,
        softCursor: Cursor.softCursorEnabled || Cursor.hybridCursorEnabled,
        focused,
        blocked: document.hidden === true || !!document.querySelector('.c7r-overlay') ||
          !!globalThis.__civ7BeforeEndTurnV1?.busy
      }),
      report: sample => console.warn(`[ControllerBridge:MenuInput] v0.1.5 ${JSON.stringify(sample)}`)
    });
    patch.setConfig(settingsStore.load());
    unsubscribe = settingsStore.subscribe(patch.setConfig);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    window.addEventListener('unload', dispose);
    engine.on('BeforeUnload', dispose);
    globalThis[KEY] = { dispose };
  } catch (error) {
    dispose();
    console.error(`[ControllerBridge] Menu input compatibility unavailable: ${error}`);
  }
  return dispose;
}
