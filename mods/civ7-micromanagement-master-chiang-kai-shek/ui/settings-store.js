export const FEATURE_KEYS = Object.freeze(['autoAttack', 'autoJoin', 'quickTransfer', 'rightClickJoin', 'autoExit', 'emptyMarker', 'keepCommanderFocus', 'nextDeployable', 'nextRanged', 'focusPreview', 'focusNoMove', 'focusFarFirst', 'focusExclude', 'singleReinforcement', 'reinforcementCycle']);
const OPT_IN_FEATURES = new Set(['focusNoMove', 'focusFarFirst', 'focusExclude']);
export const PROFILES = Object.freeze(['mouse', 'gamepad']);
export const isFeatureApplicable = (profile, key) => !(profile === 'gamepad' && key === 'rightClickJoin');
const SHARED_KEY = 'modSettings';
const NAMESPACE = 'civ7-war-controls';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function normalizeConfig(value) {
  const config = {};
  for (const profile of PROFILES) {
    config[profile] = {};
    for (const key of FEATURE_KEYS) {
      const candidate = record(value) && record(value[profile]) ? value[profile][key] : undefined;
      config[profile][key] = typeof candidate === 'boolean' ? candidate : !OPT_IN_FEATURES.has(key);
    }
  }
  return config;
}

export function createSettingsStore(storage) {
  function readShared() {
    const raw = storage.getItem(SHARED_KEY);
    if (raw === null || raw === '') return {};
    const shared = JSON.parse(raw);
    if (!record(shared)) throw new Error('Mod settings must be an object');
    return shared;
  }
  return {
    load() {
      try {
        const saved = readShared()[NAMESPACE];
        const config = normalizeConfig(saved?.config);
        // Version 1 enabled exclusion by default, so its true value cannot
        // distinguish consent from an inherited default. Require a fresh opt-in
        // once; preserve all other saved choices and never rewrite on load.
        if (saved && saved.version !== 2) for (const profile of PROFILES)
          for (const key of OPT_IN_FEATURES) config[profile][key] = false;
        return { config, error: null };
      }
      catch (error) { return { config: normalizeConfig(), error }; }
    },
    save(value) {
      // Re-read on every save: another mod may have changed its namespace.
      // A damaged shared document must never be replaced with our defaults.
      const shared = readShared();
      const config = normalizeConfig(value);
      shared[NAMESPACE] = { version: 2, config };
      storage.setItem(SHARED_KEY, JSON.stringify(shared));
      return config;
    }
  };
}
