import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createSelectionAssist } from '../ui/selection-assist.js';
import { installCommandHooks, installAutoTargetFocus } from '../ui/command-hooks.js';
import { createSettingsStore, normalizeConfig } from '../ui/settings-store.js';
const source = (await readFile(new URL('../ui/war-controls.js', import.meta.url), 'utf8')).replace(/^import .+;\r?\n/gm, '');
export const ADD = 'UNITCOMMAND_ADD_TO_ARMY', REMOVE = 'UNITCOMMAND_REMOVE_FROM_ARMY', ATTACK = 'UNITOPERATION_RANGE_ATTACK', REINFORCE = 'UNITOPERATION_REINFORCE_ARMY';
export async function fixture(initialConfig) {
  const id = { owner: 0, id: 7, type: 26 };
  const armyId = { owner: 0, id: 1, type: 29 };
  const commander = { id: {owner:0,id:1,type:26}, owner:0, isCommanderUnit:true, armyId, location:{x:1,y:0} };
  const unit = { id, owner:0, armyId, location:{x:-9999,y:-9999}, isCommanderUnit:false, Movement:{movementMovesRemaining:2}, Combat:{attacksRemaining:1} };
  const state = {
    head:id, unit, commander, members:[id], units:new Map([[7,unit],[1,commander]]),
    mode:'INTERFACEMODE_UNIT_SELECTED', modes:[], queries:[], requests:[], moves:[], errors:[], markers:[],
    commands:new Map([[REMOVE,{Success:true,Plots:[2]}]]), operations:new Map(),
    reachable:[], visible:true, atWar:true, atPlot:new Map([[1,[commander.id]]]),
    allowed:true, districtOwner:null, targetAllowed:true, notices:[], gamepad:false, settingsOpen:false,
    focus:'world'
  };
  const listeners = new Map(), windowListeners = new Map(), raised = new Set(), frames = new Map();
  let stored = initialConfig ? JSON.stringify({'civ7-war-controls':{config:initialConfig}}) : null;
  let serial=0;
  const match=(a,b)=>a&&b&&a.owner===b.owner&&a.id===b.id&&a.type===b.type;
  const api = (kind, results) => ({
    canStart:(id,type,args,visibility)=>{ state.queries.push({kind,id,type,args,visibility}); return args.X!==undefined&&!state.targetAllowed?{Success:false}:(results.get(type)??{Success:false}); },
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
  const handlers = {switchToActionInterfaceMode(type,args){state.modes.push({type,args});state.mode='INTERFACEMODE_'+type.replace(/^UNITCOMMAND_|^UNITOPERATION_/,'');state.focus='world';}};
  const context = vm.createContext({
    createSelectionAssist, installCommandHooks, installAutoTargetFocus, createSettingsStore, normalizeConfig,
    ActionHandler:{get isGamepadActive(){return state.gamepad;}},
    Controls:{getDefinition:name=>name==='unit-actions'?{createInstance:UnitActions}:undefined},
    localStorage:{getItem:()=>stored,setItem:(_key,value)=>{stored=value;}},
    console:{log(){},warn(){},error:e=>state.errors.push(e)},
    setTimeout:()=>++serial, clearTimeout(){},
    ComponentID:{isValid:x=>x!=null&&x.owner!==-1&&x.id!==-1,toString:x=>`${x.owner};${x.id};${x.type}`,isMatch:match},
    InterfaceMode:{getCurrent:()=>state.mode,switchToDefault:()=>{state.mode='INTERFACEMODE_DEFAULT';}},
    ViewManager:{get isWorldInputAllowed(){return state.allowed;},isUnitSelectingAllowed:true},
    UnitSelection:{onRaise:{on:f=>raised.add(f),off:f=>raised.delete(f)}},
    UnitActionHandlers:handlers, WorldInput:world, OVERLAY_PRIORITY:{PLOT_HIGHLIGHT:4},
    WorldUI:{createOverlayGroup:()=>({reset(){state.markers=[];},destroy(){state.markers=[];},addPlotOverlay:()=>({addPlots:plots=>state.markers.push(...plots)})})},
    UI:{Player:{getHeadSelectedUnit:()=>state.head}},
    Units:{get:id=>state.units.get(id?.id),getReachableTargets:()=>state.reachable},
    Armies:{get:()=>({getUnitIds:()=>state.members})},
    Players:{get:()=>({Diplomacy:{isAtWarWith:()=>state.atWar},Units:{getUnitIds:()=>[...state.units.values()].filter(u=>u.owner===0).map(u=>u.id)}})},
    MapUnits:{getUnits:x=>state.atPlot.get(x)??[]},
    MapCities:{getDistrict:()=>state.districtOwner!==null?{}:null},
    Districts:{get:()=>({owner:state.districtOwner})},
    GameplayMap:{getLocationFromIndex:x=>({x,y:0}),getIndexFromLocation:p=>p.x,getPlotDistance:(x,y,a,b)=>Math.abs(x-a)+Math.abs(y-b),getRevealedState:()=>state.visible?1:0},
    RevealedStates:{VISIBLE:1}, GameContext:{localPlayerID:0,localObserverID:0},
    Game:{UnitCommands:api('command',state.commands),UnitOperations:api('operation',state.operations)},
    document:{querySelector:()=>state.settingsOpen?{}:null,createElement:()=>({style:{},remove(){},set textContent(value){state.notices.push(value);}}),body:{appendChild(){}}},
    engine:{whenReady:Promise.resolve(),on:(n,f)=>{if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(f);},off:(n,f)=>listeners.get(n)?.delete(f)},
    window:{requestAnimationFrame:f=>{frames.set(++serial,f);return serial;},cancelAnimationFrame:n=>frames.delete(n),addEventListener:(n,f)=>{if(!windowListeners.has(n))windowListeners.set(n,new Set());windowListeners.get(n).add(f);},removeEventListener:(n,f)=>windowListeners.get(n)?.delete(f)}
  });
  vm.runInContext(source,context); await Promise.resolve();
  state.settings={getConfig:()=>context.__civ7WarControls.config,save(value){createSettingsStore(context.localStorage).save(value);windowListeners.get('war-controls-settings-applied')?.forEach(f=>f());}};
  const emit=(name,arg)=>listeners.get(name)?.forEach(f=>f(arg));
  const flush=()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(f=>f());};
  const select=(selected=id)=>{state.head=selected;emit('UnitSelectionChanged',{unit:selected,selected:true});raised.forEach(f=>f(selected));flush();};
  const unpack=()=>{unit.armyId={owner:-1,id:-1,type:0};unit.location={x:0,y:0};state.members=[];};
  const device=gamepad=>{state.gamepad=gamepad;windowListeners.get('active-device-type-changed')?.forEach(f=>f());flush();};
  function confirmTarget(args) {
    if(state.focus==='move') return world.requestMoveOperation(state.head,args);
    if(state.focus==='disabled-add') return;
    const type = state.mode==='INTERFACEMODE_ADD_TO_ARMY' ? ADD : state.mode==='INTERFACEMODE_REMOVE_FROM_ARMY' ? REMOVE : null;
    if(type) context.Game.UnitCommands.sendRequest(state.head,type,args);
  }
  const emitWindow=(name,event)=>windowListeners.get(name)?.forEach(f=>f(event));
  return {id,state,context,emit,emitWindow,flush,select,unpack,world,handlers,listeners,raised,device,panel,confirmTarget};
}
