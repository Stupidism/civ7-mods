import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { fixture, REMOVE } from './game-fixture.mjs';

const nativePath = (process.env.CIV7_MODULES_DIR ?? `${homedir()}/Library/Application Support/Steam/steamapps/common/Sid Meier's Civilization VII/CivilizationVII.app/Contents/Resources/Base/modules`) + '/base-standard/ui/army-panel/army-panel.js';
let nativeArmyPanelSource;
try { nativeArmyPanelSource = await readFile(nativePath, 'utf8'); }
catch(error) { if(error.code !== 'ENOENT') throw error; }

function addPacked(f,id,extra={}) {
  const unit={...f.state.unit,id:{...f.id,id},...extra};
  f.state.units.set(id,unit);f.state.members.push(unit.id);return unit;
}
function portraits(f) {
  return Array.from(f.armyPanel.armyButtons,b=>b.getAttribute('data-war-controls-unit')).filter(Boolean);
}
const keys=ids=>ids.map(id=>`${id.owner};${id.id};${id.type}`);
function deploy(f,id) {
  f.context.Game.UnitCommands.sendRequest(id,REMOVE,{X:2,Y:0});
  // The panel model can still contain the old snapshot when the army event
  // fires. Selecting another packed soldier does not rebuild that model.
  f.emit('UnitRemovedFromArmy',{initiatingUnit:id});
  const unit=f.state.units.get(id.id);
  unit.armyId={owner:-1,id:-1,type:0};unit.location={x:2,y:0};
  f.state.members=f.state.members.filter(member=>member.id!==id.id);
  f.tick();f.flush();
}

for(const native of [false,true]) test(`packed portraits shrink 3→2→1→0 and highlight the next unit${native?' (installed native panel)':''}`, {skip:native&&!nativeArmyPanelSource}, async()=>{
  const f=await fixture(undefined,native?{nativeArmyPanelSource}:{});
  const second=addPacked(f,8),third=addPacked(f,9);
  f.showArmy();assert.equal(portraits(f).length,3);
  for(const id of [f.id,second.id,third.id]) {
    deploy(f,id);
    assert.deepEqual(portraits(f),keys(f.state.members));
    if(f.state.members.length) {
      assert.equal(f.state.head.id,f.state.members[0].id);
      const selected=f.armyPanel.armyButtons.filter(b=>b.getAttribute('aria-pressed')==='true');
      assert.equal(selected.length,1);
      assert.equal(selected[0].getAttribute('data-war-controls-unit'),keys([f.state.head])[0]);
    }
  }
  assert.equal(f.state.errors.length,0);
});

test('portrait refresh works with both deployment selection switches disabled',async()=>{
  const f=await fixture({mouse:{keepCommanderFocus:false,nextDeployable:false}});
  const next=addPacked(f,8);f.showArmy();deploy(f,f.id);
  assert.deepEqual(portraits(f),keys([next.id]));
  assert.equal(f.state.selections.length,0);
});

test('reopening the panel refreshes cached portraits without an army event',async()=>{
  const f=await fixture();const next=addPacked(f,8);f.showArmy();
  f.state.members=[next.id];f.select(next.id);
  assert.deepEqual(portraits(f),keys([next.id]));
});

test('the deferred refresh catches army data that arrives after the first frame',async()=>{
  const f=await fixture({mouse:{keepCommanderFocus:false,nextDeployable:false}});
  const next=addPacked(f,8);f.showArmy();
  f.emit('UnitRemovedFromArmy',{initiatingUnit:f.id});f.flush();
  assert.equal(portraits(f).length,2);
  f.state.members=[next.id];f.tick();f.flush();
  assert.deepEqual(portraits(f),keys([next.id]));
});

test('refresh keeps civilians, scouts and spent units visible while selecting only a ready soldier',async()=>{
  const f=await fixture();
  f.state.definitions.set('SCOUT',{CoreClass:'CORE_CLASS_RECON'});
  addPacked(f,8,{Combat:{isCombat:false}});addPacked(f,9,{type:'SCOUT'});
  addPacked(f,10,{Movement:{movementMovesRemaining:0}});addPacked(f,11);
  f.showArmy();deploy(f,f.id);
  assert.deepEqual(portraits(f),keys(f.state.members));assert.equal(portraits(f).length,4);
  assert.equal(f.state.head.id,11);
});

test('portrait reconciliation never steals a deliberate selection during deployment',async()=>{
  const f=await fixture();addPacked(f,8);f.showArmy();
  f.context.Game.UnitCommands.sendRequest(f.id,REMOVE,{X:2,Y:0});
  f.emit('UnitRemovedFromArmy',{initiatingUnit:f.id});f.state.members=f.state.members.slice(1);
  const other={...f.state.unit,id:{...f.id,id:20},armyId:{owner:-1,id:-1,type:0},location:{x:8,y:8}};
  f.state.units.set(20,other);f.select(other.id);f.tick();f.flush();
  assert.equal(f.state.head.id,20);assert.equal(f.state.selections.length,0);
});

test('detached panels are not redrawn by delayed army events',async()=>{
  const f=await fixture();addPacked(f,8);f.showArmy();
  f.emit('UnitRemovedFromArmy',{initiatingUnit:f.id});
  f.armyPanel.onDetach();f.armyPanel.updateArmyPanel=()=>assert.fail('redrew detached panel');
  f.state.members=[];f.tick();f.flush();
});

test('unloading cancels delayed roster mutation and restores the native render method',async()=>{
  const f=await fixture();addPacked(f,8);f.showArmy();
  f.emit('UnitRemovedFromArmy',{initiatingUnit:f.id});f.context.__civ7WarControls.dispose();
  f.state.members=[];f.tick();f.flush();f.armyPanel.setupArmy();
  assert.equal(f.context.CommanderInteract.currentArmyCommander.packedUnits.length,2);
});

test('empty native slots are never highlighted when no unit is selected', {skip:!nativeArmyPanelSource},async()=>{
  const f=await fixture(undefined,{nativeArmyPanelSource});f.showArmy();
  f.state.head={owner:-1,id:-1,type:0};f.emit('UnitSelectionChanged',{unit:f.state.head,selected:false});f.flush();
  assert.equal(f.armyPanel.armyButtons.filter(b=>b.getAttribute('aria-pressed')==='true').length,0);
});
