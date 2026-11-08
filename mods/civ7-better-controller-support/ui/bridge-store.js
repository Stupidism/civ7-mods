export const STORE = 'civ7-controller-bridge-v1';
export const DEFAULTS = Object.freeze({ enabled: true, swapSticks: false, invertLeftY: false, invertPanY: true, showDebug: false });

export function normalizeConfig(value = {}, defaults = DEFAULTS) {
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) =>
    [key, typeof value?.[key] === 'boolean' ? value[key] : fallback]));
}

function parseConfig(raw) {
  const value = JSON.parse(raw);
  if (!value || Array.isArray(value) || typeof value !== 'object' ||
      Object.keys(value).some(key => !Object.prototype.hasOwnProperty.call(DEFAULTS, key) || typeof value[key] !== 'boolean')) {
    throw new Error('Invalid controller settings; refusing unrelated storage data');
  }
  return value;
}

export class BridgeSettingsStore {
  constructor(storage, report = () => {}, defaults = DEFAULTS) {
    this.storage = storage;
    this.report = report;
    this.defaults = defaults;
    this.listeners = new Set();
    this.lastGood = null;
    this.readFault = null;
    this.writeFault = false;
  }
  load() {
    // A failed save must not become active through a later read. A successful
    // explicit retry clears this quarantine; adapters also roll back writes.
    if (this.writeFault) return { ...(this.lastGood ?? this.defaults) };
    try {
      const raw = this.storage.getItem(STORE);
      if (raw == null && !this.lastGood) return { ...this.defaults };
      if (raw == null) throw new Error('Controller settings disappeared');
      const value = parseConfig(raw);
      if (!Object.keys(value).length && this.lastGood) throw new Error('Controller settings became empty');
      this.lastGood = normalizeConfig(value, this.defaults);
      this.readFault = null;
      return { ...this.lastGood };
    } catch (error) {
      const fault = String(error);
      if (this.readFault !== fault) { this.readFault = fault; this.report(error); }
      return { ...(this.lastGood ?? this.defaults) };
    }
  }
  #rollbackPlain(before, attempted, failure) {
    const actual = this.storage.getItem(STORE);
    if (actual === before) return;
    if (actual !== attempted) {
      // Do not overwrite a detectable intervening foreign update while trying
      // to undo our rejected write.
      throw new Error(`Controller settings rollback failed after ${failure}`);
    }
    try {
      if (before == null) {
        if (typeof this.storage.removeItem !== 'function') throw new Error('storage cannot remove the rejected first write');
        this.storage.removeItem(STORE);
        if (this.storage.getItem(STORE) != null) throw new Error('removal was not verified');
      } else {
        this.storage.setItem(STORE, before);
        if (this.storage.getItem(STORE) !== before) throw new Error('restoration was not verified');
      }
    } catch (error) {
      throw new Error(`Controller settings rollback failed after ${failure}: ${error}`);
    }
  }
  save(config) {
    const next = normalizeConfig(config, this.defaults);
    if (!this.lastGood) this.load();
    const serialized = JSON.stringify(next);
    try {
      if (typeof this.storage.verifiedSetItem === 'function') {
        this.storage.verifiedSetItem(STORE, serialized, () => {
          const actual = parseConfig(this.storage.getItem(STORE));
          if (Object.keys(DEFAULTS).some(key => actual[key] !== next[key])) {
            throw new Error('Controller settings read-back failed');
          }
        });
      } else {
        let attempted = false;
        let before;
        try {
          before = this.storage.getItem(STORE);
          attempted = true;
          this.storage.setItem(STORE, serialized);
          const actual = parseConfig(this.storage.getItem(STORE));
          if (Object.keys(DEFAULTS).some(key => actual[key] !== next[key])) {
            throw new Error('Controller settings read-back failed');
          }
        } catch (error) {
          if (attempted) this.#rollbackPlain(before, serialized, String(error.message ?? error));
          throw error;
        }
      }
    } catch (error) { this.writeFault = true; throw error; }
    this.lastGood = { ...next };
    this.readFault = null;
    this.writeFault = false;
    for (const listener of this.listeners) listener({ ...next });
    return next;
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
