import { normalizeConfig, normalizeSession } from './rules.js';
const KEY = 'modSettings';
const NS = 'civ7-garbage-time';
export function createConfigStore(storage) {
  const read = () => {
    const value = JSON.parse(storage.getItem(KEY) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('附加内容设置数据损坏；未覆盖原有数据');
    return value;
  };
  return {
    load() { return normalizeConfig(read()[NS]?.config); },
    save(value) {
      const shared = read();
      const config = normalizeConfig(value);
      shared[NS] = { version: 1, config };
      storage.setItem(KEY, JSON.stringify(shared));
      return config;
    }
  };
}
// The same per-save property API is used by core/ui/utilities/utility-serialize.
// Global preferences stay in modSettings; activation and city choices travel
// with this player's save and are isolated between ages.
export function createSessionStore(api = globalThis) {
  const available = () => typeof api.GameTutorial !== 'undefined' && typeof api.GameContext !== 'undefined' &&
    api.GameContext.localPlayerID >= 0 && !!api.Players?.get(api.GameContext.localPlayerID);
  const key = () => api.Database.makeHash(`${NS}.v1.${api.Game.age}.${api.GameContext.localPlayerID}`);
  return {
    available,
    load() {
      if (!available()) return normalizeSession();
      const raw = api.GameTutorial.getProperty(key());
      return normalizeSession(typeof raw === 'string' && raw ? JSON.parse(raw) : undefined);
    },
    save(value) {
      if (!available()) throw new Error('请在游戏内开启垃圾时间');
      const state = normalizeSession(value);
      api.GameTutorial.setProperty(key(), JSON.stringify(state));
      return state;
    }
  };
}
