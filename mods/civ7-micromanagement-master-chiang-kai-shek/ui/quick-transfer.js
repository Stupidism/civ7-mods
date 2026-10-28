// Join + deploy uses two ordinary commands. The engine remains authoritative;
// neither preview nor hover changes unit membership, position or movement.
export function installQuickTransfer(api) {
  const {Game,GameInfo,GameplayMap,MapUnits,Units,Armies,ComponentID,GameContext,
    InterfaceMode,UI,WorldUI,OVERLAY_PRIORITY,PlacementMode,DirectionTypes,
    engine,window,setTimeout,clearTimeout,enabled,localUnit,onMap,isPacked,military,
    ownedCommandersAt,usable,session,stopAutomaticSelection,showNotice,Locale} = api;
  const ADD='UNITCOMMAND_ADD_TO_ARMY', REMOVE='UNITCOMMAND_REMOVE_FROM_ARMY';
  const MODE='INTERFACEMODE_ADD_TO_ARMY';
  const overlay=WorldUI.createOverlayGroup('WarControlsQuickTransfer',OVERLAY_PRIORITY.PLOT_HIGHLIGHT);
  const arrows=WorldUI.createModelGroup('WarControlsQuickTransferPath');
  const green={x:0,y:1,z:0,w:0.5}, cleanups=[], timers=new Set(), frames=new Set();
  let routes=new Map(), previewID=null, pending=null, disposed=false, sending=false;
  const same=(a,b)=>!!a&&!!b&&ComponentID.isMatch(a,b);
  const index=p=>GameplayMap.getIndexFromLocation(p);
  const distance=(a,b)=>GameplayMap.getPlotDistance(a.x,a.y,b.x,b.y);
  const query=(id,type,args={})=>Game.UnitCommands.canStart(id,type,args,false);
  const args=p=>({X:p.x,Y:p.y});
  function listen(target,name,fn,capture=false) {
    if(target===engine) { target.on(name,fn);cleanups.push(()=>target.off(name,fn)); }
    else {target.addEventListener(name,fn,capture);cleanups.push(()=>target.removeEventListener(name,fn,capture));}
  }
  function frame(fn) {
    const handle=window.requestAnimationFrame(()=>{frames.delete(handle);if(!disposed)fn();});frames.add(handle);
  }
  function later(fn,ms) {
    const handle=setTimeout(()=>{timers.delete(handle);if(!disposed)fn();},ms);timers.add(handle);
  }
  function clearPreview() {routes.clear();previewID=null;overlay.reset();arrows.clear();}
  function cancel() {
    pending=null;clearPreview();
    for(const t of timers)clearTimeout(t);timers.clear();
    for(const f of frames)window.cancelAnimationFrame(f);frames.clear();
  }
  function active() {
    const s=session();
    return !disposed&&!pending&&enabled('quickTransfer')&&enabled('autoJoin')&&usable()&&
      s?.mode===MODE&&InterfaceMode.getCurrent()===MODE&&same(s.id,UI.Player.getHeadSelectedUnit()) ? localUnit(s.id):null;
  }
  function hasFreeDeployment(commander) {
    const ability=GameInfo.UnitAbilities?.lookup('ABILITY_MOVE_AFTER_UNPACKING');
    return ability!=null && commander.getAbilityCount?.(ability.$hash)>0;
  }
  function emptyVisible(p) {
    return GameplayMap.getRevealedState(GameContext.localObserverID,p.x,p.y)===api.RevealedStates.VISIBLE&&
      MapUnits.getUnits(p.x,p.y).length===0;
  }
  function plan(unit) {
    const result=new Map();
    if(!military(unit)||!onMap(unit)||isPacked(unit)||unit.isEmbarked||!(unit.Movement?.movementMovesRemaining>=1))return result;
    // The one-point shortcut is a land-army operation. Do not guess costs for
    // embarkation, aircraft or naval deployment from this land-only evidence.
    if(GameInfo.Units.lookup(unit.type)?.Domain!=='DOMAIN_LAND')return result;
    const joins=query(unit.id,ADD);
    if(!joins.Success)return result;
    for(const plot of joins.Plots??[]) {
      const via=GameplayMap.getLocationFromIndex(plot);
      if(distance(unit.location,via)!==1)continue;
      const commanders=ownedCommandersAt(via);
      if(commanders.length!==1)continue;
      for(const commander of commanders) {
        if(!hasFreeDeployment(commander)||!query(unit.id,ADD,args(via)).Success)continue;
        const native=query(commander.id,'UNITCOMMAND_UNPACK_ARMY');
        const nearby=GameplayMap.getPlotIndicesInRadius(via.x,via.y,1);
        for(const targetIndex of nearby) {
          const target=GameplayMap.getLocationFromIndex(targetIndex);
          if(targetIndex===plot||!emptyVisible(target))continue;
          if(native.Plots && !native.Plots.includes(targetIndex))continue;
          const terrain=GameInfo.Terrains.lookup(GameplayMap.getTerrainType(target.x,target.y));
          const feature=GameInfo.Features.lookup(GameplayMap.getFeatureType(target.x,target.y));
          if(!terrain||terrain.Impassable||terrain.Water||feature?.Impassable||feature?.PreventUnpack)continue;
          // Before joining, REMOVE has no Plots. Use the unit's own native
          // pathfinder as a conservative passability check, not the commander's
          // mass-unpack ring (which also contains mountains). Limit to two steps
          // and re-query this unit's exact REMOVE after joining. Path `obstacles`
          // can include a prior/turn-boundary plot even on a valid native path;
          // it is not an authoritative deployment rejection.
          const path=Units.getPathTo(unit.id,target);
          if(!path?.plots||path.plots.length<2||path.plots.length>3||
            path.plots[0]!==index(unit.location)||path.plots.at(-1)!==targetIndex)continue;
          const route={id:unit.id,commander:commander.id,army:commander.armyId,source:{...unit.location},via:{...via},target:{...target}};
          // Stable tie: choose the first eligible commander returned by native
          // Join. Never submit both routes when two commanders share a destination.
          if(!result.has(targetIndex))result.set(targetIndex,route);
        }
      }
    }
    return result;
  }
  function refresh() {
    clearPreview();const unit=active();if(!unit)return;
    routes=plan(unit);previewID=unit.id;
    if(routes.size)overlay.addPlotOverlay().addPlots([...routes.keys()],{fillColor:green,edgeColor:{x:0.2,y:1,z:0.25,w:0.9}});
  }
  function hover(plot) {
    arrows.clear();
    const unit=active();if(!unit||!same(previewID,unit.id))return false;
    const route=routes.get(index(plot));if(!route)return false;
    const positions=[route.source,route.via,route.target];
    const order=[DirectionTypes.DIRECTION_EAST,DirectionTypes.DIRECTION_SOUTHEAST,DirectionTypes.DIRECTION_SOUTHWEST,
      DirectionTypes.DIRECTION_WEST,DirectionTypes.DIRECTION_NORTHWEST,DirectionTypes.DIRECTION_NORTHEAST];
    const direction=(from,to)=>to?order.indexOf(GameplayMap.getDirectionToPlot(from,to))+1:0;
    for(let n=0;n<positions.length;n++)arrows.addVFXAtPlot('VFX_3dUI_MovePip_01',index(positions[n]),{x:0,y:0,z:0},
      {constants:{start:direction(positions[n],positions[n-1]),end:direction(positions[n],positions[n+1]),Color3:[0.2,1,0.25],height:0}});
    arrows.addVFXAtPlot('VFX_3dUI_TurnCount_01',index(route.target),{x:0,y:0,z:0},
      {constants:{turn:1,scale:1},placement:PlacementMode.FIXED});
    return true;
  }
  function fail() {cancel();showNotice(Locale.compose('LOC_WC_TRANSFER_STOPPED'));}
  function send(id,type,location) {
    sending=true;
    try{return Game.UnitCommands.sendRequest(id,type,args(location));}
    finally{sending=false;}
  }
  function validPending(ticket) {
    const head=UI.Player.getHeadSelectedUnit();
    return pending===ticket&&usable()&&enabled('quickTransfer')&&enabled('autoJoin')&&Game.turn===ticket.turn&&
      (!ComponentID.isValid(head)||same(head,ticket.id)||same(head,ticket.commander));
  }
  function continueAfterJoin(ticket) {
    if(!validPending(ticket)){cancel();return;}
    const unit=localUnit(ticket.id),commander=localUnit(ticket.commander);
    if(!unit||!commander||!isPacked(unit)||!same(unit.armyId,ticket.army)||!same(commander.armyId,ticket.army)||
      index(commander.location)!==index(ticket.via)||!hasFreeDeployment(commander)){fail();return;}
    const result=query(ticket.id,REMOVE);
    if(!emptyVisible(ticket.target)||!result.Success||!result.Plots?.includes(index(ticket.target))||
      !query(ticket.id,REMOVE,args(ticket.target)).Success){fail();return;}
    ticket.phase='deploy';
    try{if(send(ticket.id,REMOVE,ticket.target)===false)fail();}catch(error){fail();}
  }
  function intercept(plot) {
    const unit=active();if(!unit)return false;
    // Recheck on click: previews are not permission to use stale capacity,
    // movement, occupancy, commander position or terrain information.
    const route=plan(unit).get(index(plot));if(!route)return false;
    stopAutomaticSelection();clearPreview();InterfaceMode.switchToDefault();
    const ticket={...route,turn:Game.turn,phase:'join'};pending=ticket;
    later(()=>{if(pending===ticket)fail();},10000);
    try{if(send(unit.id,ADD,route.via)===false)fail();}catch(error){fail();}
    return true;
  }
  listen(engine,'UnitAddedToArmy',data=>{
    const ticket=pending;
    if(ticket?.phase==='join'&&same(data.secondaryUnit,ticket.id)&&same(data.initiatingUnit,ticket.commander)) {
      ticket.phase='joined';frame(()=>continueAfterJoin(ticket));
    } else if(!pending)frame(refresh);
  });
  listen(engine,'UnitRemovedFromArmy',data=>{
    const ticket=pending;
    if(ticket?.phase==='deploy'&&same(data.secondaryUnit,ticket.id)&&same(data.initiatingUnit,ticket.commander)) {
      ticket.phase='complete';
      later(()=>{
        if(!validPending(ticket)){cancel();return;}
        const unit=localUnit(ticket.id);
        if(!unit||isPacked(unit)||!onMap(unit)||index(unit.location)!==index(ticket.target)){fail();return;}
        cancel();UI.Player.selectUnit(unit.id);
      },220);
    } else if(!pending)frame(refresh);
  });
  listen(engine,'UnitSelectionChanged',data=>{
    if(data.selected&&pending&&!same(data.unit,pending.id)&&!same(data.unit,pending.commander))cancel();
    else if(!pending) {
      if(data.selected&&same(data.unit,previewID))frame(refresh);
      else clearPreview();
    }
  });
  listen(window,'interface-mode-changed',()=>{
    if(!pending)clearPreview();
    else if(!['INTERFACEMODE_DEFAULT','INTERFACEMODE_UNIT_SELECTED',MODE,'INTERFACEMODE_REMOVE_FROM_ARMY'].includes(InterfaceMode.getCurrent()))cancel();
  });
  listen(window,'engine-input',event=>{if(event.isCancelInput?.()||event.detail?.name==='sys-menu')cancel();},true);
  for(const name of ['war-controls-settings-applied','active-device-type-changed','blur'])listen(window,name,cancel);
  for(const name of ['PlayerTurnDeactivated','GameStarted','BeforeUnload'])listen(engine,name,cancel);
  for(const name of ['UnitMoveComplete','UnitAddedToMap','UnitRemovedFromMap'])listen(engine,name,()=>{if(!pending)frame(refresh);});
  // Another explicit order cancels a queued deployment, even if it targets the
  // same unit. Our own two native requests are the only exception.
  for(const commands of [Game.UnitCommands,Game.UnitOperations]) {
    const original=commands.sendRequest;
    const replacement=function(...params){if(!disposed&&!sending&&pending)cancel();return original.apply(this,params);};
    commands.sendRequest=replacement;cleanups.push(()=>{if(commands.sendRequest===replacement)commands.sendRequest=original;});
  }
  return {refresh,hover,intercept,cancel,get busy(){return pending!==null;},
    dispose(){cancel();disposed=true;for(const f of cleanups.reverse())f();overlay.destroy();arrows.destroy();}};
}
