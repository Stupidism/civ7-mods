import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as planner from '../ui/rp-planner.js';
const source=readFileSync(new URL('../ui/rp-controller.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const city=(key,base)=>({key,preferenceID:key,base,bareBase:base,multiplier:Array(7).fill(1),capacity:2,tags:{}});
test('defaults use bare income, share positive ties, and leave zero/nonfinite types unmarked',()=>{
 const a=city('a',[10,5,0,0,0,0,0]),b=city('b',[5,20,0,0,0,0,0]),c=city('c',[10,0,0,NaN,0,0,0]);
 b.multiplier[0]=100;const before=JSON.stringify([a,b,c]);
 assert.deepEqual(planner.defaultPreferences([a,b,c]),{a:{YIELD_FOOD:2},c:{YIELD_FOOD:2},b:{YIELD_PRODUCTION:2}});
 assert.equal(JSON.stringify([a,b,c]),before);
});
test('bare income subtracts already slotted flat effects, including conditional yields, but not multipliers',()=>{
 const c={...city('a',[30,15,0,0,0,0,0]),isTown:true,tags:{WAREHOUSE:2},multiplier:[3,2,1,1,1,1,1]};
 const rs=[{effects:[{kind:'flat',yield:'YIELD_FOOD',amount:8},{kind:'percent',yield:'YIELD_FOOD',amount:50},{kind:'flat',yield:'YIELD_PRODUCTION',amount:2,tag:'WAREHOUSE'},{kind:'flat',yield:'YIELD_PRODUCTION',amount:99,town:false}]}];
 assert.deepEqual(planner.bareYields(c,rs),[22,11,0,0,0,0,0]);assert.equal(c.base[0],30);
});
test('overall score considers unmarked settlements and preserves existing assignments on ties',()=>{
 const a=city('a',[0,0,0,10,0,0,0]),b=city('b',[0,0,0,30,0,0,0]);
 const r={key:'r',allowed:['a','b'],effects:[{kind:'percent',yield:'YIELD_SCIENCE',amount:20}]};
 assert.deepEqual(planner.planAllocation([r],[a,b],'score'),{r:'b'});
 b.tendency={YIELD_SCIENCE:0};assert.deepEqual(planner.planAllocation([r],[a,b],'score'),{r:'a'});
 const flat={...r,original:'b',effects:[{kind:'flat',yield:'YIELD_FOOD',amount:3}]};
 assert.deepEqual(planner.planAllocation([flat],[a,b],'score'),{r:'b'});
});
function fixture(initial={preferences:{},games:{},preferenceModes:{}}){
 let stored=structuredClone(initial),mounts=[],cleanups=[],snapshots=0,operations=0;
 const cities=[city('a',[10,2,0,0,0,0,0]),city('b',[5,20,0,0,0,0,0])];
 const model={selectedSettlementSortType:()=>13,selectedSortDirection:()=>-1,setSelectedSettlementSortType(){},toggleSelectedSortDirection(){},deselectSelectedResource(){}};
 const create=vm.runInNewContext(source+';createPlanner',{
 ...planner,t:(key,...args)=>key+args.join(':'),errorMessage:e=>e.message,
 createSignal:v=>[()=>v,n=>v=typeof n==='function'?n(v):n],createEffect:f=>f(),untrack:f=>f(),onMount:f=>mounts.push(f),onCleanup:f=>cleanups.push(f),
 readSettings:()=>structuredClone(stored),writeSettings:v=>stored=structuredClone(v),gameScope:()=> 'map',resourceCatalog:()=>new Map(),
 Cities:{get:id=>({key:id})},preferenceKey:c=>c.key,Game:{turn:1,age:1},GameContext:{localPlayerID:0},Players:{get:()=>({Resources:{isResourceAssignmentLocked:()=>false}})},
 snapshot:(_m,marks)=>{snapshots++;return {cities:cities.map(c=>({...c,tendency:marks[c.key]})),resources:[]}},
 sendOperation:()=>operations++,findAssignment:()=>undefined,setTimeout,console:{log(){},error:assert.fail}
 });
 return {cities,get stored(){return stored},get snapshots(){return snapshots},get operations(){return operations},open(){const p=create(model);mounts.splice(0).forEach(f=>f());return p},close(){cleanups.splice(0).forEach(f=>f())}};
}
test('manual edits including clearing freeze defaults across reopening and allocation; reset resumes without allocating',async()=>{
 const f=fixture({preferences:{},games:{other:{keep:'YIELD_GOLD'}},extra:7});let p=f.open();
 assert.deepEqual(f.stored.games.map,{a:{YIELD_FOOD:2},b:{YIELD_PRODUCTION:2}});assert.equal(p.preferenceMode(),'auto');
 const count=f.snapshots;p.choose('a','YIELD_FOOD');assert.equal(f.snapshots,count);assert.equal(f.stored.games.map.a.YIELD_FOOD,0);
 p.clear('a');p.clear('b');assert.deepEqual(f.stored.games.map,{});assert.equal(f.stored.preferenceModes.map,'manual');
 f.cities[1].bareBase[0]=100;f.close();p=f.open();assert.equal(f.snapshots,count);assert.deepEqual(f.stored.games.map,{});
 p.run();await new Promise(r=>setTimeout(r,20));assert.deepEqual(f.stored.games.map,{});assert.equal(f.snapshots,count+1);assert.equal(p.statusCode(),'NO_CHANGES');
 p.resetDefaults();assert.deepEqual(f.stored.games.map,{b:{YIELD_FOOD:2,YIELD_PRODUCTION:2}});assert.equal(f.operations,0);assert.equal(p.preferenceMode(),'auto');
 f.cities[0].bareBase[0]=101;f.close();p=f.open();assert.equal(f.stored.games.map.a.YIELD_FOOD,2);
 assert.deepEqual(f.stored.games.other,{keep:'YIELD_GOLD'});assert.equal(f.stored.extra,7);f.close();
});
test('existing user preferences migrate to manual mode without recalculating defaults',()=>{
 const f=fixture({preferences:{},games:{map:{a:'YIELD_CULTURE'}}});const p=f.open();
 assert.equal(p.preferenceMode(),'manual');assert.equal(f.snapshots,0);assert.equal(f.stored.games.map.a,'YIELD_CULTURE');f.close();
});
test('native snapshot derives default income before candidate filtering and never checks resource placement',()=>{
 const adapter=readFileSync(new URL('../ui/rp-game-adapter.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
 const lives=[30,25].map((food,i)=>({id:{owner:0,id:i,type:1},name:'city'+i,originalOwner:0,location:{x:i,y:0},
 Resources:{getAssignedResources:()=>i===0?[{value:9,uniqueResource:{resource:'R'}}]:[],getAssignedResourcesCap:()=>2},
 Yields:{getYields:()=>planner.YIELDS.map((_y,n)=>({value:n===0?food*5:0,base:{value:n===0?food*5:0,steps:[{id:'ATTR_YIELD_INCOME',base:{value:n===0?food:0},value:n===0?food*5:0,modifier:{value:400}}]},modifier:{value:0}}))}}));
 const snapshot=vm.runInNewContext(adapter+';snapshot',{...planner,isResourceDamaged:()=>false,t:k=>k,GameContext:{localPlayerID:0},Players:{get:()=>({Cities:{getCities:()=>lives}})},
 GameInfo:{Resources:{lookup:()=>({ResourceType:'R'})},Yields:planner.YIELDS.map(YieldType=>({YieldType}))},Game:{getHash:x=>x},ProductionKind:{UNIT:1,CONSTRUCTIBLE:2},Locale:{compose:x=>x}});
 const catalog=new Map([['R',[{kind:'flat',yield:'YIELD_FOOD',amount:10}]]]);
 const first=snapshot({}, {},catalog,{defaultsOnly:true,camels:false,assigned:false});
 const second=snapshot({}, {},catalog,{defaultsOnly:true,camels:true,assigned:true});
 assert.equal(first.cities[0].bareBase[0],20);assert.equal(first.cities[1].bareBase[0],25);
 assert.deepEqual(planner.defaultPreferences(first.cities),{'0:1:0':{YIELD_FOOD:2}});
 assert.deepEqual(planner.defaultPreferences(first.cities),planner.defaultPreferences(second.cities));
});
