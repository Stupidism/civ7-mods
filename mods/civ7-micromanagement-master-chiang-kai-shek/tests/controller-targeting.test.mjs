import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,ADD,REMOVE} from './game-fixture.mjs';

for(const action of [ADD,REMOVE]) test(`controller ${action}: delayed panel animation must not steal target confirmation`,async()=>{
  const f=await fixture(); f.device(true);
  if(action===ADD){f.unpack();f.state.commands.set(ADD,{Success:true,Plots:[1]});}
  f.select();
  f.panel.realizeFocus(); // Native animationComplete after the automatic mode.
  f.confirmTarget({X:1,Y:0});
  assert.equal(f.state.requests.length,1,'target confirmation must send a command');
  assert.equal(f.state.requests[0].type,action);
  assert.equal(f.state.moves.length,0,'controller must not activate the default Move button');
});

test('B cancel restores native button focus without automatically reentering',async()=>{
  const f=await fixture();f.device(true);f.select();
  f.state.mode='INTERFACEMODE_UNIT_SELECTED';f.panel.realizeFocus();
  assert.equal(f.state.focus,'disabled-add');
  f.select();assert.equal(f.state.mode,'INTERFACEMODE_UNIT_SELECTED');
});

test('disabled controller assist retains native panel focus',async()=>{
  const f=await fixture({gamepad:{autoExit:false}});f.device(true);f.select();
  f.panel.realizeFocus();assert.equal(f.state.focus,'disabled-add');
});

test('explicit controller navigation to a button remains usable',async()=>{
  const f=await fixture();f.device(true);f.unpack();f.state.commands.set(ADD,{Success:true,Plots:[1]});f.select();
  f.state.focus='move';f.confirmTarget({X:1,Y:0});
  assert.equal(f.state.moves.length,1);assert.equal(f.state.requests.length,0);
});

test('leaving auto mode retires its focus guard before a manual return',async()=>{
  const f=await fixture();f.device(true);f.select();
  f.state.mode='INTERFACEMODE_UNIT_SELECTED';f.emitWindow('interface-mode-changed',{});
  f.handlers.switchToActionInterfaceMode(REMOVE,{UnitID:f.id});f.panel.realizeFocus();
  assert.equal(f.state.focus,'disabled-add');
});

for(const [name,change] of [
  ['mouse input',f=>f.device(false)],
  ['another selected unit',f=>{f.state.head=f.state.commander.id;}],
  ['modal',f=>{f.state.allowed=false;}],
  ['unload',f=>f.context.__civ7WarControls.dispose()]
])test(`${name} retains native automatic panel focus`,async()=>{
  const f=await fixture();f.device(true);f.select();change(f);f.panel.realizeFocus();
  assert.equal(f.state.focus,'disabled-add');
});
