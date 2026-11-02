import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {homedir} from 'node:os';
import vm from 'node:vm';

const screen=readFileSync(new URL('../ui-next/screens/commerce/commerce-screen-resources-tab.js',import.meta.url),'utf8');
const modelSource=readFileSync(new URL('../ui-next/screens/commerce/commerce-screen-model.js',import.meta.url),'utf8');
// Execute the actual event callbacks, replacing only their engine dependencies.
function body(source, start, end){
  const from=source.indexOf(start),to=source.indexOf(end,from);
  assert.ok(from>=0&&to>from,`Missing source seam: ${start}`);
  return source.slice(from,to);
}
const sameID=(a,b)=>!!a&&!!b&&a.id===b.id&&a.owner===b.owner&&a.type===b.type;
function selectionModel(initial={resourceValue:-1}) {
  let selected=initial;
  const requests=[];
  const model={isSlottingAvailable:true, selectedResource:()=>selected, requests,
    deselectSelectedResource:()=>{selected={resourceValue:-1};},
  };
  const code=body(modelSource,'  function handleClickAvailableResource(', '  function handleMClickSlottedResource(')+
    body(modelSource,'  function handleClickSlottedResource(', '  function getMatchingResources(')+
    body(modelSource,'  function assignResource(', '  function unassignResource(');
  Object.assign(model,vm.runInNewContext(code+`;({clickAvailableResource:handleClickAvailableResource,
    clickSlottedResource:handleClickSlottedResource,slotSelectedResource:handleSlotSelectedResource})`,{
    model,INVALID_RESOURCE_VALUE:-1,INVALID_OFF_MAP_ID:-1,ComponentID:{isMatch:sameID},
    batch:fn=>fn(),setSelectedResource:value=>{selected=value;},handleDeselectSelectedResource:model.deselectSelectedResource,
    useAudio:()=>()=>{},resourceNameShort:v=>v,getResourceTypeFromValue:v=>v,
    addItemSlotIndex:()=>{},setLastSlottedResourceValues:()=>{},
    GameplayMap:{getLocationFromIndex:value=>({x:value,y:0})},PlayerOperationTypes:{ASSIGN_RESOURCE:'assign'},
    tryRequestPlayerOperation:(_type,args)=>{requests.push(args);return true;}
  }));
  return model;
}
function dragStart(model){return vm.runInNewContext(body(screen,'  const onDragStart =','  const onDragEnd =')+';onDragStart',{
  model,ComponentID:{isMatch:sameID}
});}
test('click selection preserves off-map identity through placement',()=>{
  const model=selectionModel(), data={resourceValue:52,isOffMap:true};
  const activate=vm.runInNewContext(body(screen,'  function onActivate() {','  const isResourceSelected =')+';onActivate',{
    model,props:{resourceData:data},IsControllerActive:()=>false
  });
  activate();
  model.slotSelectedResource({id:2});
  assert.equal(model.requests.length,1);
  assert.equal(model.requests[0].Flags,true);
  assert.equal(model.requests[0].ID,52);
  assert.equal(model.requests[0].City,2);
});
test('dragging an already selected resource does not toggle the selection off',()=>{
  const data={resourceValue:52,isOffMap:false}, model=selectionModel(data);
  dragStart(model)({data});
  assert.equal(model.selectedResource(),data);
});
test('starting a different drag selects its resource instead of swapping or deselecting',()=>{
  const model=selectionModel({resourceValue:51,cityID:{id:3}});
  dragStart(model)({data:{resourceValue:52,isOffMap:true}});
  assert.equal(model.selectedResource().resourceValue,52);
  assert.equal(model.selectedResource().isOffMap,true);
});
function inputGuard(model,busy=false){
  const resets=[];
  const guard=vm.runInNewContext(body(screen,'                  const rpInputGuard =','                  let inputRoot;')+';rpInputGuard',{
    model,getPlanner:()=>({busy:()=>busy}),InputActionStatuses:{START:1,FINISH:2},
    setCancelDrag:value=>resets.push(value),setTimeout:fn=>fn(),_el$46:{contains:target=>target==='resources'}
  });
  return {resets, send(name,status,target='resources'){
    let prevented=false,stopped=false;
    guard({target,detail:{name,status},preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
    return prevented&&stopped;
  }};
}
for(const name of ['cancel','mousebutton-right','keyboard-escape'])test(`${name} cancels selection before allowing the next gesture to close`,()=>{
  const model=selectionModel({resourceValue:52}),input=inputGuard(model);
  for(const status of [1,2])assert.ok(input.send(name,status),'cancel must not reach the screen close handler');
  assert.equal(model.selectedResource().resourceValue,-1);
  assert.deepEqual(input.resets,[true,false],'also reset an active drag');
  assert.equal(input.send(name,1),false);
  assert.equal(input.send(name,2),false);
  assert.equal(model.requests.length,0,'cancel never changes game resources');
});
test('busy input guard blocks manual assignments while leaving screen close accessible',()=>{
  const input=inputGuard(selectionModel(),true);
  assert.equal(input.send('mousebutton-left',2),true);
  assert.equal(input.send('mousebutton-left',2,'close-button'),false);
  assert.equal(input.send('cancel',2),false);
});
test('clicking a slotted off-map resource retains identity when moving it to another city',()=>{
  const model=selectionModel(),data={resourceValue:52,isOffMap:true,cityID:{id:1}};
  const activate=vm.runInNewContext(body(screen,'  function onActivate() {','  const isResourceSelected =')+';onActivate',{
    model,props:{resourceData:data},IsControllerActive:()=>false
  });
  activate();model.slotSelectedResource({id:2});
  assert.equal(model.requests[0].ID,52);
  assert.equal(model.requests[0].Flags,true);
});
test('clicking city yield icons with a picked resource places it without starting a planner run',()=>{
  const ui=readFileSync(new URL('../ui/rp-ui.js',import.meta.url),'utf8');
  const model=selectionModel({resourceValue:52,isOffMap:true});
  model.canAssignSelectedResourceToSettlement=()=>true;
  let choices=0;
  const TendencyYield=vm.runInNewContext(body(ui,'export function TendencyYield(','export function TendencyLabel(')
    .replace('export ','')+';TendencyYield',{
    createComponent:(_component,props)=>props,button:()=>{},getPlanner:()=>({choose:()=>choices++}),YIELDS:['YIELD_FOOD']
  });
  const buttonProps=TendencyYield({model,cityID:{id:2},index:()=>0});
  buttonProps.onActivate();
  assert.equal(model.requests.length,1);
  assert.equal(choices,0,'placing a resource must not change tendencies or start allocation');
  model.canAssignSelectedResourceToSettlement=()=>false;buttonProps.onActivate();
  assert.equal(model.requests.length,1,'an illegal target must not send an assignment');
  assert.equal(choices,0,'an illegal target must not start automatic allocation either');
  model.deselectSelectedResource();buttonProps.onActivate();
  assert.equal(choices,1,'without a picked resource the icon still chooses a tendency');
});

const solidPath=process.env.CIV7_SOLID_PATH||`${homedir()}/Library/Application Support/Steam/steamapps/common/Sid Meier's Civilization VII/CivilizationVII.app/Contents/Resources/Base/modules/core/vendor/solid-js/dist/solid.js`;
test('resource yield changes do not recalculate settlement order or save settings', {skip:!existsSync(solidPath)},async()=>{
  // Real game Solid reactivity, offline: no engine, UI, saves, or game operations.
  const solid=await import('data:text/javascript;base64,'+Buffer.from(readFileSync(solidPath,'utf8')).toString('base64'));
  let dispose, changeYield, sort, rows, saves=0;
  solid.createRoot(d=>{
    dispose=d;
    const [a,setA]=solid.createSignal(1);changeYield=setA;
    rows=[{cityID:{id:1},yieldDeltas:[{get yieldTotal(){return a();}}]}, {cityID:{id:2},yieldDeltas:[{yieldTotal:2}]}];
    const start=modelSource.includes('  function sortSettlements()')?'  function sortSettlements()':'  createEffect(() => {\n    function compareYields';
    const code=body(modelSource,start,'  const [selectedResource, setSelectedResource]');
    sort=vm.runInNewContext(code+';typeof sortSettlements === "function" ? sortSettlements : null',{
      ...solid,model:{data:{resourceTabData:{slottedResourceSectionData:[{cityResources:rows}]}}},
      selectedSettlementSortType:()=>8,selectedSortDirection:()=>-1,setSelectedSortDirection:()=>{},
      savedSettlementSortDirection:{8:-1},saveSettlementSortType:()=>saves++,compareSettlementTypes:()=>0
    });
    sort?.();
  });
  try{
    assert.deepEqual(rows.map(c=>c.cityID.id),[2,1]);
    const savedBefore=saves;
    changeYield(9);
    assert.deepEqual(rows.map(c=>c.cityID.id),[2,1],'adjustments must preserve order until an explicit sort');
    assert.equal(saves,savedBefore,'resource updates must not write settings');
    sort?.();
    assert.deepEqual(rows.map(c=>c.cityID.id),[1,2],'explicit sort uses the new yield');
  }finally{dispose();}
});

test('controller pickup clears settlement focus and preserves resource identity for placement',()=>{
  const model=selectionModel(),data={resourceValue:52,isOffMap:true,cityID:{id:1}};
  const selections=[];model.setSelectedSettlementId=id=>selections.push(id);
  const activate=vm.runInNewContext(body(screen,'  function onActivate() {','  const isResourceSelected =')+';onActivate',{
    model,props:{resourceData:data},IsControllerActive:()=>true
  });
  activate();assert.deepEqual(selections,[undefined]);
  model.slotSelectedResource({id:2});
  assert.equal(model.requests[0].ID,52);assert.equal(model.requests[0].Flags,true);assert.equal(model.requests[0].City,2);
  model.isSlottingAvailable=false;activate();assert.equal(selections.length,1);
});
