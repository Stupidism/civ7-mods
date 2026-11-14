import { DEFAULTS, STORE } from './bridge-store.js';

export const SHARED_KEY = 'modSettings';
export const NAMESPACE = 'civ7-map-tools-gamepad';
const PROBE_KEY = '__bcs-controller-storage-key-probe-20261109__';
const object = value => value != null && typeof value === 'object' && !Array.isArray(value);
function calibration(record) {
  if (!object(record) || record.version !== 1 || !object(record.controller) ||
      Object.keys(record.controller).length !== Object.keys(DEFAULTS).length ||
      Object.keys(DEFAULTS).some(key => typeof record.controller[key] !== 'boolean')) {
    throw new Error('Invalid shared controller settings format');
  }
  return record.controller;
}

function legacyCalibration(raw) {
  const value = JSON.parse(raw);
  if (!object(value) || !Object.prototype.hasOwnProperty.call(value, 'enabled') ||
      !Object.prototype.hasOwnProperty.call(value, 'invertPanY') ||
      Object.keys(value).some(key => !Object.prototype.hasOwnProperty.call(DEFAULTS, key) || typeof value[key] !== 'boolean')) {
    throw new Error('Invalid legacy controller settings; refusing unrelated storage data');
  }
  // Deliberately return only the legacy fields. BridgeSettingsStore applies
  // the platform defaults for omitted switches, so migration does not bake a
  // platform-specific enabled value into the shared document.
  return value;
}

// macOS can return the first row for ANY requested key. A missing probe key
// proves keyed reads for this particular backend; an empty backend is treated
// as keyed and is tested again after every storage mutation. This is not an
// OS guess and never creates a second persistent key. Multi-row key-blind
// storage remains fail-closed.
export function createSharedControllerStorage(storage) {
  const checkKey = key => { if (key !== STORE) throw new Error('Unexpected controller store key'); };
  function reliableKeyedRead() {
    if (storage.length === 0) return true;
    // A failed probe is unknown, not evidence of key-blind behavior. Propagate
    // it so a save can never use a detection fault as an ownership claim.
    return storage.getItem(PROBE_KEY) == null;
  }
  function read() {
    const length = storage.length;
    const keyed = reliableKeyedRead();
    if (length > 1 && !keyed) throw new Error('Ambiguous multi-key settings storage; verified migration required');
    if (length === 0) return { raw: null, document: {}, legacyRaw: null, keyed, length };
    // key(0) is also broken on affected macOS builds and logs an engine
    // warning. The probe plus document checks avoid relying on it.
    const raw = storage.getItem(SHARED_KEY);
    if (raw == null && !keyed) {
      throw new Error('Key-blind settings storage did not return its sole row');
    }
    if (raw == null) return { raw: null, document: {}, legacyRaw: storage.getItem(STORE), keyed, length };
    const document = JSON.parse(raw);
    if (!object(document)) throw new Error('Invalid shared settings document');
    // An exact BCS namespace permits preserving old root fields left by other
    // tools. Without it, require the community's namespaced-object shape; the
    // old bare five-switch record is never interpreted as a shared document.
    if (Object.prototype.hasOwnProperty.call(document, NAMESPACE)) {
      calibration(document[NAMESPACE]);
    } else if (!keyed && Object.values(document).some(value => !object(value))) {
      // A reliable keyed read targets modSettings exactly and can preserve any
      // root metadata. A key-blind read cannot identify that target, so the
      // all-namespaced-objects shape remains necessary only there.
      throw new Error('Unrecognized shared settings document');
    }
    // An exact legacy key is authoritative only on a keyed backend. A sole
    // bare record remains unknown on key-blind storage and is never guessed.
    const legacyRaw = keyed ? storage.getItem(STORE) : null;
    return { raw, document, legacyRaw, keyed, length };
  }
  function readForLoad() {
    const state = read();
    if (Object.prototype.hasOwnProperty.call(state.document, NAMESPACE)) {
      return { config: calibration(state.document[NAMESPACE]), state };
    }
    if (!state.keyed) return { config: null, state };
    if (state.legacyRaw == null) return { config: null, state };
    return { config: legacyCalibration(state.legacyRaw), state };
  }
  function sameJson(left, right) {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  }
  function currentShared() {
    return storage.getItem(SHARED_KEY);
  }
  function rollbackShared(before, attempted, failure) {
    // A backend may reject the write before changing anything. An initially
    // empty store which is still empty is already rolled back; probing it can
    // only turn the original diagnostic into a misleading rollback failure.
    if (before.length === 0 && storage.length === 0) return;
    const current = currentShared();
    // An empty before-state plus one row containing exactly this attempted
    // namespace proves this call created the whole shared key. This remains
    // safe when that first mutation reveals key-blind reads.
    if (before.length === 0) {
      let document = null;
      try {
        document = JSON.parse(current ?? 'null');
      } catch {
        document = null;
      }
      const exactOwnWrite = object(document) &&
        Object.keys(document).length === 1 && sameJson(document[NAMESPACE], attempted);
      const ours = object(document) && sameJson(document[NAMESPACE], attempted);
      if (!ours) throw new Error(`Controller settings rollback failed after ${failure}`);
      try {
        if (Object.keys(document).length === 1 && exactOwnWrite) {
          const lengthBeforeRemoval = storage.length;
          storage.removeItem(SHARED_KEY);
          if (storage.length !== lengthBeforeRemoval - 1 || (storage.length === 0 && currentShared() != null)) {
            throw new Error('first shared key was not removed');
          }
        } else {
          // The first creation may have been observed by another writer. Keep
          // every foreign root field and remove only the attempted namespace.
          const withoutNamespace = { ...document };
          delete withoutNamespace[NAMESPACE];
          const restored = JSON.stringify(withoutNamespace);
          storage.setItem(SHARED_KEY, restored);
          if (currentShared() !== restored) throw new Error('restoration was not verified');
        }
      } catch (error) {
        throw new Error(`Controller settings rollback failed after ${failure}: ${error}`);
      }
      return;
    }

    // A write can be keyed while reads are key-blind. An unchanged sole row
    // plus exactly one new row still cannot prove which row this call added:
    // the original row may be the shared settings while another writer added
    // an independent key. Preserve both rows and report the original failure.
    if (!before.keyed && before.length === 1 && storage.length === 2 &&
        current === before.raw) {
      throw new Error(
        `Controller settings rollback unverified after ${failure}: shared-row identity is ambiguous`
      );
    }
    if (!before.keyed && before.length === 1 && storage.length === 2) {
      // If the first row changed, this write probably updated an existing
      // shared document while another writer added an independent key. Restore
      // the old BCS namespace only when the before-row positively identified
      // that target and the current row still contains this attempt. Unknown
      // sole rows fail closed rather than deleting either row.
      let document = null;
      try {
        document = JSON.parse(current ?? 'null');
      } catch {
        document = null;
      }
      const confidentlyTarget = object(document) &&
        Object.prototype.hasOwnProperty.call(before.document, NAMESPACE) &&
        sameJson(document[NAMESPACE], attempted);
      if (!confidentlyTarget) {
        throw new Error(`Controller settings rollback failed after ${failure}`);
      }
      const restoredDocument = { ...document, [NAMESPACE]: before.document[NAMESPACE] };
      const restored = JSON.stringify(restoredDocument);
      try {
        storage.setItem(SHARED_KEY, restored);
        if (currentShared() !== restored) throw new Error('restoration was not verified');
      } catch (error) {
        throw new Error(`Controller settings rollback failed after ${failure}: ${error}`);
      }
      return;
    }
    if (current === before?.raw) return;
    if (before?.raw == null) {
      if (current == null) return;
      let document = null;
      try {
        document = JSON.parse(current);
      } catch {
        document = null;
      }
      const ours = object(document) && sameJson(document[NAMESPACE], attempted);
      if (!ours) throw new Error(`Controller settings rollback failed after ${failure}`);
      const withoutNamespace = { ...document };
      delete withoutNamespace[NAMESPACE];
      try {
        if (Object.keys(withoutNamespace).length === 0) {
          storage.removeItem(SHARED_KEY);
          if (currentShared() != null) throw new Error('removal was not verified');
        } else {
          // Another writer may have added root fields after our rejected first
          // creation. Remove only BCS and retain those detectable changes.
          const restored = JSON.stringify(withoutNamespace);
          storage.setItem(SHARED_KEY, restored);
          if (currentShared() !== restored) throw new Error('restoration was not verified');
        }
      } catch (error) {
        throw new Error(`Controller settings rollback failed after ${failure}: ${error}`);
      }
      return;
    }

    let document = null;
    try {
      document = JSON.parse(current ?? '{}');
    } catch {
      document = null;
    }
    const ours = object(document) && sameJson(document[NAMESPACE], attempted);
    if (!ours) throw new Error(`Controller settings rollback failed after ${failure}`);
    const next = { ...document };
    if (Object.prototype.hasOwnProperty.call(before.document, NAMESPACE)) next[NAMESPACE] = before.document[NAMESPACE];
    else delete next[NAMESPACE];
    const restored = JSON.stringify(next);
    try {
      storage.setItem(SHARED_KEY, restored);
      if (currentShared() !== restored) throw new Error('restoration was not verified');
    } catch (error) {
      throw new Error(`Controller settings rollback failed after ${failure}: ${error}`);
    }
  }
  function verifiedSet(key, json, verify = () => {}) {
    checkKey(key);
    const next = { version: 1, controller: JSON.parse(json) };
    calibration(next);
    let before;
    let attempted = false;
    let legacyCleanupAttempted = false;
    let failure;
    try {
      before = read();
      if (before.raw == null && !before.keyed) failure = 'invalid empty settings storage';
      else if (before.keyed && before.legacyRaw != null &&
               !Object.prototype.hasOwnProperty.call(before.document, NAMESPACE)) {
        legacyCalibration(before.legacyRaw);
      }
      if (failure) throw new Error(failure);
      const document = { ...before.document, [NAMESPACE]: next };
      const serialized = JSON.stringify(document);
      attempted = true;
      storage.setItem(SHARED_KEY, serialized);
      const afterKeyed = reliableKeyedRead();
      if (!afterKeyed && storage.length !== 1) {
        throw new Error('Shared settings write created a second key; migration required');
      }
      const afterRaw = storage.getItem(SHARED_KEY);
      if (afterRaw !== serialized) throw new Error('Shared controller settings read-back failed');
      const after = JSON.parse(afterRaw);
      calibration(after[NAMESPACE]);
      verify();

      // Cleanup is conditional and exact: only a still-unchanged, valid legacy
      // row is removed. The final store verification above happened before
      // this operation, so no callback can observe an uncommitted migration.
      if (before.keyed && before.legacyRaw != null &&
          !Object.prototype.hasOwnProperty.call(before.document, NAMESPACE) &&
          storage.getItem(STORE) === before.legacyRaw) {
        legacyCalibration(before.legacyRaw);
        legacyCleanupAttempted = true;
        storage.removeItem(STORE);
        if (storage.getItem(STORE) != null) {
          throw new Error('Legacy controller settings removal was not verified');
        }
      }
    } catch (error) {
      failure = String(error.message ?? error);
      let rollbackError = null;
      if (legacyCleanupAttempted && before?.keyed) {
        try {
          const currentLegacy = storage.getItem(STORE);
          if (currentLegacy == null) {
            storage.setItem(STORE, before.legacyRaw);
            if (storage.getItem(STORE) !== before.legacyRaw) throw new Error('legacy restoration was not verified');
          } else if (currentLegacy !== before.legacyRaw) {
            throw new Error('legacy row changed during migration');
          }
        } catch (error2) {
          rollbackError = new Error(`Controller settings rollback failed after ${failure}: ${error2}`);
        }
      }
      if (attempted) {
        try {
          rollbackShared(before, next, failure);
        } catch (error2) {
          rollbackError ||= error2;
        }
      }
      throw rollbackError ?? error;
    }
  }
  return {
    getItem(key) {
      checkKey(key);
      const { config } = readForLoad();
      return config == null ? null : JSON.stringify(config);
    },
    setItem(key, json) {
      checkKey(key);
      verifiedSet(key, json);
    },
    verifiedSetItem(key, json, verify) {
      verifiedSet(key, json, verify);
    }
  };
}
