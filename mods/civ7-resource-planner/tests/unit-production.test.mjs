import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {catalogs,useGameLanguage} from './locale-fixture.mjs';
import {YIELDS,cityYieldVector,effectsFor,marginal,planAllocation,planUtility,restoreAssignedResource} from '../ui/rp-planner.js';
import {currentProduction,productionProgressText,productionReader,productionText,productionTitle,resourceCatalog,snapshot,updateProduction} from '../ui/rp-game-adapter.js';

const UNITS={
  UNIT_TEST_WARRIOR:{UnitType:'UNIT_TEST_WARRIOR',Name:'LOC_UNIT_TEST_WARRIOR',Domain:'DOMAIN_LAND'},
  UNIT_TEST_ARCHER:{UnitType:'UNIT_TEST_ARCHER',Name:'LOC_UNIT_TEST_ARCHER',Domain:'DOMAIN_LAND'}
};
const BUILDINGS={
  BUILDING_TEST_BARRACKS:{ConstructibleType:'BUILDING_TEST_BARRACKS',ConstructibleClass:'BUILDING',Name:'LOC_BUILDING_TEST_BARRACKS'}
};
const PROJECTS={
  PROJECT_TEST:{ProjectType:'PROJECT_TEST',Name:'LOC_PROJECT_TEST'}
};
const NAMES={
  LOC_UNIT_TEST_WARRIOR:{en_US:'Test Warrior',zh_Hans_CN:'测试战士'},
  LOC_UNIT_TEST_ARCHER:{en_US:'Test Archer',zh_Hans_CN:'测试弓手'},
  LOC_BUILDING_TEST_BARRACKS:{en_US:'Test Barracks',zh_Hans_CN:'测试兵营'},
  LOC_PROJECT_TEST:{en_US:'Test Project',zh_Hans_CN:'测试项目'}
};
const KIND={UNIT:1,CONSTRUCTIBLE:2,PROJECT:3};
const TEST_ICON={
  getUnitIconFromDefinition:def=>`blp:unit_${def.UnitType}`,
  getConstructibleIconFromDefinition:def=>`blp:building_${def.ConstructibleType}`,
  getProjectIconFromDefinition:def=>`blp:project_${def.ProjectType}`,
  getYieldIcon:yieldType=>{
    assert.equal(typeof yieldType,'string');
    return `blp:yield_${yieldType}`;
  }
};

function installLocale(language='en_US'){
  const base=useGameLanguage(language).compose;
  globalThis.Locale={compose(key,...args){
    if(NAMES[key])return NAMES[key][language]??NAMES[key].en_US;
    if(!String(key).startsWith('LOC_'))return key;
    return base(key,...args);
  }};
}
function makeInfo(){
  const resources={
    RESOURCE_SALT:{ResourceType:'RESOURCE_SALT',Name:'Salt',ResourceClassType:'RESOURCECLASS_BONUS',BonusResourceSlots:0},
    RESOURCE_SPICES:{ResourceType:'RESOURCE_SPICES',Name:'Spices',ResourceClassType:'RESOURCECLASS_BONUS',BonusResourceSlots:0},
    RESOURCE_WOOL:{ResourceType:'RESOURCE_WOOL',Name:'Wool',ResourceClassType:'RESOURCECLASS_BONUS',BonusResourceSlots:0},
    RESOURCE_CAMELS:{ResourceType:'RESOURCE_CAMELS',Name:'Camels',ResourceClassType:'RESOURCECLASS_BONUS',BonusResourceSlots:2}
  };
  const yields=YIELDS.map(YieldType=>({YieldType,Name:`LOC_${YieldType}_NAME`}));
  yields.forEach((yieldDefinition,index)=>yieldDefinition.$index=index);
  yields.lookup=type=>yields.find(yieldDefinition=>yieldDefinition.YieldType===type);
  return {
    Yields:yields,
    Resources:{lookup:type=>resources[type]},
    Units:{lookup:type=>UNITS[type]},
    Constructibles:{lookup:type=>BUILDINGS[type]},
    Projects:{lookup:type=>PROJECTS[type]},
    TypeTags:[{Type:'UNIT_TEST_WARRIOR',Tag:'UNIT_CLASS_INFANTRY'},{Type:'UNIT_TEST_ARCHER',Tag:'UNIT_CLASS_RANGED'}],
    DynamicModifiers:[
      {ModifierType:'MOD_SALT_UNIT',EffectType:'EFFECT_CITY_ADJUST_UNIT_PRODUCTION_PER_RESOURCE',CollectionType:'COLLECTION_ALL_CITIES'},
      {ModifierType:'MOD_SPICES_FLAT',EffectType:'EFFECT_CITY_ADJUST_YIELD_PER_RESOURCE',CollectionType:'COLLECTION_ALL_CITIES'},
      {ModifierType:'MOD_WOOL_FLAT',EffectType:'EFFECT_CITY_ADJUST_YIELD_PER_RESOURCE',CollectionType:'COLLECTION_ALL_CITIES'}
    ],
    Modifiers:[
      {ModifierId:'MOD_SALT_UNIT_PRODUCTION',ModifierType:'MOD_SALT_UNIT',CollectionType:'COLLECTION_ALL_CITIES',SubjectRequirementSetId:'REQSET_SALT'},
      {ModifierId:'MOD_SPICES_GOLD',ModifierType:'MOD_SPICES_FLAT',CollectionType:'COLLECTION_ALL_CITIES'},
      {ModifierId:'MOD_WOOL_PRODUCTION',ModifierType:'MOD_WOOL_FLAT',CollectionType:'COLLECTION_ALL_CITIES'}
    ],
    ModifierArguments:[
      {ModifierId:'MOD_SALT_UNIT_PRODUCTION',Name:'ResourceType',Value:'RESOURCE_SALT'},
      {ModifierId:'MOD_SALT_UNIT_PRODUCTION',Name:'Percent',Value:20},
      {ModifierId:'MOD_SPICES_GOLD',Name:'ResourceType',Value:'RESOURCE_SPICES'},
      {ModifierId:'MOD_SPICES_GOLD',Name:'YieldType',Value:'YIELD_GOLD'},
      {ModifierId:'MOD_SPICES_GOLD',Name:'Amount',Value:4},
      {ModifierId:'MOD_SPICES_GOLD',Name:'PercentMultiplier',Value:false},
      {ModifierId:'MOD_WOOL_PRODUCTION',Name:'ResourceType',Value:'RESOURCE_WOOL'},
      {ModifierId:'MOD_WOOL_PRODUCTION',Name:'YieldType',Value:'YIELD_PRODUCTION'},
      {ModifierId:'MOD_WOOL_PRODUCTION',Name:'Amount',Value:10},
      {ModifierId:'MOD_WOOL_PRODUCTION',Name:'PercentMultiplier',Value:false}
    ],
    GameModifiers:[{ModifierId:'MOD_SALT_UNIT_PRODUCTION'},{ModifierId:'MOD_SPICES_GOLD'},{ModifierId:'MOD_WOOL_PRODUCTION'}],
    Requirements:[{RequirementId:'REQ_HAS_QUEUE',RequirementType:'REQUIREMENT_CITY_HAS_BUILD_QUEUE'}],
    RequirementSets:[{RequirementSetId:'REQSET_SALT',RequirementSetType:'REQUIREMENTSET_TEST_ALL'}],
    RequirementSetRequirements:[{RequirementSetId:'REQSET_SALT',RequirementId:'REQ_HAS_QUEUE'}]
  };
}
function makeYields(production,gold=0){
  return YIELDS.map((YieldType,index)=>{
    const value=index===1?production:index===2?gold:0;
    return {value,base:{value},modifier:{value:0}};
  });
}
function makeCity({id=1,production=100,gold=0,isTown=false,assigned=[],capacity=2,queue=[],name='Test City'}={}){
  const cityID={owner:0,id,type:1};
  return {
    id:cityID,owner:0,name,originalOwner:0,isTown,isCapital:false,isDistantLands:false,
    location:{x:id,y:0},
    Trade:{isInTradeNetwork:()=>true},
    Resources:{getAssignedResources:()=>assigned,getAssignedResourcesCap:()=>capacity},
    Yields:{getYields:()=>makeYields(production,gold)},
    BuildQueue:{getQueue:()=>queue},
    Constructibles:{getIds:()=>[]}
  };
}
function raw(value,type='RESOURCE_SALT',isOffMap=false){return {value,isOffMap,uniqueResource:{resource:type}};}
function unit(type='UNIT_TEST_WARRIOR',itemType=101){return {kind:KIND.UNIT,type:itemType,unitType:type};}
function building(type='BUILDING_TEST_BARRACKS',itemType=102){return {kind:KIND.CONSTRUCTIBLE,type:itemType,constructibleType:type};}
function project(type='PROJECT_TEST',itemType=103){return {kind:KIND.PROJECT,type:itemType,projectType:type};}
function makeModel(slots){
  return {data:{resourceTabData:{availableResourceSectionData:[{subSections:[{resourceSlotData:slots.map(({value,isOffMap=false})=>({resourceValue:value,isOffMap}))}]}]}}};
}
function setup({cities=[],inventory=[],slots=[]}={}){
  installLocale('en_US');
  globalThis.ProductionKind=KIND;
  globalThis.GameInfo=makeInfo();
  globalThis.GameContext={localPlayerID:0};
  globalThis.Players={get:()=>({Cities:{getCities:()=>cities},Resources:{getResources:()=>inventory,isResourceAssignmentLocked:()=>false}})};
  globalThis.Cities={get:id=>cities.find(city=>city.id.id===id.id)};
  globalThis.Game={
    getHash:()=>1,
    age:1,
    Resources:{getOriginCity:()=>cities[0]?.id},
    PlayerOperations:{canStart:()=>({Success:true})}
  };
  globalThis.PlayerOperationTypes={ASSIGN_RESOURCE:1};
  globalThis.PlayerOperationParameters={Deactivate:2};
  globalThis.GameplayMap={getLocationFromIndex:()=>({x:0,y:0}),isValidIndex:()=>true};
  globalThis.MapConstructibles={getHiddenFilteredConstructibles:()=>[]};
  globalThis.Constructibles={getByComponentID:()=>({damaged:false})};
  delete globalThis.Icon;
  return makeModel(slots);
}
function testReader(){return productionReader({info:globalThis.GameInfo,icon:TEST_ICON,locale:globalThis.Locale,kinds:globalThis.ProductionKind});}
function catalog(){return resourceCatalog();}
function byId(cities,id){return cities.find(city=>city.id.id===id);}
function salt(plan){return plan.resources.find(resource=>resource.key==='plot:1');}

function setQueueProgress(city,{invested=112.1953125,required=117,kind,type}={}) {
  const head=city.BuildQueue.getQueue()[0];
  Object.assign(city.BuildQueue,{
    currentBuildProgress:invested,
    currentBuildProgressRequired:required,
    currentProductionKind:kind??head.kind,
    currentProductionTypeHash:type??head.type
  });
}
function setRawQueueProgress(city,values){
  Object.assign(city.BuildQueue,{
    currentBuildProgress:values.invested,
    currentBuildProgressRequired:values.required,
    currentProductionKind:values.kind,
    currentProductionTypeHash:values.type
  });
}

test('resourceCatalog reads the salt construction effect and snapshot uses only the first queue item',()=>{
  const unitFirst=makeCity({id:1,queue:[unit('UNIT_TEST_WARRIOR'),building()]});
  const buildingFirst=makeCity({id:2,queue:[building(),unit('UNIT_TEST_ARCHER')]});
  const projectFirst=makeCity({id:3,queue:[project()]});
  const empty=makeCity({id:4,queue:[]});
  const town=makeCity({id:5,isTown:true,queue:[]});
  const model=setup({cities:[unitFirst,buildingFirst,projectFirst,empty,town],inventory:[raw(1)],slots:[{value:1}]});
  const effects=catalog().get('RESOURCE_SALT');
  assert.deepEqual(effects.map(({kind,amount,queue})=>({kind,amount,queue})),[{kind:'construction',amount:20,queue:{kind:'unit',type:undefined,tag:undefined,class:undefined,domain:undefined}}]);
  const plan=snapshot(model,{},catalog(),{camels:false,assigned:false});
  assert.equal(byId(plan.cities,1).queue.kind,'unit');
  assert.equal(byId(plan.cities,1).queue.type,'UNIT_TEST_WARRIOR');
  assert.equal(byId(plan.cities,2).queue.kind,'building');
  assert.equal(byId(plan.cities,3).queue.kind,'project');
  assert.equal(byId(plan.cities,4).queue,undefined);
  assert.equal(byId(plan.cities,5).queue,undefined);
  assert.equal(effectsFor(salt(plan),byId(plan.cities,1)).construction,20);
  assert.equal(effectsFor(salt(plan),byId(plan.cities,2)).construction,0);
  assert.equal(effectsFor(salt(plan),byId(plan.cities,3)).construction,0);
  assert.equal(effectsFor(salt(plan),byId(plan.cities,5)).construction,0);
});

test('twenty percent of production is the candidate before/after difference; non-unit queues score zero',()=>{
  const unit100=makeCity({id:1,production:100,queue:[unit()]});
  const unit200=makeCity({id:2,production:200,queue:[unit()]});
  const building200=makeCity({id:3,production:200,queue:[building()]});
  const project200=makeCity({id:4,production:200,queue:[project()]});
  const empty200=makeCity({id:5,production:200,queue:[]});
  const town200=makeCity({id:6,production:200,isTown:true,queue:[]});
  const model=setup({cities:[unit100,unit200,building200,project200,empty200,town200],inventory:[raw(1)],slots:[{value:1}]});
  const plan=snapshot(model,{},catalog(),{camels:false,assigned:false});
  const resource=salt(plan);
  assert.equal(marginal(byId(plan.cities,1),resource).yields[1],20);
  assert.equal(marginal(byId(plan.cities,2),resource).yields[1],40);
  assert.equal(marginal(byId(plan.cities,1),resource).score,80);
  assert.equal(marginal(byId(plan.cities,2),resource).score,160);
  for(const id of [3,4,5,6])assert.equal(marginal(byId(plan.cities,id),resource).yields[1],0,id);
  assert.deepEqual(planAllocation([resource],[byId(plan.cities,1),byId(plan.cities,3)],'score'),{ 'plot:1':byId(plan.cities,1).key });
  assert.deepEqual(planAllocation([resource],[byId(plan.cities,2),byId(plan.cities,1)],'score'),{ 'plot:1':byId(plan.cities,2).key });
});

test('production preference doubles salt value and avoidance assigns none',()=>{
  const city=makeCity({id:1,production:100,queue:[unit()]});
  const other=makeCity({id:2,production:200,queue:[building()]});
  const model=setup({cities:[city,other],inventory:[raw(1)],slots:[{value:1}]});
  const plan=snapshot(model,{},catalog(),{camels:false,assigned:false});
  const resource=salt(plan),target=byId(plan.cities,1);
  target.tendency={YIELD_PRODUCTION:2};
  assert.equal(marginal(target,resource).score,160);
  assert.equal(planAllocation([resource],[target,byId(plan.cities,2)],'tendency')['plot:1'],target.key);
  target.tendency={YIELD_PRODUCTION:0};
  assert.equal(marginal(target,resource).score,0);
  assert.deepEqual(planAllocation([resource],[target,byId(plan.cities,2)],'tendency'),{});
});

test('盐的溢出评分仅截断条件产能，倾向在截断后加权',()=>{
  const finished=makeCity({id:1,production:120,queue:[unit()]});
  const useful=makeCity({id:2,production:119,queue:[unit()]});
  const model=setup({cities:[finished,useful],inventory:[raw(1)],slots:[{value:1}]});
  setQueueProgress(finished,{invested:0,required:120});
  setQueueProgress(useful,{invested:0,required:120});
  const plan=snapshot(model,{},catalog(),{camels:false,assigned:false});
  const resource=salt(plan),full=byId(plan.cities,1),nearly=byId(plan.cities,2);
  assert.equal(full.productionRemaining,120);
  assert.equal(nearly.productionRemaining,120);
  assert.equal(marginal(full,resource).score,0,'ordinary production beyond the remaining cost is retained');
  assert.equal(marginal(nearly,resource).score,4,'only one production point of salt is useful');
  assert.ok(Math.abs(marginal(nearly,resource).yields[1]-23.8)<1e-9,'raw/UI deltas remain uncapped');
  nearly.tendency={YIELD_PRODUCTION:2};
  assert.equal(marginal(nearly,resource).score,8,'the existing preference multiplier is applied after clipping');
  assert.deepEqual(planAllocation([resource],[full,nearly],'score'),{'plot:1':nearly.key});

  const capital=makeCity({id:1,production:119,queue:[unit()],capacity:2});
  const preferred=makeCity({id:2,production:71,queue:[unit()],capacity:2});
  const competing=setup({cities:[capital,preferred],inventory:[raw(1),raw(2)],slots:[{value:1},{value:2}]});
  setQueueProgress(capital,{invested:0,required:120});
  setQueueProgress(preferred,{invested:0,required:120});
  const competition=snapshot(competing,{},catalog(),{camels:false,assigned:false});
  byId(competition.cities,1).tendency={YIELD_PRODUCTION:2};
  byId(competition.cities,2).tendency={YIELD_PRODUCTION:2};
  const preferredKey=byId(competition.cities,2).key;
  assert.deepEqual(planAllocation(competition.resources,competition.cities,'tendency'),
    {'plot:1':preferredKey,'plot:2':preferredKey});
});

test('多份盐共用剩余需求上限，不改变原始产出和顺序',()=>{
  const city=makeCity({id:1,production:100,queue:[unit()],capacity:3});
  const model=setup({cities:[city],inventory:[raw(1),raw(2),raw(3)],slots:[{value:1},{value:2},{value:3}]});
  setQueueProgress(city,{invested:0,required:130});
  const plan=snapshot(model,{},catalog(),{camels:false,assigned:false});
  const [first,second,third]=plan.resources,target=plan.cities[0];
  const cityBefore={base:[...target.base],construction:target.construction,remaining:target.productionRemaining,offset:target.productionRateOffset};
  const resourceBefore=plan.resources.map(resource=>({key:resource.key,original:resource.original,allowed:[...resource.allowed]}));
  assert.equal(marginal(target,first).score,80);
  assert.equal(marginal(target,second,[first]).score,40);
  assert.equal(marginal(target,third,[first,second]).score,0);
  assert.equal(marginal(target,third,[first,second]).yields[1],20);
  const noResources=planUtility({},plan.resources,plan.cities);
  const firstUtility=planUtility({'plot:1':target.key},plan.resources,plan.cities);
  const twoUtility=planUtility({'plot:1':target.key,'plot:2':target.key},plan.resources,plan.cities);
  const allUtility=planUtility({'plot:1':target.key,'plot:2':target.key,'plot:3':target.key},plan.resources,plan.cities);
  assert.equal(firstUtility-noResources,80);
  assert.equal(twoUtility-firstUtility,40);
  assert.equal(allUtility-twoUtility,0);
  assert.equal(cityYieldVector(target,[first])[1],120);
  assert.equal(cityYieldVector(target,[first,second])[1],140);
  assert.equal(cityYieldVector(target,[first,second,third])[1],160);

  const assignment=planAllocation(plan.resources,plan.cities,'score');
  assert.equal(Object.values(assignment).filter(key=>key===target.key).length,2);
  assert.deepEqual(plan.resources.map(resource=>resource.key),resourceBefore.map(resource=>resource.key));
  assert.deepEqual(plan.resources.map(resource=>resource.allowed),resourceBefore.map(resource=>resource.allowed));
  assert.deepEqual(plan.cities.map(item=>item.key),[target.key]);
  assert.deepEqual(target.base,cityBefore.base);
  assert.equal(target.construction,cityBefore.construction);
  assert.equal(target.productionRemaining,cityBefore.remaining);
  assert.equal(target.productionRateOffset,cityBefore.offset);

  city.BuildQueue={getQueue:()=>[unit()],currentBuildProgress:110,currentBuildProgressRequired:120,
    currentProductionKind:KIND.UNIT,currentProductionTypeHash:101};
  const saturated=snapshot(model,{},catalog(),{camels:false,assigned:false});
  const saturatedCity=saturated.cities[0];
  assert.equal(saturatedCity.productionRemaining,10);
  assert.equal(marginal(saturatedCity,saturated.resources[0]).score,0);
  assert.equal(marginal(saturatedCity,saturated.resources[1],[saturated.resources[0]]).score,0);
  assert.equal(Object.values(planAllocation(saturated.resources,saturated.cities,'score')).filter(Boolean).length,0);
});

test('原生单位类别产能只校准评分基准，参数使用类别与原生索引',()=>{
  const city=makeCity({id:1,production:100,queue:[unit()]});
  const model=setup({cities:[city],inventory:[raw(1)],slots:[{value:1}]});
  setQueueProgress(city,{invested:0,required:120});
  const calls=[];
  city.Yields.calculateProductionSpecificYield=(...args)=>{
    calls.push(args);
    return {value:140};
  };
  const plan=snapshot(model,{},catalog(),{camels:false,assigned:false});
  const target=plan.cities[0];
  assert.deepEqual(calls,[[1,KIND.UNIT,false]]);
  assert.equal(target.productionRemaining,120);
  assert.equal(target.productionRateOffset,40);
  assert.equal(marginal(target,salt(plan)).score,0,'other native bonuses consume the remaining head cost');
  assert.equal(marginal(target,salt(plan)).yields[1],20);
  assert.equal(cityYieldVector(target,[salt(plan)])[1],120);

  for(const value of [undefined,'140',-1,NaN]) {
    const fallbackCity=makeCity({id:1,production:100,queue:[unit()]});
    const fallbackModel=setup({cities:[fallbackCity],inventory:[raw(1)],slots:[{value:1}]});
    setQueueProgress(fallbackCity,{invested:0,required:120});
    fallbackCity.Yields.calculateProductionSpecificYield=()=>({value});
    const fallback=snapshot(fallbackModel,{},catalog(),{camels:false,assigned:false});
    assert.equal(fallback.cities[0].productionRateOffset,0,`native value=${String(value)}`);
    assert.equal(marginal(fallback.cities[0],salt(fallback)).score,80,`native value=${String(value)}`);
  }
});

test('缺失、过期、无效和食物进度回退旧估算',()=>{
  const checkFallback=(prepare,label)=>{
    const city=makeCity({id:1,production:100,queue:[unit()]});
    const model=setup({cities:[city],inventory:[raw(1)],slots:[{value:1}]});
    prepare(city);
    const calls=[];
    city.Yields.calculateProductionSpecificYield=(...args)=>{
      calls.push(args);
      return {value:140};
    };
    const plan=snapshot(model,{},catalog(),{camels:false,assigned:false});
    assert.equal(plan.cities[0].productionRemaining,undefined,label);
    assert.equal(plan.cities[0].productionRateOffset,0,label);
    assert.deepEqual(calls,[],label);
    assert.equal(marginal(plan.cities[0],salt(plan)).score,80,label);
    assert.equal(marginal(plan.cities[0],salt(plan)).yields[1],20,label);
  };
  checkFallback(()=>{},'missing progress is not a zero cap');
  checkFallback(city=>setRawQueueProgress(city,{invested:99,required:120,kind:KIND.UNIT,type:999}),'a stale queue head is not a zero cap');
  checkFallback(city=>setRawQueueProgress(city,{invested:'99',required:120,kind:KIND.UNIT,type:101}),'invalid numeric progress is not a zero cap');
  checkFallback(city=>{
    setQueueProgress(city,{invested:0,required:120});
    city.Production={productionYieldSource:'YIELD_FOOD'};
  },'food progress is not a production cap');
});

test('固定盐和可重排盐在两种包含已分配模式下共用上限',()=>{
  const occupied=raw(1);
  const city=makeCity({id:1,production:100,queue:[unit()],assigned:[occupied],capacity:3});
  const model=setup({cities:[city],inventory:[occupied,raw(2),raw(3)],slots:[{value:1},{value:2},{value:3}]});
  setQueueProgress(city,{invested:0,required:20});
  city.Yields.calculateProductionSpecificYield=()=>({value:120});
  const fixed=snapshot(model,{},catalog(),{camels:false,assigned:false});
  const fixedCity=fixed.cities[0];
  assert.equal(fixedCity.construction,20);
  assert.equal(fixedCity.productionRemaining,20);
  assert.equal(fixedCity.productionRateOffset,0);
  assert.equal(marginal(fixedCity,fixed.resources[0]).score,0,'the fixed salt already finishes this head');
  assert.equal(marginal(fixedCity,fixed.resources[0]).yields[1],20);
  assert.deepEqual(planAllocation(fixed.resources,fixed.cities,'score'),{});

  const movable=snapshot(model,{},catalog(),{camels:false,assigned:true});
  const movableCity=movable.cities[0];
  assert.equal(movableCity.construction,0);
  assert.equal(movableCity.productionRateOffset,0);
  const assignment=planAllocation(movable.resources,movable.cities,'score');
  assert.equal(Object.values(assignment).filter(Boolean).length,1);
  assert.equal(assignment['plot:1'],movableCity.key,'the original copy wins the saturated cap');
  assert.equal(cityYieldVector(movableCity,movable.resources)[1],160);

  const originalSalt=raw(1),wool=raw(4,'RESOURCE_WOOL');
  const mixed=makeCity({id:1,production:100,queue:[unit()],assigned:[originalSalt,wool],capacity:3});
  const mixedModel=setup({cities:[mixed],inventory:[originalSalt,raw(2),wool],slots:[{value:1},{value:2},{value:4}]});
  setQueueProgress(mixed,{invested:0,required:130});
  mixed.Yields.calculateProductionSpecificYield=()=>({value:140});
  const mixedPlan=snapshot(mixedModel,{},catalog(),{camels:false,assigned:true});
  const mixedCity=mixedPlan.cities[0],original=mixedPlan.resources.find(resource=>resource.key==='plot:1');
  const ordinary=mixedPlan.resources.find(resource=>resource.key==='plot:4'),extra=mixedPlan.resources.find(resource=>resource.key==='plot:2');
  assert.equal(cityYieldVector(mixedCity,[original,ordinary])[1],120);
  assert.equal(mixedCity.productionRateOffset,20,'unmodeled native bonuses are corrected after ordinary and salt resources');
  assert.equal(marginal(mixedCity,extra,[original,ordinary]).score,0,'the original salt and correction consume the useful cap');
  assert.equal(marginal(mixedCity,extra,[original,ordinary]).yields[1],20);
  assert.deepEqual(planAllocation(mixedPlan.resources,mixedPlan.cities,'score'),
    {'plot:1':mixedCity.key,'plot:4':mixedCity.key});
});

test('fixed assigned salt is not a candidate when include-assigned is off; two salts add without compounding',()=>{
  const occupied=raw(1);
  const city=makeCity({id:1,production:100,queue:[unit()],assigned:[occupied],capacity:2});
  const model=setup({cities:[city],inventory:[occupied,raw(2)],slots:[{value:1},{value:2}]});
  const fixed=snapshot(model,{},catalog(),{camels:false,assigned:false});
  assert.deepEqual(fixed.resources.map(r=>r.key),['plot:2']);
  assert.equal(fixed.cities[0].capacity,1);
  assert.equal(fixed.cities[0].assigned[0].key,'plot:1');
  assert.equal(marginal(fixed.cities[0],fixed.resources[0]).yields[1],20);
  assert.equal(planAllocation(fixed.resources,fixed.cities,'score')['plot:2'],fixed.cities[0].key);

  const all=snapshot(model,{},catalog(),{camels:false,assigned:true});
  assert.deepEqual(all.resources.map(r=>r.key),['plot:1','plot:2']);
  assert.equal(all.cities[0].capacity,2);
  assert.equal(all.cities[0].construction,0,'reassignable salt stays on the candidate side');
  assert.deepEqual(planAllocation(all.resources,all.cities,'score'),{'plot:1':all.cities[0].key,'plot:2':all.cities[0].key});
  assert.equal(cityYieldVector(all.cities[0],all.resources)[1],140);
  assert.equal(marginal(all.cities[0],all.resources[1],[all.resources[0]]).yields[1],20);
});

test('fixed salt contributes its construction to new ordinary production',()=>{
  const occupied=raw(1);
  const city=makeCity({id:1,production:100,queue:[unit()],assigned:[occupied],capacity:2});
  const model=setup({cities:[city],inventory:[occupied,raw(4,'RESOURCE_WOOL')],slots:[{value:1},{value:4}]});
  const plan=snapshot(model,{},catalog(),{camels:false,assigned:false});
  const wool=plan.resources.find(r=>r.key==='plot:4');
  assert.equal(plan.cities[0].construction,20);
  assert.equal(cityYieldVector(plan.cities[0],[])[1],120);
  assert.equal(marginal(plan.cities[0],wool).yields[1],12);
  assert.equal(cityYieldVector(plan.cities[0],[wool])[1],132);
  assert.equal(planAllocation(plan.resources,plan.cities,'score')['plot:4'],plan.cities[0].key);
});

test('restoring a removed assigned resource returns its construction to the fixed baseline once',()=>{
  const city={...makeCity({id:1,production:100,queue:[unit()],capacity:2}),base:[0,100,0,0,0,0,0],multiplier:Array(7).fill(1),tags:{},construction:0,capacity:2,queue:{kind:'unit',tags:[]}};
  const resource={key:'plot:1',original:city.key,bonusSlots:0,effects:[{kind:'construction',yield:'YIELD_PRODUCTION',amount:20,queue:{kind:'unit'}}]};
  restoreAssignedResource(city,resource);
  assert.equal(city.construction,20);
  assert.equal(city.capacity,1);
  assert.equal(cityYieldVector(city,[])[1],120,'one fixed copy, not a candidate copy');
});

test('include-assigned can move an existing salt from a building city to a unit city',()=>{
  const unitCity=makeCity({id:1,production:100,queue:[unit()]});
  const buildingCity=makeCity({id:2,production:100,queue:[building()],assigned:[raw(1)]});
  const model=setup({cities:[unitCity,buildingCity],inventory:[raw(1)],slots:[{value:1}]});
  const plan=snapshot(model,{},catalog(),{camels:false,assigned:true});
  const assignment=planAllocation(plan.resources,plan.cities,'score');
  const resource=plan.resources[0];
  assert.equal(assignment['plot:1'],byId(plan.cities,1).key);
  assert.equal(resource.allowed.includes(byId(plan.cities,1).key),true);
  assert.equal(cityYieldVector(byId(plan.cities,1),[resource])[1],120);
  assert.equal(cityYieldVector(byId(plan.cities,2),[])[1],100);
  assert.equal(byId(plan.cities,1).construction,0);
  assert.equal(byId(plan.cities,2).construction,0);
});

test('salt and ordinary flat resources keep independent destinations',()=>{
  const unitCity=makeCity({id:1,production:100,queue:[unit()],capacity:1});
  const buildingCity=makeCity({id:2,production:200,gold:50,queue:[building()],capacity:1});
  const model=setup({cities:[unitCity,buildingCity],inventory:[raw(1),raw(3,'RESOURCE_SPICES')],slots:[{value:1},{value:3}]});
  const plan=snapshot(model,{},catalog(),{camels:false,assigned:false});
  const saltResource=plan.resources.find(r=>r.key==='plot:1');
  const spices=plan.resources.find(r=>r.key==='plot:3');
  assert.equal(marginal(byId(plan.cities,1),saltResource).yields[1],20);
  assert.equal(marginal(byId(plan.cities,2),saltResource).yields[1],0);
  assert.equal(marginal(byId(plan.cities,2),spices).yields[2],4);
  assert.deepEqual(planAllocation(plan.resources,plan.cities,'score'),{
    'plot:1':byId(plan.cities,1).key,
    'plot:3':byId(plan.cities,2).key
  });
});

test('current production labels and explicit ES icon injection cover unit, building, project, none, town and unknown data',()=>{
  assert.equal(globalThis.Icon,undefined,'the test must not rely on a global Icon');
  const cases=[
    {city:makeCity({id:1,queue:[unit()]}),kind:'unit',key:'PRODUCTION_TRAINING_TIP',en:'Training: Test Warrior',zh:'训练：测试战士',icon:'url(blp:unit_UNIT_TEST_WARRIOR)'},
    {city:makeCity({id:2,queue:[building()]}),kind:'building',key:'PRODUCTION_BUILDING',en:'Building: Test Barracks',zh:'正在建造：测试兵营',icon:'url(blp:building_BUILDING_TEST_BARRACKS)'},
    {city:makeCity({id:3,queue:[project()]}),kind:'project',key:'PRODUCTION_PROJECT',en:'Project: Test Project',zh:'项目：测试项目',icon:'url(blp:project_PROJECT_TEST)'},
    {city:makeCity({id:4,queue:[]}),kind:'none',key:'PRODUCTION_NONE',en:'No unit in training',zh:'未训练单位'},
    {city:makeCity({id:5,queue:[],isTown:true}),kind:'none',en:'',zh:''}
  ];
  for(const language of ['en_US','zh_Hans_CN']){
    installLocale(language);
    const read=testReader();
    for(const item of cases){
      const production=read(item.city);
      assert.equal(production.kind,item.kind);
      assert.equal(productionText(production),language==='en_US'?item.en:item.zh);
      if(item.icon)assert.equal(production.icon,item.icon);
      if(item.kind==='unit')assert.equal(productionTitle(production),language==='en_US'?'Currently training: Test Warrior':'当前正在训练：测试战士');
    }
    const unknown=read(makeCity({id:6,queue:[unit('UNIT_MISSING')]}));
    assert.equal(unknown.kind,'unknown');
    assert.equal(unknown.queue,undefined);
    assert.equal(productionText(unknown),language==='en_US'?'Production unknown':'生产状态未知');
  }
});

test('the commerce model wires its ES Icon import through productionReader',()=>{
  const modelSource=readFileSync(new URL('../ui-next/screens/commerce/commerce-screen-model.js',import.meta.url),'utf8');
  assert.match(modelSource,/productionReader\(\{info:GameInfo,icon:Icon,locale:Locale,kinds:ProductionKind\}\)/);
  assert.match(modelSource,/production: readProduction\(city\)/);
  assert.match(modelSource,/updateProduction\(rows,cityID=>Cities\.get\(cityID\),readProduction\)/);
});

test('current production progress covers all queue types, food source and exact tooltips',()=>{
  const unitCity=makeCity({id:1,queue:[unit()]});
  const buildingCity=makeCity({id:2,queue:[building()]});
  const projectCity=makeCity({id:3,queue:[project()]});
  setup({cities:[unitCity,buildingCity,projectCity]});
  for(const city of [unitCity,buildingCity,projectCity])setQueueProgress(city);
  installLocale('en_US');
  globalThis.Locale.toNumber=(value,format)=>`${value}:${format}`;
  const read=testReader();

  const unitProduction=read(unitCity);
  assert.deepEqual({...unitProduction.progress},{
    invested:112.1953125,required:117,yieldType:'YIELD_PRODUCTION',yieldName:'Production',
    icon:'url(blp:yield_YIELD_PRODUCTION)',iconIsUrl:true
  });
  assert.equal(unitProduction.icon,'url(blp:unit_UNIT_TEST_WARRIOR)','item icon remains the explicit native Icon result');
  assert.equal(productionProgressText(unitProduction),'112.2:0.## / 117:0');
  assert.equal(productionTitle(unitProduction),
    'Currently training: Test Warrior\nProduction progress: Production — 112.1953125:0.#################### invested / 117:0 required');

  assert.equal(read(buildingCity).progress.invested,112.1953125);
  assert.equal(productionProgressText(read(buildingCity)),'112.2:0.## / 117:0');
  setQueueProgress(projectCity,{invested:130.125,required:117});
  const overflow=read(projectCity).progress;
  assert.equal(overflow.invested,130.125,'overflow is displayed, not clamped');
  assert.equal(productionProgressText({progress:overflow}),'130.13:0.## / 117:0');

  unitCity.Production={productionYieldSource:'YIELD_FOOD'};
  const food=read(unitCity).progress;
  assert.equal(food.yieldType,'YIELD_FOOD');
  assert.equal(food.yieldName,'Food');
  assert.equal(food.icon,'url(blp:yield_YIELD_FOOD)');
  assert.ok(productionTitle(read(unitCity)).includes('Production progress: Food'));

  installLocale('zh_Hans_CN');
  globalThis.Locale.toNumber=(value,format)=>`${value}:${format}`;
  const chinese=testReader()(buildingCity);
  assert.equal(productionProgressText(chinese),'112.2:0.## / 117:0');
  assert.equal(productionTitle(chinese),
    '正在建设：测试兵营\n生产进度：生产力 — 已投入 112.1953125:0.####################／需求 117:0');
});

test('yield metadata uses native string yield identifiers and unavailable source defaults to production',()=>{
  const city=makeCity({id:1,queue:[unit()]});
  setup({cities:[city]});
  setQueueProgress(city);
  const requested=[];
  const info=makeInfo();
  const nativeLookup=info.Yields.lookup;
  info.Yields.lookup=type=>{
    requested.push(type);
    assert.equal(typeof type,'string');
    return nativeLookup.call(info.Yields,type);
  };
  const production=productionReader({info,icon:TEST_ICON,locale:globalThis.Locale,kinds:KIND})(city);
  assert.deepEqual(requested,['YIELD_PRODUCTION']);
  assert.equal(production.progress.yieldType,'YIELD_PRODUCTION');
  assert.equal(production.progress.icon,'url(blp:yield_YIELD_PRODUCTION)');
});

test('production yield source accepts native numeric hashes while icons receive string types',()=>{
  const city=makeCity({id:1,queue:[unit()]});
  setup({cities:[city]});
  setQueueProgress(city);
  const info=makeInfo(),lookup=info.Yields.lookup;
  const foodHash=123456;
  info.Yields.lookup=type=>lookup.call(info.Yields,type===foodHash?'YIELD_FOOD':type);
  city.Production={productionYieldSource:foodHash};
  const production=productionReader({info,icon:TEST_ICON,locale:globalThis.Locale,kinds:KIND})(city);
  assert.equal(production.progress.yieldType,'YIELD_FOOD');
  assert.equal(production.progress.icon,'url(blp:yield_YIELD_FOOD)');
});

test('optional yield metadata failures do not break labels, titles or allocation scoring',()=>{
  const unitCity=makeCity({id:1,queue:[unit()]});
  const buildingCity=makeCity({id:2,queue:[building()]});
  const model=setup({cities:[unitCity,buildingCity],inventory:[raw(1)],slots:[{value:1}]});
  setQueueProgress(unitCity);
  const effects=catalog();
  globalThis.GameInfo.Yields.lookup=()=>{throw new Error('yield lookup unavailable');};

  const plan=snapshot(model,{},effects,{camels:false,assigned:false});
  assert.equal(planAllocation(plan.resources,plan.cities,'score')['plot:1'],undefined,
    'yield display failures do not invent a cap; the nearly finished unit leaves no useful salt');

  const throwingIcon={...TEST_ICON,getYieldIcon:()=>{throw new Error('yield icon unavailable');}};
  const read=productionReader({info:globalThis.GameInfo,icon:throwingIcon,locale:globalThis.Locale,kinds:KIND});
  const production=read(unitCity);
  assert.equal(production.kind,'unit');
  assert.deepEqual({...production.progress},{
    invested:112.1953125,required:117,yieldType:'YIELD_PRODUCTION',yieldName:'Production',
    icon:undefined,iconIsUrl:false
  });
  assert.equal(productionText(production),'Training: Test Warrior');
  assert.equal(productionProgressText(production),'112.2 / 117');
  assert.equal(productionTitle(production),
    'Currently training: Test Warrior\nProduction progress: Production — 112.1953125 invested / 117 required');

  Object.defineProperty(unitCity,'Production',{get(){throw new Error('production source unavailable');},configurable:true});
  const sourceFailure=read(unitCity);
  assert.equal(sourceFailure.kind,'unit');
  assert.equal(sourceFailure.progress.yieldType,'YIELD_PRODUCTION');
  assert.equal(sourceFailure.progress.yieldName,'Production');
  assert.equal(sourceFailure.progress.icon,undefined);

  Object.defineProperty(unitCity,'Production',{value:{productionYieldSource:'YIELD_FOOD'},configurable:true});
  const localizedYieldName=globalThis.Locale.compose;
  globalThis.Locale.compose=(key,...args)=>{
    if(key==='LOC_YIELD_PRODUCTION_NAME')throw new Error('localized yield name unavailable');
    return localizedYieldName(key,...args);
  };
  const nameFailure=read(unitCity);
  assert.equal(nameFailure.progress.yieldType,'YIELD_PRODUCTION');
  assert.equal(nameFailure.progress.yieldName,'YIELD_PRODUCTION');
  assert.ok(productionTitle(nameFailure).includes('Production progress: YIELD_PRODUCTION —'));
});

test('missing, invalid or stale numeric production values are omitted rather than invented',()=>{
  const city=makeCity({id:1,queue:[unit()]});
  setup({cities:[city]});
  const read=testReader();
  const cases=[
    {invested:undefined,required:117},
    {invested:null,required:117},
    {invested:'112.2',required:117},
    {invested:NaN,required:117},
    {invested:-1,required:117},
    {invested:112.2,required:undefined},
    {invested:112.2,required:null},
    {invested:112.2,required:'117'},
    {invested:112.2,required:0},
    {invested:112.2,required:-117},
    {invested:112.2,required:Infinity},
    {invested:112.2,required:117,kind:KIND.CONSTRUCTIBLE},
    {invested:112.2,required:117,type:999},
    {invested:112.2,required:117,kind:NaN},
    {invested:112.2,required:117,kind:null},
    {invested:112.2,required:117,type:0},
    {invested:112.2,required:117,type:NaN},
    {invested:112.2,required:117,type:'101'},
    {invested:112.2,required:117,kind:undefined,type:undefined}
  ];
  for(const values of cases) {
    setRawQueueProgress(city,values);
    const production=read(city);
    assert.equal(production.kind,'unit');
    assert.equal(production.progress,undefined,JSON.stringify(values));
    assert.equal(productionProgressText(production),'');
    assert.equal(productionTitle(production),'Currently training: Test Warrior');
  }

  setRawQueueProgress(city,{invested:0,required:0.125,kind:KIND.UNIT,type:101});
  const zeroInvested=read(city).progress;
  assert.equal(zeroInvested.invested,0);
  assert.equal(productionProgressText({progress:zeroInvested}),'0 / 0.13');

  city.BuildQueue={getQueue:()=>[unit()]};
  Object.defineProperty(city.BuildQueue,'currentBuildProgress',{get(){throw new Error('engine unavailable');}});
  city.BuildQueue.currentBuildProgressRequired=117;
  city.BuildQueue.currentProductionKind=KIND.UNIT;
  city.BuildQueue.currentProductionTypeHash=101;
  assert.equal(read(city).progress,undefined);
  assert.equal(read(makeCity({id:2,queue:[]})).progress,undefined,'an empty queue has no invested or required values');

  assert.equal(productionProgressText({progress:{invested:-0.1,required:117}}),'');
  assert.equal(productionTitle({kind:'unit',name:'Test Warrior',progress:{invested:-0.1,required:117}}),'Currently training: Test Warrior');
  for(const required of [0,-117,Infinity,NaN]) {
    assert.equal(productionProgressText({progress:{invested:0,required}}),'',`required=${required}`);
    assert.equal(productionTitle({kind:'unit',name:'Test Warrior',progress:{invested:0,required}}),'Currently training: Test Warrior',`required=${required}`);
  }
});

test('queue changes refresh only the production field and keep settlement order and yields',()=>{
  const a=makeCity({id:1,queue:[unit()]});
  const b=makeCity({id:2,queue:[building()]});
  setup({cities:[a,b]});
  const read=testReader();
  const cities=new Map([[1,a],[2,b]]);
  const rows=[
    {cityID:a.id,settlementNameData:{production:read(a)},yieldDeltas:[1,2,3]},
    {cityID:b.id,settlementNameData:{production:read(b)},yieldDeltas:[4,5,6]}
  ];
  const before=rows.map(row=>row.cityID.id);
  a.BuildQueue={getQueue:()=>[project()]};
  updateProduction(rows,id=>cities.get(id.id),read);
  assert.deepEqual(rows.map(row=>row.cityID.id),before);
  assert.equal(rows[0].settlementNameData.production.kind,'project');
  assert.equal(rows[0].settlementNameData.production.icon,'url(blp:project_PROJECT_TEST)');
  assert.equal(rows[1].settlementNameData.production.kind,'building');
  assert.equal(rows[1].settlementNameData.production.icon,'url(blp:building_BUILDING_TEST_BARRACKS)');
  assert.deepEqual(rows[0].yieldDeltas,[1,2,3]);
  assert.deepEqual(rows[1].yieldDeltas,[4,5,6]);
  assert.equal(productionTitle(rows[0].settlementNameData.production),'Working on project: Test Project');
});

test('a queue switch clears old progress before valid building progress and keeps salt scoring stable',()=>{
  const unitCity=makeCity({id:1,production:100,queue:[unit()]});
  const buildingCity=makeCity({id:2,production:200,queue:[building()]});
  const model=setup({cities:[unitCity,buildingCity],inventory:[raw(1)],slots:[{value:1}]});
  setQueueProgress(unitCity,{invested:112.1953125,required:117});
  const read=testReader();
  const unitPlan=snapshot(model,{},catalog(),{camels:false,assigned:false});
  assert.equal(planAllocation(unitPlan.resources,unitPlan.cities,'score')['plot:1'],undefined,
    'the existing ordinary production already finishes the current head');

  const rows=[{cityID:unitCity.id,settlementNameData:{production:read(unitCity)},yieldDeltas:[1,2,3]}];
  const oldProgress=rows[0].settlementNameData.production.progress;
  assert.equal(oldProgress.invested,112.1953125);
  unitCity.BuildQueue={getQueue:()=>[building()],currentBuildProgress:112.1953125,currentBuildProgressRequired:117,
    currentProductionKind:KIND.UNIT,currentProductionTypeHash:101};
  updateProduction(rows,id=>id.id===1?unitCity:buildingCity,read);
  assert.equal(rows[0].settlementNameData.production.kind,'building');
  assert.equal(rows[0].settlementNameData.production.progress,undefined,'old unit totals are not shown beside the new building');
  assert.deepEqual(rows[0].yieldDeltas,[1,2,3]);
  assert.equal(oldProgress.invested,112.1953125,'raw source data itself is not destructively cleared');

  setQueueProgress(unitCity,{invested:12.5,required:80});
  const refreshed=read(unitCity);
  assert.equal(refreshed.progress.invested,12.5);
  assert.equal(refreshed.progress.required,80);
  const buildingPlan=snapshot(model,{},catalog(),{camels:false,assigned:false});
  assert.equal(planAllocation(buildingPlan.resources,buildingPlan.cities,'score')['plot:1'],undefined,
    'valid progress display does not make unit-only salt score a building head');
});

test('SettlementProduction reads props.production reactively through native Tooltip.Text',()=>{
  const a=makeCity({id:1,queue:[unit()]});
  setup({cities:[a]});
  installLocale('en_US');
  const read=testReader();
  setQueueProgress(a);
  let production=read(a);
  const props={get production(){return production;}};
  const uiSource=readFileSync(new URL('../ui/rp-ui.js',import.meta.url),'utf8');
  const start=uiSource.indexOf('export function SettlementProduction');
  const end=uiSource.indexOf('\n}',start)+2;
  assert.ok(start>=0&&end>start);
  const effects=[],updates=[];
  const node=()=>{
    const classes=new Set();
    return {firstChild:null,nextSibling:null,style:{},attrs:{},classes,
      setAttribute(key,value){this.attrs[key]=value;},
      classList:{toggle(key,on){on?classes.add(key):classes.delete(key);}}};
  };
  const template=()=>{
    const root=node(),icon=node(),label=node(),progress=node(),value=node();
    root.firstChild=icon;icon.nextSibling=label;label.nextSibling=progress;progress.firstChild=value;
    return root;
  };
  const insert=(target,value)=>{
    const update=()=>{
      if(value&&value.component===Icon)target.icon=value;
      else target.text=typeof value==='function'?value():value;
    };
    update();updates.push(update);
  };
  const createEffect=fn=>{effects.push(fn);fn();};
  const createComponent=(component,componentProps)=>({component,props:componentProps});
  const Tooltip={Text:{kind:'tooltip'}};
  const Icon={kind:'native Icon component'};
  const render=vm.runInNewContext(uiSource.slice(start,end).replace('export ','')+';SettlementProduction',{
    Tooltip,Icon,createComponent,createEffect,template,insert,productionText,productionProgressText,productionTitle,productionTemplate:template
  });
  const wrapped=render(props);
  assert.equal(wrapped.component,Tooltip.Text);
  const el=wrapped.props.children;
  const icon=el.firstChild,label=icon.nextSibling,progress=label.nextSibling,value=progress.firstChild;
  assert.equal(label.text,'Training: Test Warrior');
  assert.equal(icon.style.backgroundImage,'url(blp:unit_UNIT_TEST_WARRIOR)');
  assert.equal(progress.style.display,'flex');
  assert.equal(progress.icon.component,Icon,'numeric yield icon uses the native Icon component');
  assert.equal(progress.icon.props.name,'url(blp:yield_YIELD_PRODUCTION)');
  assert.equal(progress.icon.props.isUrl,true);
  assert.equal(value.text,'112.2 / 117');
  assert.equal(wrapped.props.text,'Currently training: Test Warrior\nProduction progress: Production — 112.1953125 invested / 117 required');
  assert.equal(el.attrs['aria-label'],wrapped.props.text);

  a.Production={productionYieldSource:'YIELD_FOOD'};
  a.BuildQueue={getQueue:()=>[building()],currentBuildProgress:12.5,currentBuildProgressRequired:80,
    currentProductionKind:KIND.CONSTRUCTIBLE,currentProductionTypeHash:102};
  production=read(a);
  effects.forEach(effect=>effect());updates.forEach(update=>update());
  assert.equal(label.text,'Building: Test Barracks');
  assert.equal(icon.style.backgroundImage,'url(blp:building_BUILDING_TEST_BARRACKS)');
  assert.equal(progress.icon.props.name,'url(blp:yield_YIELD_FOOD)');
  assert.equal(value.text,'12.5 / 80');
  assert.ok(wrapped.props.text.includes('Production progress: Food — 12.5 invested / 80 required'));

  a.BuildQueue={getQueue:()=>[]};
  production=read(a);
  effects.forEach(effect=>effect());updates.forEach(update=>update());
  assert.equal(label.text,'No unit in training');
  assert.equal(icon.style.display,'none');
  assert.equal(progress.style.display,'none');
  assert.equal(progress.icon.props.name,'');
  assert.equal(value.text,'');
  assert.equal(wrapped.props.text,'No unit in training');
  assert.equal(el.attrs['aria-label'],'No unit in training');

  a.isTown=true;
  production=read(a);
  effects.forEach(effect=>effect());updates.forEach(update=>update());
  assert.equal(el.style.display,'none');
  assert.equal(label.text,'');
  assert.equal(wrapped.props.text,'');
  assert.equal(el.attrs['aria-label'],'');

  a.isTown=false;
  a.BuildQueue={getQueue:()=>[building()]};
  setQueueProgress(a);
  production=read(a);
  effects.forEach(effect=>effect());updates.forEach(update=>update());
  assert.equal(el.style.display,'');
  assert.equal(label.text,'Building: Test Barracks');
  assert.equal(progress.style.display,'flex');
  assert.ok(wrapped.props.text.includes('Constructing: Test Barracks'));
});

test('shipped runtime stays free of Chinese literals and new keys exist in both catalogs',()=>{
  const source=readFileSync(new URL('../ui/rp-game-adapter.js',import.meta.url),'utf8')+
    readFileSync(new URL('../ui/rp-ui.js',import.meta.url),'utf8')+
    readFileSync(new URL('../ui-next/screens/commerce/commerce-screen-resources-tab.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/[\p{Script=Han}]/u);
  for(const key of ['PRODUCTION_TRAINING','PRODUCTION_TRAINING_TIP','PRODUCTION_BUILDING','PRODUCTION_BUILDING_TIP','PRODUCTION_PROJECT','PRODUCTION_PROJECT_TIP','PRODUCTION_PROGRESS_TIP','PRODUCTION_NONE','PRODUCTION_UNKNOWN']){
    assert.ok(catalogs.en_US['LOC_RP_'+key]);
    assert.ok(catalogs.zh_Hans_CN['LOC_RP_'+key]);
  }
});


test('纯规划器拒绝空值伪造零上限并保留负条件收益',()=>{
  const live=makeCity({id:1,production:100,queue:[unit()]});
  const model=setup({cities:[live],inventory:[raw(1)],slots:[{value:1}]});
  const plan=snapshot(model,{},catalog(),{camels:false,assigned:false});
  const c=plan.cities[0],r=salt(plan);
  for(const invalid of [undefined,null,'0','120',NaN,Infinity,-1]) {
    c.productionRemaining=invalid;
    assert.equal(marginal(c,r).score,80,String(invalid));
  }
  c.productionRemaining=120;
  const penalty={...r,effects:r.effects.map(e=>({...e,amount:-20}))};
  assert.equal(marginal(c,penalty).score,-80);
  delete c.productionRateOffset;
  assert.equal(marginal(c,r).score,80,'无校准时偏移为零');
});

test('单位原生基准缺索引或不是单位类别时不调用，抛错安全回退',()=>{
  const live=makeCity({id:1,production:100,queue:[unit()]});
  const model=setup({cities:[live],inventory:[raw(1)],slots:[{value:1}]});
  setQueueProgress(live,{invested:0,required:120});
  let calls=0;
  live.Yields.calculateProductionSpecificYield=()=>{calls++;throw new Error('unavailable');};
  assert.equal(snapshot(model,{},catalog(),{}).cities[0].productionRateOffset,0);
  assert.equal(calls,1);
  const lookup=GameInfo.Yields.lookup;
  GameInfo.Yields.lookup=type=>{const v=lookup(type);if(!v)return v;const {$index,...rest}=v;return rest;};
  snapshot(model,{},catalog(),{});
  assert.equal(calls,1,'不能以虚构 Index 字段代替 $index');
  GameInfo.Yields.lookup=lookup;
  live.BuildQueue.getQueue=()=>[building()];
  setQueueProgress(live,{invested:0,required:120});
  snapshot(model,{},catalog(),{});
  assert.equal(calls,1,'建筑不冒用单位类别产能');
});
