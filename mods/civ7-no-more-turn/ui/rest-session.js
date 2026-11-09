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
    this.loadingStartedAt = null;
    this.turnCount = 0;
    this.countedToken = null;
    this.night = null;
    if (saved?.version === 1 || saved?.version === 2) {
      for (const key of ['startedAt', 'lastInputAt', 'suspendedAt']) {
        if (Number.isFinite(saved[key]) && saved[key] >= 0) this[key] = saved[key];
      }
      for (const key of ['idleRested', 'loading']) this[key] = saved[key] === true;
      if (this.loading && Number.isFinite(saved.loadingStartedAt) && saved.loadingStartedAt >= 0) {
        this.loadingStartedAt = saved.loadingStartedAt;
      }
      if (!this.loading && this.startedAt !== null && this.lastInputAt !== null &&
          Number.isFinite(saved.idleBreakStartedAt) && saved.idleBreakStartedAt >= 0) {
        this.idleBreakStartedAt = saved.idleBreakStartedAt;
      }
      if (saved.version === 2) {
        if (Number.isSafeInteger(saved.turnCount) && saved.turnCount >= 0) this.turnCount = saved.turnCount;
        if (typeof saved.countedToken === 'string') this.countedToken = saved.countedToken;
      }
      if (Number.isFinite(saved.night?.startedAt) && Number.isFinite(saved.night?.endsAt)) {
        this.night = { startedAt: saved.night.startedAt, endsAt: saved.night.endsAt };
      }
      if (typeof saved.paidToken === 'string') this.gate.state.paidToken = saved.paidToken;
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
      idleRested: this.idleRested, loading: this.loading, loadingStartedAt: this.loadingStartedAt, turnCount: this.turnCount,
      idleBreakStartedAt: this.idleBreakStartedAt,
      countedToken: this.countedToken, night: this.night, ...this.gate.state };
  }

  setSuspended(active, now) {
    if (active) {
      if (this.suspendedAt === null) this.suspendedAt = now;
      return;
    }
    if (this.suspendedAt === null) return;
    const duration = Math.max(0, now - this.suspendedAt);
    for (const key of ['startedAt', 'lastInputAt', 'idleBreakStartedAt', 'loadingStartedAt']) {
      if (this[key] !== null) this[key] = Math.min(now, this[key] + duration);
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
    // Native loading emits several phase changes, sometimes across JS windows.
    // Keep the first boundary so repeated notifications cannot charge the wait.
    if (this.loading) {
      this.loadingStartedAt ??= now; // Old handoffs have no loading boundary.
      return;
    }
    if (this.suspendedAt === null) {
      this.resumeIdle(null, now);
      this.start(now);
      if (this.idleRested) this.startedAt = now;
      this.idleRested = false;
    }
    this.loadingStartedAt = now;
    this.loading = true;
    this.lastInputAt = now;
  }

  finishLoading(now, succeeded = true) {
    if (!this.loading) return;
    // Exclude loading, including the curtain's WaitingToStart phase. Overlap
    // with a recording suspension or night break is already excluded there.
    const end = Math.min(now, this.suspendedAt ?? now, this.night?.startedAt ?? now);
    if (this.startedAt !== null && this.loadingStartedAt !== null) {
      this.startedAt += Math.max(0, end - this.loadingStartedAt);
    }
    this.lastInputAt = now;
    this.loading = false;
    this.loadingStartedAt = null;
    if (succeeded) {
      // Loading preserves the counter. Replaying even the same turn token is
      // a new action; failed loads must retain the old duplicate protection.
      this.countedToken = null;
      this.gate.state.paidToken = null;
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
      Math.max(0, Math.min(now, this.night?.startedAt ?? now, this.idleBreakStartedAt ?? now,
        this.loadingStartedAt ?? now, this.suspendedAt ?? now) - this.startedAt);
  }
  idle(now) { return this.lastInputAt === null || this.loading ? 0 : Math.max(0, now - this.lastInputAt); }

  tick(current, config, now, detectIdle = true) {
    if (current) this.start(now);
    if (current && !this.loading) {
      const window = nightWindow(config, now);
      if (window.active) {
        if (!this.night) {
          this.resumeIdle(current, now);
          this.night = { startedAt: now, endsAt: window.endsAt };
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
    }
    if (current && config.timeEnabled && !this.loading && !this.idleRested &&
        !this.isIdleBreak && this.elapsed(now) >= config.playMinutes * 60000) {
      this.gate.begin(current.token, current.turn, 'time', config, now);
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
    this.idleRested = false;
    this.lastInputAt = now;
    return true;
  }

  complete(current, now) {
    if (this.night || !this.gate.complete(now)) return false;
    this.reset(current, now);
    return true;
  }
}
