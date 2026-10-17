import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, normalizeSession, normalizeCity, citySettings, cityKey, DEFAULT_WEIGHTS, PRESETS, score, happinessWeight, chooseGrowth, chooseProject, createRequestGate, targetAllowed, rankRoutes } from '../ui/rules.js';
import { createConfigStore, createSessionStore } from '../ui/storage.js';
test('new save requires opt in for every automation',()=>{
  const s=normalizeSession(); for(const k of ['military','treasure','religion','technology','culture'])assert.equal(s[k],false);
  assert.deepEqual(s.cities,{});assert.equal(normalizeCity().enabled,false);
});
test('specified defaults and presets',()=>{
  assert.deepEqual(Object.values(DEFAULT_WEIGHTS),[1,2,4,4,4,8]);
  assert.deepEqual(Object.values(PRESETS.science),[1,2,8,4,4,8]);
  assert.deepEqual(Object.values(PRESETS.culture),[1,2,4,8,4,8]);
  assert.deepEqual(Object.values(PRESETS.gold),[4,2,4,4,4,8]);
  assert.deepEqual(normalizeConfig().religionTargets,{own:true,cityStates:false,foreign:false});
});
test('normalization rejects malformed data and bounds numeric input',()=>{
  const c=normalizeConfig({weights:{gold:NaN,food:-8,science:200,culture:'99'},minHappiness:Infinity,militaryMode:'both'});
  assert.deepEqual(c.weights,{gold:1,food:0,science:100,culture:4,production:4,happiness:8});assert.equal(c.minHappiness,0);assert.equal(c.militaryMode,'nearest');
  assert.equal(normalizeSession({military:'true'}).military,false);
});
const city={id:{owner:0,id:12},location:{x:3,y:5}};
test('city override and inheritance are independent',()=>{
  const cfg=normalizeConfig({weights:{science:9},minHappiness:10});const state=normalizeSession();
  state.cities[cityKey(city)]={enabled:true,override:false,weights:PRESETS.gold,minHappiness:1};
  assert.equal(citySettings(cfg,state,city).weights.science,9);
  state.cities[cityKey(city)].override=true;assert.equal(citySettings(cfg,state,city).weights.gold,4);assert.equal(citySettings(cfg,state,city).minHappiness,1);
  assert.notEqual(cityKey(city),cityKey({...city,id:{owner:1,id:12}}));
});
const candidate=(plot,delta,legal=true)=>({plot,delta:{gold:0,food:0,science:0,culture:0,production:0,happiness:0,...delta},legal});
test('weighted growth uses net benefit and stable plot tie break',()=>{
  const c=[candidate(8,{gold:12}),candidate(7,{science:4}),candidate(6,{science:4})];
  assert.equal(chooseGrowth(c,DEFAULT_WEIGHTS,10,0).plot,6);
  assert.equal(chooseGrowth(c,PRESETS.gold,10,0).plot,8);
});

test('smile weight is eight only when the current happiness is negative',()=>{
  const delta={gold:1,food:1,science:1,culture:1,production:1,happiness:2};
  assert.equal(score(delta,DEFAULT_WEIGHTS,-1),31);
  assert.equal(score(delta,DEFAULT_WEIGHTS,1),15);
  assert.equal(score(delta,DEFAULT_WEIGHTS,0),15);
  assert.equal(happinessWeight(DEFAULT_WEIGHTS,-0.01),8);
});

test('negative happiness prioritizes smile yield and penalizes smile losses',()=>{
  const c=[candidate(1,{science:3}),candidate(2,{happiness:2}),candidate(3,{science:6,happiness:-2})];
  assert.equal(chooseGrowth(c,DEFAULT_WEIGHTS,-5,-10).plot,2);
  assert.equal(chooseGrowth(c,DEFAULT_WEIGHTS,5,-10).plot,3);
  assert.equal(chooseGrowth(c,DEFAULT_WEIGHTS,0,-10).plot,3);
  assert.equal(chooseGrowth(c,DEFAULT_WEIGHTS,-5,0),null);
});

test('smile switch uses the current value, even when candidate would cross zero',()=>{
  const c=[candidate(1,{science:3}),candidate(2,{happiness:2})];
  assert.equal(chooseGrowth(c,DEFAULT_WEIGHTS,-1,-5).plot,2);
  assert.equal(chooseGrowth(c,DEFAULT_WEIGHTS,1,-5).plot,1);
  assert.equal(DEFAULT_WEIGHTS.happiness,8);
});

test('legacy global and city weights gain smile weight without losing overrides',()=>{
  const legacy={gold:3,food:5,science:9,culture:2,production:7};
  assert.deepEqual(normalizeConfig({weights:legacy}).weights,{...legacy,happiness:8});
  assert.deepEqual(normalizeCity({enabled:true,override:true,weights:legacy}).weights,{...legacy,happiness:8});
  const cfg=normalizeConfig({weights:{happiness:12}}),session=normalizeSession();
  session.cities[cityKey(city)]={enabled:true,override:false,weights:{happiness:6}};
  assert.equal(happinessWeight(citySettings(cfg,session,city).weights,-1),12);
  session.cities[cityKey(city)].override=true;
  assert.equal(happinessWeight(citySettings(cfg,session,city).weights,-1),6);
  assert.equal(happinessWeight(citySettings(cfg,session,city).weights,1),0);
});
test('happiness guard tests the resulting happiness strictly above threshold',()=>{
  const c=[candidate(1,{science:100,happiness:-6}),candidate(2,{gold:1,happiness:-4})];
  assert.equal(chooseGrowth(c,DEFAULT_WEIGHTS,10,5).plot,2);
  assert.equal(chooseGrowth(c,DEFAULT_WEIGHTS,10,6),null);
  assert.equal(chooseGrowth(c,DEFAULT_WEIGHTS,5,5),null);
  assert.equal(chooseGrowth(c,DEFAULT_WEIGHTS,undefined,0),null);
});
test('unknown previews and illegal commands are excluded',()=>{
  assert.equal(chooseGrowth([candidate(1,{science:99},false),candidate(2,{happiness:NaN})],DEFAULT_WEIGHTS,10,0),null);
});
test('project selection always chooses the highest score regardless of history',()=>{
  for(const [ratio,expected] of [[PRESETS.science,'science'],[PRESETS.culture,'culture']]){
    const counts={science:100,culture:100};
    for(let i=0;i<60;i++){
      const chosen=chooseProject(['science','culture'],ratio,counts);
      assert.equal(chosen,expected);counts[chosen]++;
    }
  }
});
test('equal project scores use science consistently regardless of list order',()=>{
  assert.equal(chooseProject(['science','culture'],DEFAULT_WEIGHTS),'science');
  assert.equal(chooseProject(['culture','science'],DEFAULT_WEIGHTS),'science');
});
test('unavailable and zero weighted projects are never selected',()=>{
  assert.equal(chooseProject(['culture'],PRESETS.science),'culture');
  assert.equal(chooseProject(['science','culture'],{science:0,culture:0}),null);
  assert.equal(chooseProject(['science','culture'],{science:0,culture:4}),'culture');
});
test('target ownership filters are independent',()=>{
  const c=normalizeConfig().religionTargets;
  assert.equal(targetAllowed(0,0,false,c),true);assert.equal(targetAllowed(1,0,true,c),false);assert.equal(targetAllowed(2,0,false,c),false);
  c.cityStates=true;assert.equal(targetAllowed(1,0,true,c),true);assert.equal(targetAllowed(2,0,false,c),false);
});
test('route selection ignores unreachable cities',()=>assert.equal(rankRoutes([{plot:2,cost:Infinity},{plot:1,cost:3},{plot:0,cost:3}])[0].plot,0));
test('request gate suppresses duplicate asynchronous events and allows state changes',()=>{
  const g=createRequestGate();let calls=0;assert.equal(g.run('u','a',()=>calls++),true);assert.equal(g.run('u','a',()=>calls++),false);
  g.run('u','b',()=>calls++);assert.equal(calls,2);g.clear();g.run('u','b',()=>calls++);assert.equal(calls,3);
});
test('request gate permits retry after synchronous failure',()=>{
  const g=createRequestGate();assert.throws(()=>g.run('u','a',()=>{throw Error('reject');}));assert.equal(g.run('u','a',()=>{}),true);
});
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};};
test('saving global settings preserves other mods and re-reads before write',()=>{
  const m=memory();m.setItem('modSettings',JSON.stringify({other:{x:1}}));const s=createConfigStore(m);s.save(normalizeConfig());
  const raw=JSON.parse(m.getItem('modSettings'));raw.newer={y:2};m.setItem('modSettings',JSON.stringify(raw));s.save(normalizeConfig({minHappiness:5}));
  const result=JSON.parse(m.getItem('modSettings'));assert.deepEqual(result.other,{x:1});assert.deepEqual(result.newer,{y:2});assert.equal(s.load().minHappiness,5);
});
test('corrupt shared settings are not overwritten',()=>{
  const m=memory();m.setItem('modSettings','{bad');assert.throws(()=>createConfigStore(m).save({}));assert.equal(m.getItem('modSettings'),'{bad');
});
test('per-save storage isolates players and ages; shell cannot enable automation',()=>{
  const values=new Map();const api={Game:{age:1},GameContext:{localPlayerID:0},Players:{get:()=>({})},Database:{makeHash:v=>v},GameTutorial:{getProperty:k=>values.get(k),setProperty:(k,v)=>values.set(k,v)}};
  const s=createSessionStore(api);s.save({military:true});assert.equal(s.load().military,true);
  api.Game.age=2;assert.equal(s.load().military,false);api.Game.age=1;api.GameContext.localPlayerID=1;assert.equal(s.load().military,false);
  const shell=createSessionStore({});assert.equal(shell.available(),false);assert.throws(()=>shell.save({military:true}));
});
