import { installQuickTransfer } from '../ui/quick-transfer.js';
import { installTacticalControls } from '../ui/tactical-controls.js';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createSelectionAssist } from '../ui/selection-assist.js';
import { installCommandHooks, installAutoTargetFocus, installAutoTargetSwitching } from '../ui/command-hooks.js';
import { createSettingsStore, normalizeConfig } from '../ui/settings-store.js';
const source = (await readFile(new URL('../ui/war-controls.js', import.meta.url), 'utf8')).replace(/^import .+;\r?\n/gm, '');
const localizationXml = await readFile(new URL('../text/settings.xml', import.meta.url), 'utf8');
export const translations = Object.fromEntries(['EnglishText', 'LocalizedText'].map(section => [
  section, Object.fromEntries([...localizationXml.match(new RegExp('<' + section + '>([\\s\\S]*?)</' + section + '>'))[1].matchAll(/<Row Tag="([^"]+)"[^>]*><Text>([\s\S]*?)<\/Text><\/Row>/g)].map(([,key,value]) => [key,value]))
]));
export const ADD = 'UNITCOMMAND_ADD_TO_ARMY', REMOVE = 'UNITCOMMAND_REMOVE_FROM_ARMY', ATTACK = 'UNITOPERATION_RANGE_ATTACK', REINFORCE = 'UNITOPERATION_REINFORCE_ARMY';
export async function fixture(initialConfig, { nativeArmyPanelSource, unitOperationTypes = {RANGE_ATTACK:ATTACK,NAVAL_ATTACK:'UNITOPERATION_NAVAL_ATTACK'} } = {}) {
  const id = { owner: 0, id: 7, type: 26 };
  const armyId = { owner: 0, id: 1, type: 29 };
  const commander = { id: {owner:0,id:1,type:26}, owner:0, isCommanderUnit:true, armyId, location:{x:1,y:0}, Movement:{movementMovesRemaining:4,maxMoves:2} };
  const unit = { id, owner:0, armyId, location:{x:-9999,y:-9999}, isCommanderUnit:false, Movement:{movementMovesRemaining:2}, type:'ARCHER', Combat:{isCombat:true,attacksRemaining:1} };
  const state = {
    tags:new Map([[0,1],[100,1]]), language:'zh_Hans_CN', head:id, unit, commander, members:[id], units:new Map([[7,unit],[1,commander]]),
    mode:'INTERFACEMODE_UNIT_SELECTED', modes:[], queries:[], requests:[], moves:[], errors:[], markers:[], tacticalOverlays:[], attackArrows:[], formationFrames:[], transferArrows:[], transferOverlays:[],
    commands:new Map([[REMOVE,{Success:true,Plots:[2]}]]), operations:new Map(),
    reachable:[], visible:true, atWar:true, atPlot:new Map([[1,[commander.id]]]),
    allowed:true, districtOwner:null, targetAllowed:true, notices:[], gamepad:false, settingsOpen:false,
    focus:'world', cameras:[], elements:[], selections:[], radius:[0,1,2,3,4], definitions:new Map([['ARCHER',{CoreClass:'CORE_CLASS_RANGED'}]])
  };
  const listeners = new Map(), windowListeners = new Map(), raised = new Set(), frames = new Map(), timers = new Map();
  let stored = initialConfig ? JSON.stringify({'civ7-war-controls':{version:2,config:initialConfig}}) : null;
  let serial=0;
  const match=(a,b)=>a&&b&&a.owner===b.owner&&a.id===b.id&&a.type===b.type;
  const api = (kind, results) => ({
    canStart:(id,type,args,visibility)=>{ state.queries.push({kind,id,type,args,visibility}); return args.X!==undefined&&!state.targetAllowed?{Success:false}:(typeof results.get(type)==='function'?results.get(type)(id,args):(results.get(type)??{Success:false})); },
    sendRequest:(id,type,args)=>state.requests.push({kind,id,type,args})
  });
  const world = {
    actionMouseRightButton(input){return this.requestMoveOperation(state.head,{X:input.X,Y:input.Y});},
    requestMoveOperation(...args){state.moves.push(args);return 'native-move';}
  };
  // Native ChoosePlot clears focus, but UnitActions' later animationComplete
  // invokes realizeFocus again. Controller Accept goes to that button first.
  class UnitActions {
    unitId = id;
    realizeFocus() { state.focus = state.members.length ? 'disabled-add' : 'move'; }
  }
  const panel = new UnitActions();
  const CommanderInteract = {
    currentArmyCommander:null, currentReinforcements:[], registerListener(){}, unregisterListener(){}
  };
  class CachedArmyPanel {
    unitId = null;
    currentState = 0;
    armyButtons = [];
    onAttach() { raised.add(this.onRaiseArmyPanel); }
    onDetach() { raised.delete(this.onRaiseArmyPanel); }
    onRaiseArmyPanel = id => { this.unitId=id; this.currentState=1; this.updateArmyPanel(); };
    createArmyUnitButton(){return context.document.createElement('unit-button');}
    clearArmyUnits(){this.armyButtons.forEach(b=>b.remove());this.armyButtons=[];}
    setupArmy(){
      for(const unit of CommanderInteract.currentArmyCommander?.packedUnits??[])
        this.armyButtons.push(this.createArmyUnitButton(unit.id));
    }
    updateArmyPanel = () => {this.clearArmyUnits();this.setupArmy();};
  }
  let ArmyPanel = CachedArmyPanel;
  const nativeModes = new Map(['INTERFACEMODE_FOCUSED_ATTACK_LAND_RANGED','INTERFACEMODE_FOCUSED_ATTACK_SEA_RANGED'].map(name=>[name,{Context:{UnitID:commander.id},decorate(){},reset(){},decorateHover(){},selectPlot(plot){this.commitPlot(plot);},commitPlot(plot){context.Game.UnitCommands.sendRequest(this.Context.UnitID,name.replace('INTERFACEMODE_','UNITCOMMAND_'),{X:plot.x,Y:plot.y});}}]));
  const handlers = {switchToActionInterfaceMode(type,args){state.modes.push({type,args});state.mode='INTERFACEMODE_'+type.replace(/^UNITCOMMAND_|^UNITOPERATION_/,'');state.focus='world';}};
  const context = vm.createContext({
    installQuickTransfer, installTacticalControls, createSelectionAssist, installCommandHooks, installAutoTargetFocus, installAutoTargetSwitching, createSettingsStore, normalizeConfig,
    CommanderInteract, ActionHandler:{get isGamepadActive(){return state.gamepad;}},
    Controls:{getDefinition:name=>name==='unit-actions'?{createInstance:UnitActions}:name==='army-panel'?{createInstance:ArmyPanel}:undefined},
    localStorage:{getItem:()=>stored,setItem:(_key,value)=>{stored=value;}},
    console:{log(){},warn(){},error:e=>state.errors.push(e)},
    setTimeout:(f,ms)=>{timers.set(++serial,{f,ms});return serial;}, clearTimeout:id=>timers.delete(id),
    Configuration:{getGame:()=>({isAnyMultiplayer:false})},GlobalParameters:{COMBAT_FOCUSED_ATTACK_BASE_BONUS:2},Online:{Metaprogression:{getEquippedMementos:()=>[]}},
    GameInfo:{NarrativeTags:{lookup:name=>({$index:name.startsWith('NARRATIVE_TAG_WC_COST_')?100+['READY','UNIT','TYPE','ACTIVE'].indexOf(name.replace('NARRATIVE_TAG_WC_COST_','')):['READY','1','2','4','8','16','32','64'].indexOf(name.replace('NARRATIVE_TAG_WC_FOCUS_',''))})},Units:{lookup:type=>state.definitions.get(type)}}, Locale:{compose:(key,...args)=>(translations[state.language === 'zh_Hans_CN' ? 'LocalizedText' : 'EnglishText'][key] ?? key).replace(/\{(\d+)\}/g,(_,n)=>String(args[Number(n)-1]))}, InputActionStatuses:{FINISH:2}, OperationPlotModifiers:{NONE:0},
    Camera:{lookAtPlot:p=>state.cameras.push(p)}, PlotCursor:{plotCursorCoords:null},
    ComponentID:{isValid:x=>x!=null&&x.owner!==-1&&x.id!==-1,toString:x=>`${x.owner};${x.id};${x.type}`,isMatch:match},
    InterfaceMode:{addHandler:(n,h)=>nativeModes.set(n,h),getInterfaceModeHandler:n=>nativeModes.get(n),getCurrent:()=>state.mode,switchTo:(name)=>{state.mode=name;windowListeners.get('interface-mode-changed')?.forEach(f=>f({}));},switchToDefault:()=>{state.mode='INTERFACEMODE_DEFAULT';windowListeners.get('interface-mode-changed')?.forEach(f=>f({}));}},
    ViewManager:{get isWorldInputAllowed(){return state.allowed;},isUnitSelectingAllowed:true},
    UnitSelection:{onRaise:{on:f=>raised.add(f),off:f=>raised.delete(f)},onLower:{on(){},off(){}}},
    UnitActionHandlers:handlers, WorldInput:world, OVERLAY_PRIORITY:{PLOT_HIGHLIGHT:4},
    PlacementMode:{TERRAIN:0,FIXED:1},
    DirectionTypes:{DIRECTION_EAST:0,DIRECTION_SOUTHEAST:1,DIRECTION_SOUTHWEST:2,DIRECTION_WEST:3,DIRECTION_NORTHWEST:4,DIRECTION_NORTHEAST:5},
    UnitOperationTypes:unitOperationTypes,
    UnitOperationMoveModifiers:{NONE:0,ATTACK:1,MOVE_IGNORE_UNEXPLORED_DESTINATION:2},CombatTypes:{COMBAT_RANGED:2},
    WorldUI:{getPlotLocation:p=>({x:p.x,y:p.y,z:0}),createModelGroup:name=>{
      const field=name==='WarControlsQuickTransferPath'?'transferArrows':name==='WarControlsFormationFrames'?'formationFrames':'attackArrows';
      return {clear(){state[field]=[];},destroy(){state[field]=[];},addVFXAtPlot:(...args)=>state[field].push(args)};
    },createOverlayGroup:name=>({reset(){if(name==='WarControlsEmptyCommanders')state.markers=[];if(name==='WarControlsTactical')state.tacticalOverlays=[];if(name==='WarControlsQuickTransfer')state.transferOverlays=[];},destroy(){if(name==='WarControlsEmptyCommanders')state.markers=[];if(name==='WarControlsTactical')state.tacticalOverlays=[];if(name==='WarControlsQuickTransfer')state.transferOverlays=[];},addPlotOverlay:()=>({addPlots:(plots,style)=>{if(name==='WarControlsEmptyCommanders')state.markers.push(...plots);if(name==='WarControlsTactical')state.tacticalOverlays.push({plots,style});if(name==='WarControlsQuickTransfer')state.transferOverlays.push({plots,style});}})})},
    UI:{Player:{getHeadSelectedUnit:()=>state.head,selectUnit:id=>{state.selections.push(id);select(id);}}},
    Units:{restoreMovement:id=>{state.costRequests??=[];state.costRequests.push(id);state.units.get(id.id).Movement.movementMovesRemaining=Math.max(0,state.units.get(id.id).Movement.maxMoves);},getCommandRadiusPlots:()=>state.radius,get:id=>state.units.get(id?.id),getReachableTargets:()=>state.reachable},
    Armies:{get:()=>({getUnitIds:()=>state.members})},
    Players:{get:()=>({Identity:{getNarrativeTagPoints:i=>state.tags.get(i)??0,changeNarrativeTagPoints:(i,n)=>{state.tags.set(i,(state.tags.get(i)??0)+n);if(i===103)for(const u of state.units.values())if(u.isCommanderUnit)u.Movement.maxMoves=state.tags.get(i)?-998:2;}},Diplomacy:{isAtWarWith:()=>state.atWar},Units:{getUnitIds:()=>[...state.units.values()].filter(u=>u.owner===0).map(u=>u.id)}})},
    MapUnits:{getUnits:x=>state.atPlot.get(x)??[...state.units.values()].filter(u=>u.location.x===x && u.location.y===0).map(u=>u.id)},
    MapCities:{getDistrict:()=>state.districtOwner!==null?{}:null},
    Districts:{get:()=>({owner:state.districtOwner})},
    GameplayMap:{getPlotIndicesInRadius:(x,y,r)=>Array.from({length:2*r+1},(_,i)=>x-r+i).filter(x=>x>=0),getLocationFromIndex:x=>({x,y:0}),getIndexFromLocation:p=>p.x,getPlotDistance:(x,y,a,b)=>Math.abs(x-a)+Math.abs(y-b),getRevealedState:()=>state.visible?1:0},
    RevealedStates:{VISIBLE:1}, GameContext:{localPlayerID:0,localObserverID:0},
    Game:{UnitCommands:api('command',state.commands),UnitOperations:api('operation',state.operations),Combat:{testAttackInto:()=>2}},
    document:{querySelectorAll:()=>state.elements.filter(e=>e.attrs?.['data-war-controls-unit']!==undefined&&!e.removed),querySelector:()=>state.settingsOpen?{}:null,createElement:()=>{const e={style:{},classList:{add(){}},children:[],attrs:{},events:{},remove(){this.removed=true;},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k];},removeAttribute(k){delete this.attrs[k];},addEventListener(n,f){this.events[n]=f;},appendChild(c){this.children.push(c);},set textContent(value){this.text=value;state.notices.push(value);}};state.elements.push(e);return e;},body:{appendChild(){}}},
    engine:{whenReady:Promise.resolve(),on:(n,f)=>{if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(f);},off:(n,f)=>listeners.get(n)?.delete(f)},
    window:{requestAnimationFrame:f=>{frames.set(++serial,f);return serial;},cancelAnimationFrame:n=>frames.delete(n),addEventListener:(n,f)=>{if(!windowListeners.has(n))windowListeners.set(n,new Set());windowListeners.get(n).add(f);},removeEventListener:(n,f)=>windowListeners.get(n)?.delete(f)}
  });
  if(nativeArmyPanelSource) {
    // Execute the installed game's real panel methods, replacing only visuals
    // unrelated to roster construction. Native source is never redistributed.
    context.Panel=class { constructor(root){this.Root=root;} onAttach(){} onDetach(){} };
    context.UpdateGate=class { constructor(callback){this.call=callback;} };
    context.Audio={playSound(){}};
    context.isMobile=()=>false;
    context.requestAnimationFrame=context.window.requestAnimationFrame;
    context.ComponentID.getInvalidID=()=>({owner:-1,id:-1,type:0});
    vm.runInContext(nativeArmyPanelSource.replace(/^import .+;\r?\n/gm,'').split('Controls.define("army-panel"')[0]+'\nglobalThis.NativeArmyPanel=ArmyPanel;',context);
    ArmyPanel=context.NativeArmyPanel;
    ArmyPanel.prototype.createArmyUnitButton=CachedArmyPanel.prototype.createArmyUnitButton;
    ArmyPanel.prototype.setUnitButtonData=()=>{};
    ArmyPanel.prototype.setupArmyActions=()=>{};
  }
  const rows=new Map();
  const root={innerHTML:'fixture',style:{},classList:{add(){},remove(){},contains(){return true;}},querySelector(selector){
    if(!rows.has(selector)) rows.set(selector,{appendChild(button){button.parentElement=this;},removeChild(button){button.remove();},setAttribute(){}});
    return rows.get(selector);
  }};
  const armyPanel = new ArmyPanel(root);
  vm.runInContext(source,context); await Promise.resolve();
  state.settings={getConfig:()=>context.__civ7WarControls.config,save(value){createSettingsStore(context.localStorage).save(value);windowListeners.get('war-controls-settings-applied')?.forEach(f=>f());}};
  const emit=(name,arg)=>listeners.get(name)?.forEach(f=>f(arg));
  const flush=()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(f=>f());};
  const select=(selected=id)=>{state.head=selected;emit('UnitSelectionChanged',{unit:selected,selected:true});raised.forEach(f=>f(selected));flush();};
  const tick=(ms=220)=>{const ready=[...timers.entries()].filter(([,t])=>t.ms<=ms);for(const [id,t]of ready){timers.delete(id);t.f();}};
  const unpack=()=>{unit.armyId={owner:-1,id:-1,type:0};unit.location={x:0,y:0};state.members=[];};
  const device=gamepad=>{state.gamepad=gamepad;windowListeners.get('active-device-type-changed')?.forEach(f=>f());flush();};
  function confirmTarget(args) {
    if(state.focus==='move') return world.requestMoveOperation(state.head,args);
    if(state.focus==='disabled-add') return;
    const type = state.mode==='INTERFACEMODE_ADD_TO_ARMY' ? ADD : state.mode==='INTERFACEMODE_REMOVE_FROM_ARMY' ? REMOVE : null;
    if(type) context.Game.UnitCommands.sendRequest(state.head,type,args);
  }
  const emitWindow=(name,event)=>windowListeners.get(name)?.forEach(f=>f(event));
  const showArmy=()=>{
    CommanderInteract.currentArmyCommander={commander,army:{combatUnitCapacity:6},packedUnits:state.members.map(id=>state.units.get(id.id))};
    armyPanel.onAttach();armyPanel.onRaiseArmyPanel(state.head);flush();
  };
  return {id,state,context,tick,armyPanel,showArmy,nativeModes,emit,emitWindow,flush,select,unpack,world,handlers,listeners,raised,device,panel,confirmTarget};
}
