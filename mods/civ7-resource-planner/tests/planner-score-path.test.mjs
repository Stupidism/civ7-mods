import test from 'node:test';
import assert from 'node:assert/strict';
import {marginal,marginalScore,planAllocation,planUtility} from '../ui/rp-planner.js';

const productionCity=(extra={})=>({
  key:'a',base:[0,60,0,0,0,0,0],multiplier:[1,1.5,1,1,1,1,1],tags:{},capacity:1,
  queue:{kind:'unit',tags:[]},...extra
});
const productionResource=(amount=2,key='r')=>({
  key,allowed:['a','b'],effects:[{kind:'flat',amount,yield:'YIELD_PRODUCTION'}]
});

test('marginalScore matches public marginal across production and preference variants',()=>{
  const variants=[
    ['uncapped production',{},undefined,12,3],
    ['capped production',{productionRemaining:80},undefined,0,3],
    ['cap crossing',{base:[0,50,0,0,0,0,0],productionRemaining:80},undefined,12,3],
    ['native rate offset',{multiplier:Array(7).fill(1),productionRateOffset:10,productionRemaining:80},undefined,8,2],
    ['native extra percent',{multiplier:Array(7).fill(1),productionExtraPercent:50,productionRemaining:80},undefined,0,2],
    ['production preference x2',{productionRemaining:80},{YIELD_PRODUCTION:2},0,3],
    ['production preference off',{productionRemaining:80},{YIELD_PRODUCTION:0},0,3],
    ['unrelated preference keeps weight',{productionRemaining:80},{YIELD_GOLD:2},0,3]
  ];
  for(const [name,cityExtra,tendency,expectedScore,expectedYield] of variants) {
    const city=productionCity({...cityExtra,tendency});
    const resource=productionResource();
    const full=marginal(city,resource);
    assert.equal(marginalScore(city,resource),full.score,`${name}: score helper`);
    assert.equal(full.score,expectedScore,`${name}: expected score`);
    assert.equal(full.yields[1],expectedYield,`${name}: display yield remains uncapped`);
  }
});

test('score planning preserves cap and native-modifier choices',()=>{
  const resource=productionResource();
  const capped=productionCity({key:'a',productionRemaining:80});
  const useful=productionCity({key:'b',base:[0,50,0,0,0,0,0],multiplier:Array(7).fill(1),productionRemaining:80});
  assert.deepEqual(planAllocation([resource],[capped,useful],'score'),{r:'b'});

  const strongNative=productionCity({key:'a',multiplier:Array(7).fill(1),productionExtraPercent:50,productionRemaining:80});
  const weakNative=productionCity({key:'b',base:[0,10,0,0,0,0,0],multiplier:Array(7).fill(1),productionExtraPercent:20,productionRemaining:80});
  assert.deepEqual(planAllocation([resource],[strongNative,weakNative],'score'),{r:'b'});
  assert.equal(marginalScore(strongNative,resource),0);
  assert.ok(Math.abs(marginalScore(weakNative,resource)-9.6)<1e-9);
});

test('score planning preserves preference-mode allocation behavior',()=>{
  const mixed={
    key:'r',allowed:['a','b'],
    effects:[
      {kind:'flat',amount:2,yield:'YIELD_PRODUCTION'},
      {kind:'flat',amount:2,yield:'YIELD_GOLD'}
    ]
  };
  const city=extra=>productionCity({multiplier:Array(7).fill(1),...extra});
  const productionPreferred=[city({key:'a',tendency:{YIELD_PRODUCTION:2}}),city({key:'b',tendency:{YIELD_GOLD:2}})];
  const goldPreferred=[city({key:'a',tendency:{YIELD_GOLD:0}}),city({key:'b',tendency:{YIELD_GOLD:2}})];
  assert.deepEqual(planAllocation([mixed],productionPreferred,'tendency'),{r:'a'});
  assert.deepEqual(planAllocation([mixed],goldPreferred,'tendency'),{r:'b'});

  for(const [cities,expected] of [[productionPreferred,'a'],[goldPreferred,'b']]) {
    const plan=planAllocation([mixed],cities,'score');
    assert.deepEqual(plan,{r:expected});
    assert.equal(
      planUtility(plan,[mixed],cities)-planUtility({},[mixed],cities),
      marginalScore(cities.find(c=>c.key===expected),mixed)
    );
  }
});

test('score-only paths do not compute public marginal display deltas',()=>{
  const city=productionCity({base:[0,0,10,0,0,0,0],multiplier:Array(7).fill(1)});
  const effects=[{kind:'flat',amount:10,yield:'YIELD_GOLD'}];
  const publicResource={key:'public',allowed:['a']};
  let reads=0;
  Object.defineProperty(publicResource,'effects',{get(){reads++;return effects;}});
  assert.equal(marginal(city,publicResource).score,10);
  assert.equal(reads,2,'public marginal computes one scored and one raw candidate evaluation');

  const scoreResource={key:'score',allowed:['a']};
  reads=0;
  Object.defineProperty(scoreResource,'effects',{get(){reads++;return effects;}});
  assert.equal(marginalScore(city,scoreResource),10);
  assert.equal(reads,1,'score-only helper skips the raw display evaluation');

  const planned=productionCity({base:[0,0,10,0,0,0,0],multiplier:Array(7).fill(1)});
  const planningResource={key:'plan',allowed:['a']};
  reads=0;
  Object.defineProperty(planningResource,'effects',{get(){reads++;return effects;}});
  assert.deepEqual(planAllocation([planningResource],[planned],'score'),{plan:'a'});
  assert.equal(
    reads,
    4,
    'matching, improve pruning, its local effect cache, and final utility each read effects once; no raw-delta pair is added'
  );
});
