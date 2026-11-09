import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {isResourceDamaged,readCardNeeds} from '../ui/card-reminders-runtime.js';
import {snapshot} from '../ui/rp-game-adapter.js';
import {resourcePool} from '../ui/rp-resource-actions.js';

const modelSource=readFileSync(new URL('../ui-next/screens/commerce/commerce-screen-model.js',import.meta.url),'utf8');
function modelFunction(name,next,context) {
  const start=modelSource.indexOf('  function '+name+'(');
  const end=modelSource.indexOf('  function '+next+'(',start);
  assert.ok(start>=0 && end>start);
  return runInNewContext(modelSource.slice(start,end)+';'+name,context);
}

test('损坏副本排除于规划、未分配收益、批量移动和提醒，修复后恢复',()=>{
  const damaged=new Set([5,6]);
  const raw=(value,isOffMap=false)=>({value,isOffMap,uniqueResource:{resource:1}});
  const cityID={owner:0,id:1,type:1}, occupied=[raw(5),raw(7)];
  const city={id:cityID,owner:0,location:{x:0,y:0},originalOwner:0,Trade:{isInTradeNetwork:()=>true},
    Resources:{getAssignedResources:()=>occupied,getAssignedResourcesCap:()=>3},Yields:{getYields:()=>[]}};
  let inventory=[...occupied,raw(6),raw(5,true)];
  const player={Cities:{getCities:()=>[city]},Resources:{getResources:()=>inventory,isResourceAssignmentLocked:()=>false,getUnassignedResourceYieldBonus:()=>2}};
  const info={Yields:[{YieldType:'YIELD_GOLD'}],Resources:{lookup:()=>({ResourceClassType:'RESOURCECLASS_CITY',ResourceType:'R'})}};
  Object.assign(globalThis,{
    GameContext:{localPlayerID:0},Players:{get:()=>player},Cities:{get:()=>city},GameInfo:info,Locale:{compose:x=>x},
    Game:{Resources:{getOriginCity:()=>cityID},PlayerOperations:{canStart:()=>({Success:true})}},
    ProductionKind:{UNIT:1,CONSTRUCTIBLE:2},PlayerOperationTypes:{ASSIGN_RESOURCE:1},
    MapConstructibles:{getHiddenFilteredConstructibles:x=>[x]},Constructibles:{getByComponentID:id=>({damaged:damaged.has(id)})},
    GameplayMap:{getLocationFromIndex:x=>({x,y:0})}
  });
  const slot=r=>({resourceValue:r.value,isOffMap:r.isOffMap,resourceType:'R',resourceProps:{isDamaged:isResourceDamaged(r)}});
  const sections=[{cityResources:[{cityID,slottedResources:occupied.map(slot)}]}];
  const tab={slottedResourceSectionData:sections};
  const model={data:{resourceTabData:tab}};
  const available=modelFunction('populateAvailableResources','populateEmpireResources',{
    localPlayerResources:player.Resources,hasSlottedConnectedResources:true,hasSlottedDisconnectedResources:false,
    Game,Cities,GameInfo:info,getYieldTypes:()=>[],getResourceProps:r=>slot(r).resourceProps,
    createMemo:()=>()=>false,cityIsConnectedToTradeNetwork:()=>true});
  const bonuses=modelFunction('updateUnslottedBonuses','sortSlottedResources',{model,GameInfo:info,GameContext,Players,Database:{makeHash:x=>x},Icon:{getYieldIcon:x=>x}});
  const needs=()=>readCardNeeds({player,playerID:0,kinds:['resources'],info,operations:Game.PlayerOperations,location:GameplayMap.getLocationFromIndex}).resources;
  const slots=()=>Array.from(available(sections)[0].subSections[0].resourceSlotData,r=>[r.resourceValue,r.isOffMap]);
  assert.deepEqual(slots(),[[5,true]]);
  tab.availableResourceSectionData=available(sections);
  bonuses();assert.equal(tab.unslottedBonuses[0].bonusAmount,2);
  assert.equal(needs(),true);
  // Background callers can supply unfiltered pool data.
  tab.availableResourceSectionData=[{subSections:[{resourceSlotData:inventory.map(slot)}]}];
  const catalog=new Map([['R',[{yield:'YIELD_GOLD',kind:'flat',amount:1}]]]);
  const plan=snapshot(model,{},catalog,{assigned:false});
  assert.deepEqual(plan.resources.map(r=>r.key),['off:5']);
  assert.deepEqual(plan.cities[0].assigned.map(r=>r.key),['plot:7']);
  assert.equal(plan.cities[0].capacity,1);
  assert.deepEqual(snapshot(model,{},catalog,{assigned:true}).resources.map(r=>r.key),['plot:7','off:5']);
  assert.deepEqual(resourcePool(tab,{resourceValue:7,cityID}).resources.map(r=>r.resourceValue),[7]);
  inventory=inventory.filter(r=>!r.isOffMap);
  assert.equal(needs(),false);assert.deepEqual(slots(),[]);
  tab.availableResourceSectionData=available(sections);bonuses();assert.equal(tab.unslottedBonuses[0].bonusAmount,0);
  damaged.delete(6);assert.equal(needs(),true);assert.deepEqual(slots(),[[6,false]]);
});
