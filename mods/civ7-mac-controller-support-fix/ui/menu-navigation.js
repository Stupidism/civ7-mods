// Native slots and radial panels accept UPDATE, not HOLD, for analog navigation.
// Only normalize that status; keep vectors, native routing and all input guards.
export function createMenuNavigation({ actionHandler, statuses, snapshot, report = () => {} }) {
  const previous = actionHandler.onEngineInput;
  if (typeof previous !== 'function' || statuses.HOLD === undefined || statuses.UPDATE === undefined) {
    throw new Error('Required menu input interfaces are unavailable');
  }
  let disposed = false, enabled = true, debug = false;
  const seen = new Set();
  const diagnosticActions = new Set(['nav-move', 'plot-move', 'scroll-pan', 'camera-pan', 'nav-up', 'nav-down']);
  const hook = function (name, status, x = 0, y = 0) {
    let outputStatus = status;
    if (!disposed) {
      try {
        const s = snapshot();
        const finite = Number.isFinite(x) && Number.isFinite(y);
        if (enabled && s.menu && s.controller && s.focused !== false && !s.softCursor && !s.blocked &&
            name === 'nav-move' && status === statuses.HOLD && finite) outputStatus = statuses.UPDATE;
        // Opt-in and bounded: enough to distinguish an unexpected action name,
        // status or missing left-stick stream, without a per-frame log flood.
        if (debug && s.menu && diagnosticActions.has(name) && finite &&
            (Math.hypot(x, y) > 0.2 || name === 'nav-up' || name === 'nav-down')) {
          const key = `${s.scope}:${name}:${status}:${outputStatus}`;
          if (!seen.has(key) && seen.size < 32) {
            seen.add(key);
            report({ scope: s.scope, inputContext: s.inputContext, name, status, outputStatus,
              x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
          }
        }
      } catch (_) { /* Diagnostics/snapshot failures must not swallow input. */ }
    }
    // Never catch/replay the delegate: it may already have acted before throwing.
    return previous.call(actionHandler, name, outputStatus, x, y);
  };
  actionHandler.onEngineInput = hook;
  if (actionHandler.onEngineInput !== hook) throw new Error('Menu input hook is read-only');
  return {
    setConfig(config) {
      if (!debug && !!config.showDebug) seen.clear();
      enabled = config.enabled !== false; debug = !!config.showDebug;
    },
    dispose() {
      disposed = true;
      if (actionHandler.onEngineInput === hook) actionHandler.onEngineInput = previous;
    }
  };
}
