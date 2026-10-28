import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,ATTACK} from './game-fixture.mjs';

async function setup() {
  const f=await fixture();f.unpack();f.state.unit.location={x:10,y:0};
  f.state.commander.location={x:11,y:0};f.state.atPlot.delete(1);
  f.state.radius=[10,11,12];
  f.state.atPlot.set(20,[{owner:1,id:90,type:26}]);
  f.state.atPlot.set(21,[{owner:1,id:91,type:26}]);
  f.state.definitions.set('SLINGER',{CoreClass:'CORE_CLASS_RANGED'});
  f.state.definitions.set('CATAPULT',{CoreClass:'CORE_CLASS_SIEGE'});
  const targets=new Map([[7,[20]]]);
  f.state.operations.set(ATTACK,(id,args)=>{
    const plots=targets.get(id.id)??[];
    return {Success:args.X===undefined?plots.length>0:plots.includes(args.X),Plots:plots,Modifiers:plots.map(()=>1)};
  });
  function add(id,x,type='ARCHER',plots=[20],extra={}) {
    const unit={...f.state.unit,id:{...f.id,id},location:{x,y:0},type,
      Movement:{movementMovesRemaining:2},Combat:{isCombat:true,attacksRemaining:1},...extra};
    f.state.units.set(id,unit);targets.set(id,plots);return unit;
  }
  // Isolate ranking from unrelated selection UI listeners, which maintain
  // their own overlays. The chain must not enumerate player-wide units.
  f.context.UI.Player.selectUnit=id=>{f.state.head=id;f.state.selections.push(id);};
  const getPlayer=f.context.Players.get;
  f.context.Players.get=(...args)=>({...getPlayer(...args),Units:{getUnitIds(){throw new Error('Global unit scan in attack chaining');}}});
  function begin() {f.context.Game.UnitOperations.sendRequest(f.id,ATTACK,{X:20,Y:0});}
  function finish() {f.state.unit.Combat.attacksRemaining=0;f.emit('Combat',{attacker:f.id});f.emit('UnitOperationDeactivated',{unit:f.id,data1:0});f.tick();return f.state.head.id;}
  return {f,add,begin,finish};
}

test('same target outranks commander, exact type, class and proximity',async()=>{
  const {add,begin,finish}=await setup();add(8,12,'ARCHER',[21]);add(9,13,'CATAPULT');begin();assert.equal(finish(),9);
});
test('same commander outranks exact type and distance',async()=>{
  const {add,begin,finish}=await setup();add(8,9);add(9,12,'CATAPULT');begin();assert.equal(finish(),9);
});
test('exact type outranks class and distance',async()=>{
  const {f,add,begin,finish}=await setup();f.state.radius=[10,11,12,13];add(8,12,'SLINGER');add(9,13);begin();assert.equal(finish(),9);
});
test('same class permits slinger fallback ahead of nearer siege',async()=>{
  const {f,add,begin,finish}=await setup();f.state.radius=[10,11,12,13];add(8,12,'CATAPULT');add(9,13,'SLINGER');begin();assert.equal(finish(),9);
});
test('distance sorts near to far after higher priorities tie',async()=>{
  const {f,add,begin,finish}=await setup();f.state.radius=[10,11,12,13];add(8,13);add(9,12);begin();assert.equal(finish(),9);
});
test('spent, immobile and targetless units cannot win any priority',async()=>{
  const {add,begin,finish}=await setup();add(8,12,'ARCHER',[20],{Movement:{movementMovesRemaining:0}});
  add(9,12,'ARCHER',[20],{Combat:{isCombat:true,attacksRemaining:0}});add(10,12,'ARCHER',[]);
  add(11,13,'CATAPULT',[21]);begin();assert.equal(finish(),11);
});
test('three-hex limit includes boundary and never tests distant unit legality',async()=>{
  const {f,add,begin,finish}=await setup();add(8,14);add(9,13,'CATAPULT',[21]);add(10,200);
  begin();assert.equal(finish(),9);assert.ok(!f.state.queries.some(q=>[8,10].includes(q.id.id)));
});
test('no commander still allows nearby ready units',async()=>{
  const {f,add,begin,finish}=await setup();f.state.units.delete(1);add(8,12);begin();assert.equal(finish(),8);
});
test('dead target replacement does not retain same-unit priority',async()=>{
  const {f,add,begin,finish}=await setup();add(8,13,'CATAPULT');add(9,12,'ARCHER',[21]);
  begin();f.state.atPlot.set(20,[{owner:1,id:92,type:26}]);assert.equal(finish(),9);
});
test('readiness is rechecked after attack completion',async()=>{
  const {add,begin,finish}=await setup();const next=add(8,12);add(9,13,'CATAPULT',[21]);
  begin();next.Movement.movementMovesRemaining=0;assert.equal(finish(),9);
});
