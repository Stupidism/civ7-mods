export const STORE = 'civ7-controller-bridge-v1';
export const DEFAULTS = Object.freeze({ enabled: true, invertLeftY: false, invertPanY: true, showDebug: false });

export function normalizeConfig(value = {}) {
  return Object.fromEntries(Object.entries(DEFAULTS).map(([key, fallback]) =>
    [key, typeof value?.[key] === 'boolean' ? value[key] : fallback]));
}

export class BridgeSettingsStore {
  constructor(storage, report = () => {}) {
    this.storage = storage;
    this.report = report;
    this.listeners = new Set();
  }
  load() {
    try { return normalizeConfig(JSON.parse(this.storage.getItem(STORE) || '{}')); }
    catch (error) { this.report(error); return normalizeConfig(); }
  }
  save(config) {
    const next = normalizeConfig(config);
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
