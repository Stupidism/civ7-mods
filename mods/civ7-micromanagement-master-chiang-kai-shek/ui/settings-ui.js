import { Options, OptionType } from '/core/ui/options/model-options.js';
import { CategoryData } from '/core/ui/options/options-helpers.js';
import { DialogBoxManager } from '/core/ui/dialog-box/manager-dialog-box.js';
import { createSettingsStore } from './settings-store.js';
import { installNativeOptions } from './native-options.js';
import { installSettingsLayout } from './settings-layout.js';

const SLOT = '__civ7WarControlsOptions';
function install() {
  globalThis[SLOT]?.dispose();
  const stylesheet = document.createElement('link');
  stylesheet.setAttribute('rel', 'stylesheet');
  stylesheet.setAttribute('href', 'fs://game/civ7-war-controls/ui/settings.css');
  const integration = installNativeOptions({
    options: Options, optionType: OptionType, categories: CategoryData,
    store: createSettingsStore(localStorage),
    applied() { window.dispatchEvent(new CustomEvent('war-controls-settings-applied')); },
    reportError(error, saving) {
      console.error('[War Controls] Options storage error: ' + String(error));
      if (saving) DialogBoxManager.createDialog_Confirm({
        title: 'LOC_WC_SAVE_ERROR_TITLE', body: 'LOC_WC_SAVE_ERROR_BODY'
      });
    }
  });
  const removeLayout = installSettingsLayout();
  document.head.appendChild(stylesheet);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    integration.dispose();
    removeLayout();
    stylesheet.remove();
    engine.off('BeforeUnload', dispose);
    window.removeEventListener('unload', dispose);
    if (globalThis[SLOT]?.dispose === dispose) delete globalThis[SLOT];
  };
  engine.on('BeforeUnload', dispose);
  window.addEventListener('unload', dispose);
  globalThis[SLOT] = { version: '0.6.0', dispose };
  console.warn('[War Controls] Additional Content settings 0.6.0 loaded.');
}
engine.whenReady.then(install).catch(error => console.error('[War Controls] Options install failed: ' + String(error)));
