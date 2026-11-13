import test from 'node:test';
import assert from 'node:assert/strict';
import {createResourceActions,resourcePool,sameResource} from '../ui/rp-resource-actions.js';
function fixture(options={}){
  const a={id:1,owner:0,type:1},b={id:2,owner:0,type:1};
  const resources=[{resourceValue:10,resourceType:'SPICE',isOffMap:false},
    {resourceValue:10,resourceType:'SPICE',isOffMap:true},{resourceValue:12,resourceType:'SPICE',isOffMap:true},
    {resourceValue:13,resourceType:'IRON',isOffMap:false}];
  const cities=[{cityID:a,slottedResources:[]},{cityID:b,slottedResources:[]}];
  const pool=resources.map(r=>({...r}));
  if(options.slotted)cities[0].slottedResources.push(...pool.splice(0).map(r=>({...r,cityID:a})));
  const data={slottedResourceSectionData:[{cityResources:cities},{cityResources:[]}],
    availableResourceSectionData:[{subSections:[{resourceSlotData:pool}]},{subSections:[]}]};
  let ctx='turn-1',allowed=true,time=0,pending;
  const requests=[],states=[];
  const api=createResourceActions({read:()=>data,context:()=>ctx,allowed:()=>allowed,
    onState:(...args)=>states.push(args),now:()=>time,
    request:(r,id,remove)=>{
      const city=cities.find(c=>c.cityID.id===id.id);
      if(!remove&&city.slottedResources.length>=(options.capacity??9))return false;
      requests.push({r:{...r},id,remove});
      pending=()=>{
        for(const list of [pool,...cities.map(c=>c.slottedResources)]){
          const i=list.findIndex(item=>sameResource(item,r));if(i>=0)list.splice(i,1);
        }
        (remove?pool:city.slottedResources).push({...r,cityID:remove?undefined:id});
      };
      return true;
    },
    wait:async()=>{
      time+=1000;
      if(options.cancel){api.cancel();return;}
      if(options.contextChange){ctx='turn-2';return;}
      if(options.lock){allowed=false;return;}
      if(!options.timeout){pending?.();pending=undefined;}
    }
  });
  return {api,data,resources,cities,pool,requests,states,a,b};
}
test('bulk move preserves map/off-map identity and continues after moving the original selection',async()=>{
  const f=fixture({slotted:true});
  await f.api.run({...f.resources[0],cityID:f.a},f.b);
  assert.equal(f.requests.length,3);
  assert.deepEqual(f.requests.map(x=>[x.r.resourceValue,x.r.isOffMap]),[[10,false],[10,true],[12,true]]);
  assert.equal(f.cities[0].slottedResources.length,1);
  assert.equal(f.cities[1].slottedResources.length,3);
  assert.deepEqual(f.states.at(-1),[false,'QUICK_DONE',3]);
});
test('quick fill stops at one settlement capacity and preserves unrelated resources',async()=>{
  const f=fixture({capacity:2});await f.api.run(f.resources[0],undefined,'fill');
  assert.equal(f.requests.length,2);assert.equal(f.cities[1].slottedResources.length,0);
  assert.deepEqual(f.pool.map(r=>r.resourceValue),[12,13]);
});
test('quick remove chooses exactly the selected off-map resource',async()=>{
  const f=fixture({slotted:true});await f.api.run({...f.resources[1],cityID:f.a},f.a,'remove-one');
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].r.isOffMap,true);
  assert.ok(f.cities[0].slottedResources.some(r=>r.resourceValue===10&&!r.isOffMap));
});
test('Shift removal removes only the matching type in its source settlement',async()=>{
  const f=fixture({slotted:true});await f.api.run({...f.resources[1],cityID:f.a},f.a,'remove');
  assert.equal(f.requests.length,3);assert.equal(f.cities[0].slottedResources[0].resourceType,'IRON');
});
for(const option of ['cancel','contextChange','lock','timeout'])test(`${option} stops after the outstanding request without sending the rest`,async()=>{
  const f=fixture({[option]:true});await f.api.run(f.resources[0],f.a);
  assert.equal(f.requests.length,1);assert.equal(f.api.busy(),false);
  assert.equal(f.states.at(-1)[1],option==='timeout'?'QUICK_TIMEOUT':'QUICK_CANCELLED');
});
test('a second activation cannot start another overlapping batch',async()=>{
  const f=fixture();await Promise.all([f.api.run(f.resources[0],f.a),f.api.run(f.resources[0],f.b)]);
  assert.equal(f.requests.length,3);assert.ok(f.requests.every(r=>r.id.id===f.a.id));
});
test('a stale or missing resource identity sends nothing',async()=>{
  const f=fixture();assert.equal(resourcePool(f.data,{resourceValue:999,isOffMap:true}).resources.length,0);
  await f.api.run({resourceValue:999},f.a);assert.equal(f.requests.length,0);
});
