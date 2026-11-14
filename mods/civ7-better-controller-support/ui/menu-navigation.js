// Match the user's calibrated stick roles in opted-in menus, then normalize HOLD for
// native slots/radials. Keep vectors, native routing and all input guards.
export function createMenuNavigation({ actionHandler, statuses, snapshot, input, contexts, report = () => {}, diagnostic = () => {}, scrollControls }) {
  const previous = actionHandler.onEngineInput;
  if (typeof previous !== 'function' || statuses.HOLD === undefined || statuses.UPDATE === undefined) {
    throw new Error('Required menu input interfaces are unavailable');
  }
  let disposed = false, enabled = true, swapSticks = false, invertLeftY = false, invertPanY = false, debug = false;
  let scrolling = false, scrollScope;
  let ownsContext = false, syncingContext = false;
  const seen = new Set();
  const diagnosticActions = new Set([
    'nav-move', 'plot-move', 'scroll-pan', 'camera-pan', 'scroll-controls',
    'nav-up', 'nav-down', 'nav-left', 'nav-right',
    'camera-zoom-in', 'camera-zoom-out'
  ]);
  const diagnose = sample => {
    try {
      if (!diagnosticActions.has(sample.source) && !diagnosticActions.has(sample.target)) return;
      diagnostic({ stage: 'menu-route', ...sample });
    } catch {
      /* Optional diagnostics never affect input. */
    }
  };
  function stopScroll() {
    if (!scrolling) return;
    scrolling = false;
    // Only finish scrolling started by our role swap. Do not synthesize a
    // nav-move release: native slots may treat FINISH as another focus step.
    previous.call(actionHandler, 'scroll-pan', statuses.FINISH, 0, 0);
  }
  const eligible = s => enabled && s.menu && s.controller && s.focused !== false && !s.softCursor && !s.blocked;
  function syncContext(s) {
    if (!input || !contexts || syncingContext) return;
    syncingContext = true;
    try {
      if (!disposed && eligible(s) && s.nativeMenuContext !== undefined) {
        ownsContext = true;
        if (input.getActiveContext() !== contexts.Shell) input.setActiveContext(contexts.Shell);
      } else if (ownsContext) {
        ownsContext = false;
        // Restore this popup when disabled; never overwrite a new panel's
        // context. On close the view (and map bridge, if enabled) resumes.
        const restore = s.nativeMenuContext ?? (!s.panelPresent ? s.viewContext : undefined);
        if (input.getActiveContext() === contexts.Shell && restore !== undefined && restore !== contexts.INVALID) {
          input.setActiveContext(restore);
        }
      }
    } finally { syncingContext = false; }
  }
  function sync() {
    if (disposed) return;
    try {
      const s = snapshot();
      syncContext(s);
      scrollControls?.sync(s.menu && s.controller && s.focused !== false && !s.softCursor && !s.blocked, enabled && swapSticks && s.swapRoles ? 'nav-move' : 'scroll-pan');
      if (scrolling && (!eligible(s) || !s.swapRoles || scrollScope !== s.scope)) stopScroll();
    } catch (_) { /* Missing native state must not prevent normal input. */ }
  }
  const hook = function (name, status, x = 0, y = 0) {
    let outputName = name, outputStatus = status;
    let routeState;
    if (!disposed) {
      try {
        const s = snapshot();
        syncContext(s);
        const finite = Number.isFinite(x) && Number.isFinite(y);
        const active = eligible(s);
        if (scrolling && (!active || !finite || !s.swapRoles || scrollScope !== s.scope)) stopScroll();
        if (active && s.nativeMenuContext !== undefined) {
          // A sample decoded just before Shell was acquired can still carry a
          // Dual camera action. A choice popup must not move/zoom the world.
          if (name === 'camera-zoom-in' || name === 'camera-zoom-out') {
            diagnose({ kind: 'route', source: name, target: name, status, inputStatus: status,
              outputStatus: 'none', scope: s.scope, context: s.inputContext, panel: s.panelPresent,
              blocked: s.blocked, reason: 'suppressed-popup-world-action' });
            return;
          }
          if ((name === 'camera-pan' || name === 'plot-move') && status !== statuses.FINISH) {
            diagnose({ kind: 'route', source: name, target: name, status, inputStatus: status,
              outputStatus: 'none', x, y, scope: s.scope, context: s.inputContext, panel: s.panelPresent,
              blocked: s.blocked, reason: 'suppressed-popup-motion' });
            return;
          }
        }
        if (active && finite) {
          // Shell binds these two streams to opposite sticks. Swapping both
          // keeps the right stick on native scrolling instead of also focusing.
          if (swapSticks && s.swapRoles === true) {
            if (name === 'nav-move') outputName = 'scroll-pan';
            else if (name === 'scroll-pan') outputName = 'nav-move';
          }
          if (outputName === 'nav-move' && status === statuses.HOLD) outputStatus = statuses.UPDATE;
          if (name === 'nav-move' && outputName === 'scroll-pan') {
            if (status === statuses.FINISH) scrolling = false;
            else if ([statuses.START, statuses.UPDATE, statuses.HOLD].includes(status) && Math.hypot(x, y) > 0) {
              scrolling = true; scrollScope = s.scope;
            }
          }
        }
        routeState = { kind: 'route', source: name, target: outputName, status: outputStatus, inputStatus: status, outputStatus, x, y, scope: s.scope,
          context: s.inputContext, panel: s.panelPresent, blocked: s.blocked,
          reason: active ? (outputName === name && outputStatus === status ? 'pass-through-active' : 'mapped') : 'pass-through-inactive' };
        // Opt-in and bounded: enough to distinguish an unexpected action name,
        // status or missing left-stick stream, without a per-frame log flood.
        if (debug && s.menu && diagnosticActions.has(name) && finite &&
            (Math.hypot(x, y) > 0.2 || name === 'nav-up' || name === 'nav-down')) {
          const key = `${s.scope}:${name}:${outputName}:${status}:${outputStatus}`;
          if (!seen.has(key) && seen.size < 32) {
            seen.add(key);
            report({ scope: s.scope, inputContext: s.inputContext, name, outputName, status, outputStatus,
              x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
          }
        }
      } catch (_) { /* Diagnostics/snapshot failures must not swallow input. */ }
    }
    // Feature routing is downstream of calibration, also available with compatibility off.
    if (!disposed && scrollControls) {
      const s = snapshot();
      if (scrollControls.route(outputName, outputStatus, x, y,
          s.menu && s.controller && s.focused !== false && !s.softCursor && !s.blocked,
          enabled && swapSticks && s.swapRoles ? 'nav-move' : 'scroll-pan')) { diagnose({ kind: 'route', source: name, target: 'scroll-controls', status: outputStatus, inputStatus: status, outputStatus, x, y, reason: 'consumed' }); return; }
    }
    if (routeState) diagnose(routeState);
    // Never catch/replay the delegate: it may already have acted before throwing.
    return previous.call(actionHandler, outputName, outputStatus, x, y);
  };
  actionHandler.onEngineInput = hook;
  if (actionHandler.onEngineInput !== hook) throw new Error('Menu input hook is read-only');
  return {
    setConfig(config) {
      if (!debug && !!config.showDebug) seen.clear();
      if (enabled !== (config.enabled !== false) || swapSticks !== !!config.swapSticks) stopScroll();
      enabled = config.enabled !== false;
      swapSticks = !!config.swapSticks;
      invertLeftY = !!config.invertLeftY;
      invertPanY = !!config.invertPanY;
      debug = !!config.showDebug;
      sync();
    },
    getStatus() {
      return { enabled, swapSticks, invertLeftY, invertPanY, showDebug: debug };
    },
    sync,
    suspend() { stopScroll(); scrollControls?.suspend(); },
    dispose() {
      stopScroll();
      enabled = false;
      sync();
      disposed = true;
      scrollControls?.dispose();
      if (actionHandler.onEngineInput === hook) actionHandler.onEngineInput = previous;
    }
  };
}
