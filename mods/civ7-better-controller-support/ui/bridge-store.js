export const STORE = 'civ7-controller-bridge-v1';
export const DEFAULTS = Object.freeze({ enabled: true, invertLeftY: false, invertPanY: true, showDebug: false });

export function normalizeConfig(value = {}, defaults = DEFAULTS) {
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) =>
    [key, typeof value?.[key] === 'boolean' ? value[key] : fallback]));
}

export class BridgeSettingsStore {
  constructor(storage, report = () => {}, defaults = DEFAULTS) {
    this.storage = storage;
    this.report = report;
    this.defaults = defaults;
    this.listeners = new Set();
  }
  load() {
    try { return normalizeConfig(JSON.parse(this.storage.getItem(STORE) || '{}'), this.defaults); }
    catch (error) { this.report(error); return normalizeConfig({}, this.defaults); }
  }
  save(config) {
    const next = normalizeConfig(config, this.defaults);
    // Publish only after the write succeeds, so failed changes never go live.
    this.storage.setItem(STORE, JSON.stringify(next));
    for (const listener of this.listeners) listener({ ...next });
    return next;
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
