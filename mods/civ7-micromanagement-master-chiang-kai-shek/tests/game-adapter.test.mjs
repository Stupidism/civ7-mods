import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture, ADD,REMOVE,ATTACK,REINFORCE} from './game-fixture.mjs';

test('packed soldier selects individual exit without sending an order',async()=>{const f=await fixture();f.select();assert.equal(f.state.modes[0].type,REMOVE);assert.equal(f.state.requests.length,0);});
for(const [name,mutate] of [
  ['commander cannot automatically unpack entire army',f=>f.state.unit.isCommanderUnit=true],
  ['foreign unit',f=>f.state.unit.owner=1],
  ['unit removed',f=>f.state.units.delete(7)],
  ['stale membership',f=>f.state.members=[]],
  ['rejected exit',f=>f.state.commands.set(REMOVE,{Success:false,Plots:[2]})],
  ['no exit tile',f=>f.state.commands.set(REMOVE,{Success:true,Plots:[]})]
])test(name,async()=>{const f=await fixture();mutate(f);f.select();assert.equal(f.state.modes.length,0);assert.equal(f.state.errors.length,0);});

function enemy(f){f.state.reachable=[3];f.state.atPlot.set(3,[{owner:1,id:90,type:26}]);f.state.operations.set(ATTACK,{Success:true,Plots:[3]});}
test('attack takes precedence over adjacent commander',async()=>{const f=await fixture();f.unpack();enemy(f);f.state.commands.set(ADD,{Success:true,Plots:[1]});f.select();assert.equal(f.state.modes[0].type,ATTACK);assert.equal(f.state.requests.length,0);});
test('no enemy and legal adjacent commander selects Join',async()=>{const f=await fixture();f.unpack();f.state.commands.set(ADD,{Success:true,Plots:[1]});f.select();assert.equal(f.state.modes[0].type,ADD);});
test('same-tile commander also permits Join',async()=>{const f=await fixture();f.unpack();f.state.unit.location.x=1;f.state.commands.set(ADD,{Success:true,Plots:[1]});f.select();assert.equal(f.state.modes[0].type,ADD);});
for(const [name,mutate]of[
  ['hidden enemy',f=>f.state.visible=false],['peaceful unit',f=>f.state.atWar=false],
  ['spent attack',f=>f.state.unit.Combat.attacksRemaining=0],['no movement',f=>f.state.unit.Movement.movementMovesRemaining=0],
  ['blocked shot',f=>f.state.targetAllowed=false]
])test(name+' never enables attack',async()=>{const f=await fixture();f.unpack();enemy(f);mutate(f);f.select();assert.equal(f.state.modes.length,0);});
test('enemy district counts as attack target',async()=>{const f=await fixture();f.unpack();f.state.reachable=[3];f.state.districtOwner=1;f.state.operations.set(ATTACK,{Success:true,Plots:[3]});f.select();assert.equal(f.state.modes[0].type,ATTACK);});
test('reachable melee enemy prevents automatic Join',async()=>{const f=await fixture();f.unpack();enemy(f);f.state.operations.clear();f.state.commands.set(ADD,{Success:true,Plots:[1]});f.select();assert.equal(f.state.modes.length,0);});
test('commander beyond one tile is not an automatic Join target',async()=>{const f=await fixture();f.unpack();f.state.unit.location.x=5;f.state.commands.set(ADD,{Success:true,Plots:[1]});f.select();assert.equal(f.state.modes.length,0);});

test('right-click commander joins instead of native move/swap',async()=>{const f=await fixture();f.unpack();f.state.atPlot.set(1,[f.state.commander.id,{owner:0,id:8,type:26}]);f.state.units.set(8,{...f.state.unit,id:{owner:0,id:8,type:26}});f.state.commands.set(ADD,{Success:true,Plots:[1]});assert.equal(f.world.actionMouseRightButton({X:1,Y:0}),true);assert.equal(f.state.requests[0].type,ADD);assert.equal(f.state.moves.length,0);});

test('target-specific Success cannot authorize a commander outside legal join plots',async()=>{const f=await fixture();f.unpack();f.state.atPlot.set(1,[f.state.commander.id,{owner:0,id:8,type:26}]);f.state.units.set(8,{...f.state.unit,id:{owner:0,id:8,type:26}});f.state.commands.set(ADD,{Success:true,Plots:[2]});f.world.actionMouseRightButton({X:1,Y:0});assert.equal(f.state.requests.length,0);assert.equal(f.state.moves.length,0);assert.equal(f.state.notices.length,1);});
test('illegal join consumes right-click and never swaps',async()=>{const f=await fixture();f.unpack();f.state.atPlot.set(1,[f.state.commander.id,{owner:0,id:8,type:26}]);f.state.units.set(8,{...f.state.unit,id:{owner:0,id:8,type:26}});f.world.actionMouseRightButton({X:1,Y:0});assert.equal(f.state.requests.length,0);assert.equal(f.state.moves.length,0);assert.equal(f.state.notices.length,1);});
test('normal destinations retain native move',async()=>{const f=await fixture();f.unpack();assert.equal(f.world.actionMouseRightButton({X:8,Y:0}),'native-move');assert.equal(f.state.moves.length,1);});
test('explicit movement button is not intercepted',async()=>{const f=await fixture();f.unpack();assert.equal(f.world.requestMoveOperation(f.id,{X:1,Y:0}),'native-move');});

test('one eligible reinforcement commander sends exactly one native order',async()=>{const f=await fixture();f.unpack();f.state.operations.set(REINFORCE,{Success:true,Plots:[1,1]});f.handlers.switchToActionInterfaceMode(REINFORCE,{UnitID:f.id});assert.equal(f.state.requests.length,1);assert.equal(f.state.requests[0].type,REINFORCE);assert.equal(f.state.modes.length,0);});
test('multiple reinforcement commanders retain native target choice',async()=>{const f=await fixture();f.unpack();const other={...f.state.commander,id:{owner:0,id:2,type:26},location:{x:2,y:0}};f.state.units.set(2,other);f.state.atPlot.set(2,[other.id]);f.state.operations.set(REINFORCE,{Success:true,Plots:[1,2]});f.handlers.switchToActionInterfaceMode(REINFORCE,{UnitID:f.id});assert.equal(f.state.requests.length,0);assert.equal(f.state.modes[0].type,REINFORCE);});
test('failed reinforcement validation does not submit',async()=>{const f=await fixture();f.unpack();f.state.operations.set(REINFORCE,{Success:true,Plots:[1]});f.state.targetAllowed=false;f.handlers.switchToActionInterfaceMode(REINFORCE,{UnitID:f.id});assert.equal(f.state.requests.length,0);assert.equal(f.state.modes.length,1);});
test('empty marker follows real membership',async()=>{const f=await fixture();f.flush();assert.equal(f.state.markers.length,0);f.unpack();f.emit('UnitRemovedFromArmy',{});f.flush();assert.deepEqual(f.state.markers,[1]);f.state.members=[f.id];f.emit('UnitAddedToArmy',{});f.flush();assert.equal(f.state.markers.length,0);});
test('reload/unload remove hooks, markers and listeners',async()=>{const f=await fixture();f.context.install();assert.equal(f.listeners.get('UnitSelectionChanged').size,3);assert.equal(f.raised.size,1);f.emit('BeforeUnload');f.unpack();f.world.actionMouseRightButton({X:1,Y:0});assert.equal(f.state.moves.length,1);assert.equal(f.listeners.get('UnitSelectionChanged').size,0);assert.equal(f.raised.size,0);assert.equal(f.state.markers.length,0);});
