import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {fixture,ADD,REMOVE,ATTACK} from './game-fixture.mjs';
const root=process.env.CIV7_MODULES_DIR ?? `${homedir()}/Library/Application Support/Steam/steamapps/common/Sid Meier's Civilization VII/CivilizationVII.app/Contents/Resources/Base/modules`;
let sources,worldSource;
try {
  sources=await Promise.all(['choose-plot','add-to-army','remove-from-army','ranged-attack','naval-attack','air-attack','default'].map(n=>readFile(`${root}/base-standard/ui/interface-modes/interface-mode-${n}.js`,'utf8')));
  worldSource=await readFile(`${root}/base-standard/ui/world-input/world-input.js`,'utf8');
} catch(error) {if(error.code!=='ENOENT') throw error;}
const clean=s=>s.replace(/^import .+;\r?\n/gm,'').replace(/^export .+;\r?\n/gm,'');
async function setup(action,gamepad=false) {
  const f=await fixture();if(action!==REMOVE)f.unpack();
  f.device(gamepad);
  Object.assign(f.context,{Audio:{getSoundTag:()=>'',playSound(){}},HighlightColors:{},LensManager:{setActiveLens(){}},
    FocusManager:{get:()=>({clearFocus(){}})},CustomEvent:class{constructor(type){this.type=type;}},
    IsControllerActive:()=>f.state.gamepad,IsTouchActive:()=>false});
  f.context.ViewManager.isWorldSelectingAllowed=true;
  f.context.UI.sendAudioEvent=()=>{};f.context.window.dispatchEvent=()=>true;
  f.context.UI.Player.deselectAllUnits=()=>{const id=f.state.head;f.state.head=null;if(id)f.emit('UnitSelectionChanged',{unit:id,selected:false});};
  f.context.UI.Player.deselectAllCities=()=>{};
  const select=f.context.UI.Player.selectUnit;
  f.context.UI.Player.selectUnit=id=>{f.state.mode='INTERFACEMODE_UNIT_SELECTED';select(id);};
  for(const source of sources) vm.runInContext(clean(source),f.context);
  vm.runInContext(clean(worldSource).split('const WorldInput = new WorldInputSingleton();')[0]+'\nglobalThis.nativeWorld=WorldInputSingleton.prototype;',f.context);
  Object.assign(f.world,{canUnitSelect:true,canCitySelect:false,
    handleSelectedPlot:f.context.nativeWorld.handleSelectedPlot,
    handleSelectedPlotUnit:f.context.nativeWorld.handleSelectedPlotUnit,
    doActionOnPlot(){throw Error('Selection fell through into a controller movement order');}});
  f.context.InterfaceMode.switchToDefault=()=>{
    f.state.mode='INTERFACEMODE_DEFAULT';f.nativeModes.get('INTERFACEMODE_DEFAULT').transitionTo();f.emitWindow('interface-mode-changed',{});
  };
  const enter=f.handlers.switchToActionInterfaceMode;
  f.handlers.switchToActionInterfaceMode=(type,args)=>{
    enter(type,args);const handler=f.nativeModes.get(f.state.mode);
    if(handler){handler._context=args;handler.validPlots?.clear();handler.initialize?.();}
  };
  const valid=action===ADD?1:2;
  if([ADD,REMOVE].includes(action))f.state.commands.set(action,{Success:true,Plots:[valid]});
  else {f.state.operations.set(action,{Success:true,Plots:[valid],Modifiers:[1]});f.state.reachable=[valid];f.state.atPlot.set(valid,[{owner:1,id:90,type:26}]);}
  function add(id,x) {
    const unit={...f.state.unit,id:{...f.id,id},armyId:{owner:-1,id:-1,type:0},location:{x,y:0}};
    f.state.units.set(id,unit);f.state.atPlot.set(x,[unit.id]);return unit;
  }
  f.select();
  const mode='INTERFACEMODE_'+action.replace(/^UNITCOMMAND_|^UNITOPERATION_/,'');
  assert.equal(f.state.mode,mode);
  const handler=f.nativeModes.get(mode);
  const click=x=>handler.selectPlot({x,y:0});
  return {f,add,click,valid,handler};
}
const actions=[ADD,REMOVE,ATTACK,'UNITOPERATION_NAVAL_ATTACK','UNITOPERATION_AIR_ATTACK'];
for(const gamepad of [false,true]) for(const action of actions) {
  test(`${action} ${gamepad?'controller':'mouse'}: click other friendly switches without orders`,{skip:!sources},async()=>{
    const {f,add,click}=await setup(action,gamepad);const next=add(8,8);click(8);
    assert.equal(f.state.head.id,next.id.id);assert.equal(f.state.requests.length,0);assert.equal(f.state.moves.length,0);
  });
  test(`${action} ${gamepad?'controller':'mouse'}: valid original target retains native action`,{skip:!sources},async()=>{
    const {f,click,valid}=await setup(action,gamepad);click(valid);
    assert.equal(f.state.requests.length,1);assert.equal(f.state.requests[0].type,action);
  });
  test(`${action} ${gamepad?'controller':'mouse'}: invalid empty hex cancels without moving`,{skip:!sources},async()=>{
    const {f,click}=await setup(action,gamepad);click(30);
    assert.equal(f.state.mode,'INTERFACEMODE_DEFAULT');assert.equal(f.state.head,null);assert.equal(f.state.requests.length,0);assert.equal(f.state.moves.length,0);
  });
}
for(const gamepad of [false,true]) for(const action of actions) {
  test(`${action} ${gamepad?'controller':'mouse'}: legal target wins over another unit on the tile`, {skip:!sources},async()=>{
    const {f,add,click,valid}=await setup(action,gamepad);
    const occupants=f.state.atPlot.get(valid)??[];
    const other=add(8,valid);
    f.state.atPlot.set(valid,[other.id,...occupants]);
    click(valid);
    assert.equal(f.state.requests.length,1);
    assert.equal(f.state.requests[0].type,action);
    assert.equal(f.state.requests[0].id.id,f.id.id);
    assert.equal(f.state.requests[0].args.X,valid);
    assert.equal(f.state.selections.some(id=>id.id===other.id.id),false);
    assert.equal(f.state.moves.length,0);
  });
  test(`${action} ${gamepad?'controller':'mouse'}: stale legal highlight falls back to unit selection`, {skip:!sources},async()=>{
    const {f,add,click,valid}=await setup(action,gamepad);
    const occupants=f.state.atPlot.get(valid)??[];
    const other=add(8,valid);
    f.state.atPlot.set(valid,[other.id,...occupants]);
    f.state.targetAllowed=false;
    click(valid);
    assert.equal(f.state.head.id,other.id.id);
    assert.equal(f.state.requests.length,0);
    assert.equal(f.state.moves.length,0);
  });
}
test('out-of-range enemy cancels targeting and cannot turn into a move', {skip:!sources},async()=>{
  const {f,click}=await setup(ATTACK,true);f.state.atPlot.set(30,[{owner:1,id:91,type:26}]);click(30);
  assert.equal(f.state.head,null);assert.equal(f.state.requests.length,0);assert.equal(f.state.moves.length,0);
});
test('a stale or blocked ranged target is revalidated before committing', {skip:!sources},async()=>{
  const {f,click,valid}=await setup(ATTACK);f.state.targetAllowed=false;click(valid);assert.equal(f.state.requests.length,0);
});
test('friendly-only tile is not an enemy target despite an attack highlight', {skip:!sources},async()=>{
  const {f,add,click,valid}=await setup(ATTACK);add(8,valid);click(valid);
  assert.equal(f.state.head.id,8);assert.equal(f.state.requests.length,0);
});
test('hidden units cannot be selected via target switching', {skip:!sources},async()=>{
  const {f,add,click}=await setup(ATTACK);add(8,8);f.state.visible=false;f.context.RevealedStates.HIDDEN=0;click(8);
  assert.equal(f.state.head,null);assert.equal(f.state.requests.length,0);
});
for(const blocked of ['settings','world','selection']) test(`switching respects ${blocked} input gate`, {skip:!sources},async()=>{
  const {f,add,click}=await setup(REMOVE);add(8,8);
  if(blocked==='settings') f.state.settingsOpen=true;
  if(blocked==='world') f.state.allowed=false;
  if(blocked==='selection') f.context.ViewManager.isUnitSelectingAllowed=false;
  click(8);assert.equal(f.state.head.id,7);assert.equal(f.state.requests.length,0);
});
test('manual targeting remains native after automatic session cancellation', {skip:!sources},async()=>{
  const {f,click}=await setup(ATTACK);f.emitWindow('engine-input',{isCancelInput:()=>true});click(8);
  assert.equal(f.state.requests.length,1,'native ranged handler is untouched outside automatic session');
});
test('unloading restores mode methods and handler registration', {skip:!sources},async()=>{
  const {f,handler}=await setup(REMOVE);const wrapped=handler.selectPlot;f.emit('BeforeUnload');assert.notEqual(handler.selectPlot,wrapped);
});
test('new unit can immediately auto-target and attack with its own ID', {skip:!sources},async()=>{
  const {f,add,click,handler}=await setup(ATTACK);add(8,3);click(3);
  assert.equal(f.state.head.id,8);assert.equal(f.state.mode,'INTERFACEMODE_RANGE_ATTACK');
  handler.selectPlot({x:2,y:0});assert.equal(f.state.requests.length,1);assert.equal(f.state.requests[0].id.id,8);
});
test('direct switching cancels an already scheduled continuous attack handoff', {skip:!sources},async()=>{
  const {f,add,click}=await setup(ATTACK);add(8,3);add(9,4);
  f.context.Game.UnitOperations.sendRequest(f.id,ATTACK,{X:2,Y:0});
  f.emit('Combat',{attacker:f.id});f.emit('UnitOperationDeactivated',{unit:f.id,data1:0});
  click(3);f.tick();f.flush();assert.equal(f.state.head.id,8);assert.equal(f.state.requests.length,1);
});
test('zero ranged target modifier cannot dispatch a hidden move-and-attack', {skip:!sources},async()=>{
  const {f,click}=await setup(ATTACK);f.state.operations.set(ATTACK,{Success:true,Plots:[2],Modifiers:[0]});click(2);
  assert.equal(f.state.requests.length,0);assert.equal(f.state.moves.length,0);
});
