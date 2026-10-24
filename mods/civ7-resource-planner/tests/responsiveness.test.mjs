import test from 'node:test';
import assert from 'node:assert/strict';
import * as planner from '../ui/rp-planner.js';

function world(){
 const cities=Array.from({length:36},(_,i)=>({key:'c'+i,capacity:2+i%6,base:[10,30,20,15,10+i*3,-(i%7),0],multiplier:Array(7).fill(1),tags:{WAREHOUSE:i%8},tendency:'YIELD_CULTURE'}));
 const resources=Array.from({length:92},(_,i)=>({key:'r'+i,allowed:cities.map(c=>c.key),bonusSlots:i%23===0?3:0,effects:i%23===0?[]:[{yield:i%4===0?'YIELD_HAPPINESS':'YIELD_CULTURE',amount:2+i%5,kind:i%3===0?'percent':'flat'}]}));
 return {cities,resources};
}
test('large allocation lets input run while computing and retains allocation quality',async()=>{
 const {cities,resources}=world();let paints=0;
 const timer=setInterval(()=>paints++,0);
 let out;try{out=await planner.planAllocationAsync(resources,cities);}finally{clearInterval(timer);}
 assert.ok(paints>1,'input/paint tasks must run during a large calculation');
 assert.ok(planner.planUtility(out,resources,cities)>=17201.16-1e-6);
 for(const c of cities){const held=resources.filter(r=>out[r.key]===c.key);assert.ok(held.length<=c.capacity+held.reduce((s,r)=>s+r.bonusSlots,0));}
});
test('closing the screen cancels calculation before returning a plan',async()=>{
 const {cities,resources}=world();let alive=true;
 const timer=setTimeout(()=>{alive=false;},0);
 try{await assert.rejects(()=>planner.planAllocationAsync(resources,cities,'tendency',{shouldContinue:()=>alive}),/LOC_RP_CONTEXT_CHANGED/);}finally{clearTimeout(timer);}
});
