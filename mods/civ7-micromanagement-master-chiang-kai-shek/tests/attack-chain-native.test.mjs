import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {fixture, ATTACK} from './game-fixture.mjs';

const root = process.env.CIV7_MODULES_DIR ?? `${homedir()}/Library/Application Support/Steam/steamapps/common/Sid Meier's Civilization VII/CivilizationVII.app/Contents/Resources/Base/modules`;
test('switching units without an attack never starts continuous selection',async()=>{
  const f=await fixture();f.unpack();
  const other={...f.state.unit,id:{...f.id,id:8},location:{x:3,y:0}};
  f.state.units.set(8,other);
  f.state.operations.set(ATTACK,{Success:true,Plots:[5],Modifiers:[1]});
  f.state.atPlot.set(5,[{owner:1,id:90,type:26}]);f.state.reachable=[5];
  f.select();f.tick();f.select(other.id);f.tick();
  f.emit('UnitOperationDeactivated',{unit:f.id,data1:0});
  f.emit('UnitOperationDeactivated',{unit:other.id,data1:0});f.tick();f.flush();
  assert.equal(f.state.head.id,other.id.id);
  assert.equal(f.state.selections.length,0);
  assert.equal(f.state.requests.length,0);
});

test('select-to-attack is independent from continuous attack selection',async()=>{
  const f=await fixture({mouse:{nextRanged:false,autoAttack:true}});f.unpack();
  f.state.operations.set(ATTACK,{Success:true,Plots:[5],Modifiers:[1]});
  f.state.atPlot.set(5,[{owner:1,id:90,type:26}]);f.state.reachable=[5];
  f.select();f.tick();f.flush();
  assert.equal(f.state.mode,'INTERFACEMODE_RANGE_ATTACK');
  assert.equal(f.state.requests.length,0);
  assert.equal(f.state.selections.length,0);
});
let sources;
try {
  sources = await Promise.all(['choose-plot','ranged-attack','default'].map(name=>readFile(`${root}/base-standard/ui/interface-modes/interface-mode-${name}.js`,'utf8')));
} catch(error) { if(error.code !== 'ENOENT') throw error; }

// Native game source is read locally, never bundled. Numeric values are fixture
// tokens, not a claim about a particular engine build's enum values.
for (const operation of [ATTACK, 701]) for(const scenario of ['next','disabled','cancel','manual selection','no combat','unrelated combat','combat after deactivation']) test(`native left-click attack: ${scenario} (operation ${operation})`, {skip:!sources}, async()=>{
  const f=await fixture({mouse:{nextRanged:scenario!=='disabled'}},{unitOperationTypes:{RANGE_ATTACK:operation,NAVAL_ATTACK:702}});f.unpack();
  const next={...f.state.unit,id:{...f.id,id:8},location:{x:3,y:0},Combat:{isCombat:true,attacksRemaining:1}};
  f.state.units.set(8,next);
  f.state.operations.set(ATTACK,{Success:true,Plots:[5],Modifiers:[1]});
  f.state.operations.set(operation,{Success:true,Plots:[5],Modifiers:[1]});
  f.state.atPlot.set(5,[{owner:1,id:90,type:26}]);f.state.reachable=[5];
  Object.assign(f.context, {
    Audio:{getSoundTag:()=>'',playSound(){}},
    HighlightColors:{}, LensManager:{setActiveLens(){}},
    FocusManager:{get:()=>({clearFocus(){}})},
    CustomEvent:class {constructor(type){this.type=type;}}
  });
  f.context.UI.sendAudioEvent=()=>{};
  f.context.UI.Player.deselectAllUnits=()=>{f.state.head=null;f.emit('UnitSelectionChanged',{unit:f.id,selected:false});};
  f.context.UI.Player.deselectAllCities=()=>{};
  f.context.window.dispatchEvent=()=>{};
  for(const source of sources) vm.runInContext(source.replace(/^import .+;\r?\n/gm,'').replace(/^export .+;\r?\n/gm,''),f.context);
  const handler=f.nativeModes.get('INTERFACEMODE_RANGE_ATTACK');
  handler._context={UnitID:f.id};
  f.context.InterfaceMode.switchToDefault=()=>{
    f.state.mode='INTERFACEMODE_DEFAULT';
    f.nativeModes.get('INTERFACEMODE_DEFAULT').transitionTo();
  };
  f.select();f.tick();f.flush();
  handler.selectPlot({x:5,y:0});
  assert.equal(f.state.requests.length,1);
  assert.equal(f.state.head,null);
  f.tick();f.flush();
  assert.equal(f.state.head,null,'must wait for completion, not an animation timer');
  f.emit('UnitOperationDeactivated',{unit:next.id,data1:0});f.tick();f.flush();
  assert.equal(f.state.head,null,'another unit completing is not this attack');
  if(scenario==='cancel') f.emitWindow('engine-input',{isCancelInput:()=>true});
  if(scenario==='manual selection') {
    const other={...next,id:{...f.id,id:9}};f.state.units.set(9,other);f.select(other.id);
  }
  if(!['no combat','unrelated combat','combat after deactivation'].includes(scenario)) f.emit('Combat',{attacker:f.id});
  if(scenario==='unrelated combat') f.emit('Combat',{attacker:next.id});
  if(!['no combat','unrelated combat'].includes(scenario)) f.state.unit.Combat.attacksRemaining=0;
  f.emit('UnitOperationDeactivated',{unit:f.id,data1:0});f.tick();f.flush();
  if(scenario==='combat after deactivation') {
    assert.equal(f.state.head,null,'operation end alone is not evidence of combat');
    f.emit('Combat',{attacker:f.id});f.tick();f.flush();
  }
  assert.equal(f.state.head?.id,['next','combat after deactivation'].includes(scenario)?next.id.id:scenario==='manual selection'?9:undefined);
  assert.equal(f.state.requests.length,1,'selection must never send another attack');
});
