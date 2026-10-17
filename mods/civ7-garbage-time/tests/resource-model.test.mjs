import test from 'node:test';
import assert from 'node:assert/strict';
import {createResourceModel,finishResourceRun} from '../ui/resource-model.js';

test('background resource list matches native assignable classes and separates off-map IDs',()=>{
  const raw=(value,type,isOffMap=false)=>({value,isOffMap,uniqueResource:{resource:type}});
  const resources=[raw(1,'city'),raw(1,'city',true),raw(2,'bonus'),raw(3,'factory'),raw(4,'empire'),raw(5,'treasure'),raw(6,'missing')];
  const player={Cities:{getCities:()=>[{Resources:{getAssignedResources:()=>[resources[0]]}}]},Resources:{getResources:()=>resources}};
  const info={Resources:{lookup:type=>type==='missing'?null:{ResourceClassType:'RESOURCECLASS_'+type.toUpperCase()}}};
  const model=createResourceModel(player,info,{sort:8,direction:1});
  assert.deepEqual(model.data.resourceTabData.availableResourceSectionData[0].subSections[0].resourceSlotData,[{resourceValue:1,isOffMap:true},{resourceValue:2,isOffMap:false},{resourceValue:3,isOffMap:false}]);
  assert.equal(model.selectedSettlementSortType(),8);assert.equal(model.selectedSortDirection(),1);
});

test('resource success acknowledges only after all operations finish',async()=>{
  let busy=true,acks=0,cleanups=0;
  const result=await finishResourceRun({busy:()=>busy,status:()=> '已完成：装入 2 份资源'},()=>cleanups++,()=>true,()=>{assert.equal(busy,false);acks++;},async()=>{busy=false;});
  assert.equal(result.error,false);assert.equal(acks,1);assert.equal(cleanups,1);
});

test('interruption cancels planner and awaits rollback without acknowledging another context',async()=>{
  let busy=true,alive=true,waits=0,acks=0;
  const result=await finishResourceRun({busy:()=>busy,status:()=> '已撤回'},()=>{alive=false;},()=>false,()=>acks++,async()=>{assert.equal(alive,false);if(++waits===2)busy=false;});
  assert.equal(result,undefined);assert.equal(waits,2);assert.equal(acks,0);
});

test('failed allocation and failed rollback leave the resource decision unacknowledged',async()=>{
  for(const message of ['城市无法装入资源；本次调整已撤回','游戏未确认资源操作；部分资源未恢复']){
    let acks=0;
    const result=await finishResourceRun({busy:()=>false,status:()=>message},()=>{},()=>true,()=>acks++,async()=>{});
    assert.equal(result.error,true);assert.equal(acks,0);
  }
});

test('completion after turn or menu changes never acknowledges resources',async()=>{
  let valid=true,busy=true,acks=0;
  const result=await finishResourceRun({busy:()=>busy,status:()=> '已完成'},()=>{},()=>valid,()=>acks++,async()=>{valid=false;busy=false;});
  assert.equal(result,undefined);assert.equal(acks,0);
});
