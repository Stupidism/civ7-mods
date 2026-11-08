import { DEFAULTS, STORE } from './bridge-store.js';

export const SHARED_KEY = 'modSettings';
export const NAMESPACE = 'civ7-map-tools-gamepad';
const object = value => value != null && typeof value === 'object' && !Array.isArray(value);
function calibration(record) {
  if (!object(record) || record.version !== 1 || !object(record.controller) ||
      Object.keys(record.controller).length !== Object.keys(DEFAULTS).length ||
      Object.keys(DEFAULTS).some(key => typeof record.controller[key] !== 'boolean')) {
    throw new Error('Invalid shared controller settings format');
  }
  return record.controller;
}

// macOS can return the first row for ANY requested key. Only the community's
// single-row document is safe. Never create another independent localStorage
// key, clear storage, guess a legacy calibration, or merge an ambiguous read.
export function createSharedControllerStorage(storage) {
  const checkKey = key => { if (key !== STORE) throw new Error('Unexpected controller store key'); };
  function read() {
    if (storage.length > 1) throw new Error('Ambiguous multi-key settings storage; verified migration required');
    if (storage.length === 0) return { raw: null, document: {} };
    // key(0) is also broken on affected macOS builds and logs an engine
    // warning; the count, document schema and post-write count guard suffice.
    const raw = storage.getItem(SHARED_KEY);
    const document = JSON.parse(raw);
    if (!object(document)) throw new Error('Invalid shared settings document');
    // An exact BCS namespace permits preserving old root fields left by other
    // tools. Without it, require the community's namespaced-object shape; the
    // old bare five-switch record is never interpreted as a shared document.
    if (Object.prototype.hasOwnProperty.call(document, NAMESPACE)) calibration(document[NAMESPACE]);
    else if (Object.values(document).some(value => !object(value))) throw new Error('Unrecognized shared settings document');
    return { raw, document };
  }
  return {
    getItem(key) {
      checkKey(key);
      const { document } = read();
      return Object.prototype.hasOwnProperty.call(document, NAMESPACE)
        ? JSON.stringify(calibration(document[NAMESPACE])) : null;
    },
    setItem(key, json) {
      checkKey(key);
      const next = { version: 1, controller: JSON.parse(json) };
      calibration(next);
      const before = read();
      const document = { ...before.document, [NAMESPACE]: next };
      const serialized = JSON.stringify(document);
      storage.setItem(SHARED_KEY, serialized);
      if (storage.length !== 1) {
        // With one unknown key on buggy macOS, creating modSettings could make
        // a second row. Remove only our just-created row; retain that original.
        storage.removeItem(SHARED_KEY);
        throw new Error('Shared settings write created a second key; migration required');
      }
      const after = read();
      if (after.raw !== serialized) throw new Error('Shared controller settings read-back failed');
    }
  };
}
