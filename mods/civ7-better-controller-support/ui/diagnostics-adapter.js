import { ContextManager } from '/core/ui/context-manager/context-manager.js';
import ViewManager from '/core/ui/views/view-manager.js';
import Cursor from '/core/ui/input/cursor.js';
import { FocusManager } from '/core/ui-next/services/focus-manager.js';
import {
  createDiagnosticRecorder,
  DIAGNOSTICS_NAMESPACE,
  DIAGNOSTICS_SCHEMA,
  sanitizePayload,
  utf8Bytes,
  MAX_BYTES
} from './diagnostics-recorder.js';

const KEY = '__civ7BetterControllerDiagnosticsV1';
const SHARED_KEY = 'modSettings';
const SETTINGS_NAMESPACE = 'civ7-map-tools-gamepad';
const PROBE_KEY = '__bcs-controller-storage-key-probe-20261109__';
const ROUTE_EVENT = 'civ7-bcs-diagnostic-route';
const BCS_VERSION = '0.10.2';
const ROUTE_ACTIONS = new Set([
  'nav-move', 'scroll-pan', 'plot-move', 'camera-pan', 'scroll-controls',
  'nav-up', 'nav-down', 'nav-left', 'nav-right',
  'camera-zoom-in', 'camera-zoom-out'
]);
const controllerKeys = ['enabled', 'swapSticks', 'invertLeftY', 'invertPanY', 'showDebug'];

const object = value =>
  value != null && typeof value === 'object' && !Array.isArray(value);

function validSettings(value) {
  return object(value) &&
    Object.keys(value).length === 2 &&
    value.version === 1 &&
    object(value.controller) &&
    Object.keys(value.controller).length === controllerKeys.length &&
    controllerKeys.every(key => typeof value.controller[key] === 'boolean');
}

function validDiagnostics(value) {
  try {
    return value?.schema === DIAGNOSTICS_SCHEMA &&
      JSON.stringify(sanitizePayload(value)) === JSON.stringify(value) &&
      utf8Bytes(value) <= MAX_BYTES;
  } catch {
    return false;
  }
}

export function createStorageBackend(storage) {
  function readDocument(forWrite = false) {
    const length = storage.length;
    const keyed = length === 0 || storage.getItem(PROBE_KEY) == null;
    if (!keyed && length !== 1) throw new Error('ambiguous key-blind storage');

    const raw = storage.getItem(SHARED_KEY);
    if (raw == null) {
      if (forWrite) throw new Error('diagnostics do not create shared settings');
      return { document: {} };
    }

    const document = JSON.parse(raw);
    if (!object(document)) throw new Error('malformed shared settings');
    if (!validSettings(document[SETTINGS_NAMESPACE])) {
      throw new Error('missing or invalid exact BCS namespace');
    }
    if (document[DIAGNOSTICS_NAMESPACE] != null && !validDiagnostics(document[DIAGNOSTICS_NAMESPACE])) {
      throw new Error('invalid diagnostics namespace');
    }
    return { document };
  }

  return {
    load() {
      return readDocument().document[DIAGNOSTICS_NAMESPACE] || null;
    },

    save(payload, writerId) {
      // Read and validate the entire shared document before mutation. Foreign
      // namespace JSON values are preserved in the replacement, but the shared
      // document is reserialized and foreign values are not interpreted.
      const latest = readDocument(true);
      const current = sanitizePayload(latest.document[DIAGNOSTICS_NAMESPACE]);
      const own = sanitizePayload(payload).sessions.find(item => item.id === writerId);
      if (!own) throw new Error('writer session missing');

      const merged = sanitizePayload({
        schema: DIAGNOSTICS_SCHEMA,
        sessions: [
          ...current.sessions.filter(item => item.id !== writerId),
          own
        ]
      });
      const serialized = JSON.stringify({
        ...latest.document,
        [DIAGNOSTICS_NAMESPACE]: merged
      });
      storage.setItem(SHARED_KEY, serialized);

      // Do not roll back a mutation whose visibility is ambiguous. Halt this
      // recorder and leave the potentially changed shared row untouched.
      if (storage.getItem(SHARED_KEY) !== serialized) throw new Error('diagnostics readback failed');
      readDocument();
    },

    config() {
      const value = readDocument().document[SETTINGS_NAMESPACE];
      return validSettings(value) ? { ...value.controller } : null;
    }
  };
}

function safeCall(action, fallback = undefined) {
  try {
    const value = action();
    return value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

function configurationFields(prefix, configuration) {
  if (!configuration) return {};
  return {
    [`${prefix}Enabled`]: configuration.enabled,
    [`${prefix}SwapSticks`]: configuration.swapSticks,
    [`${prefix}InvertLeftY`]: configuration.invertLeftY,
    [`${prefix}InvertPanY`]: configuration.invertPanY,
    ...(prefix === 'menu' ? { menuShowDebug: configuration.showDebug } :
      { persistedShowDebug: configuration.showDebug })
  };
}

function runtimeFields(prefix, status) {
  if (!object(status)) return {};
  return {
    [`${prefix}Enabled`]: status.enabled,
    [`${prefix}SwapSticks`]: status.swapSticks,
    [`${prefix}InvertLeftY`]: status.invertLeftY,
    [`${prefix}InvertPanY`]: status.invertPanY
  };
}

export function installDiagnostics(deps = {}) {
  const root = deps.root || globalThis;
  try {
    root[KEY]?.dispose?.();
  } catch {
    /* A broken prior observer cannot block a replacement. */
  }

  const startupErrors = [];
  let backend;
  try {
    const storage = deps.storage || root.localStorage;
    backend = createStorageBackend(storage);
  } catch (error) {
    startupErrors.push(error);
    backend = {
      load() { throw error; },
      save() { throw error; },
      config() { throw error; }
    };
  }
  let initial = null;
  let persistedConfig = null;
  try {
    initial = backend.load();
  } catch (error) {
    startupErrors.push(error);
  }
  try {
    persistedConfig = backend.config();
    if (!persistedConfig) startupErrors.push(new Error('memory-only:no-verified-calibration'));
  } catch (error) {
    startupErrors.push(error);
  }

  const page = deps.page || safeCall(() => root.UI?.isInShell?.() ? 'shell' : 'game', 'game');
  const recorder = createDiagnosticRecorder({
    page,
    bcsVersion: BCS_VERSION,
    gameVersion: safeCall(() => root.BuildInfo?.version || root.BuildInfo?.build),
    initial,
    persist: (value, id) => backend.save(value, id),
    now: deps.now || Date.now
  });
  const safeRecord = sample => {
    try {
      recorder.record(sample);
    } catch {
      /* Diagnostics cannot acquire input-stack behavior. */
    }
  };
  for (const error of startupErrors) {
    safeRecord({ stage: 'adapter', kind: 'error', reason: `startup:${error?.message || error}` });
  }

  const engineApi = deps.engine || root.engine;
  const windowApi = deps.window || root.window;
  const viewManager = deps.viewManager || ViewManager;
  const contextManager = deps.contextManager || ContextManager;
  const cursor = deps.cursor || Cursor;
  const listeners = [];
  let timer;
  let removed = false;
  let lastHealth = '';

  function statusName(status) {
    return safeCall(() => {
      const names = deps.statuses || root.InputActionStatuses;
      const match = Object.entries(names || {}).find(([, value]) => value === status);
      return match?.[0] || String(status);
    }, String(status));
  }

  function acquireFocus() {
    try {
      if ('focus' in deps) {
        return { value: typeof deps.focus === 'function' ? deps.focus() : deps.focus };
      }
      return { value: FocusManager.get() };
    } catch (error) {
      return { fault: error?.message || String(error) };
    }
  }

  function bridgeState(globalKey, statusKey) {
    let present = false;
    let globalValue;
    let presenceFault;
    try {
      globalValue = root[globalKey];
      present = !!globalValue;
    } catch (error) {
      presenceFault = error?.message || String(error);
    }

    let status = null;
    let statusFault;
    if (present) {
      try {
        const returned = globalValue?.[statusKey]?.();
        if (object(returned)) {
          status = {};
          for (const key of ['active', 'fault', 'enabled', 'swapSticks', 'invertLeftY', 'invertPanY']) {
            try {
              const value = returned[key];
              if (value !== undefined) status[key] = value;
            } catch (error) {
              statusFault ||= `${key}:${error?.message || error}`;
            }
          }
        }
      } catch (error) {
        statusFault = error?.message || String(error);
      }
    }
    return { present, status, fault: presenceFault || statusFault || undefined };
  }

  function health() {
    const observedFaults = [];
    const observe = (label, action, fallback = undefined) => {
      try {
        const value = action();
        return value === undefined ? fallback : value;
      } catch (error) {
        observedFaults.push(`${label}:${error?.message || error}`);
        return fallback;
      }
    };
    let configFault;
    try {
      persistedConfig = backend.config() || persistedConfig;
    } catch (error) {
      configFault = error?.message || String(error);
    }

    const focus = acquireFocus();
    if (focus.fault) observedFaults.push(`focus-fault:${focus.fault}`);
    const focusLocked = focus.fault ? undefined : observe('focus-lock', () => !!focus.value?.isFocusLocked?.());
    const documentApi = observe('document', () => windowApi?.document);
    const windowHidden = observe('document-hidden', () => documentApi?.hidden === true, false);
    const focused = observe('document-focus', () =>
      typeof documentApi?.hasFocus === 'function' ? !!documentApi.hasFocus() : undefined);
    const view = observe('view-current', () => viewManager?.current);
    const viewName = observe('view-name', () => view?.getName?.());
    const target = observe('context-target', () => contextManager?.getCurrentTarget?.());
    const panel = observe('panel-tag', () => target?.tagName);
    const device = observe('device', () => root.Input?.getActiveDeviceType?.());
    const context = observe('context', () => root.Input?.getActiveContext?.());
    const softCursor = observe('cursor', () =>
      !!(cursor?.softCursorEnabled || cursor?.hybridCursorEnabled), false);
    const overlayBlocked = observe('overlay', () =>
      !!documentApi?.querySelector?.('.c7r-overlay'), false);
    const beforeEndTurnBlocked = observe('before-end-turn', () =>
      !!root.__civ7BeforeEndTurnV1?.busy, false);
    const map = bridgeState('__civ7ControllerBridge', 'getStatus');
    const menu = bridgeState('__civ7ControllerMenuNavigation', 'getStatus');

    const faults = [
      ...observedFaults,
      configFault && `config:${configFault}`,
      map.fault && `map:${map.fault}`,
      map.status?.fault && `map-runtime:${map.status.fault}`,
      menu.fault && `menu:${menu.fault}`,
      menu.status?.fault && `menu-runtime:${menu.status.fault}`
    ].filter(Boolean);
    const reasons = [
      ...faults,
      focusLocked && 'focus-locked',
      windowHidden && 'window-hidden',
      softCursor && 'soft-cursor',
      overlayBlocked && 'overlay-blocked',
      beforeEndTurnBlocked && 'before-end-turn-blocked',
      !map.present && !menu.present && 'bridge-missing'
    ].filter(Boolean);

    const state = {
      stage: 'adapter',
      kind: 'health',
      page,
      device,
      context,
      view: viewName,
      panel,
      focused,
      focusLocked,
      windowHidden,
      visible: !windowHidden,
      softCursor,
      overlayBlocked,
      beforeEndTurnBlocked,
      mapPresent: map.present,
      menuPresent: menu.present,
      mapFault: map.fault,
      menuFault: menu.fault,
      active: map.status?.active,
      ...(faults.length ? { fault: faults.join(';') } : {}),
      reason: reasons.length ? reasons.join(';') : 'present',
      ...configurationFields('persisted', persistedConfig),
      ...runtimeFields('map', map.status),
      ...runtimeFields('menu', menu.status)
    };

    const signature = JSON.stringify(state);
    if (signature !== lastHealth) {
      lastHealth = signature;
      safeRecord(state);
    }
  }

  function removeListeners() {
    for (const remove of listeners.splice(0)) {
      try {
        remove();
      } catch {
        /* Cleanup is best effort. */
      }
    }
  }

  function dispose() {
    if (removed) return;
    removed = true;
    safeRecord({ stage: 'adapter', kind: 'unload' });
    try {
      recorder.flush(true);
    } catch {
      /* Unload persistence is best effort. */
    }
    removeListeners();
    try {
      (deps.clearInterval || root.clearInterval)(timer);
    } catch {
      /* A broken timer global cannot block cleanup. */
    }
    try {
      if (root[KEY]?.dispose === dispose) delete root[KEY];
    } catch {
      /* Ignore a faulted root slot. */
    }
  }

  function attachEngine(name, callback) {
    try {
      engineApi.on(name, callback);
      listeners.push(() => engineApi.off(name, callback));
    } catch (error) {
      safeRecord({ stage: 'adapter', kind: 'error', reason: `setup:${error?.message || error}` });
    }
  }

  function attachWindow(name, callback) {
    try {
      windowApi.addEventListener(name, callback);
      listeners.push(() => windowApi.removeEventListener(name, callback));
    } catch (error) {
      safeRecord({ stage: 'adapter', kind: 'error', reason: `setup:${error?.message || error}` });
    }
  }

  function rawInput(action, status, x = 0, y = 0) {
    try {
      if (!ROUTE_ACTIONS.has(action)) return;
      safeRecord({
        stage: 'raw-engine', kind: 'input', action, status: statusName(status),
        source: action, target: action, x, y
      });
    } catch (error) {
      safeRecord({ stage: 'adapter', kind: 'error', reason: `input:${error?.message || error}` });
    }
  }

  function route(event) {
    try {
      const detail = event?.detail || {};
      if (!ROUTE_ACTIONS.has(detail.source) && !ROUTE_ACTIONS.has(detail.target)) return;
      const normalized = { ...detail };
      if (normalized.status != null) normalized.status = statusName(normalized.status);
      if (normalized.inputStatus != null) normalized.inputStatus = statusName(normalized.inputStatus);
      if (normalized.outputStatus != null) normalized.outputStatus = statusName(normalized.outputStatus);
      safeRecord(normalized);
    } catch (error) {
      safeRecord({ stage: 'adapter', kind: 'error', reason: `route:${error?.message || error}` });
    }
  }

  function observeHealth() {
    try {
      health();
    } catch (error) {
      safeRecord({ stage: 'adapter', kind: 'error', reason: `health:${error?.message || error}` });
    }
  }

  function tick() {
    observeHealth();
    try {
      recorder.flush();
    } catch (error) {
      safeRecord({ stage: 'adapter', kind: 'error', reason: `flush:${error?.message || error}` });
    }
  }

  attachEngine('InputAction', rawInput);
  attachEngine('BeforeUnload', dispose);
  attachWindow(ROUTE_EVENT, route);
  attachWindow('unload', dispose);
  try {
    timer = (deps.setInterval || root.setInterval)(tick, 2000);
  } catch (error) {
    safeRecord({ stage: 'adapter', kind: 'error', reason: `timer:${error?.message || error}` });
  }
  observeHealth();
  try {
    recorder.flush(true);
  } catch {
    /* Startup persistence is best effort and is paused inside the recorder on error. */
  }

  return root[KEY] = {
    snapshot: recorder.snapshot,
    flush: () => recorder.flush(true),
    mark: recorder.mark,
    dispose,
    get persistencePaused() { return recorder.persistencePaused; }
  };
}

installDiagnostics();
