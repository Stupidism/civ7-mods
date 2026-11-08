import { anchorSkipToClose } from './turn-order-runtime.js';
import { setInstruction } from './aoa-instruction-hints.js';
import '/core/ui/components/fxs-activatable.js';
import ActionHandler from '/core/ui/input/action-handler.js';
import InputFilter from '/core/ui/input/input-filter.js';
import { InputEngineEvent, InputHandlerState } from '/core/ui/input/input-support.js';
import { ContextManager } from '/core/ui/context-manager/context-manager.js';
import ViewManager from '/core/ui/views/view-manager.js';
import { FocusManager } from '/core/ui-next/services/focus-manager.js';
import { IsControllerActive } from '/core/ui-next/services/input.js';
import { setActivePolicyTab } from '/base-standard/ui/policies/model-government.js';
import { installPageSkipHold } from './page-skip-hold.js';
import { CARD_NOTIFICATIONS, productionOnlyResources, readCardNeeds, createCardSkips } from './card-reminders-runtime.js';

export function createCardReminders({ scope, localTurn, refresh, nextRank }, { kinds = ['resources', 'policies'], textPrefix = 'LOC_AOA_' } = {}) {
  const text = key => key.replace('LOC_AOA_', textPrefix);
  const skips = createCardSkips();
  const owner={};let deferService,releaseDeferral;
  function deferral(){if(!kinds.includes('resources'))return;const next=globalThis.__civ7ResourceDeferralV1;if(next!==deferService){releaseDeferral?.();deferService=next;releaseDeferral=next?.claim(owner, { turnGuards: true });}return next;}
  deferral();
  function resourceIntent(){return deferral()?.mode();}
  let cached, cachedScope, expires = 0, focused = true, disposed = false;
  let ui, lastPoll = -Infinity, lastState = '', message = null;
  const roots = new WeakMap(); let serial = 0;
  const visits = new Map(), deferred = new Map(); let deferredScope;
  const rootKind = root => root?.tagName?.toLowerCase() === 'screen-resource-allocation' ? 'resources' : root?.tagName?.toLowerCase() === 'screen-policies' ? 'policies' : null;
  function trackRoot(root) {
    const key = rootKind(root);
    if (kinds.includes(key) && !visits.has(root)) visits.set(root, { key, scope: scope() });
  }
  function trackVisits(records = []) {
    for (const record of records) for (const node of record.addedNodes ?? []) {
      trackRoot(node);
      node.querySelectorAll?.('screen-policies, screen-resource-allocation').forEach(trackRoot);
    }
    document.querySelectorAll?.('screen-policies, screen-resource-allocation').forEach(trackRoot);
    const current = ContextManager.getCurrentTarget(); if (current?.isConnected) trackRoot(current);
    for (const [root, visit] of visits) {
      if (root.isConnected) continue;
      visits.delete(root);
      const need = state(true);
      if (visit.scope !== scope() || !localTurn() || !need[visit.key] || skips.has(visit.key)) continue;
      if (visit.key === 'resources' && resourceIntent() === 'closed') continue;
      deferred.set(visit.key, nextRank?.() ?? ++serial);
      if (visit.key === 'resources') deferral()?.defer();
      refresh();
    }
  }
  const typeName = item => Game.Notifications.getTypeName(item.type);
  const kind = item => { const value = CARD_NOTIFICATIONS[typeName(item)]; return kinds.includes(value) ? value : undefined; };
  let productionOnly, catalogAge, acknowledged;
  function state(fresh = false) {
    const token = scope(); skips.sync(token);
    if (deferredScope !== token) { deferredScope = token; deferred.clear(); }
    if (!localTurn()) return { resources: false, policies: false, empty: [] };
    if (fresh || token !== cachedScope || performance.now() >= expires) {
      if (kinds.includes('resources') && (!productionOnly || catalogAge !== Game.age)) {
        productionOnly = productionOnlyResources(GameInfo);
        catalogAge = Game.age;
      }
      cached = readCardNeeds({ player: Players.get(GameContext.localPlayerID), playerID: GameContext.localPlayerID,
        info: GameInfo, operations: Game.PlayerOperations, assignType: PlayerOperationTypes.ASSIGN_RESOURCE,
        location: value => GameplayMap.getLocationFromIndex(value),
        kinds, productionOnly, slotTypes: [CultureSlotTypes.POLICY_CULTURE_SLOT, CultureSlotTypes.TRADITION_CULTURE_SLOT, CultureSlotTypes.CRISIS_CULTURE_SLOT] });
      cachedScope = token; expires = performance.now() + 1500;
      for (const key of kinds) if (!cached[key]) deferred.delete(key);
    }
    return cached;
  }
  function active(fresh = false) {
    if(!localTurn())return [];
    const need = state(fresh);
    return kinds.filter(key => need[key] && !skips.has(key) && (key !== 'resources' ||
      (deferral()?.remindersEnabled?.() !== false && resourceIntent() !== 'closed')));
  }
  function tail(items) {
    const keys = active();
    for (const key of (resourceIntent()==='deferred'?['policies','resources']:['resources','policies'])) {
      if (!kinds.includes(key)) continue;
      const native = items.find(item => kind(item) === key);
      if (keys.includes(key)) {
        return { card: key, deferRank: deferred.get(key) ?? 0,
          message: text(key === 'resources' ? 'LOC_AOA_RESOURCES_PENDING' : 'LOC_AOA_POLICIES_PENDING'),
          icon: key === 'resources' ? 'NOTIFICATION_ASSIGN_NEW_RESOURCES' : 'NOTIFICATION_TRADITIONS_AVAILABLE' };
      }
      // Native blockers must remain reachable until the engine acknowledges them.
      if (native) return { ...native, deferRank: deferred.get(key) ?? 0 };
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
    const visibleElement = el => !!(el && (el.getBoundingClientRect?.().width || el.getClientRects?.().length));
    let key, tab;
    if (rootKind(root) === 'resources') {
      const container = root.querySelector('[data-name="available-resources-container"]');
      key = 'resources'; tab = visibleElement(container) ? 'Resources' : 'other-commerce';
    } else if (rootKind(root) === 'policies') {
      // The native Tab owns mouse/controller selection; activePolicyTab only
      // requests the initial page and can still say overview after switching.
      const visible = name => visibleElement(root.querySelector(`[data-name="${name}"]`));
      tab = visible('policies-traditions(HSlot)') ? 'policies-and-traditions'
        : visible('crisis-policies(SpatialSlot)') ? 'crisis-policies' : 'gov-overview';
      key = 'policies';
    } else return null;
    if (!kinds.includes(key)) return null;
    trackRoot(root);
    if (!roots.has(root)) roots.set(root, ++serial);
    return { root, key, tab, token: `${scope()}:${roots.get(root)}:${tab}` };
  }
  function allowed(ctx, controller = true) {
    const focus = FocusManager.get();
    return !!(ctx && ctx.tab !== 'other-commerce' && localTurn() && focused && !document.hidden && ViewManager.isViewInputAllowed &&
      (!controller || IsControllerActive()) && !focus.isFocusLocked() &&
      !focus.currentFocus()?.closest?.('fxs-textbox, input, textarea, [contenteditable="true"]') &&
      !document.querySelector('.c7r-overlay') && !globalThis.__civ7BeforeEndTurnV1?.busy &&
      (ctx.key !== 'resources' || ctx.root.__civ7ResourceSkipAllowed?.() !== false) &&
      InputFilter.handleInput(new InputEngineEvent('shell-action-1', InputActionStatuses.FINISH, 0, 0, false, false)) !== InputHandlerState.Handled);
  }
  function skip(controller = true) {
    const ctx = context();
    if (!allowed(ctx, controller) || !state(true)[ctx.key] || skips.has(ctx.key)) return;
    const operation = ctx.key === 'resources' ? PlayerOperationTypes.CONSIDER_ASSIGN_RESOURCE : PlayerOperationTypes.CONSIDER_ASSIGN_TRADITIONS;
    const check = Game.PlayerOperations.canStart(GameContext.localPlayerID, operation, {}, false);
    if (check?.Success) Game.PlayerOperations.sendRequest(GameContext.localPlayerID, operation, {});
    else {
      const ids = Game.Notifications.getIdsForPlayer(GameContext.localPlayerID) ?? [];
      if (ids.some(id => Game.Notifications.getBlocksTurnAdvancement(id) && kind({ type: Game.Notifications.getType(id) }) === ctx.key)) {
        message = 'LOC_AOA_CARD_SKIP_UNAVAILABLE'; updateUI(); return;
      }
    }
    skips.skip(ctx.key);
    if (ctx.key === 'resources') deferral()?.dismiss();
    message = 'LOC_AOA_CARD_SKIPPED'; refresh(); updateUI();
    // Keep the screen/draft open. Long X must not confirm or discard policy edits.
  }
  function removeUI() { if (ui) { ui.unbind(); ui.button.removeEventListener('action-activate', ui.click); ui.button.remove(); ui.container.remove(); ui = null; } }
  const setStyle = (element, key, value) => { if (element.style[key] !== value) element.style[key] = value; };
  const setAttribute = (element, key, value) => { if (element.getAttribute?.(key) !== value) element.setAttribute(key, value); };
  function positionUI(root) {
    // Match the actual native close button, including the compact/touch layout.
    // Keep this presentation outside the policy card flow.
    const close = root.querySelector('[data-name="CloseButton"]');
    anchorSkipToClose(ui.button, close);
    const bounds = root.getBoundingClientRect?.();
    // Native tray/scroll instructions retain their own space; our hint sits above.
    const tray = document.querySelector('nav-tray')?.getBoundingClientRect?.();
    setStyle(ui.label, 'bottom', tray?.height && bounds ? `${Math.max(16, bounds.bottom - tray.top + 8)}px` : '1rem');
  }
  function updateUI() {
    const ctx = context();
    if (!ctx) { removeUI(); message = null; return; }
    if (ui?.token !== ctx.token) { removeUI(); message = null; }
    const need = state();
    if (!need[ctx.key] && !skips.has(ctx.key)) message = null;
    if (!ui) {
      const container = document.createElement('div');
      container.className = 'font-body aoa-card-reminder';
      const button = document.createElement('fxs-activatable');
      button.classList.add('aoa-card-skip','absolute','top-5','right-4','size-12'); button.setAttribute('tabindex', '0');
      const symbol = document.createElement('div'); symbol.className = 'aoa-card-skip-symbol'; symbol.setAttribute('aria-hidden', 'true'); button.append(symbol);
      const label = document.createElement('div'); label.className = 'aoa-card-hint'; label.setAttribute('role', 'status');
      const click = event => { event.stopPropagation(); skip(false); };
      button.addEventListener('action-activate', click); container.append(button, label); ctx.root.appendChild(container);
      const unbind = hold.bindButton(button, () => {
        const current = context();
        return current?.token === ctx.token && allowed(current, false) && !skips.has(ctx.key) && state()[ctx.key] ? ctx.token : null;
      }, () => skip(false));
      ui = { container, button, label, click, unbind, token: ctx.token };
    }
    setAttribute(ui.button, 'disabled', need[ctx.key] && !skips.has(ctx.key) && allowed(ctx, false) ? 'false' : 'true');
    const hintKey=message ?? (skips.has(ctx.key) ? 'LOC_AOA_CARD_SKIPPED' : 'LOC_AOA_CARD_SKIP_HINT');
    setAttribute(ui.button, 'aria-label', Locale.compose(text('LOC_AOA_CARD_SKIP')));
    setAttribute(ui.button, 'data-tooltip-content', Locale.compose(text(message ?? (skips.has(ctx.key) ? 'LOC_AOA_CARD_SKIPPED' : !need[ctx.key] ? 'LOC_AOA_CARD_SKIP_NO_ACTION' : 'LOC_AOA_CARD_SKIP_TOOLTIP'))));
    setInstruction(ui.label, text(hintKey), ['LOC_AOA_CARD_SKIP_HINT','LOC_AOA_CARD_SKIP_HOLD','LOC_AOA_CARD_SKIP_RELEASE'].includes(hintKey) ? 'shell-action-1' : null);
    const controller = IsControllerActive();
    setStyle(ui.button, 'display', 'block');
    setStyle(ui.label, 'display', (controller && need[ctx.key] && ctx.tab !== 'other-commerce') || message || skips.has(ctx.key) ? 'flex' : 'none');
    positionUI(ctx.root);
  }
  const hold = installPageSkipHold({ actionHandler: ActionHandler, statuses: InputActionStatuses, actionName: 'shell-action-1',
    snapshot() { const ctx = context(); return { eligible: allowed(ctx) && state()[ctx.key] && !skips.has(ctx.key), scope: ctx?.token }; },
    onLongPress: () => skip(),
    progress(value) { message = value === null ? null : value < 1 ? 'LOC_AOA_CARD_SKIP_HOLD' : 'LOC_AOA_CARD_SKIPPED'; updateUI(); },
    report: error => console.error(`[ActionOrderAdjustments] Card reminder: ${error}`) });
  function invalidate() { expires = 0; }
  function frame() {
    trackVisits();
    hold.tick();
    if (performance.now() - lastPoll < 200) return;
    lastPoll = performance.now();
    // A native "assign new resources" blocker can coexist with our empty tail.
    // Acknowledge that prompt only, without assigning anything or ending the turn.
    if (kinds.includes('resources') && state().onlyOptional) {
      const player = GameContext.localPlayerID;
      const id = (Game.Notifications.getIdsForPlayer(player) ?? []).find(id =>
        Game.Notifications.getBlocksTurnAdvancement(id) && kind({type:Game.Notifications.getType(id)}) === 'resources');
      const token = id && scope() + '/' + ComponentID.toString(id);
      if (token && token !== acknowledged && state(true).onlyOptional &&
          Game.PlayerOperations.canStart(player, PlayerOperationTypes.CONSIDER_ASSIGN_RESOURCE, {}, false)?.Success) {
        acknowledged = token;
        Game.PlayerOperations.sendRequest(player, PlayerOperationTypes.CONSIDER_ASSIGN_RESOURCE, {});
      } else if (!id) acknowledged = undefined;
    } else acknowledged = undefined;
    const key = `${scope()}:${active().join(',')}`;
    if (key !== lastState) { lastState = key; refresh(); }
    updateUI();
  }
  function cancel() { hold.cancel(); }
  function blur() { focused = false; cancel(); }
  function focus() { focused = true; }
  function reset() { skips.clear(); deferred.clear(); visits.clear(); invalidate(); cancel(); refresh(); }
  const observer = typeof MutationObserver === 'function' ? new MutationObserver(trackVisits) : null;
  observer?.observe(document.documentElement, { childList: true, subtree: true });
  trackVisits();
  const changes = ['ResourceAssigned', 'ResourceUnassigned', 'ResourceCapChanged', 'TraditionChanged', 'CityAddedToMap', 'CityRemovedFromMap'];
  for (const event of changes) engine.on(event, invalidate);
  const windows = ['view-changed', 'interface-mode-changed', 'active-device-type-changed'];
  for (const event of windows) window.addEventListener(event, cancel);
  window.addEventListener('blur', blur); window.addEventListener('focus', focus);
  engine.on('BeginFrame', frame); engine.on('GameStarted', reset); engine.on('LocalPlayerChanged', reset);
  return { kind, tail, active, open, rank: item => deferred.get(kind(item)) ?? 0, deferred: () => resourceIntent() === 'deferred',
    dispose() {
      if (disposed) return; disposed = true; observer?.disconnect(); visits.clear(); deferred.clear(); hold.dispose(); removeUI(); skips.clear(); releaseDeferral?.();
      for (const event of changes) engine.off(event, invalidate);
      for (const event of windows) window.removeEventListener(event, cancel);
      window.removeEventListener('blur', blur); window.removeEventListener('focus', focus);
      engine.off('BeginFrame', frame); engine.off('GameStarted', reset); engine.off('LocalPlayerChanged', reset);
    }
  };
}
