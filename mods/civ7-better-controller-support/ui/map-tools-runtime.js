import { createRepeater, nextItem } from './navigation.js';

const PANELS = new Set(['BZ-CITY-PANEL', 'BZ-UNITS-PANEL', 'BZ-WONDER-PANEL', 'LENS-PANEL']);
const CHOOSER = 'DMT_INTERFACEMODE_MAP_TACK_CHOOSER';
const ROW = '.mini-map__button-row';
const ITEMS = 'fxs-activatable, fxs-button';
const DIRECTIONS = {
  'nav-up': 'up', 'toggle-diplo': 'up',
  'nav-down': 'down', 'toggle-quest': 'down',
  'nav-left': 'left', 'toggle-chat': 'left', 'nav-previous': 'left',
  'nav-right': 'right', 'navigate-yields': 'right', 'nav-next': 'right'
};

export function installMapTools({ document, window, context, focus, view, modes,
  statuses, navigation, isController, activate, input, contexts, now }) {
  let disposed = false, highlighted = null;
  const repeat = createRepeater(now);
  const previousInput = context.handleInput, previousNavigation = context.handleNavigation;
  const originalTabindex = new Map();
  let contextLease = null;

  function releasePanelContext() {
    if (!contextLease) return;
    const { root, component, previous } = contextLease;
    contextLease = null;
    if (component.inputContext !== contexts.Shell) return;
    component.inputContext = previous;
    // The native stack already restores the context when a panel closes or a
    // dialog opens. Only restore engine state when this same panel still owns it.
    if (context.getCurrentTarget() === root && !focus.isFocusLocked() &&
        !document.querySelector('.c7r-overlay') && input.getActiveContext() === contexts.Shell)
      input.setActiveContext(previous);
  }
  function syncPanelContext(scope) {
    const root = scope && (scope.kind === 'list' || scope.kind === 'lens') ? scope.root : null;
    if (contextLease?.root !== root) releasePanelContext();
    if (!root?.component || !input || !contexts || blocked()) return;
    if (!contextLease) contextLease = { root, component: root.component, previous: root.component.inputContext };
    // Map Trix requests Unit/World even for menus. Shell is needed for the Mac
    // menu input path, and restores the standard controller navigation on Windows.
    root.component.inputContext = contexts.Shell;
    if (input.getActiveContext() !== contexts.Shell) input.setActiveContext(contexts.Shell);
  }

  function visible(element) {
    if (!element?.isConnected) return false;
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      if (node.hidden || node.classList.contains('hidden') || node.classList.contains('invisible') ||
          node.classList.contains('scale-0')) return false;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  }
  function enabled(element) {
    return visible(element) && element.getAttribute('disabled') !== 'true' &&
      element.getAttribute('aria-disabled') !== 'true' && !element.classList.contains('disabled');
  }
  function prepare(element) {
    if (!element.hasAttribute('tabindex')) {
      originalTabindex.set(element, null);
      element.setAttribute('tabindex', '-1');
    }
    return element;
  }
  function items(scope) {
    const selector = scope.kind === 'tacks' ? '.map-tack-icon-wrapper' : ITEMS;
    return Array.from(scope.root.querySelectorAll(selector)).filter(enabled).map(prepare);
  }
  function blocked() {
    return disposed || !isController() || document.hidden || focus.isFocusLocked() ||
      !!document.querySelector('.c7r-overlay') || !!globalThis.__civ7BeforeEndTurnV1?.busy;
  }
  function getScope() {
    if (blocked()) return null;
    const top = context.getCurrentTarget();
    if (top && PANELS.has(top.tagName) && visible(top)) {
      return { root: top, kind: top.tagName === 'LENS-PANEL' ? 'lens' : 'list' };
    }
    // DMT's chooser lives in the view harness, rather than the popup stack.
    // Never handle its inputs through a dialog, pause menu or another screen.
    if (!top && modes.getCurrent() === CHOOSER) {
      const root = document.querySelector('dmt-map-tack-chooser');
      if (visible(root)) return { root, kind: 'tacks' };
    }
    if (top || !view.isWorldInputAllowed || !view.isViewInputAllowed) return null;
    const root = focus.currentFocus()?.closest?.(ROW);
    if (visible(root)) return { root, kind: 'toolbar' };
    return null;
  }
  function clearHighlight() {
    highlighted?.classList.remove('mtg-focus');
    highlighted = null;
  }
  function mark(element) {
    if (highlighted === element) return;
    clearHighlight();
    highlighted = element;
    element?.classList.add('mtg-focus');
  }
  function setFocus(element) {
    if (!enabled(element)) return;
    prepare(element);
    focus.setFocus(element);
    mark(element);
    // Civ's scrollable uses translated content; DOM scrollIntoView alone is insufficient.
    const scroll = element.closest('fxs-scrollable')?.component;
    if (scroll?.scrollIntoView) scroll.scrollIntoView(element);
    else element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
  function move(scope, direction) {
    const target = nextItem(items(scope), focus.currentFocus(), direction, scope.kind === 'tacks');
    if (target) setFocus(target);
  }
  function consume(event) {
    event.preventDefault();
    event.stopImmediatePropagation?.();
    return false;
  }
  function returnToMap() {
    // Native close can finish on the next frame. Never clear a newer popup's focus.
    if (blocked() || context.getCurrentTarget() || !view.isWorldInputAllowed ||
        !view.isViewInputAllowed || modes.getCurrent() !== 'INTERFACEMODE_DEFAULT') return;
    clearHighlight();
    focus.clearFocus();
  }
  function openTool(selector) {
    // The radial must finish closing before the original tool opens its own UI.
    if (blocked() || context.getCurrentTarget() || !view.isWorldInputAllowed ||
        !view.isViewInputAllowed || modes.getCurrent() !== 'INTERFACEMODE_DEFAULT') return false;
    const target = document.querySelector(selector);
    if (!enabled(target)) return false;
    activate(target);
    window.requestAnimationFrame(sync);
    return true;
  }
  function cancel(scope) {
    if (scope.kind === 'toolbar') {
      clearHighlight();
      focus.clearFocus();
    } else if (scope.kind === 'tacks') {
      modes.switchToDefault();
      window.requestAnimationFrame(returnToMap);
    } else {
      // Use the owner's close API so lens/subpanel state stays consistent.
      const minimap = document.querySelector('panel-mini-map')?.component;
      if (scope.kind === 'lens' && minimap?.lensPanelState) minimap.toggleLensPanel(false);
      else if (minimap?.activeSubpanel && minimap.activeSubpanel.tag.toUpperCase() === scope.root.tagName)
        minimap.toggleSubpanel(minimap.activeSubpanel, false);
      else scope.root.component?.close();
      window.requestAnimationFrame(returnToMap);
    }
  }
  function direction(event) {
    const detail = event.detail ?? {};
    const byNumber = new Map([[navigation.UP, 'up'], [navigation.DOWN, 'down'],
      [navigation.LEFT, 'left'], [navigation.RIGHT, 'right'],
      [navigation.PREVIOUS, 'left'], [navigation.NEXT, 'right']]);
    if (detail.navigation !== undefined) return byNumber.get(detail.navigation);
    if (detail.name === 'plot-move' || detail.name === 'nav-move') {
      const x = detail.x ?? 0, y = detail.y ?? 0;
      if (Math.hypot(x, y) < 0.35) return null;
      return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'up' : 'down');
    }
    return DIRECTIONS[detail.name];
  }
  function handleNavigation(event) {
    const scope = getScope();
    if (!scope || scope.kind === 'lens') return previousNavigation.call(this, event);
    const step = event.detail.name === 'nav-move' && event.detail.status === statuses.FINISH ? null : direction(event);
    if (repeat(scope.root, step, event.detail.status, statuses)) move(scope, step);
    return consume(event);
  }
  function handleInput(event) {
    const scope = getScope();
    if (!scope || event.detail?.isMouse || event.detail?.isTouch) return previousInput.call(this, event);
    const { name, status } = event.detail;
    if (name === 'cancel' || name === 'keyboard-escape') {
      if (status === statuses.FINISH) cancel(scope);
      return consume(event);
    }
    if (scope.kind === 'lens') return previousInput.call(this, event);
    const analog = name === 'plot-move' || name === 'nav-move';
    const step = analog && status === statuses.FINISH ? null : direction(event);
    if (step || name === 'plot-move' || name === 'nav-move') {
      if (repeat(scope.root, step, status, statuses)) move(scope, step);
      return consume(event);
    }
    if (name === 'accept') {
      if (status === statuses.FINISH) {
        const available = items(scope), current = focus.currentFocus();
        // Recover focus after a list rebuild, without activating an unexpected item.
        if (!available.includes(current)) { setFocus(available[0]); return consume(event); }
        // Dispatch the same semantic event used by fxs-activatable. No mouse positions,
        // game orders or copied third-party callbacks are needed.
        activate(current);
        window.requestAnimationFrame(sync);
      }
      return consume(event);
    }
    // Prevent map movement/end turn/hotkeys leaking through the focused tool.
    // Pause and other unowned actions still follow the normal input pipeline.
    if (['camera-pan', 'next-action', 'unit-move', 'notification', 'swap-plot-selection',
      'shell-action-1', 'toggle-radial-menu', 'open-lens-panel'].includes(name)) return consume(event);
    return previousInput.call(this, event);
  }
  function sync() {
    if (disposed) return;
    document.querySelectorAll(`${ROW} > fxs-activatable`).forEach(prepare);
    const scope = getScope();
    syncPanelContext(scope);
    if (!scope) { clearHighlight(); return; }
    if (scope.kind === 'lens') { clearHighlight(); return; }
    const available = items(scope), current = focus.currentFocus();
    if (available.includes(current)) mark(current);
    else if (scope.kind !== 'toolbar') setFocus(available[0]);
  }
  context.handleInput = handleInput;
  context.handleNavigation = handleNavigation;
  const onChange = () => window.requestAnimationFrame(sync);
  const events = ['focus', 'interface-mode-changed', 'active-device-type-changed'];
  for (const name of events) window.addEventListener(name, onChange, true);
  // Lists are rebuilt by their owners. Reconcile only a known, unobscured panel.
  const timer = window.setInterval(sync, 200);
  sync();
  return {
    sync, enabled, openTool,
    dispose() {
      if (disposed) return;
      disposed = true;
      releasePanelContext();
      window.clearInterval(timer);
      for (const name of events) window.removeEventListener(name, onChange, true);
      clearHighlight();
      for (const [element] of originalTabindex) element.removeAttribute('tabindex');
      originalTabindex.clear();
      if (context.handleInput === handleInput) context.handleInput = previousInput;
      if (context.handleNavigation === handleNavigation) context.handleNavigation = previousNavigation;
    }
  };
}
