import '/core/ui/options/screen-options.js';
import { Options, OptionType } from '/core/ui/options/model-options.js';
import { CategoryData } from '/core/ui/options/options-helpers.js';
import { ContextManager } from '/core/ui/context-manager/context-manager.js';
import { FocusManager } from '/core/ui-next/services/focus-manager.js';
import { DialogBoxManager } from '/core/ui/dialog-box/manager-dialog-box.js';
import { SaveSettingsStore } from './save-store.js';
import { installSaveOptions, openSaveOptions } from './save-options.js';

let storage;
try { storage = localStorage; } catch (_) {
  storage = { getItem: () => null, setItem: () => { throw new Error('localStorage unavailable'); } };
}
export const settingsStore = new SaveSettingsStore(storage);
const integration = installSaveOptions({
  options: Options, optionType: OptionType, categories: CategoryData, store: settingsStore,
  canCommit: () => !globalThis.__civ7BeforeEndTurnV1?.busy,
  reportError: () => DialogBoxManager.createDialog_Confirm({ title: 'LOC_SBE_SETTINGS_ERROR_TITLE', body: 'LOC_SBE_SETTINGS_ERROR_BODY' })
});
export function openSettings() {
  if (globalThis.__civ7BeforeEndTurnV1?.busy) return;
  openSaveOptions({ context: ContextManager, document, afterLayout: waitForLayout,
    focus: element => FocusManager.get().setFocus(element) });
}
export function installSettingsLauncher() {
  const button = document.createElement('fxs-activatable');
  button.className = 'sbe-settings-launcher font-title text-sm pointer-events-auto px-2';
  button.textContent = Locale.compose('LOC_SBE_SETTINGS_SHORT');
  button.setAttribute('data-tooltip-content', Locale.compose('LOC_SBE_SETTINGS_TOOLTIP'));
  button.setAttribute('aria-label', Locale.compose('LOC_OPTIONS_GROUP_SAVE_BEFORE_ACTION'));
  button.style.cssText = 'flex-shrink:0;white-space:nowrap;align-self:center;';
  button.addEventListener('action-activate', openSettings);
  const mount = () => {
    const host = document.querySelector('panel-system-bar #ps-clock')?.parentElement;
    if (host && button.parentElement !== host) host.appendChild(button);
  };
  const observer = new MutationObserver(mount);
  if (document.body) { observer.observe(document.body, { childList: true, subtree: true }); mount(); }
  return () => { observer.disconnect(); button.removeEventListener('action-activate', openSettings); button.remove(); };
}
window.addEventListener('unload', () => integration.dispose());
