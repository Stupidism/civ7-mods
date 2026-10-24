import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture, ADD, REINFORCE} from './game-fixture.mjs';

test('a lone commander tile keeps ordinary right-click movement', async()=>{
 const f=await fixture(); f.unpack(); f.state.commands.set(ADD,{Success:true,Plots:[1]});
 assert.equal(f.world.actionMouseRightButton({X:1,Y:0}),'native-move');
 assert.equal(f.state.requests.length,0);
});
test('two owned commanders never auto reinforce even when only the distant one is eligible', async()=>{
 const f=await fixture(); f.unpack();
 f.state.units.set(2,{...f.state.commander,id:{owner:0,id:2,type:26},location:{x:0,y:0}});
 f.state.operations.set(REINFORCE,{Success:true,Plots:[1]});
 f.handlers.switchToActionInterfaceMode(REINFORCE,{UnitID:f.id});
 assert.equal(f.state.requests.length,0);
 assert.equal(f.state.modes[0].type,REINFORCE);
});
