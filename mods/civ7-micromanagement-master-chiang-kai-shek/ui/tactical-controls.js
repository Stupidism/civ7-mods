import { createFocusBonus } from './focus-bonus.js';
import { createFocusCost } from './focus-cost.js';
// Native APIs are supplied explicitly so event ordering can be replayed offline.
export function installTacticalControls(api) {
  const { InterfaceMode, ComponentID, ViewManager, UnitActionHandlers, PlotCursor,
    Game, Units, Armies, GameplayMap, MapUnits, GameInfo, UI, Camera, WorldUI,
    OVERLAY_PRIORITY, Controls, CommanderInteract, window, document, engine, setTimeout, clearTimeout,
    enabled, localUnit, onMap, isPacked, military, ownedCommanders, isEnemyPlot,
    isSettingsOpen, showNotice } = api;
  const t = (tag, ...args) => api.Locale.compose(tag, ...args);
  const REMOVE = 'UNITCOMMAND_REMOVE_FROM_ARMY';
  const REINFORCE = 'UNITOPERATION_REINFORCE_ARMY';
  const RANGE = 'UNITOPERATION_RANGE_ATTACK';
  const NAVAL = 'UNITOPERATION_NAVAL_ATTACK';
  const FOCUS = new Map([
    ['INTERFACEMODE_FOCUSED_ATTACK_LAND_RANGED', RANGE],
    ['INTERFACEMODE_FOCUSED_ATTACK_SEA_RANGED', NAVAL]
  ]);
  const cleanups = [];
  const timers = new Set();
  const frames = new Set();
  const armyPanels = new Set();
  let disposed = false, pending = null, volley = null, picker = null, preview = null;
  let selecting = false, sendingVolley = false;
  let panel = null;
  const bonus = createFocusBonus(api);
  const cost = createFocusCost(api, success => {
    if (!volley) return;
    if (!success) { cancel(); showNotice(t('LOC_WC_FOCUS_COST_UNAVAILABLE')); return; }
    volley.charged = true;
    frame(advanceVolley);
  });
  const overlay = WorldUI.createOverlayGroup('WarControlsTactical', OVERLAY_PRIORITY.PLOT_HIGHLIGHT);
  const attackArrows = WorldUI.createModelGroup('WarControlsAttackPreview');
  const key = id => ComponentID.isValid(id) ? ComponentID.toString(id) : '';
  const same = (a, b) => !!a && !!b && ComponentID.isMatch(a, b);
  const plotIndex = location => GameplayMap.getIndexFromLocation(location);
  const usable = () => !disposed && !isSettingsOpen() && ViewManager.isWorldInputAllowed;
  const mode = () => InterfaceMode.getCurrent();
  const allUnits = () => (api.Players.get(api.GameContext.localPlayerID)?.Units?.getUnitIds() ?? []).map(localUnit).filter(Boolean);
  const distance = (a,b) => GameplayMap.getPlotDistance(a.x,a.y,b.x,b.y);
  function later(callback, delay = 220) {
    const timer = setTimeout(() => { timers.delete(timer); if (!disposed) callback(); }, delay);
    timers.add(timer);
    return timer;
  }
  function frame(callback) {
    const handle = window.requestAnimationFrame(() => { frames.delete(handle); if (!disposed) callback(); });
    frames.add(handle);
  }
  function listen(target, event, callback, capture = false) {
    if (target === engine) { target.on(event, callback); cleanups.push(() => target.off(event, callback)); }
    else { target.addEventListener(event, callback, capture); cleanups.push(() => target.removeEventListener(event, callback, capture)); }
  }
  function wrap(object, name, callback) {
    if (!object || typeof object[name] !== 'function') return;
    const original = object[name];
    const replacement = function (...args) { return disposed ? original.apply(this,args) : callback.call(this, original.bind(this), ...args); };
    object[name] = replacement;
    if (object[name] !== replacement) throw new Error(`War Controls cannot hook ${name}`);
    cleanups.push(() => { if (object[name] === replacement) object[name] = original; });
  }
  const radius = commander => new Set(Units.getCommandRadiusPlots(commander.id) ?? []);
  const within = (unit, commander) => onMap(unit) && radius(commander).has(plotIndex(unit.location));
  function shot(unit, target, operation) {
    if (!military(unit) || !onMap(unit) || isPacked(unit) || !(unit.Movement?.movementMovesRemaining > 0) || !(unit.Combat?.attacksRemaining > 0)) return false;
    // Direct ranged operations never issue MOVE_TO. Require the native target
    // list AND target validation; reachable targets alone may include movement.
    const result = Game.UnitOperations.canStart(unit.id, operation, {}, false);
    const index = result.Plots?.indexOf(plotIndex(target)) ?? -1;
    if (!result.Success || index < 0) return false;
    if (operation === RANGE && (!result.Modifiers || result.Modifiers.length !== result.Plots.length || result.Modifiers[index] === api.OperationPlotModifiers.NONE)) return false;
    return isEnemyPlot(unit, plotIndex(target)) && Game.UnitOperations.canStart(unit.id, operation, { X: target.x, Y: target.y }, false).Success;
  }
  function candidates(commander, target, operation) {
    if (!commander || !onMap(commander)) return [];
    return formation(commander,operation).filter(unit => shot(unit, target, operation))
      .sort((a,b) => distance(b.location,target) - distance(a.location,target) || key(a.id).localeCompare(key(b.id)));
  }
  function formation(commander, operation) {
    if (!commander || !onMap(commander)) return [];
    const plots = radius(commander);
    return allUnits().filter(unit => {
      if (!military(unit) || !onMap(unit) || isPacked(unit) || !plots.has(plotIndex(unit.location))) return false;
      const definition = GameInfo.Units.lookup(unit.type);
      if (operation === NAVAL) return definition?.Domain === 'DOMAIN_SEA';
      if (['DOMAIN_SEA','DOMAIN_AIR'].includes(definition?.Domain)) return false;
      return unit.Combat?.rangedStrength > 0 || unit.Combat?.bombardStrength > 0 ||
        ['CORE_CLASS_RANGED','CORE_CLASS_SIEGE'].includes(definition?.CoreClass) ||
        Game.UnitOperations.canStart(unit.id,operation,{},true).Success;
    });
  }
  function nextAttacker(commander, previous) {
    if (!commander) return null;
    return allUnits().find(unit => !same(unit.id, previous.id) && unit.type === previous.type && within(unit, commander) &&
      [RANGE, NAVAL].some(operation => {
        const result = Game.UnitOperations.canStart(unit.id, operation, {}, false);
        return result.Plots?.some(index => shot(unit, GameplayMap.getLocationFromIndex(index), operation));
      }));
  }
  function highlightPortrait() {
    const head = UI.Player.getHeadSelectedUnit();
    document.querySelectorAll('[data-war-controls-unit]').forEach(button => {
      const selected = ComponentID.isValid(head) && button.getAttribute('data-war-controls-unit') === key(head);
      button.style.outline = selected ? '3px solid #ffe291' : '';
      button.style.backgroundColor = selected ? 'rgba(255,226,145,0.25)' : '';
      button.setAttribute('aria-pressed', String(selected));
    });
  }
  function syncPackedRoster() {
    const current = CommanderInteract?.currentArmyCommander;
    if (!current || !ComponentID.isValid(current.commander?.id)) return false;
    const commander = localUnit(current.commander.id);
    if (!commander) return false;
    const army = Armies.get(commander.armyId);
    if (!army) return false;
    const packed = army.getUnitIds().map(localUnit).filter(Boolean);
    if (packed.length === current.packedUnits.length && packed.every((unit,i)=>same(unit.id,current.packedUnits[i].id))) return false;
    // The native model only rebuilds on commander selection or its gated
    // army event. Selecting the next packed soldier can reuse an old snapshot.
    // Do not call model.update(): that also selects the commander and steals
    // the next soldier's focus. Only reconcile the roster used by the panel.
    current.packedUnits = packed;
    return true;
  }
  function refreshArmyPortraits() {
    if (!syncPackedRoster()) return;
    const commander = CommanderInteract.currentArmyCommander.commander;
    for (const armyPanel of armyPanels) {
      if (!ComponentID.isValid(armyPanel.unitId)) continue;
      const unit = localUnit(armyPanel.unitId);
      if (unit && (same(unit.id,commander.id) || same(unit.armyId,commander.armyId))) armyPanel.updateArmyPanel();
      // The last soldier may already be unpacked while the panel is still
      // visible. Rebuild its slots too, without raising or selecting anything.
      else if (unit && armyPanel.currentState === 1) armyPanel.updateArmyPanel();
    }
    frame(highlightPortrait);
  }
  function choose(id) {
    if (!usable() || !ViewManager.isUnitSelectingAllowed || !localUnit(id)) return;
    selecting = true;
    try { UI.Player.selectUnit(id); } finally { selecting = false; }
    frame(highlightPortrait);
  }
  function clearPanel() { panel?.remove(); panel = null; }
  function text(text) {
    const row = document.createElement('div'); row.textContent = text; panel.appendChild(row); return row;
  }
  function button(label, action, disabled = false) {
    const element = document.createElement('fxs-button');
    element.setAttribute('caption', label);
    element.setAttribute('disabled', String(disabled));
    element.style.cssText = 'margin:0.25rem 0;min-height:2.5rem;width:100%;flex-shrink:0;pointer-events:auto;';
    element.addEventListener('action-activate', event => { event.stopPropagation(); if (!disabled && usable()) action(); });
    panel.appendChild(element);
    return element;
  }
  function newPanel() {
    clearPanel(); panel = document.createElement('div');
    panel.className = 'war-controls-tactical font-body text-base';
    // Coherent resolves percentage max bounds against auto-sized content;
    // use the game's scaled rem units so buttons are not clipped at high DPI.
    panel.style.cssText = 'position:absolute;right:1rem;top:22%;display:flex;flex-direction:column;width:26rem;min-width:26rem;max-height:32rem;overflow:auto;padding:0.75rem;background-color:rgba(18,24,35,0.95);color:#ffe7b5;pointer-events:auto;z-index:100;';
    document.body.appendChild(panel);
  }
  function unitName(unit) { return unit.name ? (api.Locale?.compose?.(unit.name) ?? unit.name) : t('LOC_WC_UNIT_FALLBACK', unit.id.id); }
  function paint(target, units) {
    overlay.reset();
    const add = (plots, color) => { if (plots.length) overlay.addPlotOverlay().addPlots(plots, { fillColor: color }); };
    if (target) add([plotIndex(target)], {x:1,y:0.2,z:0.2,w:0.5});
    // Keep each unit's hex visible even when adjacent units share a state.
    for (const unit of units) overlay.addPlotOverlay().addPlots([plotIndex(unit.location)], {
      fillColor:{x:1,y:0.78,z:0.25,w:0},
      edgeColor:{x:1,y:0.78,z:0.25,w:1}
    });
  }
  function ensurePreview(commander, operation) {
    if (!preview || !same(preview.commander,commander) || preview.operation !== operation)
      preview = {commander,operation,excluded:new Set(),target:null};
    return preview;
  }
  function refreshPreview() {
    attackArrows.clear();
    if (!preview) return;
    const {commander, target, operation, excluded} = preview;
    const selected = formation(localUnit(commander),operation).filter(u=>!excluded.has(key(u.id)));
    const attackers = target ? selected.filter(u=>shot(u,target,operation)) : [];
    if (!enabled('focusPreview')) { overlay.reset(); return; }
    // Formation membership survives hovering empty/friendly plots or changing
    // enemies. Only arrows narrow to the units that can hit this enemy now.
    paint(attackers.length ? target : null, selected);
    if (!attackers.length) return;
    const targetPosition = WorldUI.getPlotLocation(target,{x:0,y:0,z:0},api.PlacementMode.TERRAIN);
    for (const unit of attackers) {
      const sourcePosition = WorldUI.getPlotLocation(unit.location,{x:0,y:0,z:0},api.PlacementMode.TERRAIN);
      attackArrows.addVFXAtPlot('VFX_3DUI_Ranged_Attack_Preview',{i:target.x,j:target.y},{x:0,y:0,z:0},{
        angle:0, constants:{
          target_position:[targetPosition.x,targetPosition.y,targetPosition.z],
          source_position:[sourcePosition.x,sourcePosition.y,sourcePosition.z]
        }
      });
    }
  }
  function toggle(id) {
    if (!preview || !enabled('focusPreview') || !enabled('focusExclude')) return;
    const k = key(id);
    if (!preview.excluded.delete(k)) preview.excluded.add(k);
    refreshPreview();
  }
  function startVolley(commander, target, operation, excluded) {
    if (volley || !usable()) return;
    const commanderUnit = localUnit(commander);
    if (!(commanderUnit?.Movement?.movementMovesRemaining >= 1)) {
      showNotice(t('LOC_WC_FOCUS_NEEDS_MOVEMENT')); return;
    }
    if (!bonus.ready()) { showNotice(t('LOC_WC_FOCUS_BONUS_UNAVAILABLE')); return; }
    if (!cost.ready()) { showNotice(t('LOC_WC_FOCUS_COST_UNAVAILABLE')); return; }
    const units = candidates(commanderUnit,target,operation).filter(u => !excluded.has(key(u.id)));
    if (!units.length) { showNotice(t('LOC_WC_NO_STATIONARY_ATTACKERS')); return; }
    // Remember identities: do not spend another shot on a replacement target.
    const targets = MapUnits.getUnits(target.x,target.y).map(key);
    volley = {commander, target:{...target}, operation, remaining:units.map(u=>u.id), targets, waiting:null, costStarted:false, charged:false};
    pending = null;
    preview = null; overlay.reset(); attackArrows.clear(); clearPanel();
    InterfaceMode.switchToDefault();
    advanceVolley();
  }
  function advanceVolley() {
    if (!volley || volley.waiting || (volley.costStarted && !volley.charged)) return;
    const plan = volley;
    if (!usable() || !localUnit(plan.commander) || (plan.targets.length && !MapUnits.getUnits(plan.target.x,plan.target.y).some(id => plan.targets.includes(key(id))))) { volley = null; return; }
    while (plan.remaining.length) {
      const id = plan.remaining.shift(), unit = localUnit(id);
      if (!unit || !within(unit,localUnit(plan.commander)) || !shot(unit,plan.target,plan.operation)) continue;
      if (!bonus.begin(unit)) { cancel(); showNotice(t('LOC_WC_FOCUS_BONUS_UNAVAILABLE')); return; }
      if (!plan.costStarted) {
        if (!cost.arm(plan.commander,id)) { bonus.clear();cancel();showNotice(t('LOC_WC_FOCUS_COST_UNAVAILABLE'));return; }
        plan.costStarted=true;
      }
      plan.waiting = id;
      // Stop on missing completion; never guess that an animation timer means
      // the attack resolved and send the entire queue in the same tick.
      plan.timeout = later(() => { if (volley === plan) { volley = null; showNotice(t('LOC_WC_VOLLEY_TIMEOUT')); } }, 15000);
      sendingVolley = true;
      try {
        const result = Game.UnitOperations.sendRequest(id, plan.operation, {X:plan.target.x,Y:plan.target.y});
        if (result === false) { cost.reject();bonus.clear(); cancel(); showNotice(t('LOC_WC_ATTACK_REJECTED')); }
      } catch (error) { cost.reject();bonus.clear(); cancel(); showNotice(t('LOC_WC_ATTACK_FAILED')); }
      finally { sendingVolley = false; }
      return;
    }
    volley = null;
  }
  function captureOrder(id, type) {
    if (!usable() || volley || !same(UI.Player.getHeadSelectedUnit(),id)) return null;
    const unit = localUnit(id);
    if (!unit) return null;
    if (type === REMOVE && (enabled('keepCommanderFocus') || enabled('nextDeployable')) && isPacked(unit)) {
      const commander = ownedCommanders().find(c=>same(c.armyId,unit.armyId));
      if (commander) return {kind:'deploy', id, commander:commander.id};
    }
    if ([RANGE,NAVAL].includes(type) && enabled('nextRanged') && military(unit)) {
      const commander = ownedCommanders().filter(c=>within(unit,c)).sort((a,b)=>distance(a.location,unit.location)-distance(b.location,unit.location))[0];
      if (commander) return {kind:'attack', id, commander:commander.id, type:unit.type};
    }
    return null;
  }
  function completePending() {
    const ticket = pending;
    if (!ticket || ticket.scheduled) return;
    ticket.scheduled = true;
    // Native action panel has a 150 ms delayed switchToDefault. Restore after
    // that transition, but abandon if the user selected something else.
    later(() => {
      if (pending !== ticket) return;
      pending = null;
      if (!usable() || !['INTERFACEMODE_DEFAULT','INTERFACEMODE_UNIT_SELECTED','INTERFACEMODE_REMOVE_FROM_ARMY','INTERFACEMODE_RANGE_ATTACK','INTERFACEMODE_NAVAL_ATTACK'].includes(mode())) return;
      const head = UI.Player.getHeadSelectedUnit();
      if (ComponentID.isValid(head) && !same(head,ticket.id) && !same(head,ticket.commander)) return;
      const commander = localUnit(ticket.commander);
      if (!commander) return;
      if (ticket.kind === 'deploy') {
        const packed = (Armies.get(commander.armyId)?.getUnitIds() ?? []).map(localUnit).filter(u=>military(u) && !same(u.id,ticket.id));
        const next = enabled('nextDeployable') && packed.find(u => {
          if (!(u.Movement?.movementMovesRemaining > 0)) return false;
          const result = Game.UnitCommands.canStart(u.id,REMOVE,{},false);
          return result.Success && result.Plots?.length;
        });
        if (next) choose(next.id);
        else if (enabled('keepCommanderFocus') && packed.length) choose(commander.id);
      } else if (enabled('nextRanged')) {
        const next = nextAttacker(commander,{id:ticket.id,type:ticket.type});
        if (next) choose(next.id);
      }
    });
  }
  function reinforcementChoices(id) {
    const result = Game.UnitOperations.canStart(id,REINFORCE,{},false);
    return ownedCommanders().filter(onMap).map(unit=>({unit, valid: result.Success && result.Plots?.includes(plotIndex(unit.location)) &&
      Game.UnitOperations.canStart(id,REINFORCE,{X:unit.location.x,Y:unit.location.y},false).Success}));
  }
  function cycle(step = 0) {
    if (!picker || !usable() || mode() !== 'INTERFACEMODE_REINFORCE_ARMY') return;
    const choices = reinforcementChoices(picker.id);
    if (!choices.length) { cancel(); return; }
    let index = choices.findIndex(c=>same(c.unit.id,picker.current));
    if (index < 0) index = 0;
    index = (index + step + choices.length) % choices.length;
    const choice = choices[index]; picker.current = choice.unit.id;
    Camera.lookAtPlot(choice.unit.location);
    PlotCursor.plotCursorCoords = choice.unit.location;
    paint(choice.unit.location,[]);
    newPanel();
    text(t('LOC_WC_REINFORCEMENT_TARGET', index + 1, choices.length, unitName(choice.unit)));
    text(choice.valid ? t('LOC_WC_REINFORCEMENT_READY') : t('LOC_WC_REINFORCEMENT_UNAVAILABLE'));
    text(t('LOC_WC_CYCLE_HELP'));
    button(t('LOC_WC_PREVIOUS'),()=>cycle(-1)); button(t('LOC_WC_NEXT'),()=>cycle(1));
    button(t('LOC_WC_REINFORCEMENT_CONFIRM'),()=>{
      const latest = reinforcementChoices(picker.id).find(c=>same(c.unit.id,picker.current));
      if (!latest?.valid) { cycle(); return; }
      const id = picker.id, location = latest.unit.location;
      Game.UnitOperations.sendRequest(id,REINFORCE,{X:location.x,Y:location.y});
      cancel(); InterfaceMode.switchToDefault();
    },!choice.valid);
    button(t('LOC_WC_CANCEL'),cancelReinforcement);
  }
  function cancelReinforcement() {
    if (!picker || !usable() || mode() !== 'INTERFACEMODE_REINFORCE_ARMY') return;
    const unit = localUnit(picker.id);
    cancel();
    if (!unit || !onMap(unit) || isPacked(unit)) { InterfaceMode.switchToDefault(); return; }
    // Return to the soldier, not the commander we were previewing. Explicit
    // cancellation must not trigger another automatic attack/join selection.
    api.cancelAutomaticSelection();
    if (!same(UI.Player.getHeadSelectedUnit(),unit.id)) choose(unit.id);
    InterfaceMode.switchTo('INTERFACEMODE_UNIT_SELECTED',{UnitID:unit.id});
    api.cancelAutomaticSelection();
    Camera.lookAtPlot(unit.location);
    PlotCursor.plotCursorCoords = unit.location;
  }
  function cancel() {
    pending = null; preview = null; picker = null; volley = null;
    for (const timer of timers) clearTimeout(timer);
    timers.clear(); overlay.reset(); attackArrows.clear(); clearPanel();
  }
  try {
    wrap(Game.UnitCommands,'sendRequest',function(original,id,type,...args){
      if (!sendingVolley && (bonus.active || cost.busy)) { cancel(); showNotice(t('LOC_WC_FOCUS_BUSY')); return false; }
      if (!sendingVolley) { if (volley) cancel(); pending = null; }
      const ticket = captureOrder(id,type);
      if (ticket) { pending = ticket; later(() => { if (pending === ticket) pending = null; }, 30000); }
      try { const result = original(id,type,...args); if (result === false && pending === ticket) pending = null; return result; }
      catch(error) { if (pending === ticket) pending=null; throw error; }
    });
    wrap(Game.UnitOperations,'sendRequest',function(original,id,type,...args){
      if (!sendingVolley && (bonus.active || cost.busy)) { cancel(); showNotice(t('LOC_WC_FOCUS_BUSY')); return false; }
      if (!sendingVolley) { if (volley) cancel(); pending = null; }
      const ticket = captureOrder(id,type);
      if (ticket) { pending = ticket; later(() => { if (pending === ticket) pending = null; }, 30000); }
      try { const result = original(id,type,...args); if (result === false && pending === ticket) pending = null; return result; }
      catch(error) { if (pending === ticket) pending=null; throw error; }
    });
    const armyPanelPrototype = Controls.getDefinition('army-panel')?.createInstance?.prototype;
    wrap(armyPanelPrototype,'setupArmy',function(original,...args){
      armyPanels.add(this);
      syncPackedRoster();
      return original(...args);
    });
    wrap(armyPanelPrototype,'onDetach',function(original,...args){
      armyPanels.delete(this);
      return original(...args);
    });
    wrap(armyPanelPrototype,'createArmyUnitButton',function(original,id){
      const result = original(id); result.setAttribute('data-war-controls-unit',key(id)); frame(highlightPortrait); return result;
    });
    const hookedModes = new WeakSet();
    function hookFocusMode(name, handler) {
      const operation = FOCUS.get(name);
      if (!operation || !handler || hookedModes.has(handler)) return;
      hookedModes.add(handler);
      wrap(handler,'decorate',function(original,...args){
        const result=original(...args);
        if (bonus.supported() && usable()) {
          preview=null; ensurePreview(this.Context.UnitID,operation); refreshPreview();
        }
        return result;
      });
      wrap(handler,'reset',function(original,...args){
        preview=null; overlay.reset(); attackArrows.clear();
        return original(...args);
      });
      wrap(handler,'decorateHover',function(original,target,...rest){
        if (!bonus.supported()) return original(target,...rest);
        if (!usable()) return;
        const plan=ensurePreview(this.Context.UnitID,operation);
        const commander=localUnit(plan.commander);
        plan.target=commander && isEnemyPlot(commander,plotIndex(target)) ? {...target} : null;
        refreshPreview();
      });
      wrap(handler,'selectPlot',function(_original,target){
        if (!bonus.supported()) return _original(target);
        if (!usable()) return false;
        const plan=ensurePreview(this.Context.UnitID,operation);
        const units=formation(localUnit(plan.commander),operation);
        const hit=units.find(u=>plotIndex(u.location)===plotIndex(target));
        if (hit) {
          plan.target=null; toggle(hit.id); return false;
        }
        const commander=localUnit(plan.commander);
        if (!commander || !isEnemyPlot(commander,plotIndex(target))) return false;
        startVolley(plan.commander,target,operation,plan.excluded);
        return false;
      });
      // The confirmation submits one stationary shot at a time with a native
      // temporary strength modifier matching the firing unit's focused bonus.
    }
    // Native interface modes may register after UIScripts have initialized.
    wrap(InterfaceMode,'addHandler',function(original,name,handler){
      const result=original(name,handler); hookFocusMode(name,handler); return result;
    });
    for (const [name] of FOCUS) hookFocusMode(name,InterfaceMode.getInterfaceModeHandler(name));
    wrap(UnitActionHandlers,'switchToActionInterfaceMode',function(original,type,context,...rest){
      const result=original(type,context,...rest);
      if(type===REINFORCE && enabled('reinforcementCycle') && mode()==='INTERFACEMODE_REINFORCE_ARMY' && localUnit(context?.UnitID)) {
        const origin=localUnit(context.UnitID).location;
        const choices=reinforcementChoices(context.UnitID).sort((a,b)=>distance(a.unit.location,origin)-distance(b.unit.location,origin));
        const nearest=choices.find(choice=>choice.valid) ?? choices[0];
        picker={id:context.UnitID,current:nearest?.unit.id}; frame(()=>cycle());
      }
      return result;
    });
    listen(engine,'UnitRemovedFromArmy',data=>{
      const initiatingUnit = data?.initiatingUnit;
      if (ComponentID.isValid(initiatingUnit) && localUnit(initiatingUnit)) {
        frame(refreshArmyPortraits);
        // Recheck after the native 150 ms transition, independently of the
        // auto-selection switches and whether the user chose another unit.
        later(refreshArmyPortraits);
      }
      if (pending?.kind==='deploy' && (same(initiatingUnit,pending.id) || same(initiatingUnit,pending.commander))) completePending();
    });
    listen(engine,'UnitOperationDeactivated',data=>{
      if (volley?.waiting && same(data.unit,volley.waiting)) {
        const plan=volley; clearTimeout(plan.timeout); timers.delete(plan.timeout); plan.waiting=null; frame(advanceVolley);
      } else if (pending?.kind==='attack' && same(data.unit,pending.id)) completePending();
    });
    listen(engine,'UnitSelectionChanged',data=>{
      if (data.selected && !selecting && volley && !same(data.unit,volley.commander) && !same(data.unit,volley.waiting)) cancel();
      if (data.selected && !selecting && pending && !same(data.unit,pending.id) && !same(data.unit,pending.commander)) pending=null;
      frame(highlightPortrait);
    });
    listen(window,'interface-mode-changed',()=>{
      if(!FOCUS.has(mode())) {preview=null; attackArrows.clear(); if(!picker) {overlay.reset(); clearPanel();}}
      if(picker && mode()!=='INTERFACEMODE_REINFORCE_ARMY') {picker=null; overlay.reset(); clearPanel();}
    });
    const consume=event=>{event.preventDefault?.(); event.stopImmediatePropagation?.();};
    const cycleInput=event=>{
      if(!picker || !usable()) return;
      const step={'nav-shell-previous':-1,'nav-shell-next':1}[event.detail?.name];
      if(step) {consume(event); if(event.detail.status===api.InputActionStatuses.FINISH) cycle(step);}
    };
    // The native action handler dispatches shoulder navigation as navigate-input.
    listen(window,'navigate-input',cycleInput,true);
    listen(window,'engine-input',event=>{
      if(picker && usable() && mode()==='INTERFACEMODE_REINFORCE_ARMY' && event.isCancelInput?.()) {
        consume(event);
        if(event.detail?.status===api.InputActionStatuses.FINISH) cancelReinforcement();
        return;
      }
      if(event.isCancelInput?.() || event.detail?.name==='sys-menu') {cancel(); return;}
      cycleInput(event);
    },true);
    listen(window,'keydown',event=>{
      if(!picker || !usable() || !['ArrowUp','ArrowDown'].includes(event.key)) return;
      consume(event); cycle(event.key==='ArrowUp'?-1:1);
    },true);
    let lastWheel=0;
    listen(window,'wheel',event=>{
      if(!picker || !usable() || !event.deltaY) return;
      consume(event);
      const now=Date.now(); if(now-lastWheel<150) return; lastWheel=now;
      cycle(event.deltaY<0?-1:1);
    },true);
    listen(engine,'PlayerTurnDeactivated',cancel);
    listen(window,'active-device-type-changed',()=>{
      // Switching from keyboard/controller navigation to a right-click must
      // leave the picker alive so that cancel can return to its source unit.
      if(picker && enabled('reinforcementCycle') && usable() && mode()==='INTERFACEMODE_REINFORCE_ARMY') return;
      cancel();
    });
  } catch(error) { dispose(); throw error; }
  function dispose() {
    if(disposed) return; disposed=true; cancel();
    cost.dispose();bonus.dispose();
    for(const handle of frames) window.cancelAnimationFrame(handle);
    frames.clear();
    armyPanels.clear();
    for(const cleanup of cleanups.reverse()) cleanup();
    overlay.destroy();
    document.querySelectorAll('[data-war-controls-unit]').forEach(button=>{
      button.style.outline=''; button.style.backgroundColor=''; button.removeAttribute('data-war-controls-unit');
    });
  }
  return {cancel,dispose, preserveWorldFocus(id) {
    return usable() && ((picker && same(id,picker.id) && mode()==='INTERFACEMODE_REINFORCE_ARMY') ||
      (preview && same(id,preview.commander) && FOCUS.has(mode())));
  }};
}
