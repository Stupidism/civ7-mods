import test from 'node:test';import assert from 'node:assert/strict';
import {createAutomation} from '../ui/automation.js';
import {normalizeConfig,normalizeSession,cityKey} from '../ui/rules.js';
function fixture(){
  const city={id:{owner:0,id:1},location:{x:1,y:1},name:'城',isTown:false};let state=normalizeSession(),config=normalizeConfig(),turn=1,ready=true,happiness=10,queue=[];const calls=[];
  const api={canRun:()=>true,context:()=>1,turn:()=>turn,cities:()=>[city],happiness:()=>happiness,growthReady:()=>ready,growthFingerprint:()=>String(ready),growthCandidates:()=>[{plot:1,legal:true,delta:{science:3,happiness:-1}}],assign:()=>calls.push('grow'),queue:()=>queue,projects:()=>['science','culture'],build:(c,k)=>calls.push(k),research:()=>({active:false,candidates:[{nodeType:9,depthUnlocked:0}]}),startResearch:()=>calls.push('research'),religionCities:()=>[],units:()=>[]};
  const a=createAutomation(api,{getConfig:()=>config,getSession:()=>state,saveSession:v=>state=v,report:(l,e)=>{throw e;}});
  return {api,a,city,calls,get state(){return state;},get config(){return config;},enableCity(){state.cities[cityKey(city)]={enabled:true};},setHappy:v=>happiness=v,setQueue:v=>queue=v,next:()=>turn++,notReady:()=>ready=false};
}
test('default state issues no gameplay request',()=>{const f=fixture();f.a.tick();assert.deepEqual(f.calls,[]);});
test('enabled city grows and starts project once despite repeated events',()=>{const f=fixture();f.enableCity();for(let i=0;i<10;i++)f.a.tick();assert.deepEqual(f.calls,['grow','science']);});
test('low happiness pauses growth, emits action reminder, keeps projects available',()=>{const f=fixture();f.enableCity();f.setHappy(0);f.a.tick();assert.deepEqual(f.calls,['science']);assert.equal(f.a.status.alerts.length,1);f.setHappy(10);f.a.tick();assert.equal(f.a.status.alerts.length,0);assert.ok(f.calls.includes('grow'));});
test('existing production queue is respected',()=>{const f=fixture();f.enableCity();f.setQueue([{}]);f.a.tick();assert.deepEqual(f.calls,['grow']);});
test('successive idle queues keep the highest scoring project despite legacy counts',()=>{
  const f=fixture();f.enableCity();f.notReady();f.config.weights.science=8;
  const key=cityKey(f.city);f.state.projects[key]={science:100,culture:0};
  for(let i=0;i<6;i++){
    f.a.tick();f.a.tick();
    f.setQueue([{kind:'science'}]);f.a.tick();
    f.next();f.setQueue([]);
  }
  assert.deepEqual(f.calls,Array(6).fill('science'));
  assert.deepEqual(f.state.projects[key],{science:100,culture:0});
});
test('city score override takes effect after an existing project completes',()=>{
  const f=fixture();f.enableCity();f.notReady();f.config.weights.science=8;
  f.a.tick();f.setQueue([{kind:'science'}]);
  Object.assign(f.state.cities[cityKey(f.city)],{override:true,weights:{science:4,culture:8}});
  f.a.tick();assert.deepEqual(f.calls,['science']);
  f.next();f.setQueue([]);f.a.tick();
  f.setQueue([{kind:'culture'}]);f.a.tick();f.next();f.setQueue([]);f.a.tick();
  assert.deepEqual(f.calls,['science','culture','culture']);
});
test('towns receive population but no city projects',()=>{const f=fixture();f.city.isTown=true;f.enableCity();f.a.tick();assert.deepEqual(f.calls,['grow']);});
test('only enabled research channels operate',()=>{const f=fixture();f.state.technology=true;f.a.tick();f.a.tick();assert.deepEqual(f.calls,['research']);});
test('active research is preserved',()=>{const f=fixture();f.state.technology=true;f.api.research=()=>({active:true,candidates:[{nodeType:9}]});f.a.tick();assert.deepEqual(f.calls,[]);});
test('inactive turn and disposed scheduler never submit requests',()=>{const f=fixture();f.enableCity();f.api.canRun=()=>false;f.a.tick();assert.deepEqual(f.calls,[]);f.api.canRun=()=>true;f.a.dispose();f.a.tick();assert.deepEqual(f.calls,[]);});
test('disabled military never moves units',()=>{const f=fixture();f.api.units=()=>[{}];f.api.classify=()=> 'military';f.a.tick();assert.deepEqual(f.calls,[]);});
test('military arrival sleeps instead of moving again',()=>{
  const f=fixture();f.state.military=true;f.api.units=()=>[{id:{owner:0,id:10}}];Object.assign(f.api,{classify:()=> 'military',onMap:()=>true,routeToCities:()=>({plot:1,city:f.city}),at:()=>true,unitFingerprint:()=> 'idle',sleep:()=>f.calls.push('sleep')});f.a.tick();f.a.tick();assert.deepEqual(f.calls,['sleep']);
});

function treasureFixture(){
  const f=fixture();f.state.treasure=true;const unit={id:{owner:0,id:10}};
  f.api.units=()=>[unit];Object.assign(f.api,{classify:()=> 'treasure',onMap:()=>true,homeland:()=>true,
    routeToCities:()=>({plot:1,city:f.city,location:f.city.location}),at:()=>true,
    canMove:()=>false,canRedeemTreasure:()=>true,redeemTreasure:()=>{f.calls.push('redeem');return true;}});
  return f;
}
test('treasure arrival redeems once despite repeated events and no remaining movement',()=>{
  const f=treasureFixture();f.state.orders={'0:10':{kind:'treasure',destination:f.city.location}};
  for(let i=0;i<10;i++)f.a.tick();assert.deepEqual(f.calls,['redeem']);assert.deepEqual(f.state.orders,{});assert.equal(f.a.status.actions,1);
});
test('treasure disabled, travelling, or unload not yet allowed never redeems',()=>{
  const f=treasureFixture();f.state.treasure=false;f.a.tick();
  f.state.treasure=true;f.api.at=()=>false;f.api.canRedeemTreasure=()=>false;f.a.tick();
  f.api.at=()=>true;f.api.canRedeemTreasure=()=>false;f.a.tick();assert.deepEqual(f.calls,[]);
  f.api.canRedeemTreasure=()=>true;f.a.tick();assert.deepEqual(f.calls,['redeem']);
});
test('treasure arriving during the same turn redeems after its move',()=>{
  const f=treasureFixture();let arrived=false;f.api.at=()=>arrived;f.api.canRedeemTreasure=()=>arrived;f.api.canMove=()=>true;
  f.api.move=()=>{f.calls.push('move');return true;};f.a.tick();arrived=true;f.a.tick();f.a.tick();
  assert.deepEqual(f.calls,['move','redeem']);assert.deepEqual(f.state.orders,{});
});
test('native legal treasure unload does not depend on reaching or routing to the city center',()=>{
  const f=treasureFixture();f.api.routeToCities=()=>{throw Error('unnecessary route');};f.api.at=()=>false;
  f.a.tick();assert.deepEqual(f.calls,['redeem']);
});
test('path planning is batched and cached for the turn',()=>{
  const f=fixture();f.state.military=true;let plans=0;f.api.units=()=>Array.from({length:10},(_,i)=>({id:{owner:0,id:i+20}}));
  Object.assign(f.api,{classify:()=> 'military',onMap:()=>true,routeToCities:()=>{plans++;return null;}});
  f.a.tick();assert.equal(plans,4);f.a.tick();assert.equal(plans,8);f.a.tick();assert.equal(plans,10);f.a.tick();assert.equal(plans,10);
});
test('turning automation off cancels only its tracked moving units',()=>{
  const f=fixture();f.state.orders={'0:20':{kind:'military',destination:{x:1,y:1}}};f.api.units=()=>[{id:{owner:0,id:20}},{id:{owner:0,id:21}}];
  Object.assign(f.api,{classify:()=> 'military',cancelOrder:u=>f.calls.push(u.id.id)});f.a.tick();assert.deepEqual(f.calls,[20]);assert.deepEqual(f.state.orders,{});
});
