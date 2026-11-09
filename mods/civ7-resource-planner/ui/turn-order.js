import { PanelAction } from '/base-standard/ui/action/panel-action.js';
import { NotificationModel } from '/base-standard/ui/notification-train/model-notification-train.js';
import { InterfaceMode } from '/core/ui/interface-modes/interface-modes.js';
import { ComponentID } from '/core/ui/utilities/utilities-component-id.js';
import { Icon } from '/core/ui/utilities/utilities-image.js';
import ActionHandler from '/core/ui/input/action-handler.js';
import { createTurnOrderRegistry, createCardDomainRegistry, installDeferredActionHooks, wrapMethod, chooseTailAction } from './turn-order-runtime.js';
const KEY = '__civ7TurnOrderV1';
const noOrdering = { order: items => items, has: () => false };
const noCards = { kind: () => undefined, tail: () => null };
// Native and reordered refreshes can enqueue opposite animations in one frame.
// Preserve native audio/timing, then keep only the last requested animation.
export function installBlockerAnimationGuard(prototype) {
  const latest = new WeakMap(), frames = new Set();
  let disposed = false;
  const undo = wrapMethod(prototype, 'playBlockerAnimation', function (next, slot, animation) {
    const ticket = {}; latest.set(slot, ticket);
    const result = next();
    const frame = requestAnimationFrame(() => {
      frames.delete(frame);
      if (disposed || latest.get(slot) !== ticket) return;
      for (const name of ['animate-in', 'animate-out', 'animate-swap']) {
        if (name !== animation) slot.bgEle.classList.remove(name);
      }
    });
    frames.add(frame);
    return result;
  });
  return () => { disposed = true; undo(); for (const frame of frames) cancelAnimationFrame(frame); frames.clear(); };
}
function createService(provider) {
  const undoAnimation = installBlockerAnimationGuard(PanelAction.prototype);
  const actionPanels = new Set(), frames = new Set();
  let disposed = false, refreshQueued = false, displayRefreshDepth = 0;
  let rankScope, sequence = 0;
  const idKey = id => ComponentID.isValid(id) ? ComponentID.toString(id) : '';
  const scope = () => `${Configuration.getGame().gameSeed}:${GameContext.localPlayerID}:${Game.age}:${Game.turn}`;
  function nextRank() { const value = scope(); if (rankScope !== value) { rankScope = value; sequence = 0; } return ++sequence; }
  const isSkipped = item => !!item.cityKey && !!provider('settlement')?.skipped?.(item.cityKey);
  function onlySkippedProduction(panel) {
    const list = items();
    const type = Game.Notifications.getEndTurnBlockingType(GameContext.localPlayerID);
    const head = Game.Notifications.findEndTurnBlocking(GameContext.localPlayerID, type);
    return localTurn() && list.length > 0 && list.every(isSkipped) &&
      list.some(item => ComponentID.isMatch(item.id, head)) && !panel.showRemainingMovesState() &&
      (provider('cards')?.active(true).length ?? 0) === 0;
  }
  function localTurn() {
    const id = GameContext.localPlayerID;
    const player = Number.isInteger(id) && id >= 0 ? Players.get(id) : null;
    return !!(UI.isInGame() && player?.isHuman && player.isTurnActive &&
      !GameContext.hasSentTurnComplete() && !Configuration.getGame().isPaused && !Autoplay.isActive);
  }
  function items() {
    const result = [];
    for (const id of Game.Notifications.getIdsForPlayer(GameContext.localPlayerID) ?? []) {
      if (!Game.Notifications.getBlocksTurnAdvancement(id)) continue;
      const n = Game.Notifications.find(id);
      if (!n) continue;
      const type = Game.Notifications.getType(id);
      const production = Game.Notifications.getTypeName(type) === 'NOTIFICATION_CHOOSE_CITY_PRODUCTION';
      const city = production && ComponentID.isValid(n.Target) ? Cities.get(n.Target) : null;
      // A fulfilled production request must not carry a stale deferral forward.
      const empty = city?.owner === GameContext.localPlayerID && city.BuildQueue?.getQueue()?.length === 0;
      result.push({ id, type, severity: Game.Notifications.getSeverity(id) ?? 0,
        cityKey: production && empty ? idKey(n.Target) : '', cityID: production && empty ? n.Target : null });
    }
    result.sort((a, b) => b.severity - a.severity);
    provider('settlement')?.sync(scope(), result.map(item => item.cityKey).filter(Boolean));
    return result;
  }
  function refresh() {
    if (refreshQueued || disposed) return;
    refreshQueued = true;
    // Refresh display only; do not invoke onUpdate's camera/selection side effects.
    queueMicrotask(() => {
      refreshQueued = false;
      if (disposed) return;
      displayRefreshDepth++;
      try { for (const panel of actionPanels) if (panel.Root.isConnected) panel.refreshActionButton(GameContext.localPlayerID); }
      finally { displayRefreshDepth--; }
    });
  }
  function choose(panel, player = GameContext.localPlayerID) {
    actionPanels.add(panel);
    if (player !== GameContext.localPlayerID || !localTurn()) return null;
    const list = items();
    const ordering = provider('settlement') ?? noOrdering, cards = provider('cards') ?? noCards;
    const type = Game.Notifications.getEndTurnBlockingType(player);
    const id = Game.Notifications.findEndTurnBlocking(player, type);
    const head = list.find(item => ComponentID.isMatch(item.id, id));
    if (!head && type !== EndTurnBlockingTypes.NONE) return null;
    if (onlySkippedProduction(panel)) return { skippedProduction: true };
    const visible = list.filter(item => !isSkipped(item));
    const choice = chooseTailAction({ head, items: visible, units: panel.showRemainingMovesState(),
      order: values => ordering.order(values), isDeferred: item => isSkipped(item) || ordering.has(item.cityKey),
      kind: cards.kind, tail: () => cards.tail(list) });
    if (isSkipped(head ?? {}) && !choice) return ordering.order(visible).find(item => !cards.kind(item)) ?? (panel.showRemainingMovesState() ? { units: true } : null);
    if (choice?.deferRank) {
      const city = ordering.order(visible.filter(item => !cards.kind(item)))[0];
      if (city && ordering.rank?.(city.cityKey) && ordering.rank(city.cityKey) < choice.deferRank) return city;
    }
    return choice;
  }
  function render(panel, choice) {
    const message = choice.skippedProduction ? 'LOC_ACTION_PANEL_NEXT_TURN' : choice.card ? choice.message : choice.units ? 'LOC_ACTION_PANEL_UNIT_MOVES_REMAINING' : Game.Notifications.getMessage(choice.id);
    const tooltip = choice.units ? 'LOC_ACTION_PANEL_UNIT_MOVES_REMAINING_TT' : message;
    const icon = choice.skippedProduction ? UI.getIconURL('NEXT_TURN', 'NOTIFICATION') : choice.card ? UI.getIconURL(choice.icon, 'BUBBLE') : choice.units ? UI.getIconURL('NOTIFICATION_COMMAND_UNITS', 'BUBBLE') : Icon.getNotificationIconFromID(choice.id, 'BUBBLE');
    panel.pleaseWaitAnimation.stop();
    panel.notificationIcon.style.backgroundImage = `url(${icon})`;
    // Native refresh schedules the original icon for the next frame. Follow it
    // with the current choice, rechecking state in case the turn changed.
    const frame = requestAnimationFrame(() => {
      frames.delete(frame);
      if (disposed || !panel.Root.isConnected) return;
      const current = choose(panel);
      if (current && (!!current.units === !!choice.units) &&
        (choice.skippedProduction ? current.skippedProduction : choice.units || (choice.card ? current.card === choice.card : ComponentID.isMatch(current.id, choice.id)))) panel.notificationIcon.style.backgroundImage = `url(${icon})`;
    });
    frames.add(frame);
    const html = Locale.stylize(message);
    if (panel.actionText.innerHTML !== html) panel.actionText.innerHTML = html;
    panel.actionButton.setAttribute('data-tooltip-content', Locale.compose(tooltip));
    panel.Root.classList.add('new-notification');
    // Rebuild the secondary buttons too, so their IDs agree with the visible order.
    const list = items().filter(item => !isSkipped(item));
    const ordering = provider('settlement') ?? noOrdering, cards = provider('cards') ?? noCards;
    const ordinary = ordering.order(list.filter(item => !cards.kind(item)));
    const deferred = item => ordering.has(item.cityKey);
    const tails = [...list.filter(cards.kind), ...ordinary.filter(deferred)]
      .sort((a,b) => (cards.kind(a) ? cards.rank?.(a) ?? 0 : ordering.rank?.(a.cityKey) ?? 0) -
        (cards.kind(b) ? cards.rank?.(b) ?? 0 : ordering.rank?.(b.cityKey) ?? 0));
    const seen = new Set(), secondary = [...ordinary.filter(item => !deferred(item)), ...tails].filter(item => {
      if (choice.card ? cards.kind(item) === choice.card : !choice.units && ComponentID.isMatch(item.id, choice.id)) return false;
      if (seen.has(item.type)) return false;
      seen.add(item.type); return true;
    });
    panel.notificationSlots.forEach((slot, index) => {
      const item = secondary[index];
      if (!item) { panel.hideBlockerIcon(slot); return; }
      slot.parentEle.setAttribute('data-audio-press-ref', 'data-audio-notif-press');
      slot.parentEle.setAttribute('data-audio-activate-ref', 'data-audio-notif-release');
      panel.showBlockerIcon(slot, item);
    });
  }
  function activate(_panel, choice) {
    if (choice.skippedProduction) { if (onlySkippedProduction(_panel)) withForceRequest([_panel], () => _panel.sendEndTurn(), true); }
    else if (choice.card) { provider('cards')?.open(choice); }
    else if (choice.units) {
      NotificationModel.manager.findHandler(Game.getHash('NOTIFICATION_COMMAND_UNITS'))?.activate(ComponentID.make(-1, -1, -1));
    } else Game.Notifications.activate(choice.id);
  }
  function lookAt(_panel, choice) {
    if (choice.card || choice.skippedProduction) return;
    if (UI.getOption('user', 'Interface', 'NotificationCameraPan') == 0 || ComponentID.isValid(UI.Player.getHeadSelectedUnit())) return;
    if (!choice.units) { NotificationModel.manager.lookAt(choice.id); return; }
    if (!InterfaceMode.isInInterfaceMode('INTERFACEMODE_DEFAULT')) return;
    const unit = UI.Player.getFirstReadyUnit();
    if (unit) { UI.Player.lookAtID(unit, 0); UI.Player.selectUnit(unit); }
  }
  const undoAction = installDeferredActionHooks(PanelAction.prototype, { choose, render, activate, lookAt });
  // Async save/rest wrappers preserve sendEndTurn arguments, but a stack-local
  // force flag is gone by the time they resume. Carry a one-use, panel/turn-bound
  // ticket with the request instead. This never bypasses the save/rest wrappers.
  const forceTickets = new WeakMap(), markedPanels = new WeakSet();
  function withForceRequest(panels, dispatch, skippedProduction = false) {
    if (!localTurn()) return dispatch();
    // A late Resource Planner must hand off its guard before async wrappers
    // capture this request; no frame or canEndTurn read is required first.
    provider('cards')?.active(true);
    const requestScope = scope(), restores = [];
    try {
      for (const panel of panels) {
        if (markedPanels.has(panel) || typeof panel.sendEndTurn !== 'function') continue;
        const descriptor = Object.getOwnPropertyDescriptor(panel, 'sendEndTurn');
        const previous = panel.sendEndTurn;
        const hook = function (...args) {
          const ticket = {};
          forceTickets.set(ticket, { panel: this, scope: requestScope, skippedProduction });
          return previous.call(this, ...args, ticket);
        };
        panel.sendEndTurn = hook;
        markedPanels.add(panel);
        restores.push(() => {
          markedPanels.delete(panel);
          if (panel.sendEndTurn !== hook) return;
          if (descriptor) Object.defineProperty(panel, 'sendEndTurn', descriptor);
          else delete panel.sendEndTurn;
        });
      }
      return dispatch();
    } finally { for (const restore of restores.reverse()) restore(); }
  }
  const undoCardGuards = [
    wrapMethod(PanelAction.prototype, 'canEndTurn', function (next) { return next() && (provider('cards')?.active(true).length ?? 0) === 0; }),
    wrapMethod(PanelAction.prototype, 'sendEndTurn', function (next, ...args) {
      const ticket = args.find(arg => arg && typeof arg === 'object' && forceTickets.has(arg));
      const request = ticket && forceTickets.get(ticket);
      if (request) {
        forceTickets.delete(ticket);
        if (request.panel !== this || request.scope !== scope() || !localTurn()) return;
        if (request.skippedProduction && !onlySkippedProduction(this)) return;
      }
      // Also guard native auto-end-turn, which calls sendEndTurn directly in refresh.
      if (displayRefreshDepth || (!request && (provider('cards')?.active(true).length ?? 0))) return;
      return next();
    }),
    wrapMethod(PanelAction.prototype, 'onEngineInput', function (next, event) {
      const force = event.detail.name === 'force-end-turn' && event.detail.status === InputActionStatuses.FINISH;
      return force ? withForceRequest([this], next) : next();
    }),
    // Existing panels may have bound onEngineInput before registration. Mark
    // their request at the live dispatcher too, while retaining its input guards.
    wrapMethod(ActionHandler, 'onEngineInput', function (next, name, status) {
      return name === 'force-end-turn' && status === InputActionStatuses.FINISH
        ? withForceRequest(actionPanels, next) : next();
    })
  ];
  const undoDetach = wrapMethod(PanelAction.prototype, 'onDetach', function(next) { actionPanels.delete(this); return next(); });
  return { context: { scope, localTurn, items, refresh, idKey, nextRank }, refresh, dispose() {
    if (disposed) return; disposed = true;
    undoAnimation(); undoDetach(); undoCardGuards.reverse().forEach(fn => fn()); undoAction();
    for (const frame of frames) cancelAnimationFrame(frame);
    frames.clear();
    // Native refresh may auto-end a turn. Teardown must never invoke it.
    actionPanels.clear();
  } };
}
export function registerTurnOrder(kind, createProvider) {
  const domain = kind === 'resources' || kind === 'policies';
  // Remove AO's old combined provider before obtaining the registry: its last
  // lease may dispose the registry. Settlement state survives when it has a lease.
  if (!globalThis[KEY]?.unifiedActions || (domain && !globalThis[KEY]?.cardDomains)) globalThis.__civ7CardReminderEntry?.dispose();
  let registry = globalThis[KEY];
  if (!registry) {
    const unload = () => registry.dispose();
    registry = createTurnOrderRegistry(createService, () => {
      engine.off('BeforeUnload', unload);
      if (globalThis[KEY] === registry) delete globalThis[KEY];
    });
    registry.unifiedActions = true;
    const register = registry.register;
    registry.registerSharedCards = register.bind(registry);
    // All three new owners replace the retired AO. A late legacy entry receives
    // an inert lease; only the page owners may install the composite capability.
    registry.register = (name, factory) => name === 'cards' ? { dispose() {} } : register(name, factory);
    globalThis[KEY] = registry;
    engine.on('BeforeUnload', unload);
  }
  if (registry.version !== 1) throw new Error('Unsupported turn-order contract');
  if (domain) {
    registry.cardDomains ??= createCardDomainRegistry(registry);
    return registry.cardDomains.register(kind, createProvider);
  }
  return registry.register(kind, createProvider);
}
