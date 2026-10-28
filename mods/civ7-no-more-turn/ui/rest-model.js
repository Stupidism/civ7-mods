import { DEFAULTS } from './defaults.js';

export const STAGE_LENGTH = 20;

function numberInRange(value, fallback, min, max, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const result = Math.max(min, Math.min(max, value));
  return integer ? Math.round(result) : Math.round(result * 10) / 10;
}

export function normalizeConfig(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  return {
    turnEnabled: typeof value.turnEnabled === 'boolean' ? value.turnEnabled : DEFAULTS.turnEnabled,
    timeEnabled: typeof value.timeEnabled === 'boolean' ? value.timeEnabled : DEFAULTS.timeEnabled,
    saveKeepCount: numberInRange(value.saveKeepCount, DEFAULTS.saveKeepCount, 1, 100, true),
    idleSaveEnabled: typeof value.idleSaveEnabled === 'boolean' ? value.idleSaveEnabled : DEFAULTS.idleSaveEnabled,
    nightEnabled: typeof value.nightEnabled === 'boolean' ? value.nightEnabled : DEFAULTS.nightEnabled,
    nightStart: numberInRange(value.nightStart, DEFAULTS.nightStart, 0, 1439, true),
    nightEnd: numberInRange(value.nightEnd, DEFAULTS.nightEnd, 0, 1439, true),
    playMinutes: numberInRange(value.playMinutes, DEFAULTS.playMinutes, 1, 240),
    restMinutes: numberInRange(value.restMinutes, DEFAULTS.restMinutes, 0.1, 120),
    intervals: DEFAULTS.intervals.map((fallback, i) =>
      numberInRange(value.intervals?.[i], fallback, 1, 100, true)),
  };
}

// The displayed game turn selects the difficulty stage only. RestSession
// counts end-turn actions; no absolute-turn cadence or modulo calculation.
export function scheduleAt(turn, config) {
  const t = Math.max(0, Math.floor(Number(turn) || 0));
  const stage = Math.min(4, Math.floor(Math.max(0, t - 1) / STAGE_LENGTH));
  return { turn: t, stage, interval: config.intervals[stage] };
}

export class RestGate {
  constructor() {
    // Current in-memory lock only; never count turns or persist runtime state.
    this.state = { paidToken: null, pending: null };
  }

  begin(token, turn, reason, config, now) {
    if (this.state.pending) return;
    this.state.pending = {
      token, turn, reason,
      durationMs: Math.round(config.restMinutes * 60000),
      deadline: now + Math.round(config.restMinutes * 60000),
    };
  }

  remaining(now) {
    const pending = this.state.pending;
    if (!pending) return 0;
    // Clock rollback must not turn a five-minute break into a multi-hour lock.
    if (pending.deadline > now + pending.durationMs) {
      pending.deadline = now + pending.durationMs;
    }
    return Math.max(0, pending.deadline - now);
  }

  complete(now) {
    if (!this.state.pending || this.remaining(now) > 0) return false;
    this.state.paidToken = this.state.pending.token;
    this.state.pending = null;
    return true;
  }
}

export function formatTime(milliseconds) {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}


export function clockTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// Local calendar arithmetic handles overnight windows and DST transitions.
// Equal start/end means an empty window, not an accidental all-day lock.
export function nightWindow(config, now) {
  if (!config.nightEnabled || config.nightStart === config.nightEnd) return { active: false };
  const date = new Date(now);
  const minute = date.getHours() * 60 + date.getMinutes();
  const { nightStart: start, nightEnd: end } = config;
  const overnight = start > end;
  const active = overnight ? minute >= start || minute < end : minute >= start && minute < end;
  if (!active) return { active: false };
  const until = new Date(now);
  if (overnight && minute >= start) until.setDate(until.getDate() + 1);
  until.setHours(Math.floor(end / 60), end % 60, 0, 0);
  return { active: true, endsAt: until.getTime() };
}
