// Translate only a usable plot shortcut. Its execution still passes through
// ActionHandler, focused controls, ContextManager and the native input guards.
const ACTION = 'bcs-plot-shortcut';
const KEYS = new Map([
  ['nav-next', 'next'], ['toggle-radial-menu', 'next'],
  ['nav-previous', 'previous'], ['open-lens-panel', 'previous'],
  ['shell-action-1', 'city'], ['notification', 'city'], ['swap-plot-selection', 'city']
]);

export function installPlotShortcuts({ actionHandler, context, statuses, handlerStates,
  snapshot, plan, execute, sourceAllowed = () => true, now = Date.now, report = () => {} }) {
  const previous = actionHandler.onEngineInput;
  const presses = new Map();
  let disposed = false, delivery = null;

  function candidate(key, source) {
    const state = snapshot();
    if (!state.eligible || !sourceAllowed(source)) return null;
    const action = plan(key, state);
    return action ? { state, action } : null;
  }
  function matches(a, b) {
    return a && b && a.state.scope === b.state.scope && a.action.key === b.action.key;
  }
  function invalidate() {
    for (const press of presses.values()) press.valid = false;
  }
  function sync() {
    if (disposed || ![...presses.values()].some(press => press.paired && !press.released)) return;
    const state = snapshot();
    for (const press of presses.values()) {
      if (!state.eligible || press.intent?.state.scope !== state.scope) press.valid = false;
    }
  }
  const handler = {
    handleNavigation() { return handlerStates.Active; },
    handleInput(event) {
      if (event.detail.name !== ACTION) return handlerStates.Active;
      // Only accept our synchronous delivery, never a stale/replayed custom event.
      const pending = delivery;
      delivery = null;
      if (!disposed && pending && event.detail.status === statuses.FINISH && !event.defaultPrevented) {
        const fresh = candidate(pending.key, pending.source);
        if (matches(pending.intent, fresh)) execute(fresh.action);
      }
      event.preventDefault();
      return handlerStates.Handled;
    }
  };
  function send(key, source, intent) {
    delivery = { key, source, intent };
    try { return previous.call(actionHandler, ACTION, statuses.FINISH, 0, 0); }
    finally { delivery = null; }
  }
  function onAction(name, status, x, y) {
    const delegate = () => previous.call(actionHandler, name, status, x, y);
    const key = KEYS.get(name);
    if (disposed || !key) return delegate();
    if (status === statuses.START) {
      const intent = candidate(key, name);
      presses.set(key, { intent, valid: true, claimed: !!intent, released: false, paired: true });
      return intent ? undefined : delegate();
    }
    const press = presses.get(key);
    if (status !== statuses.FINISH) return press?.claimed ? undefined : delegate();
    if (press?.paired && !press.released) {
      press.released = true;
      press.finishedAt = now();
      if (!press.claimed) return delegate();
      if (press.valid && matches(press.intent, candidate(key, name))) return send(key, name, press.intent);
      return; // Never fall through to move/radial/city after the target changed.
    }
    // Native button bindings can emit FINISH only (unlike analog EventType=All).
    // Support those streams too, with a short duplicate-release guard.
    if (press && now() - press.finishedAt < 80) return press.claimed ? undefined : delegate();
    const intent = candidate(key, name);
    if (!intent) return delegate();
    presses.set(key, { claimed: true, paired: false, finishedAt: now(), intent });
    return send(key, name, intent);
  }
  const hook = function (...args) {
    try { return onAction(...args); }
    catch (error) {
      // No fallback replay: native selection may already have happened.
      invalidate();
      report(error);
    }
  };
  context.registerEngineInputHandler(handler);
  actionHandler.onEngineInput = hook;
  return {
    sync, invalidate,
    dispose() {
      if (disposed) return;
      disposed = true;
      presses.clear();
      delivery = null;
      context.unregisterEngineInputHandler(handler);
      if (actionHandler.onEngineInput === hook) actionHandler.onEngineInput = previous;
    }
  };
}
