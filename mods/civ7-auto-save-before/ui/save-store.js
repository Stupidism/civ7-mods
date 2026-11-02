const KEY = 'modSettings';
const NAMESPACE = 'civ7-before-end-turn';

export function normalizeConfig(value = {}) {
  return {
    turnEnabled: typeof value?.turnEnabled === 'boolean' ? value.turnEnabled : true,
    diplomacyEnabled: typeof value?.diplomacyEnabled === 'boolean' ? value.diplomacyEnabled : true
  };
}

export class SaveSettingsStore {
  constructor(storage, warn = console.warn) {
    this.storage = storage; this.warn = warn; this.error = false;
    this.data = { config: normalizeConfig() };
    this.load();
  }
  read() {
    const shared = JSON.parse(this.storage.getItem(KEY) || '{}');
    if (!shared || typeof shared !== 'object' || Array.isArray(shared)) throw new Error('Invalid shared settings');
    return shared;
  }
  load() {
    try { this.data.config = normalizeConfig(this.read()[NAMESPACE]?.config); this.error = false; }
    catch (error) { this.report(error); }
  }
  save() {
    try {
      const shared = this.read();
      shared[NAMESPACE] = { version: 1, config: normalizeConfig(this.data.config) };
      this.storage.setItem(KEY, JSON.stringify(shared));
      this.error = false; return true;
    } catch (error) { this.report(error); return false; }
  }
  report(error) { this.error = true; this.warn(`[Before End Turn] Settings persistence unavailable: ${error}`); }
}
