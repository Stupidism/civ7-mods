import '/core/ui/options/screen-options.js';
import { Options, OptionType } from '/core/ui/options/model-options.js';
import { CategoryData } from '/core/ui/options/options-helpers.js';
import { DialogBoxManager } from '/core/ui/dialog-box/manager-dialog-box.js';
import { BridgeSettingsStore } from './bridge-store.js';
import { installBridgeOptions } from './bridge-options.js';
import { installMenuNavigation } from './menu-navigation-adapter.js';
import { platformDefaults, standaloneBridgeEnabled } from './controller-policy.js';

let storage;
try { storage = localStorage; }
catch (_) { storage = { getItem: () => null, setItem: () => { throw new Error('localStorage unavailable'); } }; }
export const settingsStore = new BridgeSettingsStore(storage,
  error => console.warn(`[ControllerBridge] Settings defaulted: ${error}`),
  platformDefaults(globalThis.BuildInfo, globalThis.navigator));
export const useStandaloneBridge = standaloneBridgeEnabled(globalThis.Modding, globalThis);
export function reportSettingsError(error) {
  console.error(`[ControllerBridge] Settings could not be saved: ${error}`);
  DialogBoxManager.createDialog_Confirm({ title: 'LOC_BCS_CB_SAVE_ERROR_TITLE', body: 'LOC_BCS_CB_SAVE_ERROR_BODY' });
}
if (!useStandaloneBridge) {
const integration = installBridgeOptions({
  options: Options, optionType: OptionType, categories: CategoryData, store: settingsStore, reportError: reportSettingsError
});
window.addEventListener('unload', () => integration.dispose());
engine.whenReady.then(() => installMenuNavigation(settingsStore));
} else {
  console.log('[BetterControllerSupport] Standalone controller fix enabled; retaining its input and options.');
}
