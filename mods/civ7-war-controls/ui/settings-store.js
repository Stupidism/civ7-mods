export const FEATURE_KEYS = Object.freeze(['autoAttack', 'autoJoin', 'rightClickJoin', 'autoExit', 'singleReinforcement', 'emptyMarker']);
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
      config[profile][key] = typeof candidate === 'boolean' ? candidate : true;
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
      try { return { config: normalizeConfig(readShared()[NAMESPACE]?.config), error: null }; }
      catch (error) { return { config: normalizeConfig(), error }; }
    },
    save(value) {
      // Re-read on every save: another mod may have changed its namespace.
      // A damaged shared document must never be replaced with our defaults.
      const shared = readShared();
      const config = normalizeConfig(value);
      shared[NAMESPACE] = { version: 1, config };
      storage.setItem(SHARED_KEY, JSON.stringify(shared));
      return config;
    }
  };
}
