// Compatibility is user-selectable. Never infer a correct mapping from the OS.
export const NATIVE_INPUT_ONLY = false;
import { DEFAULTS } from './bridge-store.js';

export function platformDefaults() {
  return { ...DEFAULTS, enabled: false };
}

// The old mod has no cooperative registration API. Defer to it when enabled,
// before installing any hooks/options, irrespective of script execution order.
export function standaloneBridgeEnabled(modding, globals = {}) {
  try {
    const excluded = modding?.getModulesToExclude?.() || [];
    const mods = modding?.getInstalledMods?.();
    if (mods) return mods.some(mod => mod.id === 'civ7-controller-bridge' &&
      mod.enabled && !excluded.includes(mod.id));
  } catch (_) { /* Old builds: a running standalone instance is still evidence. */ }
  return !!(globals.__civ7ControllerBridge || globals.__civ7ControllerMenuNavigation);
}
