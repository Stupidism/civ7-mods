import { setInstruction } from '/civ7-action-order/ui/aoa-instruction-hints.js';
import '/core/ui/components/fxs-activatable.js';
import ActionHandler from '/core/ui/input/action-handler.js';
import InputFilter from '/core/ui/input/input-filter.js';
import { InputEngineEvent, InputHandlerState } from '/core/ui/input/input-support.js';
import { ContextManager } from '/core/ui/context-manager/context-manager.js';
import ViewManager from '/core/ui/views/view-manager.js';
import { FocusManager } from '/core/ui-next/services/focus-manager.js';
import { IsControllerActive } from '/core/ui-next/services/input.js';
import { setActivePolicyTab } from '/base-standard/ui/policies/model-government.js';
import { installForceTurn } from '/civ7-action-order/ui/force-turn-runtime.js';
import { CARD_NOTIFICATIONS, readCardNeeds, createCardSkips } from '/civ7-action-order/ui/card-reminders-runtime.js';

export function createCardReminders({ scope, localTurn, refresh }) {
  const skips = createCardSkips();
  const owner={};let deferService,releaseDeferral;
  function deferral(){const next=globalThis.__civ7ResourceDeferralV1;if(next!==deferService){releaseDeferral?.();deferService=next;releaseDeferral=next?.claim(owner, { turnGuards: true });}return next;}
  deferral();
  function resourceIntent(){return deferral()?.mode();}
  let cached, cachedScope, expires = 0, focused = true, disposed = false;
  let ui, lastPoll = -Infinity, lastState = '', message = null;
  const roots = new WeakMap(); let serial = 0;
  const typeName = item => Game.Notifications.getTypeName(item.type);
  const kind = item => CARD_NOTIFICATIONS[typeName(item)];
  function state(fresh = false) {
    const token = scope(); skips.sync(token);
    if (!localTurn()) return { resources: false, policies: false, empty: [] };
    if (fresh || token !== cachedScope || performance.now() >= expires) {
      cached = readCardNeeds({ player: Players.get(GameContext.localPlayerID), playerID: GameContext.localPlayerID,
        info: GameInfo, operations: Game.PlayerOperations, assignType: PlayerOperationTypes.ASSIGN_RESOURCE,
        location: value => GameplayMap.getLocationFromIndex(value),
        slotTypes: [CultureSlotTypes.POLICY_CULTURE_SLOT, CultureSlotTypes.TRADITION_CULTURE_SLOT, CultureSlotTypes.CRISIS_CULTURE_SLOT] });
      cachedScope = token; expires = performance.now() + 1500;
    }
    return cached;
  }
  function active(fresh = false) {
    if(!localTurn())return [];
    const need = state(fresh);
    return ['resources', 'policies'].filter(key => key==='resources'&&resourceIntent()!=null?resourceIntent()==='deferred':need[key]&&!skips.has(key));
  }
  function tail(items) {
    const keys = active();
    for (const key of (resourceIntent()==='deferred'?['policies','resources']:['resources','policies'])) {
      const native = items.find(item => kind(item) === key);
      if (keys.includes(key)) {
        return { card: key,
          message: key === 'resources' ? 'LOC_AOA_RESOURCES_PENDING' : 'LOC_AOA_POLICIES_PENDING',
          icon: key === 'resources' ? 'NOTIFICATION_ASSIGN_NEW_RESOURCES' : 'NOTIFICATION_TRADITIONS_AVAILABLE' };
      }
      // Native blockers must remain reachable until the engine acknowledges them.
      if (native) return native;
    }
    return null;
  }
  function open(choice) {
    if (choice.card === 'resources') ContextManager.push('screen-resource-allocation', { singleton: true, createMouseGuard: true });
    else {
      const need = state(true);
      ContextManager.push('screen-policies', { singleton: true, createMouseGuard: true });
      setActivePolicyTab(need.empty.some(s => s.type !== CultureSlotTypes.CRISIS_CULTURE_SLOT && s.count > 0)
        ? 'policies-and-traditions' : 'crisis-policies');
    }
  }
  function context() {
    const root = ContextManager.getCurrentTarget();
    if (!root?.isConnected) return null;
    let key, tab;
    if (root.matches('screen-resource-allocation')) {
      const container = root.querySelector('[data-name="available-resources-container"]');
      if (!container?.getClientRects().length) return null;
      if(root.classList.contains('rp-resource-screen'))return null;
      key = 'resources'; tab = 'Resources';
    } else if (root.matches('screen-policies')) {
      // The native Tab owns mouse/controller selection; activePolicyTab only
      // requests the initial page and can still say overview after switching.
      const visible = name => !!root.querySelector(`[data-name="${name}"]`)?.getClientRects().length;
      tab = visible('policies-traditions(HSlot)') ? 'policies-and-traditions'
        : visible('crisis-policies(SpatialSlot)') ? 'crisis-policies' : null;
      if (!tab) return null;
      key = 'policies';
    } else return null;
    if (!roots.has(root)) roots.set(root, ++serial);
    return { root, key, token: `${scope()}:${roots.get(root)}:${tab}` };
  }
  function allowed(ctx, controller = true) {
    const focus = FocusManager.get();
    return !!(ctx && localTurn() && focused && !document.hidden && ViewManager.isViewInputAllowed &&
      (!controller || IsControllerActive()) && !focus.isFocusLocked() &&
      !focus.currentFocus()?.closest?.('fxs-textbox, input, textarea, [contenteditable="true"]') &&
      !document.querySelector('.c7r-overlay') && !globalThis.__civ7BeforeEndTurnV1?.busy &&
      InputFilter.handleInput(new InputEngineEvent('shell-action-1', InputActionStatuses.FINISH, 0, 0, false, false)) !== InputHandlerState.Handled);
  }
  function skip(controller = true) {
    const ctx = context();
    if (!allowed(ctx, controller) || !active(true).includes(ctx.key)) return;
    const operation = ctx.key === 'resources' ? PlayerOperationTypes.CONSIDER_ASSIGN_RESOURCE : PlayerOperationTypes.CONSIDER_ASSIGN_TRADITIONS;
    const check = Game.PlayerOperations.canStart(GameContext.localPlayerID, operation, {}, false);
    if (check?.Success) Game.PlayerOperations.sendRequest(GameContext.localPlayerID, operation, {});
    else {
      const ids = Game.Notifications.getIdsForPlayer(GameContext.localPlayerID) ?? [];
      if (ids.some(id => Game.Notifications.getBlocksTurnAdvancement(id) && kind({ type: Game.Notifications.getType(id) }) === ctx.key)) {
        message = 'LOC_AOA_CARD_SKIP_UNAVAILABLE'; updateUI(); return;
      }
    }
    skips.skip(ctx.key); message = 'LOC_AOA_CARD_SKIPPED'; refresh(); updateUI();
    // Keep the screen/draft open. Long X must not confirm or discard policy edits.
  }
  function removeUI() { if (ui) { ui.button.removeEventListener('action-activate', ui.click); ui.container.remove(); ui = null; } }
  const setStyle = (element, key, value) => { if (element.style[key] !== value) element.style[key] = value; };
  const setAttribute = (element, key, value) => { if (element.getAttribute?.(key) !== value) element.setAttribute(key, value); };
  function positionUI(root) {
    // Match the actual native close button, including the compact/touch layout.
    // Keep this presentation outside the policy card flow.
    const close = root.querySelector('[data-name="CloseButton"]');
    const anchor = close?.getBoundingClientRect?.(), bounds = root.getBoundingClientRect?.();
    if (anchor?.width && anchor.height && bounds) {
      const gap = anchor.width / 6;
      for (const [key, value] of Object.entries({ left: `${anchor.left - bounds.left - anchor.width - gap}px`,
        top: `${anchor.top - bounds.top}px`, width: `${anchor.width}px`, height: `${anchor.height}px` })) setStyle(ui.button, key, value);
    }
    // Native tray/scroll instructions retain their own space; our hint sits above.
    const tray = document.querySelector('nav-tray')?.getBoundingClientRect?.();
    setStyle(ui.label, 'bottom', tray?.height && bounds ? `${Math.max(16, bounds.bottom - tray.top + 8)}px` : '1rem');
  }
  function updateUI() {
    const ctx = context();
    if (!ctx) { removeUI(); message = null; return; }
    if (ui?.token !== ctx.token) { removeUI(); message = null; }
    const need = state();
    if (!need[ctx.key]) { removeUI(); message = null; return; }
    if (!ui) {
      const container = document.createElement('div');
      container.className = 'font-body aoa-card-reminder';
      const button = document.createElement('fxs-activatable');
      button.classList.add('aoa-card-skip'); button.setAttribute('tabindex', '0');
      const symbol = document.createElement('div'); symbol.className = 'aoa-card-skip-symbol'; symbol.setAttribute('aria-hidden', 'true'); button.append(symbol);
      const label = document.createElement('div'); label.className = 'aoa-card-hint'; label.setAttribute('role', 'status');
      const click = event => { event.stopPropagation(); skip(false); };
      button.addEventListener('action-activate', click); container.append(button, label); ctx.root.appendChild(container);
      ui = { container, button, label, click, token: ctx.token };
    }
    setAttribute(ui.button, 'disabled', !skips.has(ctx.key) && allowed(ctx, false) ? 'false' : 'true');
    const hintKey=message ?? (skips.has(ctx.key) ? 'LOC_AOA_CARD_SKIPPED' : 'LOC_AOA_CARD_SKIP_HINT');
    setAttribute(ui.button, 'aria-label', Locale.compose('LOC_AOA_CARD_SKIP'));
    setAttribute(ui.button, 'data-tooltip-content', Locale.compose(message ?? (skips.has(ctx.key) ? 'LOC_AOA_CARD_SKIPPED' : 'LOC_AOA_CARD_SKIP')));
    setInstruction(ui.label, hintKey, ['LOC_AOA_CARD_SKIP_HINT','LOC_AOA_CARD_SKIP_HOLD','LOC_AOA_CARD_SKIP_RELEASE'].includes(hintKey) ? 'shell-action-1' : null);
    const controller = IsControllerActive();
    setStyle(ui.button, 'display', controller ? 'none' : 'block');
    setStyle(ui.label, 'display', controller || message || skips.has(ctx.key) ? 'flex' : 'none');
    positionUI(ctx.root);
  }
  const hold = installForceTurn({ actionHandler: ActionHandler, statuses: InputActionStatuses, actionName: 'shell-action-1',
    snapshot() { const ctx = context(); return { eligible: allowed(ctx) && active().includes(ctx.key), scope: ctx?.token }; },
    onLongPress: () => skip(),
    progress(value) { message = value === null ? null : value < 1 ? 'LOC_AOA_CARD_SKIP_HOLD' : 'LOC_AOA_CARD_SKIP_RELEASE'; updateUI(); },
    report: error => console.error(`[ActionOrderAdjustments] Card reminder: ${error}`) });
  function invalidate() { expires = 0; }
  function frame() {
    hold.tick();
    if (performance.now() - lastPoll < 200) return;
    lastPoll = performance.now();
    const key = `${scope()}:${active().join(',')}`;
    if (key !== lastState) { lastState = key; refresh(); }
    updateUI();
  }
  function cancel() { hold.cancel(); }
  function blur() { focused = false; cancel(); }
  function focus() { focused = true; }
  function reset() { skips.clear(); invalidate(); cancel(); refresh(); }
  const changes = ['ResourceAssigned', 'ResourceUnassigned', 'ResourceCapChanged', 'TraditionChanged', 'CityAddedToMap', 'CityRemovedFromMap'];
  for (const event of changes) engine.on(event, invalidate);
  const windows = ['view-changed', 'interface-mode-changed', 'active-device-type-changed'];
  for (const event of windows) window.addEventListener(event, cancel);
  window.addEventListener('blur', blur); window.addEventListener('focus', focus);
  engine.on('BeginFrame', frame); engine.on('GameStarted', reset); engine.on('LocalPlayerChanged', reset);
  return { kind, tail, active, open,
    dispose() {
      if (disposed) return; disposed = true; hold.dispose(); removeUI(); skips.clear(); releaseDeferral?.();
      for (const event of changes) engine.off(event, invalidate);
      for (const event of windows) window.removeEventListener(event, cancel);
      window.removeEventListener('blur', blur); window.removeEventListener('focus', focus);
      engine.off('BeginFrame', frame); engine.off('GameStarted', reset); engine.off('LocalPlayerChanged', reset);
    }
  };
}
