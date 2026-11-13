import test from 'node:test';
import assert from 'node:assert/strict';
import {YIELDS,cityYieldVector,marginal,planAllocation,planUtility} from '../ui/rp-planner.js';
import {snapshot} from '../ui/rp-game-adapter.js';

const KIND={UNIT:1,CONSTRUCTIBLE:2,PROJECT:3};
const STEP_TYPES={ADDITION:1,ATTRIBUTE:4};
const UNIT={UnitType:'UNIT_TEST_WARRIOR',Name:'LOC_UNIT_TEST_WARRIOR',Domain:'DOMAIN_LAND'};
const RESOURCES={
  RESOURCE_SALT:{ResourceType:'RESOURCE_SALT',Name:'Salt',ResourceClassType:'RESOURCECLASS_BONUS',BonusResourceSlots:0},
  RESOURCE_WOOL:{ResourceType:'RESOURCE_WOOL',Name:'Wool',ResourceClassType:'RESOURCECLASS_BONUS',BonusResourceSlots:0},
  RESOURCE_COTTON:{ResourceType:'RESOURCE_COTTON',Name:'Cotton',ResourceClassType:'RESOURCECLASS_BONUS',BonusResourceSlots:0}
};

function setup({cities=[],inventory=[],slots=[]}={}) {
  const yields=YIELDS.map((YieldType,$index)=>({YieldType,$index,Name:`LOC_${YieldType}_NAME`}));
  yields.lookup=type=>yields.find(value=>value.YieldType===type);
  globalThis.GameInfo={
    Yields:yields,
    Resources:{lookup:type=>RESOURCES[type]},
    Units:{lookup:type=>type==='UNIT_TEST_WARRIOR'?UNIT:undefined},
    Constructibles:{lookup:()=>undefined},
    Projects:{lookup:()=>undefined},
    TypeTags:[{Type:'UNIT_TEST_WARRIOR',Tag:'UNIT_CLASS_INFANTRY'}]
  };
  globalThis.ProductionKind=KIND;
  globalThis.GameValueStepTypes=STEP_TYPES;
  globalThis.Locale={compose:key=>key.startsWith('LOC_')?'Test Production':key};
  globalThis.GameContext={localPlayerID:0};
  globalThis.Players={get:()=>({Cities:{getCities:()=>cities},Resources:{getResources:()=>inventory}})};
  globalThis.Cities={get:id=>cities.find(city=>city.id.id===id.id)};
  globalThis.Game={getHash:()=>1,Resources:{getOriginCity:()=>cities[0]?.id},PlayerOperations:{canStart:()=>({Success:true})}};
  globalThis.PlayerOperationTypes={ASSIGN_RESOURCE:1};
  globalThis.PlayerOperationParameters={Deactivate:2};
  globalThis.GameplayMap={getLocationFromIndex:()=>({x:0,y:0})};
  globalThis.MapConstructibles={getHiddenFilteredConstructibles:()=>[]};
  globalThis.Constructibles={getByComponentID:()=>({damaged:false})};
  return {data:{resourceTabData:{availableResourceSectionData:[{subSections:[{resourceSlotData:slots.map(({value})=>({resourceValue:value,isOffMap:false}))}]}]}}};
}

function makeCity({id=1,production=100,assigned=[],capacity=3}={}) {
  const values=YIELDS.map((YieldType,index)=>index===1?production:0);
  return {
    id:{owner:0,id,type:1},owner:0,name:'LOC_CITY',originalOwner:0,isTown:false,isCapital:false,isDistantLands:false,
    location:{x:id,y:0},Trade:{isInTradeNetwork:()=>true},
    Resources:{getAssignedResources:()=>assigned,getAssignedResourcesCap:()=>capacity},
    Yields:{getYields:()=>values.map(value=>({value,base:{value},modifier:{value:0}}))},
    BuildQueue:{getQueue:()=>[{kind:KIND.UNIT,type:101,unitType:'UNIT_TEST_WARRIOR'}]},
    Constructibles:{getIds:()=>[]}
  };
}

function raw(value,type='RESOURCE_SALT'){return {value,isOffMap:false,uniqueResource:{resource:type}};}
function setProgress(city,required=100) {
  Object.assign(city.BuildQueue,{currentBuildProgress:0,currentBuildProgressRequired:required,
    currentProductionKind:KIND.UNIT,currentProductionTypeHash:101});
}
function nativeTree(base,percent,value=base*(1+percent/100),type=STEP_TYPES.ATTRIBUTE) {
  return {value,type,base:{value:base},modifier:{value:percent}};
}
function catalog() {
  return new Map([
    ['RESOURCE_SALT',[{kind:'construction',yield:'YIELD_PRODUCTION',amount:20,queue:{kind:'unit'}}]],
    ['RESOURCE_WOOL',[{kind:'flat',yield:'YIELD_PRODUCTION',amount:2}]],
    ['RESOURCE_COTTON',[{kind:'percent',yield:'YIELD_PRODUCTION',amount:10}]]
  ]);
}
function byId(cities,id){return cities.find(city=>city.id.id===id);}
function wool(plan){return plan.resources.find(resource=>resource.type==='RESOURCE_WOOL');}

test('structural native unit percent scores candidate ordinary production',()=>{
  const strong=makeCity({id:1,production:60}),weak=makeCity({id:2,production:10});
  const model=setup({cities:[strong,weak],inventory:[raw(1,'RESOURCE_WOOL')],slots:[{value:1}]});
  setProgress(strong);setProgress(weak,1000);
  const calls=[];
  strong.Yields.calculateProductionSpecificYield=(...args)=>{calls.push(args);return nativeTree(60,50,90);};
  weak.Yields.calculateProductionSpecificYield=()=>nativeTree(10,20,12);
  const plan=snapshot(model,{},catalog(),{camels:false,assigned:false});
  const target=byId(plan.cities,1),other=byId(plan.cities,2),resource=wool(plan);
  assert.deepEqual(calls,[[1,KIND.UNIT,false]]);
  assert.equal(target.productionExtraPercent,50);
  assert.equal(target.productionRateOffset,0);
  assert.equal(other.productionExtraPercent,20);
  assert.equal(marginal(target,resource).score,12,'60*1.5 gains 3 from a 2-flat resource');
  assert.ok(Math.abs(marginal(other,resource).score-9.6)<1e-9,'10*1.2 loses to 60*1.5');
  const cityState={key:target.key,base:[...target.base],multiplier:[...target.multiplier],offset:[...target.offset],
    postMultiplier:[...target.postMultiplier],construction:target.construction,remaining:target.productionRemaining,
    extra:target.productionExtraPercent,rateOffset:target.productionRateOffset};
  const resourceState=plan.resources.map(item=>({key:item.key,type:item.type,original:item.original,allowed:[...item.allowed]}));
  const allocation=planAllocation(plan.resources,plan.cities,'score');
  assert.deepEqual(allocation,{'plot:1':target.key});
  assert.deepEqual(planAllocation(plan.resources,plan.cities,'score'),allocation);
  assert.deepEqual({key:target.key,base:[...target.base],multiplier:[...target.multiplier],offset:[...target.offset],
    postMultiplier:[...target.postMultiplier],construction:target.construction,remaining:target.productionRemaining,
    extra:target.productionExtraPercent,rateOffset:target.productionRateOffset},cityState);
  assert.deepEqual(plan.resources.map(item=>({key:item.key,type:item.type,original:item.original,allowed:[...item.allowed]})),resourceState);

  const rawBefore=cityYieldVector(target,[]),rawAfter=cityYieldVector(target,[resource]);
  assert.equal(rawAfter[1]-rawBefore[1],2,'raw/UI production remains an ordinary flat delta');
  const before=planUtility({},plan.resources,plan.cities);
  const after=planUtility({[resource.key]:target.key},plan.resources,plan.cities);
  assert.equal(after-before,marginal(target,resource).score,'marginal and plan utility agree');

  target.tendency={YIELD_PRODUCTION:2};
  assert.equal(marginal(target,resource).score,24);
  target.tendency={YIELD_PRODUCTION:0};
  assert.equal(marginal(target,resource).score,0);
});

test('structural native percent preserves the production waste rule',()=>{
  const check=(required,expected)=>{
    const city=makeCity({id:1,production:60});
    const model=setup({cities:[city],inventory:[raw(1,'RESOURCE_WOOL')],slots:[{value:1}]});
    setProgress(city,required);
    city.Yields.calculateProductionSpecificYield=()=>nativeTree(60,50,90);
    const plan=snapshot(model,{},catalog(),{camels:false,assigned:false});
    assert.equal(marginal(plan.cities[0],wool(plan)).score,expected,`required=${required}`);
  };
  check(100,12);
  check(80,0);
  check(30,8);
});

test('ordinary flat and percent resources stay additive with the native percent',()=>{
  const city={key:'city',base:[0,60,0,0,0,0,0],multiplier:Array(7).fill(1),offset:Array(7).fill(0),
    postMultiplier:Array(7).fill(1),tags:{},assigned:[],construction:0,productionRemaining:1000,
    productionExtraPercent:50,productionRateOffset:0,queue:{kind:'unit',tags:[]},tendency:{}};
  const effect=(kind,amount,index)=>({key:`${kind}:${amount}:${index}`,effects:[{kind,yield:'YIELD_PRODUCTION',amount,...(kind==='construction'?{queue:{kind:'unit'}}:{})}]});
  const flat1=effect('flat',2,1),flat2=effect('flat',2,2),percent1=effect('percent',10,1),percent2=effect('percent',10,2),salt1=effect('construction',20,1),salt2=effect('construction',20,2);
  assert.equal(marginal(city,flat1).score,12);
  assert.equal(marginal(city,flat2,[flat1]).score,12);
  assert.equal(marginal(city,percent1).score,36);
  assert.equal(marginal(city,percent2,[percent1]).score,36);
  assert.equal(marginal(city,salt1).score,48);
  assert.equal(marginal(city,salt2,[salt1]).score,48);
  const resources=[flat1,flat2,percent1,percent2,salt1,salt2];
  const none=planUtility({},resources,[city]);
  const all=planUtility(Object.fromEntries(resources.map(resource=>[resource.key,city.key])),resources,[city]);
  assert.ok(Math.abs(all-none-223.68)<1e-9,'all percentages add; no compounding is credited');
});

test('fixed and movable assigned salt are each subtracted exactly once',()=>{
  const original=raw(1),extra=raw(2),ordinary=raw(3,'RESOURCE_WOOL');
  const fixedCity=makeCity({id:1,production:60,assigned:[original],capacity:4});
  const fixedModel=setup({cities:[fixedCity],inventory:[original,extra,ordinary],slots:[{value:1},{value:2},{value:3}]});
  setProgress(fixedCity,100);
  fixedCity.Yields.calculateProductionSpecificYield=()=>nativeTree(60,40,84);
  const fixed=snapshot(fixedModel,{},catalog(),{camels:false,assigned:false});
  const fixedTarget=fixed.cities[0];
  assert.equal(fixedTarget.construction,20);
  assert.equal(fixedTarget.productionExtraPercent,20);
  assert.ok(Math.abs(marginal(fixedTarget,fixed.resources.find(r=>r.type==='RESOURCE_WOOL')).score-11.2)<1e-9);

  const movableCity=makeCity({id:1,production:60,assigned:[original],capacity:4});
  const movableModel=setup({cities:[movableCity],inventory:[original,extra,ordinary],slots:[{value:1},{value:2},{value:3}]});
  setProgress(movableCity,100);
  movableCity.Yields.calculateProductionSpecificYield=()=>nativeTree(60,40,84);
  const movable=snapshot(movableModel,{},catalog(),{camels:false,assigned:true});
  const movableTarget=movable.cities[0],originalCandidate=movable.resources.find(r=>r.key==='plot:1');
  const extraCandidate=movable.resources.find(r=>r.key==='plot:2');
  assert.equal(movableTarget.construction,0);
  assert.equal(movableTarget.productionExtraPercent,20);
  assert.equal(marginal(movableTarget,originalCandidate).score,48,'the movable original is absent from the scored baseline');
  assert.equal(marginal(movableTarget,extraCandidate,[originalCandidate]).score,48,'construction percentages add');
  assert.ok(Math.abs(marginal(movableTarget,movable.resources.find(r=>r.type==='RESOURCE_WOOL'),[originalCandidate]).score-11.2)<1e-9);
});

test('a zero native base stays finite and still scales candidate ordinary production',()=>{
  const city=makeCity({id:1,production:0});
  const model=setup({cities:[city],inventory:[raw(1,'RESOURCE_WOOL')],slots:[{value:1}]});
  setProgress(city,100);
  city.Yields.calculateProductionSpecificYield=()=>nativeTree(0,50,0);
  const plan=snapshot(model,{},catalog(),{camels:false,assigned:false});
  const target=plan.cities[0];
  assert.equal(target.productionExtraPercent,50);
  assert.ok(Number.isFinite(target.productionRateOffset));
  assert.equal(marginal(target,wool(plan)).score,12);
  assert.equal(marginal(target,wool(plan)).yields[1],2);
});

test('fixed-point ATTRIBUTE examples validate; mismatched or unknown derivatives fall back',()=>{
  const check=(production,tree,extra,offset)=>{
    const city=makeCity({id:1,production});
    const model=setup({cities:[city],inventory:[raw(1,'RESOURCE_SALT')],slots:[{value:1}]});
    setProgress(city,200);
    city.Yields.calculateProductionSpecificYield=()=>tree;
    const plan=snapshot(model,{},catalog(),{camels:false,assigned:false});
    assert.equal(plan.cities[0].productionExtraPercent,extra,`production=${production}`);
    assert.ok(Math.abs(plan.cities[0].productionRateOffset-offset)<1e-12,`production=${production}`);
  };
  check(77,nativeTree(77,40,107.796875),40,-0.003125);
  check(71,nativeTree(71,60,113.59765625),60,-0.00234375);
  const malformed=nativeTree(60,50,90);
  check(77,{...malformed,type:STEP_TYPES.ADDITION},0,13);
  check(77,{...malformed,base:{value:60}},0,13);
  check(60,{...malformed,modifier:{value:-101}},0,30);
  check(60,{...malformed,value:91},0,31);
  check(60,{value:90},0,30);
});

test('non-number native final rates are rejected rather than coerced',()=>{
  const check=rate=>{
    const city=makeCity({id:1,production:60});
    const model=setup({cities:[city],inventory:[raw(1)],slots:[{value:1}]});
    setProgress(city,100);
    let calls=0;
    city.Yields.calculateProductionSpecificYield=()=>{calls++;return {...nativeTree(60,50,90),value:rate};};
    const plan=snapshot(model,{},catalog(),{camels:false,assigned:false});
    assert.equal(calls,1,`rate=${String(rate)}`);
    assert.equal(plan.cities[0].productionExtraPercent,0,`rate=${String(rate)}`);
    assert.equal(plan.cities[0].productionRateOffset,0,`rate=${String(rate)}`);
  };
  check('90');
  check(null);
});

test('malformed structural base or percent values use scalar fallback only',()=>{
  const check=tree=>{
    const city=makeCity({id:1,production:60});
    const model=setup({cities:[city],inventory:[raw(1)],slots:[{value:1}]});
    setProgress(city,100);
    let calls=0;
    city.Yields.calculateProductionSpecificYield=()=>{calls++;return tree;};
    const plan=snapshot(model,{},catalog(),{camels:false,assigned:false});
    assert.equal(calls,1);
    assert.equal(plan.cities[0].productionExtraPercent,0);
    assert.equal(plan.cities[0].productionRateOffset,30);
  };
  const valid=nativeTree(60,50,90);
  check({...valid,base:{value:'60'}});
  check({...valid,base:{value:null}});
  check({...valid,modifier:{value:'50'}});
  check({...valid,modifier:{value:null}});
});

test('invalid, stale and food progress never query the structural production tree',()=>{
  const check=(mutate,label)=>{
    const city=makeCity({id:1,production:60});
    const model=setup({cities:[city],inventory:[raw(1)],slots:[{value:1}]});
    setProgress(city,100);
    mutate(city);
    const calls=[];
    city.Yields.calculateProductionSpecificYield=(...args)=>{calls.push(args);return nativeTree(60,50,90);};
    const plan=snapshot(model,{},catalog(),{camels:false,assigned:false});
    assert.deepEqual(calls,[],label);
    assert.equal(plan.cities[0].productionRemaining,undefined,label);
    assert.equal(plan.cities[0].productionExtraPercent,0,label);
    assert.equal(plan.cities[0].productionRateOffset,0,label);
  };
  check(city=>{city.BuildQueue.currentBuildProgress='0';},'string invested progress');
  check(city=>{city.BuildQueue.currentBuildProgressRequired=null;},'null required progress');
  check(city=>{city.BuildQueue.currentProductionKind=KIND.CONSTRUCTIBLE;},'stale production kind');
  check(city=>{city.Production={productionYieldSource:'YIELD_FOOD'};},'food production progress');
});
