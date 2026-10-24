import { InterfaceMode } from '/core/ui/interface-modes/interface-modes.js';
import { ComponentID } from '/core/ui/utilities/utilities-component-id.js';
import ViewManager from '/core/ui/views/view-manager.js';
import UnitSelection from '/base-standard/ui/unit-selection/unit-selection.js';
import '/base-standard/ui/unit-actions/unit-actions.js';
import '/base-standard/ui/army-panel/army-panel.js';
import CommanderInteract from '/base-standard/ui/commander-interact/model-commander-interact.js';
import { UnitActionHandlers } from '/base-standard/ui/unit-interact/unit-action-handlers.js';
import WorldInput from '/base-standard/ui/world-input/world-input.js';
import { OVERLAY_PRIORITY } from '/base-standard/ui/utilities/utilities-overlay.js';
import { installTacticalControls } from './tactical-controls.js';
import PlotCursor from '/core/ui/input/plot-cursor.js';
import { createSelectionAssist } from './selection-assist.js';
import { installCommandHooks, installAutoTargetFocus } from './command-hooks.js';
import ActionHandler from '/core/ui/input/action-handler.js';
import { createSettingsStore, normalizeConfig } from './settings-store.js';

const SLOT = '__civ7WarControls';
const REMOVE = 'UNITCOMMAND_REMOVE_FROM_ARMY';
const ADD = 'UNITCOMMAND_ADD_TO_ARMY';
const REINFORCE = 'UNITOPERATION_REINFORCE_ARMY';
const ATTACKS = ['UNITOPERATION_RANGE_ATTACK', 'UNITOPERATION_NAVAL_ATTACK', 'UNITOPERATION_AIR_ATTACK'];

function install() {
  globalThis[SLOT]?.dispose();
  const store = createSettingsStore(localStorage);
  const loaded = store.load();
  let config = loaded.config;
  if (loaded.error) console.error('[War Controls] Settings load failed; using defaults: ' + String(loaded.error));
  const activeProfile = () => ActionHandler.isGamepadActive ? 'gamepad' : 'mouse';
  const enabled = key => config[activeProfile()][key];
  const isSettingsOpen = () => document.querySelector('screen-options') !== null;
  let disposed = false;
  let markerFrame = null;
  let noticeTimer = null;
  let notice = null;
  let autoTarget = null;
  let tactics = null;
  const removeFocusHook = installAutoTargetFocus({
    panelPrototype: Controls.getDefinition('unit-actions')?.createInstance?.prototype,
    preserveWorldFocus: id => activeProfile() === 'gamepad' && (tactics?.preserveWorldFocus(id) || (autoTarget !== null &&
      !isSettingsOpen() && ViewManager.isWorldInputAllowed &&
      InterfaceMode.getCurrent() === autoTarget.mode &&
      ComponentID.isMatch(id, autoTarget.id) && ComponentID.isMatch(id, UI.Player.getHeadSelectedUnit())))
  });
  const markerGroup = WorldUI.createOverlayGroup('WarControlsEmptyCommanders', OVERLAY_PRIORITY.PLOT_HIGHLIGHT);
  const command = (id, type, args = {}) => Game.UnitCommands.canStart(id, type, args, false);
  const operation = (id, type, args = {}) => Game.UnitOperations.canStart(id, type, args, false);
  const localUnit = id => {
    const unit = Units.get(id);
    return unit?.owner === GameContext.localPlayerID ? unit : null;
  };
  const onMap = unit => unit?.location?.x >= 0 && unit?.location?.y >= 0;
  const ownedCommandersAt = location => MapUnits.getUnits(location.x, location.y)
    .map(id => localUnit(id)).filter(unit => unit?.isCommanderUnit);
  const isPacked = unit => ComponentID.isValid(unit.armyId) &&
    Armies.get(unit.armyId)?.getUnitIds().some(id => ComponentID.isMatch(id, unit.id));

  function isEnemyPlot(unit, plot) {
    const location = GameplayMap.getLocationFromIndex(plot);
    if (GameplayMap.getRevealedState(GameContext.localObserverID, location.x, location.y) !== RevealedStates.VISIBLE) return false;
    const diplomacy = Players.get(unit.owner)?.Diplomacy;
    const hostile = owner => owner !== unit.owner && owner != null && diplomacy?.isAtWarWith(owner) === true;
    if (MapUnits.getUnits(location.x, location.y).some(id => hostile(id.owner))) return true;
    const district = MapCities.getDistrict(location.x, location.y);
    return district != null && hostile(Districts.get(district)?.owner);
  }
  function attackChoice(unit) {
    if (!(unit.Movement?.movementMovesRemaining > 0) || !(unit.Combat?.attacksRemaining > 0)) return { action: null, enemy: false };
    const targets = (Units.getReachableTargets(unit.id) ?? []).filter(plot => isEnemyPlot(unit, plot));
    for (const type of ATTACKS) {
      const result = operation(unit.id, type);
      if (!result.Success) continue;
      for (const plot of targets) {
        if (!result.Plots?.includes(plot)) continue;
        const location = GameplayMap.getLocationFromIndex(plot);
        if (operation(unit.id, type, { X: location.x, Y: location.y }).Success) return { action: type, enemy: true };
      }
    }
    // Native melee uses default move/attack mode. Do not replace it with Join
    // while a reachable enemy is present.
    return { action: null, enemy: targets.length > 0 };
  }
  function actionFor(id) {
    const unit = localUnit(id);
    if (!unit || unit.isCommanderUnit) return null;
    if (isPacked(unit)) {
      const result = command(id, REMOVE);
      return enabled('autoExit') && result.Success && result.Plots?.length > 0 ? REMOVE : null;
    }
    if (!onMap(unit)) return null;
    const attack = attackChoice(unit);
    if (attack.enemy) return enabled('autoAttack') ? attack.action : null;
    if (!enabled('autoJoin')) return null;
    const join = command(id, ADD);
    if (!join.Success) return null;
    const nearby = join.Plots?.some(plot => {
      const location = GameplayMap.getLocationFromIndex(plot);
      return GameplayMap.getPlotDistance(unit.location.x, unit.location.y, location.x, location.y) <= 1 && ownedCommandersAt(location).length > 0;
    });
    return nearby ? ADD : null;
  }
  const assist = createSelectionAssist({
    key: id => ComponentID.isValid(id) ? ComponentID.toString(id) : null,
    headSelected: () => UI.Player.getHeadSelectedUnit(),
    nextFrame: callback => window.requestAnimationFrame(callback),
    cancelFrame: handle => window.cancelAnimationFrame(handle),
    canUseWorld: () => !isSettingsOpen() && ViewManager.isWorldInputAllowed && ViewManager.isUnitSelectingAllowed,
    mode: () => InterfaceMode.getCurrent(),
    actionFor,
    enterAction(id, action) {
      UnitActionHandlers.switchToActionInterfaceMode(action, { UnitID: id });
      const mode = InterfaceMode.getCurrent();
      if (mode !== 'INTERFACEMODE_UNIT_SELECTED' && mode !== 'INTERFACEMODE_DEFAULT') autoTarget = { id, mode };
    },
    reportError(error) { console.error('[War Controls] Selection assist failed: ' + String(error)); }
  });
  function showNotice(text) {
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'war-controls-notice font-body text-base';
      notice.style.cssText = 'position:absolute;bottom:24%;left:25%;width:50%;padding:0.65rem;background-color:rgba(18,24,35,0.92);color:#f5e4cf;text-align:center;pointer-events:none;z-index:1000;';
      document.body.appendChild(notice);
    }
    notice.textContent = text;
    notice.style.display = 'block';
    if (noticeTimer !== null) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.style.display = 'none'; noticeTimer = null; }, 3200);
  }
  const ownedCommanders = () => (Players.get(GameContext.localPlayerID)?.Units?.getUnitIds() ?? [])
    .map(localUnit).filter(unit => unit?.isCommanderUnit);
  const military = unit => !!unit && !unit.isCommanderUnit && unit.Combat?.isCombat === true &&
    GameInfo.Units.lookup(unit.type)?.CoreClass !== 'CORE_CLASS_RECON';
  function tryJoin(id, args) {
    if (activeProfile() !== 'mouse' || !enabled('rightClickJoin') || isSettingsOpen() || !ViewManager.isWorldInputAllowed || !args) return false;
    const unit = localUnit(id);
    if (!unit || unit.isCommanderUnit || !onMap(unit) || !ComponentID.isMatch(id, UI.Player.getHeadSelectedUnit())) return false;
    if (!['INTERFACEMODE_UNIT_SELECTED', 'INTERFACEMODE_DEFAULT'].includes(InterfaceMode.getCurrent())) return false;
    if (ownedCommandersAt({ x: args.X, y: args.Y }).length === 0) return false;
    if (!MapUnits.getUnits(args.X, args.Y).some(other => !ComponentID.isMatch(other, id) && military(localUnit(other)))) return false;
    // Failure on a commander tile must never fall through to Move/swap.
    try {
      const request = { X: args.X, Y: args.Y };
      // In 1.5.0 the target-only query can succeed for a distant commander.
      // Require membership in the native Join mode's actual selectable plots.
      const available = command(id, ADD);
      const targetPlot = GameplayMap.getIndexFromLocation({ x: args.X, y: args.Y });
      if (available.Success && available.Plots?.includes(targetPlot) && command(id, ADD, request).Success) {
        Game.UnitCommands.sendRequest(id, ADD, request);
        InterfaceMode.switchToDefault();
      } else showNotice(Locale.compose('LOC_WC_JOIN_UNAVAILABLE'));
    } catch (error) {
      console.error('[War Controls] Join failed: ' + String(error));
      showNotice(Locale.compose('LOC_WC_JOIN_FAILED'));
    }
    return true;
  }
  function tryReinforce(context) {
    if (!enabled('singleReinforcement') || isSettingsOpen() || !context?.UnitID || !ViewManager.isWorldInputAllowed) return false;
    const unit = localUnit(context.UnitID);
    if (!unit || !ComponentID.isMatch(unit.id, UI.Player.getHeadSelectedUnit())) return false;
    if (ownedCommanders().length !== 1) return false;
    const result = operation(unit.id, REINFORCE);
    if (!result.Success) return false;
    const candidates = new Map();
    for (const plot of result.Plots ?? []) {
      const location = GameplayMap.getLocationFromIndex(plot);
      for (const commander of ownedCommandersAt(location)) candidates.set(ComponentID.toString(commander.id), location);
    }
    if (candidates.size !== 1) return false;
    const location = [...candidates.values()][0];
    const args = { X: location.x, Y: location.y };
    if (!operation(unit.id, REINFORCE, args).Success) return false;
    Game.UnitOperations.sendRequest(unit.id, REINFORCE, args);
    InterfaceMode.switchToDefault();
    return true;
  }
  const removeHooks = installCommandHooks({ worldInput: WorldInput, handlers: UnitActionHandlers, tryJoin, tryReinforce });
  try { tactics = installTacticalControls({
    InterfaceMode, ComponentID, ViewManager, UnitSelection, UnitActionHandlers, PlotCursor,
    Game, Units, Armies, Players, GameContext, GameplayMap, MapUnits, GameInfo, GlobalParameters, Online, Configuration, UI, Camera, Locale, InputActionStatuses, OperationPlotModifiers,
    WorldUI, PlacementMode, OVERLAY_PRIORITY, Controls, CommanderInteract, window, document, engine,
    setTimeout, clearTimeout, enabled, localUnit, onMap, isPacked, military, ownedCommanders,
    isEnemyPlot, isSettingsOpen, showNotice,
    cancelAutomaticSelection() { autoTarget = null; assist.cancelPending(); }
  }); } catch (error) {
    removeHooks();
    removeFocusHook();
    markerGroup.destroy();
    assist.dispose();
    throw error;
  }
  function refreshMarkers() {
    markerFrame = null;
    if (disposed) return;
    markerGroup.reset();
    if (!enabled('emptyMarker')) return;
    const player = Players.get(GameContext.localPlayerID);
    const plots = new Set();
    for (const id of player?.Units?.getUnitIds() ?? []) {
      const unit = localUnit(id);
      if (!unit?.isCommanderUnit || !onMap(unit) || !ComponentID.isValid(unit.armyId)) continue;
      const army = Armies.get(unit.armyId);
      if (army && army.getUnitIds().length === 0) plots.add(GameplayMap.getIndexFromLocation(unit.location));
    }
    if (plots.size) markerGroup.addPlotOverlay().addPlots([...plots], { fillColor: { x: 1, y: 0.32, z: 0.58, w: 0.22 } });
  }
  const scheduleMarkers = () => {
    if (!disposed && markerFrame === null) markerFrame = window.requestAnimationFrame(refreshMarkers);
  };
  const markerEvents = ['GameStarted', 'UnitAddedToArmy', 'UnitRemovedFromArmy', 'UnitMoveComplete', 'UnitAddedToMap', 'UnitRemovedFromMap', 'PlayerTurnActivated'];
  const onSelection = data => assist.selectionChanged(data.unit, data.selected);
  const onRaise = id => assist.raised(id);
  const onInput = event => {
    if (event.isCancelInput?.() || event.detail?.name === 'sys-menu') {
      autoTarget = null;
      assist.cancelPending();
    }
  };
  const onModeChanged = () => {
    if (autoTarget && InterfaceMode.getCurrent() !== autoTarget.mode) autoTarget = null;
  };
  const onDeviceChanged = () => {
    autoTarget = null;
    assist.cancelPending();
    scheduleMarkers();
  };
  const onSettingsApplied = () => {
    const result = store.load();
    if (result.error) { console.error('[War Controls] Settings refresh failed: ' + String(result.error)); return; }
    tactics.cancel();
    config = result.config;
    autoTarget = null;
    assist.cancelPending();
    scheduleMarkers();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    assist.dispose();
    autoTarget = null;
    removeFocusHook();
    tactics.dispose();
    removeHooks();
    if (markerFrame !== null) window.cancelAnimationFrame(markerFrame);
    if (noticeTimer !== null) clearTimeout(noticeTimer);
    notice?.remove();
    markerGroup.destroy();
    for (const event of markerEvents) engine.off(event, scheduleMarkers);
    engine.off('UnitSelectionChanged', onSelection);
    engine.off('BeforeUnload', dispose);
    UnitSelection.onRaise.off(onRaise);
    window.removeEventListener('engine-input', onInput, true);
    window.removeEventListener('interface-mode-changed', onModeChanged);
    window.removeEventListener('active-device-type-changed', onDeviceChanged);
    window.removeEventListener('war-controls-settings-applied', onSettingsApplied);
    window.removeEventListener('unload', dispose);
    if (globalThis[SLOT]?.dispose === dispose) delete globalThis[SLOT];
  };
  for (const event of markerEvents) engine.on(event, scheduleMarkers);
  engine.on('UnitSelectionChanged', onSelection);
  engine.on('BeforeUnload', dispose);
  UnitSelection.onRaise.on(onRaise);
  window.addEventListener('engine-input', onInput, true);
  window.addEventListener('interface-mode-changed', onModeChanged);
  window.addEventListener('active-device-type-changed', onDeviceChanged);
  window.addEventListener('war-controls-settings-applied', onSettingsApplied);
  window.addEventListener('unload', dispose);
  globalThis[SLOT] = { version: '0.6.0', get config() { return normalizeConfig(config); }, get activeProfile() { return activeProfile(); }, dispose };
  scheduleMarkers();
  console.warn('[War Controls] 0.6.0 loaded.');
}
engine.whenReady.then(install).catch(error => console.error('[War Controls] Install failed: ' + String(error)));
