// Receives named engine actions, before ActionHandler turns nav-move into
// discrete menu navigation. The delegate remains the game's ActionHandler:
// focus, tutorials, ContextManager and other mods' input guards still run.
export function createBridge({
  actionHandler, input, contexts, statuses, snapshot, stopMotion,
  now = Date.now, report = () => {}, enabled = true, invertPanY = true, invertLeftY = false
}) {
  const previous = actionHandler.onEngineInput;
  if (typeof previous !== 'function' || typeof input.setActiveContext !== 'function' ||
      typeof input.getActiveContext !== 'function' ||
      [contexts.Shell, contexts.World, contexts.Unit, statuses.START, statuses.UPDATE, statuses.FINISH]
        .some(value => value === undefined)) {
    throw new Error('Required native input interfaces are unavailable');
  }
  const directions = {
    'nav-up': [0, 1], 'nav-down': [0, -1],
    'nav-left': [-1, 0], 'nav-right': [1, 0]
  };
  const counts = { received: 0, left: 0, right: 0, dpad: 0, mapped: 0 };
  const heldDirections = new Map();
  const pressed = new Map();
  const moving = new Map();
  const nativeMotion = new Map();
  const seen = new Set();
  let disposed = false, syncing = false, ownsShell = false;
  let active = false, scope = '', state, fault = null;
  let windowFocused = true;
  const isMapContext = value => value === contexts.World || value === contexts.Unit;
  const delegate = (...args) => previous.call(actionHandler, ...args);

  function releaseMotion() {
    // Only neutralize movements initiated by this bridge. Direct native calls
    // here are FINISH-only: a newly opened modal may block the ordinary route.
    // Never use this cleanup path to select a plot or issue a game command.
    for (const name of moving.keys()) stopMotion(name);
    moving.clear();
    heldDirections.clear();
    pressed.clear();
    nativeMotion.clear();
  }

  function relinquish(s) {
    if (!ownsShell) return;
    ownsShell = false;
    if (input.getActiveContext() !== contexts.Shell) return;
    // A panel owns its context now; don't restore World over a pause/dialog.
    if (s.panelPresent) return;
    if (s.viewContext !== undefined && s.viewContext !== contexts.INVALID) {
      input.setActiveContext(s.viewContext);
    }
  }

  function disableAfterError(error) {
    fault = String(error);
    enabled = false;
    active = false;
    try { releaseMotion(); } catch { /* Do not hide the original failure. */ }
    try { relinquish(state || snapshot()); } catch { /* Best effort on API failure. */ }
    report('error', { message: fault });
  }

  function sync() {
    if (disposed || syncing) return;
    syncing = true;
    try {
      const s = snapshot();
      state = s;
      const nextScope = `${s.viewContext}:${s.mode}`;
      const eligible = enabled && windowFocused && s.controller && !s.softCursor &&
        isMapContext(s.viewContext) && !s.panelPresent && s.worldAllowed &&
        s.viewAllowed && !s.blocked;
      if (!eligible || scope !== nextScope) releaseMotion();
      scope = nextScope;
      if (!eligible) {
        const wasActive = active;
        active = false;
        relinquish(s);
        if (wasActive) report('suspended', { mode: s.mode });
        return;
      }
      if (!active) report('active', { mode: s.mode, viewContext: s.viewContext });
      active = true;
      ownsShell = true;
      if (input.getActiveContext() !== contexts.Shell) {
        input.setActiveContext(contexts.Shell);
        if (input.getActiveContext() !== contexts.Shell) {
          throw new Error('Engine did not accept Shell input context');
        }
      }
    } catch (error) {
      disableAfterError(error);
    } finally {
      syncing = false;
    }
  }

  function send(name, status, x = 0, y = 0) {
    counts.mapped++;
    const wasMoving = moving.has(name);
    if (name === 'plot-move' || name === 'camera-pan') {
      if (status === statuses.FINISH) moving.delete(name);
      else moving.set(name, now());
    }
    try {
      return delegate(name, status, x, y);
    } finally {
      // Even an unrecognized third-party input guard may swallow a release.
      // Neutralization cannot issue a gameplay command or start new movement.
      if (wasMoving && status === statuses.FINISH) stopMotion(name);
    }
  }

  function analog(source, target, status, x, y) {
    if (now() - (nativeMotion.get(target) ?? -Infinity) <= 750) return;
    if (![statuses.START, statuses.UPDATE, statuses.FINISH, statuses.HOLD].includes(status)) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (moving.has(target)) { stopMotion(target); moving.delete(target); }
      return;
    }
    if (target === 'plot-move' && heldDirections.size) return;
    // Native PlotCursor divides by vector length; never feed it an UPDATE(0,0).
    if (status === statuses.FINISH || Math.hypot(x, y) <= 0.35) {
      if (moving.has(target)) send(target, statuses.FINISH, 0, 0);
      return;
    }
    counts[source === 'nav-move' ? 'left' : 'right']++;
    return send(target, status === statuses.HOLD ? statuses.UPDATE : status,
      Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
  }

  function dpadVector() {
    let x = 0, y = 0;
    for (const name of heldDirections.keys()) {
      x += directions[name][0];
      y += directions[name][1];
    }
    const length = Math.hypot(x, y);
    return length ? [x / length, y / length] : [0, 0];
  }

  function onAction(name, status, x = 0, y = 0) {
    if (disposed) return delegate(name, status, x, y);
    sync();
    if (!active) return delegate(name, status, x, y);
    counts.received++;
    if (!seen.has(name)) {
      seen.add(name);
      report('input', { name, status, mode: state.mode });
    }
    // Native menu UP and PlotCursor's upward camera-follow both use positive Y.
    // Calibrate the left stick separately; never invert menu or D-pad navigation.
    if (name === 'nav-move') return analog(name, 'plot-move', status, x, leftY(y));
    if (name === 'scroll-pan') return analog(name, 'camera-pan', status, x, invertPanY ? -y : y);
    // A native World/Unit stream is unexpected while Shell is selected. Let it
    // use the same left calibration; stop fallback to avoid duplicate motion.
    if (name === 'plot-move' || name === 'camera-pan') {
      if (moving.has(name)) { stopMotion(name); moving.delete(name); }
      if (name === 'plot-move') heldDirections.clear();
      nativeMotion.set(name, now());
      return delegate(name, status, x, name === 'plot-move' ? leftY(y) : y);
    }
    // Unit action buttons still need D-pad navigation. Only an unfocused world
    // uses D-pad as an alternative map cursor.
    if (directions[name] && state.viewContext === contexts.World && state.worldFocused) {
      if (now() - (nativeMotion.get('plot-move') ?? -Infinity) <= 750) return;
      if (status === statuses.FINISH) heldDirections.delete(name);
      else if (status === statuses.START || heldDirections.has(name)) heldDirections.set(name, now());
      const [dx, dy] = dpadVector();
      if (dx || dy) {
        counts.dpad++;
        if (status === statuses.START) send('plot-move', statuses.START, dx, dy);
      } else if (moving.has('plot-move')) {
        send('plot-move', statuses.FINISH);
      }
      return;
    }
    const translations = {
      // Official World RB opens the radial menu; borrowed Shell RB is nav-next.
      // Unit RB must remain native next-button navigation.
      'nav-next': state.viewContext === contexts.World ? 'toggle-radial-menu' : undefined,
      'nav-shell-previous': 'camera-zoom-out',
      'nav-shell-next': 'camera-zoom-in',
      'shell-action-3': 'center-plot-cursor',
      'shell-action-1': state.viewContext === contexts.Unit ? 'unit-move' : 'toggle-radial-menu',
      'shell-action-2': 'next-action'
    };
    const target = translations[name];
    if (target) {
      if (status === statuses.START) pressed.set(name, scope);
      if (status === statuses.FINISH) {
        const armed = pressed.get(name) === scope;
        pressed.delete(name);
        // No stray confirmation/zoom when a press began in a different panel.
        if (armed) return send(target, statuses.FINISH, target.startsWith('camera-zoom-') ? 1 : x, y);
      }
      return;
    }
    return delegate(name, status, x, y);
  }

  const hook = function (...args) {
    // Don't replay after an exception: the delegate may have already acted.
    try { return onAction(...args); }
    catch (error) { disableAfterError(error); }
  };
  actionHandler.onEngineInput = hook;
  if (actionHandler.onEngineInput !== hook) throw new Error('ActionHandler hook is read-only');

  function tick() {
    sync();
    if (!active) return;
    const time = now();
    // Engine analog actions normally UPDATE each frame. If releases disappear
    // on Bluetooth loss/overlay focus changes, stop instead of drifting forever.
    for (const [name, last] of heldDirections) {
      if (time - last > 750) heldDirections.delete(name);
    }
    for (const [name, last] of moving) {
      if (time - last > 750) { stopMotion(name); moving.delete(name); }
    }
    const [x, y] = dpadVector();
    if (x || y) send('plot-move', statuses.UPDATE, x, y);
  }

  function safeTick() {
    try { tick(); } catch (error) { disableAfterError(error); }
  }

  function setEnabled(value) {
    if (disposed) return;
    enabled = !!value;
    if (enabled) fault = null;
    sync();
    report('enabled', { enabled });
  }

  function leftY(y) { return invertLeftY && y !== 0 ? -y : y; }

  function setInvertLeftY(value) {
    if (disposed || invertLeftY === !!value) return;
    // Stop the current stream before changing its direction, including a
    // native plot stream that won the duplicate-input lease.
    if (moving.has('plot-move') || now() - (nativeMotion.get('plot-move') ?? -Infinity) <= 750) {
      stopMotion('plot-move');
      moving.delete('plot-move');
    }
    invertLeftY = !!value;
  }

  function dispose() {
    if (disposed) return;
    setEnabled(false);
    disposed = true;
    // If another mod wrapped us later, leave its wrapper intact. Our retained
    // hook becomes a transparent delegate after dispose.
    if (actionHandler.onEngineInput === hook) actionHandler.onEngineInput = previous;
    report('disposed', {});
  }

  sync();
  return {
    sync, tick: safeTick, setEnabled, setInvertLeftY, dispose,
    setWindowFocused(value) { windowFocused = !!value; sync(); },
    setInvertPanY(value) { invertPanY = !!value; },
    getStatus() {
      return { enabled, active, fault, invertPanY, invertLeftY, counts: { ...counts },
        mode: state?.mode, viewContext: state?.viewContext, inputContext: input.getActiveContext() };
    }
  };
}
