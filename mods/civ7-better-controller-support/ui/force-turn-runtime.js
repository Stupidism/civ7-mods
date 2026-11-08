const BACK = 'shell-action-5';
export const FORCE_TURN_HOLD_MS = 1000;

// Turn completion still requires release. UI actions may opt into threshold firing.
export function installForceTurn({ actionHandler, statuses, snapshot,
  progress = () => {}, now = () => performance.now(), report = () => {},
  actionName = BACK, onLongPress = null, triggerOnThreshold = false }) {
  const previous = actionHandler.onEngineInput;
  let press = null, disposed = false;
  const delegate = (...args) => previous.call(actionHandler, ...args);
  function cancel() {
    if (press) press.cancelled = true;
    progress(null);
  }
  function tick() {
    if (disposed || !press?.claimed || press.finished || press.cancelled) return;
    const state = snapshot();
    if (!state.eligible || state.scope !== press.scope) { cancel(); return; }
    const elapsed=now()-press.started;
    if (triggerOnThreshold && onLongPress && elapsed >= FORCE_TURN_HOLD_MS) {
      press.finished=true; press.awaitingRelease=true;
      progress(null);
      onLongPress();
      return;
    }
    progress(Math.min(1, Math.max(0, elapsed / FORCE_TURN_HOLD_MS)));
  }
  function onAction(name, status, x = 0, y = 0) {
    if (disposed || name !== actionName) return delegate(name, status, x, y);
    if (status === statuses.START) {
      if (press?.awaitingRelease) return;
      if (press && !press.finished) return press.claimed ? undefined : delegate(name, status, x, y);
      const state = snapshot();
      press = { claimed: state.eligible, scope: state.scope, started: now(), cancelled: false, finished: false };
      if (!press.claimed) return delegate(name, status, x, y);
      progress(0);
      return;
    }
    // Without a START (e.g. configuration override or reload mid-press), never
    // infer a long hold from HOLD/FINISH alone. Preserve the native short action.
    if (!press?.claimed) {
      if (press && status === statuses.FINISH) press.finished = true;
      return delegate(name, status, x, y);
    }
    if (press.finished) { if(status===statuses.FINISH)press.awaitingRelease=false; return; }
    tick();
    if (press.finished) { if(status===statuses.FINISH)press.awaitingRelease=false; return; }
    if (status !== statuses.FINISH) return;
    press.finished = true;
    progress(null);
    const state = snapshot();
    if (press.cancelled || !state.eligible || state.scope !== press.scope) return;
    if (now() - press.started >= FORCE_TURN_HOLD_MS) {
      // A translated action must traverse the current chain, including guards
      // installed after this long-press hook. The different name cannot re-arm us.
      return onLongPress ? onLongPress() : actionHandler.onEngineInput('force-end-turn', statuses.FINISH, x, y);
    }
    return delegate(actionName, statuses.FINISH, x, y);
  }
  const hook = function (...args) {
    try { return onAction(...args); }
    catch (error) { cancel(); report(error); } // Never replay a possibly submitted action.
  };
  actionHandler.onEngineInput = hook;
  return {
    cancel,
    tick() { try { tick(); } catch (error) { cancel(); report(error); } },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      press = null;
      if (actionHandler.onEngineInput === hook) actionHandler.onEngineInput = previous;
    }
  };
}
