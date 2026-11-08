import { installForceTurn, FORCE_TURN_HOLD_MS } from './force-turn-runtime.js';
import { wrapMethod } from './turn-order-runtime.js';

// Native activatables normally issue action-activate on FINISH. Arm on their
// actual target, then consume the release before it reaches a newly opened UI.
export function installPageSkipHold(options) {
  const {actionHandler, statuses, report, now = () => performance.now()} = options;
  let press, buttonTimer, shortcutTimer;
  function cancelButton() {
    clearTimeout(buttonTimer);
    if (press) press.cancelled = true;
  }
  function checkButton(deadline = false) {
    if (!press || press.fired || press.cancelled) return;
    if (press.scope() !== press.token) { cancelButton(); return; }
    if (deadline || now() - press.started >= FORCE_TURN_HOLD_MS) {
      press.fired = true;
      clearTimeout(buttonTimer);
      press.activate();
    }
  }
  const shortcut = installForceTurn({...options, triggerOnThreshold:true, progress(value) {
    if (value === null) {
      clearTimeout(shortcutTimer);
      shortcutTimer = undefined;
    } else if (value === 0 && shortcutTimer === undefined) {
      const started = now();
      const wake = () => {
        const remaining = FORCE_TURN_HOLD_MS - (now() - started);
        if (remaining > 0) shortcutTimer = setTimeout(wake, Math.ceil(remaining));
        else shortcut.tick();
      };
      shortcutTimer = setTimeout(wake, FORCE_TURN_HOLD_MS);
    }
    options.progress?.(value);
  }});
  const unwrap = wrapMethod(actionHandler, 'onEngineInput', function(next, name, status) {
    if (!press || press.name !== name) return next();
    if (status === statuses.START) {
      if (!press.released && (press.fired || !press.cancelled)) return;
      press = undefined;
      return next();
    }
    if (status === statuses.DRAG) cancelButton();
    checkButton();
    if (status === statuses.FINISH) {
      clearTimeout(buttonTimer);
      if (!press.fired && !press.cancelled) { press = undefined; return next(); }
      press.released = true;
    }
    if (!press.fired && !press.cancelled) return next();
  });
  return {
    bindButton(button, scope, activate) {
      const start = event => {
        const {name,status} = event.detail;
        if (status !== statuses.START || !['mousebutton-left','accept','keyboard-enter','touch-tap'].includes(name)) return;
        const token = scope();
        if (token == null) return;
        cancelButton();
        press = {button, name, scope, token, activate, started:now()};
        buttonTimer = setTimeout(() => {
          try { checkButton(true); } catch (error) { cancelButton(); report?.(error); }
        }, FORCE_TURN_HOLD_MS);
      };
      const leave = () => { if (press?.button === button) cancelButton(); };
      button.addEventListener('engine-input', start, true);
      button.addEventListener('mouseleave', leave);
      button.addEventListener('focusout', leave);
      return () => {
        leave();
        button.removeEventListener('engine-input', start, true);
        button.removeEventListener('mouseleave', leave);
        button.removeEventListener('focusout', leave);
      };
    },
    tick() { checkButton(); shortcut.tick(); },
    cancel() { cancelButton(); shortcut.cancel(); },
    dispose() { cancelButton(); press = undefined; unwrap(); shortcut.dispose(); }
  };
}
