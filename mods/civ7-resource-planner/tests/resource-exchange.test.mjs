import test from 'node:test';
import assert from 'node:assert/strict';
import {createResourceActions,sameResource} from '../ui/rp-resource-actions.js';
function fixture(options={}) {
 const a={id:1,owner:0,type:1},b={id:2,owner:0,type:1};
 const incoming={resourceValue:0,isOffMap:false,resourceType:'CITY',cityID:options.unassigned?undefined:a};
 const outgoing={resourceValue:0,isOffMap:true,resourceType:'TOWN',cityID:b};
 const pool=options.unassigned?[incoming]:[];
 const cities=[{cityID:a,slottedResources:options.unassigned?[]:[incoming]},{cityID:b,slottedResources:[outgoing]}];
 const data={slottedResourceSectionData:[{cityResources:cities}],availableResourceSectionData:[{subSections:[{resourceSlotData:pool}]}]};
 let pending,time=0,context='t1',active=true;const calls=[],states=[];
 function move(r,id) {
  for(const list of [pool,...cities.map(c=>c.slottedResources)]) {const i=list.findIndex(x=>sameResource(x,r));if(i>=0)list.splice(i,1);}
  (id?cities.find(c=>c.cityID.id===id.id).slottedResources:pool).push({...r,cityID:id});
 }
 const api=createResourceActions({read:()=>data,context:()=>context,allowed:()=>active,now:()=>time,onState:(...args)=>states.push(args),
  swap:(a,b)=>{if(!options.atomic)return false;calls.push(['swap',a,b]);pending=()=>{move(a,b.cityID);move(b,a.cityID);};return true;},
  request:(r,id,remove)=>{
   if(!remove&&sameResource(r,incoming)&&options.rejectIncoming)return false;
   if(!remove&&sameResource(r,outgoing)&&id.id===a.id&&options.rejectReturn)return false;
   calls.push([remove?'remove':'assign',{...r},id]);pending=()=>move(r,remove?undefined:id);return true;
  },
  wait:async()=>{
   time+=1000;
   if(options.timeout)return;
   pending?.();pending=undefined;
   if(options.cancel)api.cancel();
   if(options.contextChange)context='t2';
   if(options.lock)active=false;
  }
 });
 return {api,a,b,incoming,outgoing,pool,cities,calls,states};
}
for(const unassigned of [false,true])test(`native exchange confirms both destinations, unassigned origin=${unassigned}`,async()=>{
 const f=fixture({atomic:true,unassigned});await f.api.replace(f.incoming,f.outgoing);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],'swap');
 assert(sameResource(f.cities[1].slottedResources[0],f.incoming));
 assert(sameResource((unassigned?f.pool:f.cities[0].slottedResources)[0],f.outgoing));
 assert.equal(f.states.at(-1)[1],'QUICK_DONE');
});
test('replacement first frees destination then returns displaced resource to the source',async()=>{
 const f=fixture();await f.api.replace(f.incoming,f.outgoing);
 assert.deepEqual(f.calls.map(c=>[c[0],c[1].isOffMap,c[2].id]),[['remove',true,2],['assign',false,2],['assign',true,1]]);
 assert(sameResource(f.cities[0].slottedResources[0],f.outgoing));assert(sameResource(f.cities[1].slottedResources[0],f.incoming));
});
for(const options of [{rejectReturn:true},{unassigned:true}])test(`outgoing stays unassigned when no legal source: ${JSON.stringify(options)}`,async()=>{
 const f=fixture(options);await f.api.replace(f.incoming,f.outgoing);
 assert.equal(f.calls.length,2);assert(sameResource(f.pool[0],f.outgoing));assert(sameResource(f.cities[1].slottedResources[0],f.incoming));
 assert.equal(f.states.at(-1)[1],'QUICK_DONE');
});
test('illegal incoming move restores only the displaced target and leaves the source intact',async()=>{
 const f=fixture({rejectIncoming:true});await f.api.replace(f.incoming,f.outgoing);
 assert.equal(f.calls.length,2);assert(sameResource(f.cities[0].slottedResources[0],f.incoming));assert(sameResource(f.cities[1].slottedResources[0],f.outgoing));
 assert.equal(f.states.at(-1)[1],'QUICK_FAILED');
});
for(const option of ['cancel','contextChange','lock','timeout'])test(`exchange ${option} stops before any further request`,async()=>{
 const f=fixture({[option]:true});await f.api.replace(f.incoming,f.outgoing);
 assert.equal(f.calls.length,1);assert.equal(f.states.at(-1)[1],option==='timeout'?'QUICK_TIMEOUT':'QUICK_CANCELLED');assert.equal(f.api.busy(),false);
});
test('stale target, same origin, and duplicate activation cannot start another exchange',async()=>{
 const f=fixture();await f.api.replace(f.incoming,{...f.outgoing,resourceValue:999});assert.equal(f.calls.length,0);
 await f.api.replace(f.incoming,{...f.outgoing,cityID:f.a});assert.equal(f.calls.length,0);
 await Promise.all([f.api.replace(f.incoming,f.outgoing),f.api.replace(f.incoming,f.outgoing),f.api.run(f.incoming,f.b)]);
 assert.equal(f.calls.length,3);
});
