import '/core/ui/options/screen-options.js';
import { ScreenOptionsCategory } from '/core/ui/options/screen-options-category.js';
import { Options, OptionType } from '/core/ui/options/model-options.js';
import { CategoryData } from '/core/ui/options/options-helpers.js';
import { ContextManager } from '/core/ui/context-manager/context-manager.js';
import { FocusManager } from '/core/ui-next/services/focus-manager.js';
import { DialogBoxManager } from '/core/ui/dialog-box/manager-dialog-box.js';
import { RestStore } from './rest-store.js';
import { installRestOptions, openRestOptions, installRestOptionDividers } from './rest-options.js';
import { session } from './rest-runtime.js';

let storage;
try { storage = localStorage; } catch (_) {
  storage = { getItem: () => null, setItem: () => { throw new Error('localStorage unavailable'); } };
}
export const settingsStore = new RestStore(storage);
const listeners = new Set();
export function subscribeSettings(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const isSettingsOpen = () => !!document.querySelector('screen-options');
export function openSettings() {
  if (UI.isInGame() && (session.pending || session.night)) return;
  openRestOptions({ context: ContextManager, document, afterLayout: waitForLayout,
    focus: element => FocusManager.get().setFocus(element) });
}

const removeDividers = installRestOptionDividers(ScreenOptionsCategory.prototype, document);
const integration = installRestOptions({
  options: Options, optionType: OptionType, categories: CategoryData, store: settingsStore,
  canCommit: () => !UI.isInGame() || (!session.pending && !session.night),
  applied(config, previous) {
    if (!previous.timeEnabled && config.timeEnabled && session.startedAt !== null) {
      session.startedAt = Date.now(); session.lastInputAt = Date.now(); session.idleRested = false;
    }
    for (const listener of listeners) listener(config);
  },
  reportError(error) {
    console.warn(`[Rest Guard] ${error}`);
    DialogBoxManager.createDialog_Confirm({ title: 'LOC_RG_SAVE_ERROR_TITLE', body: 'LOC_RG_SAVE_ERROR_BODY' });
  },
});
window.addEventListener('unload', () => { integration.dispose(); removeDividers(); listeners.clear(); });
