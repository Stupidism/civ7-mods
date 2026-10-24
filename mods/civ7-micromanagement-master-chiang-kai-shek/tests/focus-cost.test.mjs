import test from 'node:test';
import assert from 'node:assert/strict';
import {createFocusCost} from '../ui/focus-cost.js';
function fixture({saved=false,moves=1}={}) {
 const tags=new Map([[0,1],[1,saved?8:0],[2,saved?26:0],[3,0]]), listeners=new Map(),timers=new Map(),requests=[],settled=[];
 const commander={id:{owner:0,id:7,type:26},owner:0,isCommanderUnit:true,Movement:{maxMoves:4,movementMovesRemaining:moves}};
 const other={id:{owner:0,id:8,type:26},owner:0,isCommanderUnit:true,Movement:{maxMoves:6,movementMovesRemaining:3}};
 const shooter={owner:0,id:9,type:26};let serial=0;
 const api={Units:{get:id=>id.id===7?commander:id.id===8?other:null,restoreMovement:id=>requests.push(id)},Players:{get:()=>({Identity:{getNarrativeTagPoints:i=>tags.get(i)??0,changeNarrativeTagPoints:(i,n)=>tags.set(i,(tags.get(i)??0)+n)}})},GameContext:{localPlayerID:0},GameInfo:{NarrativeTags:{lookup:name=>({$index:['READY','UNIT','TYPE','ACTIVE'].indexOf(name.replace('NARRATIVE_TAG_WC_COST_',''))})}},Configuration:{getGame:()=>({isAnyMultiplayer:false})},ComponentID:{isMatch:(a,b)=>a?.id===b?.id&&a?.owner===b?.owner&&a?.type===b?.type},engine:{on:(name,f)=>listeners.set(name,f),off:name=>listeners.delete(name)},setTimeout:f=>{timers.set(++serial,f);return serial;},clearTimeout:id=>timers.delete(id)};
 const tick=()=>{const calls=[...timers.values()];timers.clear();calls.forEach(f=>f());};
 const cost=createFocusCost(api,x=>settled.push(x));
 const fire=()=>{assert.equal(cost.arm(commander.id,shooter),true);listeners.get('Combat')({attacker:shooter});};
 const nativeApply=()=>{commander.Movement.maxMoves=-996;other.Movement.maxMoves=-994;tick();};
 const nativeDrain=()=>{assert.equal(requests.length,1);commander.Movement.movementMovesRemaining=0;tick();};
 const nativeRestore=()=>{commander.Movement.maxMoves=4;other.Movement.maxMoves=6;tick();};
 return {api,tags,commander,other,shooter,cost,listeners,timers,requests,settled,tick,fire,nativeApply,nativeDrain,nativeRestore};
}
test('awaits native effect, actual zero movement, then restored maximum; only the commander is charged',()=>{
 const f=fixture();f.fire();assert.equal(f.cost.busy,true);assert.equal(f.requests.length,0);
 f.tick();assert.equal(f.requests.length,0);f.nativeApply();assert.equal(f.requests.length,1);
 f.tick();assert.equal(f.tags.get(3),1);assert.deepEqual(f.settled,[]);
 f.nativeDrain();assert.equal(f.tags.get(3),0);assert.deepEqual(f.settled,[]);
 f.nativeRestore();assert.deepEqual(f.settled,[true]);assert.equal(f.cost.ready(),true);
 assert.equal(f.commander.Movement.movementMovesRemaining,0);assert.equal(f.other.Movement.movementMovesRemaining,3);
 assert.deepEqual(f.requests,[f.commander.id]);assert.equal(f.tags.get(1),0);
});
test('no matching combat or a rejected request never charges movement',()=>{
 const f=fixture();f.cost.arm(f.commander.id,f.shooter);f.listeners.get('Combat')({attacker:f.other.id});
 assert.equal(f.tags.get(3),0);f.cost.reject();f.listeners.get('Combat')({attacker:f.shooter});assert.equal(f.requests.length,0);
});
test('save during a committed shot resumes the debt without waiting for another combat',()=>{
 const f=fixture({saved:true});assert.equal(f.cost.busy,true);assert.equal(f.cost.ready(),false);
 f.nativeApply();f.nativeDrain();f.nativeRestore();assert.deepEqual(f.settled,[true]);assert.equal(f.tags.get(1),0);
});
test('a missing native update restores the temporary effect but retains unpaid movement in the save',()=>{
 const f=fixture();f.fire();for(let n=0;n<200;n++)f.tick();
 assert.deepEqual(f.settled,[false]);assert.equal(f.tags.get(3),0);assert.equal(f.tags.get(1),8);assert.equal(f.cost.ready(),false);
 assert.equal(f.commander.Movement.movementMovesRemaining,1);
});
test('unloading clears temporary movement modifier and timers but retains committed debt',()=>{
 const f=fixture();f.fire();f.nativeApply();f.cost.dispose();
 assert.equal(f.tags.get(3),0);assert.equal(f.tags.get(1),8);assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);
});
test('multiplayer and missing initialization refuse the cost mechanism',()=>{
 const f=fixture();f.api.Configuration.getGame=()=>({isAnyMultiplayer:true});assert.equal(f.cost.ready(),false);
 const g=fixture();g.tags.set(0,0);assert.equal(g.cost.arm(g.commander.id,g.shooter),false);assert.equal(g.requests.length,0);
});
