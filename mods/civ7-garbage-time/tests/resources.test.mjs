import test from 'node:test';
import assert from 'node:assert/strict';
import {createResourceAutomation} from '../ui/resource-automation.js';
import {normalizeSession,normalizeConfig} from '../ui/rules.js';
const flush=()=>new Promise(r=>setImmediate(r));
function fixture(){
  const f={state:normalizeSession(),turn:50,scope:'game1',active:true,blocked:false,ready:true,calls:0,errors:[],run:async()=>({message:'已完成'})};
  f.args={run:g=>{f.calls++;f.guard=g;return f.run(g);},getSession:()=>f.state,saveSession:s=>f.state=s,
    context:()=>({scope:f.scope,turn:f.turn}),canRun:()=>f.active,blocked:()=>f.blocked,ready:()=>f.ready,report:(l,e)=>f.errors.push(e)};
  f.a=createResourceAutomation(f.args);return f;
}
test('resource automation is opt in and defaults exclude camels and assigned resources',async()=>{
  const f=fixture();f.a.tick();await flush();assert.equal(f.calls,0);
  assert.deepEqual(normalizeConfig().resourceOptions,{camels:false,assigned:false});
});
test('one allocation per turn survives repeated events and reload',async()=>{
  const f=fixture();f.state.resources=true;f.a.tick();f.a.tick();await flush();
  f.a.tick();assert.equal(f.calls,1);assert.equal(f.state.resourceTurn,50);
  f.a.dispose();f.a=createResourceAutomation(f.args);f.a.tick();await flush();assert.equal(f.calls,1);
  f.turn++;f.a.tick();await flush();assert.equal(f.calls,2);
});
test('locked resources do not block other automation and run when unlocked',async()=>{
  const f=fixture();f.state.resources=true;f.ready=false;f.a.tick();await flush();
  assert.equal(f.calls,0);assert.equal(f.a.busy,false);assert.equal(f.state.resourceTurn,-1);
  f.ready=true;f.a.tick();await flush();assert.equal(f.calls,1);
});
test('pending allocation becomes invalid after turn, player, toggle or UI changes',async()=>{
  for(const invalidate of [f=>f.turn++,f=>f.scope='game2',f=>f.state.resources=false,f=>f.blocked=true,f=>f.active=false]){
    const f=fixture();let finish;f.run=()=>new Promise(r=>finish=r);f.state.resources=true;
    f.a.tick();await flush();assert.equal(f.guard(),true);invalidate(f);assert.equal(f.guard(),false);
    finish({message:'late'});await flush();assert.equal(f.state.resourceTurn,-1);
  }
});
test('pending completion preserves newer city settings and turning off takes effect',async()=>{
  const f=fixture();let finish;f.run=()=>new Promise(r=>finish=r);f.state.resources=true;
  f.a.tick();await flush();f.state.cities.newCity={enabled:true};finish({message:'done'});await flush();
  assert.equal(f.state.cities.newCity.enabled,true);f.state.resources=false;f.turn++;f.a.tick();await flush();assert.equal(f.calls,1);
});
test('missing planner error is bounded to one attempt per turn',async()=>{
  const f=fixture();f.state.resources=true;f.run=async()=>{throw Error('missing');};
  f.a.tick();await flush();f.a.tick();await flush();assert.equal(f.errors.length,1);assert.equal(f.a.status.phase,'error');
  assert.equal(f.a.busy,false);f.turn++;f.a.tick();await flush();assert.equal(f.calls,2);
});
test('dispose invalidates outstanding work and prevents save',async()=>{
  const f=fixture();let finish;f.run=()=>new Promise(r=>finish=r);f.state.resources=true;
  f.a.tick();await flush();f.a.dispose();assert.equal(f.guard(),false);finish({message:'late'});await flush();assert.equal(f.state.resourceTurn,-1);
});
