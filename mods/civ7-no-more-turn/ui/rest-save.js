let sequence = 0;

export function newRestSave(reason, turn, now = Date.now()) {
  const date = new Date(now);
  const pad = (value, length = 2) => String(value).padStart(length, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}`;
  const kind = { idle: 'Idle', time: 'Time', turn: 'Turn', night: 'Night' }[reason];
  // Timestamp + per-document sequence + entropy avoids collisions across reloads.
  // The native request also forbids overwrite, even if a name already exists.
  const suffix = `${++sequence}-${Math.random().toString(36).slice(2, 8)}`;
  return { status: 'waiting', fileName: `RestGuard_${kind}_T${turn}_${stamp}_${suffix}` };
}

// One attempt per break. Track native writes so a prior autosave can finish
// first; acceptance alone is never reported as successful completion.
export class RestSaver {
  constructor(env) {
    this.env = env;
    this.inFlight = 0;
    this.job = null;
    this.recovery = null;
  }

  poll(state, current) {
    const tracking = this.env.saveTracking?.();
    if (tracking?.recovery && tracking.recovery !== this.recovery &&
        Number.isInteger(tracking.inFlight) && tracking.inFlight >= 0) {
      // Use the current count, not zero: a recovery (or a later native write)
      // may still be saving. Never use this to confirm our own checkpoint.
      this.recovery = tracking.recovery;
      this.inFlight = tracking.inFlight;
      if (this.job?.state.status === 'saving') this.finish('unconfirmed');
    }
    if (this.job && this.job.state !== state) this.cancel();
    if (!current) return this.cancel();
    if (!state || !['waiting', 'saving'].includes(state.status)) return;
    if (!this.job) this.job = { state, token: current.token, deadline: this.env.now() + 60000, started: false };
    const job = this.job;
    if (current?.token !== job.token) return this.finish('unconfirmed');
    if (this.env.now() >= job.deadline) return this.finish('unconfirmed');
    if (state.status !== 'waiting' || this.inFlight || this.env.busy()) return;
    try {
      if (!this.env.canSave()) return this.finish('unavailable');
      state.status = 'saving';
      const accepted = this.env.save(state.fileName);
      if (!accepted && this.job === job) this.finish('failed');
    } catch (_) {
      if (this.job === job) this.finish('failed');
    }
  }

  onStart() {
    this.inFlight++;
    if (this.job?.state.status !== 'saving') return;
    this.job.started = true;
    if (this.inFlight > 1) this.finish('unconfirmed');
  }

  onComplete(result) {
    if (this.env.isPending(result)) return;
    this.inFlight = Math.max(0, this.inFlight - 1);
    const job = this.job;
    if (!job || job.state.status !== 'saving' || !job.started || !this.env.matches(result, job.state.fileName)) return;
    this.finish(this.env.succeeded(result) ? 'saved' : 'failed');
  }

  finish(status) {
    const state = this.job?.state;
    if (state) state.status = status;
    this.job = null;
    if (state && status === 'saved') this.env.saved?.(state);
  }

  cancel() { this.finish('unconfirmed'); }
}

export function createRestSaver(canSave, saved) {
  const saver = new RestSaver({
    now: () => Date.now(),
    busy: () => !!globalThis.__civ7BeforeEndTurnV1?.busy,
    saveTracking: () => globalThis.__civ7BeforeEndTurnV1?.saveTracking,
    canSave, saved,
    save: fileName => Network.saveGame({
      Location: SaveLocations.LOCAL_STORAGE,
      LocationCategories: SaveLocationCategories.AUTOSAVE,
      Type: GameStateStorage.getGameConfigurationSaveType(),
      ContentType: SaveFileTypes.GAME_STATE,
      FileName: fileName,
      Overwrite: false,
    }),
    isPending: result => result?.result === SerializerResult.RESULT_PENDING,
    succeeded: result => result?.result === SerializerResult.RESULT_OK,
    matches: (result, fileName) => {
      if (typeof result?.options !== 'number') return false;
      const other = SaveLocationCategories.NORMAL | SaveLocationCategories.QUICKSAVE;
      if (result.options & other) return false;
      if (!(result.options & SaveLocationCategories.AUTOSAVE)) return false;
      if (result.fileName !== undefined && result.fileName !== fileName) return false;
      return (result.type === undefined || result.type === GameStateStorage.getGameConfigurationSaveType()) &&
        (result.fileType === undefined || result.fileType === SaveFileTypes.GAME_STATE);
    },
  });
  const start = () => saver.onStart();
  const complete = result => saver.onComplete(result);
  const cancel = () => saver.cancel();
  engine.on('StartSaveRequest', start);
  engine.on('SaveComplete', complete);
  engine.on('LocalPlayerChanged', cancel);
  engine.on('LoadComplete', cancel);
  saver.destroy = () => {
    saver.cancel();
    engine.off('StartSaveRequest', start);
    engine.off('SaveComplete', complete);
    engine.off('LocalPlayerChanged', cancel);
    engine.off('LoadComplete', cancel);
  };
  return saver;
}
