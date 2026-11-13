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
  const model={resourceZone:()=>null,selectedSettlementId:()=>undefined,isInSortAndFilterMode:()=>false,resourceActionBusy:()=>false,isSlottingAvailable:true,canAssignSelectedResourceToSettlement:()=>true, selectedResource:()=>selected, requests,
    deselectSelectedResource:()=>{selected={resourceValue:-1};},
  };
  const code=body(modelSource,'  function handleClickAvailableResource(', '  function handleMClickSlottedResource(')+
    body(modelSource,'  function handleClickSlottedResource(', '  function swapResources(')+
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
    model,IsControllerActive:()=>true,getPlanner:()=>({busy:()=>busy}),InputActionStatuses:{START:1,FINISH:2},
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
    isControllerPlacement:()=>false,createComponent:(_component,props)=>props,button:()=>{},getPlanner:()=>({choose:()=>choices++}),YIELDS:['YIELD_FOOD']
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


test('controller settlement confirmation sends one real off-map assignment request',()=>{
  const model=selectionModel({resourceValue:52,isOffMap:true});
  const start=screen.indexOf('const CityResourceContainer =');
  const city=screen.slice(start,screen.indexOf('const WarningBannerSymbol',start));
  const callback=vm.runInNewContext('({' + body(city,'    onActivate: () => {','    onFocus: () => onFocus(),') + '}).onActivate',{
    model,props:{cityID:{id:2}},isDisabled:()=>false,isControllerPlacement:()=>true,IsControllerActive:()=>true
  });
  callback();
  assert.equal(model.requests.length,1);
  assert.equal(model.requests[0].City,2);
  assert.equal(model.requests[0].ID,52);
  assert.equal(model.requests[0].Flags,true);
});

test('selected-resource controller tray advertises placement instead of editing a city',()=>{
  const model=selectionModel({resourceValue:52,isOffMap:true});
  model.selectedSettlementId=()=>undefined;
  const code=body(modelSource,'  function getGamepadTrayItems() {','  function settlementHasSlottedResources(');
  const tray=vm.runInNewContext(code+';getGamepadTrayItems',{
    model,focusedSettlementId:()=>({id:2}),selectedSettlementId:()=>undefined,selectedResource:model.selectedResource,
    focusedResource:()=>({resourceValue:-1}),ghostResourceFocused:()=>false,IsControllerActive:()=>true,
    INVALID_RESOURCE_VALUE:-1,canSlot:true,resourceZone:()=> 'resources',enterResourceZone(){},isInSortAndFilterMode:()=>false,resourceActionBusy:()=>false,toggleResourceTools:()=>{},ComponentID:{isMatch:sameID},Locale:{compose:s=>s},
    Cities:{get:()=>({name:'Rome',Resources:{getAssignedResources:()=>[1]}})},canAssignSelectedResourceToSettlement:()=>true,settlementHasSlottedResources:()=>true
  });
  assert.deepEqual(Array.from(tray(),item=>item.name),['Deselect-Resource','Assign-resource','Quick-Assign','Choose-swap-slot']);
  model.isSlottingAvailable=false;
  assert.deepEqual(Array.from(tray(),item=>item.name),['Deselect-Resource']);
});

test('controller cancel exits the top tools before allowing the panel to close',()=>{
  const model=selectionModel();let tools=true,cancels=0;
  model.resourceZone=()=>tools?'tools':null;model.enterResourceZone=value=>tools=value!==null;
  model.cancelResourceActions=()=>cancels++;
  const input=inputGuard(model);
  assert.equal(input.send('cancel',1),true);assert.equal(tools,true);
  assert.equal(input.send('cancel',2),true);assert.equal(tools,false);
  assert.equal(cancels,0);assert.equal(input.send('cancel',1),false);
});
test('one-click tidying uses slot organization without reordering settlements or assigning resources',()=>{
  const calls=[],data={slottedResourceSectionData:[],availableResourceSectionData:[]};
  const tidy=vm.runInNewContext(body(modelSource,'  function tidyResources() {','  function handleSortResources() {')+';tidyResources',{
    resourceActionBusy:()=>false,model:{data:{resourceTabData:data}},untrack:fn=>fn(),batch:fn=>fn(),
    setLastSlottedResourceValues:()=>{},sortSlottedResources:value=>calls.push(value),sortAvailableResources:value=>calls.push(value)
  });
  tidy();assert.deepEqual(calls,[data.slottedResourceSectionData,data.availableResourceSectionData]);
});
test('controller quick actions and bulk placement dispatch the same model operations as mouse shortcuts',()=>{
  const calls=[];let picked={resourceValue:-1},focused={resourceValue:52,isOffMap:true},city,editing;
  const model={isSlottingAvailable:true,selectedResource:()=>picked,selectedSettlementId:()=>editing};
  const tray=vm.runInNewContext(body(modelSource,'  function getGamepadTrayItems() {','  function settlementHasSlottedResources(')+';getGamepadTrayItems',{
    model,focusedSettlementId:()=>city,selectedSettlementId:()=>editing,selectedResource:()=>picked,focusedResource:()=>focused,
    ghostResourceFocused:()=>false,IsControllerActive:()=>true,INVALID_RESOURCE_VALUE:-1,canSlot:true,
    resourceZone:()=> 'resources',enterResourceZone(){},isInSortAndFilterMode:()=>false,resourceActionBusy:()=>false,toggleResourceTools:()=>calls.push('tools'),
    ComponentID:{isMatch:sameID},Locale:{compose:s=>s},Cities:{get:()=>({name:'Rome',Resources:{getAssignedResources:()=>[1]}})},
    canAssignSelectedResourceToSettlement:()=>true,settlementHasSlottedResources:()=>true,
    handleMClickAvailableResource:r=>calls.push(['fill',r]),handleMClickSlottedResource:r=>calls.push(['remove',r]),
    handleSlotSelectedResource:(id,all)=>calls.push(['move',id,all])
  });
  tray().find(x=>x.name==='Quick-resource').onActivate();
  assert.equal(calls[0][0],'fill');assert.equal(calls[0][1].isOffMap,true);
  editing={id:1};focused={...focused,cityID:editing};
  tray().find(x=>x.name==='Quick-resource').onActivate();assert.equal(calls[1][0],'remove');
  editing=undefined;picked=focused;focused={resourceValue:-1};city={id:2};
  tray().find(x=>x.name==='Quick-Assign').onActivate();assert.deepEqual(calls[2],['move',city,true]);
});


test('leaving tools restores a recreated resource by identity, including off-map and source city',()=>{
  let callback,focus;
  const resource={resourceValue:52,isOffMap:true,cityID:{id:1,owner:0,type:1}};
  let current=resource;
  vm.runInNewContext(body(screen,'  createEffect(on(model.resourceZone,','  const resourceName ='),{
    createEffect:()=>{},on:(_read,fn)=>{callback=fn;},model:{resourceZone:()=> 'resources',focusedResource:()=>current},
    props:{resourceData:resource},IsControllerActive:()=>true,setShouldAutoFocus:v=>focus=v,ComponentID:{isMatch:sameID}
  });
  callback('tools','resources');assert.equal(focus,false);
  callback('resources','tools');assert.equal(focus,true);
  current={...resource,isOffMap:false};callback('resources','tools');assert.equal(focus,false);
  current={...resource,cityID:{id:2,owner:0,type:1}};callback('resources','tools');assert.equal(focus,false);
});

test('controller cancel pops resource, settlement editor, zone, then panel in separate gestures',()=>{
 let picked=52,editing={id:2},zone='resources';
 const model={selectedResource:()=>({resourceValue:picked}),selectedSettlementId:()=>editing,resourceZone:()=>zone,
   resourceActionBusy:()=>false,deselectSelectedResource:()=>picked=-1,setSelectedSettlementId:id=>editing=id,enterResourceZone:z=>zone=z};
 const input=inputGuard(model);
 const press=()=>{assert.equal(input.send('cancel',1),true);assert.equal(input.send('cancel',2),true);};
 press();assert.equal(picked,-1);assert.equal(editing.id,2);assert.equal(zone,'resources');
 press();assert.equal(editing,undefined);assert.equal(zone,'resources');
 press();assert.equal(zone,null);
 assert.equal(input.send('cancel',1),false);assert.equal(input.send('cancel',2),false);
});
test('zone transitions preserve full resource identity, reject carrying/busy transitions, and recover a missing focus target',()=>{
 let picked=-1,busy=false,editing,focused={resourceValue:52,isOffMap:true,cityID:{id:2}};
 const available={resourceValue:52,isOffMap:false},slotted={...focused};
 const data={availableResourceSectionData:[{subSections:[{resourceSlotData:[available]}]}],slottedResourceSectionData:[{cityResources:[{slottedResources:[slotted]}]}]};
 const model={selectedResource:()=>({resourceValue:picked}),resourceActionBusy:()=>busy,data:{resourceTabData:data}};
 const state=vm.runInNewContext(body(modelSource,'  const [resourceZone,setResourceZone]', '  const [tabName')+';({resourceZone,enterResourceZone})',{
  model,INVALID_RESOURCE_VALUE:-1,ComponentID:{isMatch:sameID},batch:fn=>fn(),
  createSignal:v=>[()=>v,n=>v=n],setSelectedSettlementId:id=>editing=id,focusedResource:()=>focused,setFocusedResource:r=>focused=r
 });
 assert.equal(state.resourceZone(),null);state.enterResourceZone('resources');
 assert.equal(editing.id,2);assert.equal(focused.isOffMap,true);
 picked=52;state.enterResourceZone('tools');assert.equal(state.resourceZone(),'resources');
 picked=-1;busy=true;state.enterResourceZone('tools');assert.equal(state.resourceZone(),'resources');
 busy=false;state.enterResourceZone('tools');assert.equal(editing,undefined);
 data.slottedResourceSectionData[0].cityResources[0].slottedResources=[];
 state.enterResourceZone('resources');assert.equal(focused.isOffMap,false);assert.equal(editing,undefined);
});

test('native tray uses triggers for zones and keeps preference actions separate',()=>{
 let zone='preferences';const model={selectedResource:()=>({resourceValue:-1}),selectedSettlementId:()=>undefined};
 const tray=vm.runInNewContext(body(modelSource,'  function getGamepadTrayItems() {','  function settlementHasSlottedResources(')+';getGamepadTrayItems',{
  model,focusedSettlementId:()=>undefined,selectedSettlementId:()=>undefined,selectedResource:model.selectedResource,
  focusedResource:()=>({resourceValue:52}),ghostResourceFocused:()=>false,IsControllerActive:()=>true,
  INVALID_RESOURCE_VALUE:-1,cycleResourceZone:d=>zone=d===1?'tools':'resources',
  resourceZone:()=>zone,enterResourceZone:z=>zone=z,isInSortAndFilterMode:()=>zone==='tools',resourceActionBusy:()=>false
 });
 const initial=tray();assert.ok(initial.some(x=>x.name==='Preferences-confirm'));
 assert.ok(!initial.some(x=>x.name==='Quick-resource'));
 initial.find(x=>x.name==='Next-zone').onActivate();assert.equal(zone,'tools');
 assert.ok(tray().some(x=>x.name==='Resource-tools-back'));
 zone=null;assert.deepEqual(Array.from(tray(),x=>x.hotkeyAction),['accept','nav-shell-previous','nav-shell-next']);
 tray().find(x=>x.name==='Previous-zone').onActivate();assert.equal(zone,'resources');
});

test('carrying tray offers single return and explicit slot choice, including a full destination',()=>{
 const calls=[];let legal=true,locked=false,editing;const source={id:1},target={id:2};
 const picked={resourceValue:0,isOffMap:true,cityID:source};
 const model={get isSlottingAvailable(){return !locked;},selectedResource:()=>picked,selectedSettlementId:()=>editing};
 const tray=vm.runInNewContext(body(modelSource,'  function getGamepadTrayItems() {','  function settlementHasSlottedResources(')+';getGamepadTrayItems',{
  model,focusedSettlementId:()=>target,selectedSettlementId:()=>editing,selectedResource:()=>picked,focusedResource:()=>({resourceValue:-1}),
  ghostResourceFocused:()=>false,IsControllerActive:()=>true,INVALID_RESOURCE_VALUE:-1,canSlot:true,resourceZone:()=> 'resources',
  enterResourceZone(){},isInSortAndFilterMode:()=>false,resourceActionBusy:()=>false,toggleResourceTools(){},
  ComponentID:{isMatch:sameID},Locale:{compose:s=>s},Cities:{get:()=>({name:'Rome',Resources:{}})},
  canAssignSelectedResourceToSettlement:()=>legal,settlementHasSlottedResources:()=>true,
  handleSetSelectedSettlementId:id=>{editing=id;calls.push(['edit',id]);},
  resourceActions:{run:(...args)=>calls.push(['run',...args])}
 });
 let items=tray();const back=items.find(x=>x.name==='Return-selected');
 assert.equal(back.hotkeyAction,'shell-action-3');assert.equal(back.navTrayText,'LOC_RP_RETURN_SELECTED');back.onActivate();
 assert.equal(calls[0][1].isOffMap,true);assert.equal(calls[0][1].resourceValue,0);assert.equal(calls[0][3],'remove-one');
 const choose=items.find(x=>x.name==='Choose-swap-slot');assert.equal(choose.hotkeyAction,'shell-action-2');choose.onActivate();assert.equal(editing,target);
 editing=undefined;legal=false;items=tray();assert.equal(items.find(x=>x.name==='Choose-swap-slot').hotkeyAction,'accept');assert(!items.some(x=>x.name==='Quick-Assign'));
 locked=true;assert(!tray().some(x=>x.name==='Return-selected'||x.name==='Choose-swap-slot'));
});

test('clicking an occupied slot starts the confirmed exchange with both complete identities',()=>{
 const picked={resourceValue:0,isOffMap:true,cityID:{id:1}},target={resourceValue:0,isOffMap:false,cityID:{id:2}};const calls=[];
 const click=vm.runInNewContext(body(modelSource,'  function handleClickSlottedResource(', '  function handleSlotSelectedResource(')+';handleClickSlottedResource',{
  model:{selectedResource:()=>picked},INVALID_RESOURCE_VALUE:-1,ComponentID:{isMatch:sameID},
  resourceActions:{replace:(...args)=>calls.push(args)},handleDeselectSelectedResource:()=>calls.push('cancel')
 });
 click(target);assert.equal(calls.length,1);assert.equal(calls[0][0].isOffMap,true);assert.equal(calls[0][1].isOffMap,false);
});
