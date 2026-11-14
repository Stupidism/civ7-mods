import '/core/ui/options/screen-options.js';
import { Options, OptionType } from '/core/ui/options/model-options.js';
import { CategoryData } from '/core/ui/options/options-helpers.js';
import { DialogBoxManager } from '/core/ui/dialog-box/manager-dialog-box.js';
import { BridgeSettingsStore } from './bridge-store.js';
import { createSharedControllerStorage } from './bridge-shared-storage.js';
import { installBridgeOptions } from './bridge-options.js';
import { installMenuNavigation } from './menu-navigation-adapter.js';
import { platformDefaults, standaloneBridgeEnabled, NATIVE_INPUT_ONLY } from './controller-policy.js';

const defaults = platformDefaults(globalThis.BuildInfo, globalThis.navigator);
const storage = createSharedControllerStorage(globalThis.localStorage);
export const settingsStore = new BridgeSettingsStore(storage, reportSettingsReadError, defaults);
function reportSettingsReadError(error) {
  console.error(`[ControllerBridge] Settings read failed; retaining last valid calibration: ${error}`);
  engine.whenReady.then(() => DialogBoxManager.createDialog_Confirm({
    title: 'LOC_BCS_CB_READ_ERROR_TITLE', body: 'LOC_BCS_CB_READ_ERROR_BODY'
  }));
}
export const useStandaloneBridge = standaloneBridgeEnabled(globalThis.Modding, globalThis);
export function reportSettingsError(error) {
  console.error(`[ControllerBridge] Settings could not be saved: ${error}`);
  DialogBoxManager.createDialog_Confirm({ title: 'LOC_BCS_CB_SAVE_ERROR_TITLE', body: 'LOC_BCS_CB_SAVE_ERROR_BODY' });
}
if (!NATIVE_INPUT_ONLY && !useStandaloneBridge) {
const integration = installBridgeOptions({
  options: Options, optionType: OptionType, categories: CategoryData, store: settingsStore, reportError: reportSettingsError
});
window.addEventListener('unload', () => integration.dispose());
engine.whenReady.then(() => installMenuNavigation(settingsStore));
} else {
  console.log(NATIVE_INPUT_ONLY ? '[BetterControllerSupport] Native input active; legacy remapping disabled.' : '[BetterControllerSupport] Standalone controller fix enabled; retaining its input and options.');
}
