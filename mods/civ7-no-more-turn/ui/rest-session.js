import { RestGate, scheduleAt, nightWindow } from './rest-model.js';

export const IDLE_HINT_MS = 60000;
export const IDLE_REST_MS = 300000;

// One live session, shared across UI navigation. No saved-game or turn history.
export class RestSession {
  constructor(saved = null) {
    this.gate = new RestGate();
    this.startedAt = null;
    this.suspendedAt = null;
    this.lastInputAt = null;
    this.idleRested = false;
    this.idleBreakStartedAt = null;
    this.loading = false;
    this.turnCount = 0;
    this.countedToken = null;
    this.restSave = null;
    this.night = null;
    if (saved?.version === 1 || saved?.version === 2) {
      for (const key of ['startedAt', 'lastInputAt', 'suspendedAt']) {
        if (Number.isFinite(saved[key]) && saved[key] >= 0) this[key] = saved[key];
      }
      for (const key of ['idleRested', 'loading']) this[key] = saved[key] === true;
      if (!this.loading && this.startedAt !== null && this.lastInputAt !== null &&
          Number.isFinite(saved.idleBreakStartedAt) && saved.idleBreakStartedAt >= 0) {
        this.idleBreakStartedAt = saved.idleBreakStartedAt;
      }
      if (saved.version === 2) {
        if (Number.isSafeInteger(saved.turnCount) && saved.turnCount >= 0) this.turnCount = saved.turnCount;
        if (typeof saved.countedToken === 'string') this.countedToken = saved.countedToken;
      }
      if (Number.isFinite(saved.night?.startedAt) && Number.isFinite(saved.night?.endsAt)) {
        this.night = { startedAt: saved.night.startedAt, endsAt: saved.night.endsAt, save: null };
        if (typeof saved.night.save?.fileName === 'string') this.night.save = {
          fileName: saved.night.save.fileName, status: saved.night.save.status === 'saved' ? 'saved' : 'unconfirmed',
        };
      }
      if (typeof saved.paidToken === 'string') this.gate.state.paidToken = saved.paidToken;
      if (typeof saved.restSave?.fileName === 'string') {
        // A new UI document cannot confirm an interrupted write. Do not create
        // another save simply because the same break was transferred on load.
        this.restSave = { fileName: saved.restSave.fileName,
          status: saved.restSave.status === 'saved' ? 'saved' : 'unconfirmed' };
      }
      const p = saved.pending;
      if (p && typeof p.token === 'string' && Number.isInteger(p.turn) && p.turn >= 0 &&
          ['time', 'turn'].includes(p.reason) && Number.isFinite(p.deadline) &&
          Number.isFinite(p.durationMs) && p.durationMs > 0 && p.durationMs <= 7200000) {
        this.gate.state.pending = { token: p.token, turn: p.turn, reason: p.reason,
          durationMs: p.durationMs, deadline: p.deadline };
      }
    }
  }

  get pending() { return this.gate.state.pending; }
  get isIdleBreak() { return this.idleBreakStartedAt !== null && !this.pending; }

  export() {
    return { version: 2, startedAt: this.startedAt, suspendedAt: this.suspendedAt, lastInputAt: this.lastInputAt,
      idleRested: this.idleRested, loading: this.loading, turnCount: this.turnCount,
      idleBreakStartedAt: this.idleBreakStartedAt,
      countedToken: this.countedToken, restSave: this.restSave, night: this.night, ...this.gate.state };
  }

  setSuspended(active, now) {
    if (active) {
      if (this.suspendedAt === null) this.suspendedAt = now;
      return;
    }
    if (this.suspendedAt === null) return;
    const duration = Math.max(0, now - this.suspendedAt);
    for (const key of ['startedAt', 'lastInputAt', 'idleBreakStartedAt']) {
      if (this[key] !== null) this[key] += duration;
    }
    if (this.pending) this.pending.deadline += duration;
    if (this.night) this.night.startedAt += duration;
    this.suspendedAt = null;
  }

  start(now) {
    if (this.startedAt === null) {
      this.startedAt = now;
      this.lastInputAt = now;
    }
    this.startedAt = Math.min(this.startedAt, now);
    this.lastInputAt = Math.min(this.lastInputAt ?? now, now);
    if (this.idleBreakStartedAt !== null) this.idleBreakStartedAt = Math.min(this.idleBreakStartedAt, now);
  }

  beginLoading(now) {
    if (this.suspendedAt !== null) { this.loading = true; return; }
    this.resumeIdle(null, now);
    this.start(now);
    if (this.idleRested) this.startedAt = now;
    this.idleRested = false;
    this.loading = true;
    this.lastInputAt = now;
  }

  finishLoading(now, succeeded = true) {
    if (this.suspendedAt !== null) { this.loading = false; return; }
    if (this.loading) {
      // Time spent loading counts as play time, never as five idle minutes.
      this.lastInputAt = now;
      this.loading = false;
      if (succeeded) {
        // Loading never adds or clears accumulated turns. A replayed turn is a
        // new action even if its game/age/turn token equals the previous one.
        this.countedToken = null;
        this.gate.state.paidToken = null;
      }
    }
  }

  reset(current, now, idle = false) {
    this.startedAt = now;
    this.idleRested = idle;
    this.turnCount = 0;
    this.countedToken = current?.token ?? null;
    this.gate.state.paidToken = current?.token ?? null;
    if (!idle) this.lastInputAt = now;
  }

  elapsed(now) {
    return this.startedAt === null || this.idleRested ? 0 :
      Math.max(0, Math.min(now, this.night?.startedAt ?? this.idleBreakStartedAt ?? now) - this.startedAt);
  }
  idle(now) { return this.lastInputAt === null || this.loading ? 0 : Math.max(0, now - this.lastInputAt); }

  tick(current, config, now, detectIdle = true) {
    if (current) this.start(now);
    if (current && !this.loading) {
      const window = nightWindow(config, now);
      if (window.active) {
        if (!this.night) {
          this.resumeIdle(current, now);
          this.night = { startedAt: now, endsAt: window.endsAt, save: null };
        }
        this.night.endsAt = window.endsAt;
        this.night.startedAt = Math.min(this.night.startedAt, now);
        return;
      }
      if (this.night) {
        const duration = Math.max(0, now - this.night.startedAt);
        this.night = null;
        if (duration >= (this.pending?.durationMs ?? config.restMinutes * 60000)) {
          this.gate.state.pending = null;
          this.restSave = null;
          this.reset(current, now);
        } else this.startedAt += duration;
        this.lastInputAt = now;
      }
    }
    if (this.night) return;
    if (this.isIdleBreak && !config.timeEnabled) this.resumeIdle(current, now);
    if (this.pending) {
      // A full idle break also satisfies the shared break, including idle time
      // immediately before the forced overlay appeared.
      if (config.timeEnabled && this.idle(now) >= IDLE_REST_MS) {
        this.pending.deadline = Math.min(this.pending.deadline, now);
      }
      return;
    }
    if (config.timeEnabled && !this.loading && this.startedAt !== null &&
        !this.idleRested && this.idle(now) >= IDLE_REST_MS) {
      this.reset(current, now, true);
    }
    // Only a timer tick opens the voluntary panel. Returning input before that
    // tick still uses the ordinary inactivity credit without trapping the input.
    if (detectIdle && current && config.timeEnabled && !this.loading &&
        !this.isIdleBreak && this.idle(now) >= IDLE_HINT_MS) {
      this.idleBreakStartedAt = this.lastInputAt;
      this.restSave = null;
    }
    if (current && config.timeEnabled && !this.loading && !this.idleRested &&
        !this.isIdleBreak && this.elapsed(now) >= config.playMinutes * 60000) {
      this.gate.begin(current.token, current.turn, 'time', config, now);
      this.restSave = null;
    }
  }

  activity(current, config, now) {
    // Credit a completed idle break before replacing its last-input timestamp.
    this.tick(current, config, now, false);
    // Moving the cursor to Continue must not dismiss or restart the break.
    if (this.night || this.isIdleBreak) return;
    if (this.idleRested) { this.startedAt = now; this.idleRested = false; }
    this.lastInputAt = now;
  }

  turnsRemaining(current, config) {
    return Math.max(0, scheduleAt(current.turn, config).interval - this.turnCount);
  }

  requestTurn(current, config, now) {
    this.tick(current, config, now, false);
    if (this.loading || this.night || this.pending || this.isIdleBreak) return false;
    if (!config.turnEnabled || this.gate.state.paidToken === current.token) return true;
    // Panel and native submission hooks can both see the same action. Count it
    // only once, after the upstream save gate has allowed the request through.
    if (this.countedToken !== current.token) {
      this.turnCount++;
      this.countedToken = current.token;
    }
    if (this.turnsRemaining(current, config) > 0) return true;
    this.gate.begin(current.token, current.turn, 'turn', config, now);
    this.restSave = null;
    return false;
  }

  remaining(now) { return this.gate.remaining(now); }

  resumeIdle(current, now) {
    if (this.night || !this.isIdleBreak) return false;
    // Credit the last fraction of the break even if Continue beats the timer.
    if (!this.idleRested && this.idle(now) >= IDLE_REST_MS) this.reset(current, now, true);
    if (this.idleRested) this.startedAt = now;
    else this.startedAt += Math.max(0, now - this.idleBreakStartedAt);
    this.idleBreakStartedAt = null;
    this.restSave = null;
    this.idleRested = false;
    this.lastInputAt = now;
    return true;
  }

  complete(current, now) {
    if (this.night || !this.gate.complete(now)) return false;
    this.restSave = null;
    this.reset(current, now);
    return true;
  }
}
