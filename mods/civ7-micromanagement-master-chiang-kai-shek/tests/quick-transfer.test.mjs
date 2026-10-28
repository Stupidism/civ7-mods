import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,ADD,REMOVE} from './game-fixture.mjs';
async function setup(gamepad=false) {
  const f=await fixture();f.unpack();f.device(gamepad);
  const {context:c,state:s}=f;
  s.definitions.set('ARCHER',{CoreClass:'CORE_CLASS_RANGED',Domain:'DOMAIN_LAND'});
  c.GameInfo.UnitAbilities={lookup:()=>({$hash:55})};s.commander.getAbilityCount=()=>1;
  c.GameInfo.Terrains={lookup:()=>({Impassable:false,Water:false})};c.GameInfo.Features={lookup:()=>undefined};
  Object.assign(c.GameplayMap,{getTerrainType:()=>2,getFeatureType:()=>-1,getDirectionToPlot:(a,b)=>b.x>a.x?0:3});
  c.Units.getPathTo=(_id,p)=>({plots:[0,1,p.x],obstacles:[]});
  s.commands.set(ADD,{Success:true,Plots:[1]});s.commands.set(REMOVE,{Success:true,Plots:[2]});
  const h={Context:{UnitID:f.id},selectPlot(p){c.Game.UnitCommands.sendRequest(f.id,ADD,{X:p.x,Y:p.y});},decorateHover(){}};
  c.InterfaceMode.addHandler('INTERFACEMODE_ADD_TO_ARMY',h);
  s.unit.Movement.movementMovesRemaining=2;
  f.select();
  function joined(){s.unit.armyId=s.commander.armyId;s.unit.location={x:-9999,y:-9999};s.members=[f.id];s.unit.Movement.movementMovesRemaining--;f.emit('UnitAddedToArmy',{initiatingUnit:s.commander.id,secondaryUnit:f.id});}
  function deployed(){s.unit.armyId={owner:-1,id:-1,type:0};s.unit.location={x:2,y:0};s.members=[];f.emit('UnitRemovedFromArmy',{initiatingUnit:s.commander.id,secondaryUnit:f.id});}
  return {f,c,s,h,click:()=>h.selectPlot({x:2,y:0}),joined,deployed};
}
for(const gamepad of [false,true])test(`quick transfer ${gamepad?'controller':'mouse'}: preview, hover, join confirmation, deploy, keep transferred unit`,async()=>{
  const {f,s,h,click,joined,deployed}=await setup(gamepad);
  assert.deepEqual(Array.from(s.transferOverlays[0].plots),[2]);assert.equal(s.requests.length,0);
  h.decorateHover({x:2,y:0});assert.equal(s.transferArrows.length,4);
  assert.equal(s.transferArrows.at(-1)[3].constants.turn,1);assert.equal(s.requests.length,0);
  click();assert.deepEqual(s.requests.map(r=>r.type),[ADD]);f.tick(220);assert.equal(s.requests.length,1);
  joined();f.flush();assert.deepEqual(s.requests.map(r=>r.type),[ADD,REMOVE]);
  assert.deepEqual({...s.requests[1].args},{X:2,Y:0});assert.equal(s.selections.length,0);
  deployed();f.tick(220);assert.equal(s.head.id,7);assert.equal(s.unit.Movement.movementMovesRemaining,1);
  assert.equal(s.selections.length,1);assert.equal(s.requests.length,2);
});
for(const condition of ['no-ability','no-moves','packed','water','mountain','no-path','too-long-path','prevent-unpack','occupied','hidden','naval','option-off','join-off','far-commander'])test(`quick transfer refuses ${condition}`,async()=>{
  const {f,c,s}=await setup();
  if(condition==='no-ability')s.commander.getAbilityCount=()=>0;
  if(condition==='no-moves')s.unit.Movement.movementMovesRemaining=0;
  if(condition==='packed'){s.unit.armyId=s.commander.armyId;s.members=[f.id];}
  if(condition==='water')c.GameInfo.Terrains.lookup=()=>({Water:true});
  if(condition==='mountain')c.GameInfo.Terrains.lookup=()=>({Impassable:true});
  if(condition==='no-path')c.Units.getPathTo=()=>({plots:[]});
  if(condition==='obstacle')c.Units.getPathTo=()=>({plots:[0,1,2],obstacles:[1]});
  if(condition==='too-long-path')c.Units.getPathTo=()=>({plots:[0,3,4,1,2],obstacles:[]});
  if(condition==='prevent-unpack')c.GameInfo.Features.lookup=()=>({PreventUnpack:true});
  if(condition==='occupied')s.atPlot.set(2,[{owner:0,id:9,type:26}]);
  if(condition==='hidden')s.visible=false;
  if(condition==='naval')s.definitions.set('ARCHER',{Domain:'DOMAIN_SEA'});
  if(condition==='option-off'||condition==='join-off') {const config=s.settings.getConfig();config.mouse[condition==='option-off'?'quickTransfer':'autoJoin']=false;s.settings.save(config);}
  if(condition==='far-commander'){s.unit.location={x:8,y:0};}
  f.emit('UnitSelectionChanged',{unit:f.id,selected:false});s.mode='INTERFACEMODE_UNIT_SELECTED';
  f.select();assert.equal(s.transferOverlays.length,0);assert.equal(s.requests.length,0);
});
for(const condition of ['occupied','rejected','removed-commander','moved-commander','changed-army','lost-ability','world-locked','settings','turn-changed'])test(`after joining recheck ${condition}`,async()=>{
  const {f,c,s,click,joined}=await setup();click();joined();
  if(condition==='occupied')s.atPlot.set(2,[{owner:1,id:90,type:26}]);
  if(condition==='rejected')s.commands.set(REMOVE,{Success:false});
  if(condition==='removed-commander')s.units.delete(1);
  if(condition==='moved-commander')s.commander.location={x:5,y:0};
  if(condition==='changed-army')s.unit.armyId={owner:0,id:77,type:29};
  if(condition==='lost-ability')s.commander.getAbilityCount=()=>0;
  if(condition==='world-locked')s.allowed=false;
  if(condition==='settings')s.settingsOpen=true;
  if(condition==='turn-changed')c.Game.turn=100;
  f.flush();assert.deepEqual(s.requests.map(r=>r.type),[ADD]);
});
for(const condition of ['cancel','other-unit','other-order','blur','unload','timeout','wrong-event'])test(`pending quick transfer stops on ${condition}`,async()=>{
  const {f,c,s,click,joined}=await setup();click();
  if(condition==='cancel')f.emitWindow('engine-input',{isCancelInput:()=>true});
  if(condition==='other-unit')f.emit('UnitSelectionChanged',{selected:true,unit:{owner:0,id:8,type:26}});
  if(condition==='other-order')c.Game.UnitOperations.sendRequest(f.id,'OTHER',{});
  if(condition==='blur')f.emitWindow('blur',{});
  if(condition==='unload')f.emit('BeforeUnload');
  if(condition==='timeout')f.tick(10000);
  if(condition==='wrong-event'){f.emit('UnitAddedToArmy',{initiatingUnit:s.commander.id,secondaryUnit:{owner:0,id:8,type:26}});f.flush();}
  else{joined();f.flush();}
  assert.equal(s.requests.filter(r=>r.type===REMOVE).length,0);
});
test('moving hover off a transfer clears the arrow without changing membership',async()=>{
  const {s,h}=await setup();h.decorateHover({x:2,y:0});h.decorateHover({x:9,y:0});assert.equal(s.transferArrows.length,0);assert.equal(s.requests.length,0);
});
test('duplicate completion cannot issue a second deployment',async()=>{
  const {f,s,click,joined}=await setup();click();joined();joined();f.flush();assert.equal(s.requests.filter(r=>r.type===REMOVE).length,1);
});

test('native path obstacles at an intermediate plot do not hide a reachable transfer',async()=>{const {f,c,s}=await setup();c.Units.getPathTo=()=>({plots:[0,1,2],turns:[1,1,2],obstacles:[1]});f.select();assert.equal(s.transferOverlays[0].plots[0],2);});
test('last movement point can join and deploy without creating a continuous-deployment ticket',async()=>{
  const {f,s,click,joined,deployed}=await setup();s.unit.Movement.movementMovesRemaining=1;
  click();joined();f.flush();deployed();f.tick(220);
  assert.equal(s.unit.Movement.movementMovesRemaining,0);assert.equal(s.head.id,7);assert.equal(s.requests.length,2);
});
test('native join rejection stops before deployment',async()=>{
  const {f,c,s,click,joined}=await setup();const original=c.Game.UnitCommands.sendRequest;
  c.Game.UnitCommands.sendRequest=function(...args){original.apply(this,args);return false;};
  click();joined();f.flush();assert.equal(s.requests.filter(r=>r.type===REMOVE).length,0);assert.ok(s.notices.length);
});
test('rejected deployment is not retried',async()=>{
  const {f,c,s,click,joined}=await setup();const original=c.Game.UnitCommands.sendRequest;
  c.Game.UnitCommands.sendRequest=function(...args){original.apply(this,args);return args[1]!==REMOVE;};
  click();joined();f.flush();joined();f.flush();f.tick(10000);
  assert.equal(s.requests.filter(r=>r.type===REMOVE).length,1);assert.ok(s.notices.length);
});
test('click rechecks occupancy and switches friendly unit instead of transferring',async()=>{
  const {f,s,h}=await setup();const other={...s.unit,id:{owner:0,id:8,type:26},location:{x:2,y:0}};s.units.set(8,other);s.atPlot.set(2,[other.id]);
  h.selectPlot({x:2,y:0});assert.equal(s.head.id,8);assert.equal(s.requests.length,0);
});
