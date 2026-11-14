export const DIAGNOSTICS_NAMESPACE = 'civ7-map-tools-gamepad.diagnostics.v1';
export const DIAGNOSTICS_SCHEMA = 1;
export const MAX_SESSIONS = 3;
export const MAX_EVENTS = 512;
export const MAX_BYTES = 96 * 1024;

const MAX_COUNTERS = 64;
const MAX_RATE_KEYS = 64;
const MAX_EVENTS_PER_SECOND = 4;

const object = value => value != null && typeof value === 'object' && !Array.isArray(value);

const short = (value, limit = 64) =>
  String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, limit);

const numeric = value =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : undefined;

export function utf8Bytes(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).byteLength;
  return unescape(encodeURIComponent(text)).length;
}

const allowedFields = new Set([
  'stage', 'kind', 'action', 'status', 'source', 'target',
  'inputStatus', 'outputStatus', 'x', 'y', 'device', 'context',
  'view', 'panel', 'blocked', 'reason', 'mode', 'scope', 'enabled',
  'swapSticks', 'invertLeftY', 'invertPanY', 'showDebug', 'active',
  'fault', 'label', 'count', 'mapPresent', 'menuPresent', 'mapFault',
  'menuFault', 'focused', 'focusLocked', 'windowHidden', 'visible',
  'softCursor', 'persistedEnabled', 'persistedSwapSticks',
  'persistedInvertLeftY', 'persistedInvertPanY', 'persistedShowDebug',
  'mapEnabled', 'mapSwapSticks', 'mapInvertLeftY', 'mapInvertPanY',
  'menuEnabled', 'menuSwapSticks', 'menuInvertLeftY',
  'menuInvertPanY', 'menuShowDebug', 'overlayBlocked',
  'beforeEndTurnBlocked'
]);

function cleanEvent(sample, time) {
  const event = { t: Math.max(0, Math.round(time)) };
  for (const [key, value] of Object.entries(sample || {})) {
    if (!allowedFields.has(key) || value == null) continue;
    if (key === 'x' || key === 'y' || key === 'count') {
      const number = numeric(value);
      if (number !== undefined) event[key] = number;
    } else if (typeof value === 'boolean') {
      event[key] = value;
    } else {
      const limit = key === 'reason' || key === 'fault' || key === 'mapFault' || key === 'menuFault' ? 96 : 48;
      event[key] = short(value, limit);
    }
  }
  event.stage ||= 'adapter';
  event.kind ||= 'state';
  return event;
}

function cleanStartup(value) {
  if (!object(value)) return null;
  const startup = {
    page: short(value.page, 16),
    bcsVersion: short(value.bcsVersion || value.build, 32),
    schema: DIAGNOSTICS_SCHEMA,
    started: Number.isFinite(value.started) ? Math.round(value.started) : 0
  };
  if (value.gameVersion != null) startup.gameVersion = short(value.gameVersion, 48);
  if (value.installedBuild != null) startup.installedBuild = short(value.installedBuild, 48);
  return startup;
}

function cleanCounters(value) {
  const counters = {};
  if (!object(value)) return counters;
  for (const [key, count] of Object.entries(value).slice(0, MAX_COUNTERS)) {
    if (Number.isFinite(count) && count > 0) {
      counters[short(key, 96)] = Math.min(999999, Math.round(count));
    }
  }
  return counters;
}

function cleanSession(value) {
  if (!object(value) || typeof value.id !== 'string' || !object(value.startup)) return null;
  const startup = cleanStartup(value.startup);
  if (!startup) return null;
  const events = Array.isArray(value.events)
    ? value.events.slice(-MAX_EVENTS).map(event => cleanEvent(event, event?.t || 0))
    : [];
  return {
    id: short(value.id, 48),
    startup,
    ...(value.initialHealth ? { initialHealth: cleanEvent(value.initialHealth, value.initialHealth.t || 0) } : {}),
    ...(value.latestHealth ? { latestHealth: cleanEvent(value.latestHealth, value.latestHealth.t || 0) } : {}),
    events,
    counters: cleanCounters(value.counters)
  };
}

function totalEvents(payload) {
  return payload.sessions.reduce((total, session) => total + session.events.length, 0);
}

function trimToLimits(payload) {
  let count = totalEvents(payload);
  while (count > MAX_EVENTS) {
    const session = payload.sessions.find(item => item.events.length);
    if (!session) break;
    session.events.shift();
    count--;
  }

  while (utf8Bytes(payload) > MAX_BYTES) {
    const eventSession = payload.sessions.find(item => item.events.length);
    if (eventSession) {
      eventSession.events.shift();
      continue;
    }
    const counterSession = payload.sessions.find(item => Object.keys(item.counters).length);
    if (!counterSession) break;
    delete counterSession.counters[Object.keys(counterSession.counters)[0]];
  }
  return payload;
}

export function sanitizePayload(value) {
  const sessions = value?.schema === DIAGNOSTICS_SCHEMA && Array.isArray(value.sessions)
    ? value.sessions.map(cleanSession).filter(Boolean)
    : [];
  sessions.sort((left, right) =>
    left.startup.started - right.startup.started || left.id.localeCompare(right.id));
  return trimToLimits({
    schema: DIAGNOSTICS_SCHEMA,
    sessions: sessions.slice(-MAX_SESSIONS)
  });
}

function rateKeyFor(event) {
  const identity = event.source || event.action || event.target || event.reason || event.kind;
  return short(`${event.stage}:${identity}`, 96);
}

function createSession({ page, bcsVersion, build, gameVersion, installedBuild, started }) {
  return {
    id: `${Math.round(started).toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    startup: {
      page: short(page, 16),
      bcsVersion: short(bcsVersion === 'unknown' && build ? build : bcsVersion, 32),
      schema: DIAGNOSTICS_SCHEMA,
      started: Math.round(started),
      ...(gameVersion ? { gameVersion: short(gameVersion, 48) } : {}),
      ...(installedBuild ? { installedBuild: short(installedBuild, 48) } : {})
    },
    events: [],
    counters: {}
  };
}

export function createDiagnosticRecorder({
  page = 'unknown',
  bcsVersion = 'unknown',
  build,
  gameVersion,
  installedBuild,
  now = Date.now,
  persist = () => {},
  initial = null
} = {}) {
  const started = now();
  const session = createSession({ page, bcsVersion, build, gameVersion, installedBuild, started });
  const prior = sanitizePayload(initial).sessions.filter(item => item.id !== session.id);
  const rates = new Map();
  let dirty = true;
  let paused = false;
  let flushing = false;
  let lastFlush = -Infinity;
  let revision = 0;

  const increment = key => {
    const boundedKey = short(key, 96);
    const known = Object.hasOwn(session.counters, boundedKey);
    const hasRoom = Object.keys(session.counters).length < MAX_COUNTERS;
    const targetKey = known || hasRoom ? boundedKey : 'other';
    session.counters[targetKey] = Math.min(999999, (session.counters[targetKey] || 0) + 1);
  };

  function admit(event, time) {
    const bucket = Math.floor(time / 1000);
    const requestedKey = rateKeyFor(event);
    const key = rates.has(requestedKey) || rates.size < MAX_RATE_KEYS ? requestedKey : 'other';
    const rate = rates.get(key) || { bucket, count: 0 };
    if (rate.bucket !== bucket) {
      rate.bucket = bucket;
      rate.count = 0;
    }
    if (rate.count >= MAX_EVENTS_PER_SECOND) {
      increment(`dropped:${key}`);
      rates.set(key, rate);
      return false;
    }
    rate.count++;
    rates.set(key, rate);
    return true;
  }

  function record(sample = {}) {
    const time = now();
    const event = cleanEvent(sample, time - started);
    if (event.kind === 'health') {
      if (!session.initialHealth) session.initialHealth = event;
      session.latestHealth = event;
    }
    if (!admit(event, time)) {
      dirty = true;
      revision++;
      return false;
    }
    session.events.push(event);
    if (session.events.length > MAX_EVENTS) session.events.shift();
    dirty = true;
    revision++;
    return true;
  }

  const currentPayload = () =>
    sanitizePayload({ schema: DIAGNOSTICS_SCHEMA, sessions: [...prior, session] });

  function flush(force = false) {
    if (paused || flushing || !dirty) return false;
    if (!force && now() - lastFlush < 10000) return false;

    const attemptRevision = revision;
    const attempt = currentPayload();
    flushing = true;
    try {
      persist(attempt, session.id);
      if (revision === attemptRevision) dirty = false;
      lastFlush = now();
      return true;
    } catch (error) {
      paused = true;
      record({
        stage: 'adapter',
        kind: 'error',
        reason: `persistence-paused:${short(error?.message || error, 72)}`
      });
      return false;
    } finally {
      flushing = false;
    }
  }

  function snapshot() {
    return {
      ...currentPayload(),
      status: {
        dirty,
        persistencePaused: paused,
        lastFlush: Number.isFinite(lastFlush) ? lastFlush : null
      }
    };
  }

  return {
    record,
    snapshot,
    flush,
    mark: label => record({ stage: 'adapter', kind: 'mark', label: short(label, 64) }),
    sessionId: session.id,
    get persistencePaused() {
      return paused;
    }
  };
}
