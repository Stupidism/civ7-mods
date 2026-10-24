import { DEFAULTS } from './bridge-store.js';

// BuildInfo is the native game's platform source; navigator covers older Mac
// builds whose target label is absent. Do not enable fallback on unknown hosts.
export function platformDefaults(build = {}, navigator = {}) {
  const target = String(build.target || '');
  const mac = target === 'Windows' ? false :
    /mac|osx|darwin/i.test(target) || build.graphics === 'Metal' ||
    /mac/i.test(navigator.platform || navigator.userAgent || '');
  return { ...DEFAULTS, enabled: mac };
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
