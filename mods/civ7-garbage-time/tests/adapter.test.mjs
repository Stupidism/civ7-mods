import test from 'node:test';import assert from 'node:assert/strict';import {createGameAdapter} from '../ui/game-adapter.js';
function fixture(){
  const sent=[];const city={id:{owner:0,id:1},location:{x:2,y:0},getPurchasedPlots:()=>[2,3],Workers:{GetAllPlacementInfo:()=>[]},Yields:{calculateAllBuildingsPlacements:()=>({buildings:[{constructibleType:99,placements:[{plotID:3,yieldChanges:[1,2,3,4,5,-2]}]}]})}};
  const player={id:0,isTurnActive:true,Cities:{getCities:()=>[city]},Diplomacy:{isAtWarWith:()=>false},Units:{getUnits:()=>[]},Techs:{getTreeType:()=>1,getTurnsForNode:()=>3}};
  const g={Game:{turn:1,age:1,getHash:x=>x,UnitOperations:{canStart:()=>({Success:true}),sendRequest:(...a)=>sent.push(a)},CityCommands:{canStart:()=>({Success:true,Plots:[3],ConstructibleTypes:[99]}),sendRequest:(...a)=>sent.push(a)},PlayerOperations:{canStart:()=>({Success:true}),sendRequest:(...a)=>sent.push(a)},ProgressionTrees:{getTree:()=>({nodes:[]})}},GameContext:{localPlayerID:0},Players:{get:()=>player},Cities:{},Units:{getPathTo:()=>({plots:[0,1,2],turns:[0,1,1]}),getQueuedOperationDestination:()=>null},MapUnits:{getUnits:()=>[]},GameplayMap:{getLocationFromIndex:i=>({x:i,y:0}),getIndexFromLocation:p=>p.x},GameInfo:{Yields:{lookup:type=>({$index:['YIELD_GOLD','YIELD_FOOD','YIELD_SCIENCE','YIELD_CULTURE','YIELD_PRODUCTION','YIELD_HAPPINESS'].indexOf(type)})},Units:{lookup:()=>({CoreClass:'CORE_CLASS_MILITARY',UnitType:'UNIT_ARCHER'})},Constructibles:{}},Configuration:{getGame:()=>({isAnyMultiplayer:false})},CityCommandTypes:{EXPAND:1},PlayerOperationTypes:{ASSIGN_WORKER:2,SET_TECH_TREE_NODE:3},UnitOperationMoveModifiers:{NONE:0},ProgressionTreeNodeState:{NODE_STATE_CLOSED:1,NODE_STATE_INVALID:0,NODE_STATE_FULLY_UNLOCKED:5,NODE_STATE_IN_PROGRESS:3}};
  const unit={id:{owner:0,id:2},location:{x:0,y:0},Movement:{movementMovesRemaining:2}};return {g,city,unit,sent,a:createGameAdapter(g)};
}
test('native route uses plot index arrays and verifies destination',()=>{const f=fixture();assert.equal(f.a.routeToCities(f.unit,[f.city],false).plot,2);f.g.Units.getPathTo=()=>({plots:[0,1]});assert.equal(f.a.routeToCities(f.unit,[f.city],false),null);});
test('military already inside target settlement stays on its occupied plot',()=>{const f=fixture();f.unit.location={x:3,y:0};assert.equal(f.a.routeToCities(f.unit,[f.city],true).plot,3);});
test('growth previews map constructible row index to hash and yields by database index',()=>{const f=fixture();f.g.GameInfo.Constructibles[99]={$hash:99};const c=f.a.growthCandidates(f.city)[0];assert.deepEqual(c.delta,{gold:1,food:2,science:3,culture:4,production:5,happiness:-2});});
test('specialist score subtracts additional food/happiness upkeep',()=>{const f=fixture();f.city.Workers.GetAllPlacementInfo=()=>[{PlotIndex:4,NumWorkers:0,MaxWorkers:2,CurrentYields:[0,0,0,0,0,0],NextYields:[0,0,2,2,0,0],CurrentMaintenance:[0,0,0,0,0,0],NextMaintenance:[0,2,0,0,0,2]}];const c=f.a.growthCandidates(f.city).find(c=>c.kind==='worker');assert.equal(c.delta.happiness,-2);assert.equal(c.delta.food,-2);assert.equal(c.delta.science,2);});
test('hostile units invalidate a movement path',()=>{const f=fixture();f.g.MapUnits.getUnits=()=>[{owner:2}];f.g.Players.get().Diplomacy.isAtWarWith=()=>true;assert.equal(f.a.routeToCities(f.unit,[f.city],false),null);});
test('queued destination does not receive another move request',()=>{const f=fixture();f.g.Units.getQueuedOperationDestination=()=>({x:2,y:0});const r=f.a.routeToCities(f.unit,[f.city],false);f.a.move(f.unit,r);assert.equal(f.sent.length,0);});
test('movement arguments never include attack or swap',()=>{const f=fixture();const r=f.a.routeToCities(f.unit,[f.city],false);f.a.move(f.unit,r);assert.equal(f.sent[0][1],'UNITOPERATION_MOVE_TO');assert.equal(f.sent[0][2].Modifiers,0);});
test('treasure and religious units are excluded from military scheduling',()=>{const f=fixture();f.g.GameInfo.Units.lookup=()=>({UnitType:'UNIT_TREASURE_FLEET',CoreClass:'CORE_CLASS_SUPPORT'});assert.equal(f.a.classify(f.unit),'treasure');f.g.GameInfo.Units.lookup=()=>({UnitType:'UNIT_KAHUNA',SpreadCharges:3});assert.equal(f.a.classify(f.unit),'religion');});

function treasureFixture(){
  const f=fixture();f.unit.location={...f.city.location};f.unit.getDisbandBaseAmount=()=>3;
  f.unit.Movement.movementMovesRemaining=0;
  f.g.GameInfo.Units.lookup=()=>({UnitType:'UNIT_TREASURE_FLEET'});
  f.g.Players.get().isDistantLands=()=>false;
  f.g.Game.UnitCommands={canStart:()=>({Success:true}),sendRequest:(...args)=>f.sent.push(args)};
  return f;
}
test('loaded treasure at an owned homeland settlement uses native unload, even without moves',()=>{
  const f=treasureFixture();assert.equal(f.a.canRedeemTreasure(f.unit),true);
  assert.equal(f.a.redeemTreasure(f.unit),true);
  assert.deepEqual(f.sent,[[f.unit.id,'UNITCOMMAND_DISBAND',{}]]);
});
test('unload is never sent for ordinary, foreign, empty, distant, or travelling units',()=>{
  const cases=[
    f=>f.g.GameInfo.Units.lookup=()=>({UnitType:'UNIT_ARCHER'}),
    f=>f.unit.id.owner=1,
    f=>f.unit.getDisbandBaseAmount=()=>0,
    f=>f.g.Players.get().isDistantLands=()=>true,
    f=>f.unit.location={x:9,y:0},
    f=>f.g.Players.get().Cities.getCities=()=>[],
    f=>f.g.Game.UnitCommands.canStart=()=>({Success:false})
  ];
  for(const change of cases){const f=treasureFixture();change(f);assert.equal(f.a.canRedeemTreasure(f.unit),false);assert.equal(f.a.redeemTreasure(f.unit),false);assert.deepEqual(f.sent,[]);}
});
test('unload rechecks native legality immediately before sending',()=>{
  const f=treasureFixture();assert.equal(f.a.canRedeemTreasure(f.unit),true);
  f.g.Game.UnitCommands.canStart=()=>({Success:false});
  assert.equal(f.a.redeemTreasure(f.unit),false);assert.deepEqual(f.sent,[]);
});
test('treasure can unload on owned settlement territory outside the center',()=>{
  const f=treasureFixture();f.unit.location={x:3,y:0};assert.equal(f.a.redeemTreasure(f.unit),true);
});
test('empty foreign districts cannot be captured by a return order',()=>{const f=fixture();f.unit.isCombat=true;f.g.MapCities={getDistrict:()=>({owner:2,id:7})};f.g.Districts={get:()=>({owner:2})};assert.equal(f.a.routeToCities(f.unit,[f.city],false),null);});
test('cancel only applies to the exact destination issued by this mod',()=>{const f=fixture();let cancels=0;f.g.Game.UnitCommands={canStart:()=>({Success:true}),sendRequest:()=>cancels++};f.g.Units.getQueuedOperationDestination=()=>({x:2,y:0});f.a.cancelOrder(f.unit,{destination:{x:3,y:0}});assert.equal(cancels,0);f.a.cancelOrder(f.unit,{destination:{x:2,y:0}});assert.equal(cancels,1);});

test('missionary targets unconverted rural district after urban conversion',()=>{const f=fixture();f.g.Players.get().Religion={getReligionType:()=>7};f.unit.Religion={spreadCharges:2,religionType:7};f.city.Religion={urbanReligion:7,ruralReligion:8};f.g.MapCities={getDistrict:x=>({id:x})};f.g.Districts={get:id=>({isUrbanCore:id.id===2})};f.g.Units.getPathTo=(id,loc)=>({plots:[0,loc.x],turns:[0,1]});assert.equal(f.a.routeToReligion(f.unit,[f.city]).plot,3);f.unit.Religion.spreadCharges=0;assert.equal(f.a.routeToReligion(f.unit,[f.city]),null);});

test('military in its destination avoids unnecessary path searches',()=>{const f=fixture();f.unit.location={x:3,y:0};f.g.Units.getPathTo=()=>{throw Error('must not search')};assert.equal(f.a.routeToCities(f.unit,[f.city],true).cost,0);});

test('aircraft use native legal rebasing plots inside the target city',()=>{const f=fixture();f.g.GameInfo.Units.lookup=()=>({Domain:'DOMAIN_AIR'});f.g.Game.UnitOperations.canStart=()=>({Success:true,Plots:[2,9]});f.g.GameplayMap.getPlotDistance=(x,y,tx,ty)=>Math.abs(tx-x);f.unit.Movement.movementMovesRemaining=0;assert.equal(f.a.canMove(f.unit),true);const route=f.a.routeToCities(f.unit,[f.city],true);assert.equal(route.plot,2);assert.equal(route.operation,'UNITOPERATION_REBASE');f.a.move(f.unit,route);assert.equal(f.sent[0][1],'UNITOPERATION_REBASE');});

test('selected research with zero progress is preserved',()=>{const f=fixture();f.g.Players.get().Techs.getResearching=()=>({type:71,progress:0,state:0});assert.equal(f.a.research('technology').active,true);});

test('old partial progress does not block selecting a new research node',()=>{const f=fixture();f.g.Players.get().Techs.getResearching=()=>({type:-1});f.g.Game.ProgressionTrees.getTree=()=>({nodes:[{nodeType:71,state:3,progress:20}]});f.g.GameInfo.ProgressionTreeNodes={lookup:()=>({ProgressionTreeNodeType:'NODE_TEST'})};const result=f.a.research('technology');assert.equal(result.active,false);assert.equal(result.candidates.length,1);});
