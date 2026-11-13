import {YIELDS,normalizePreferences,hasPreferences} from '../ui/rp-planner.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const uiSource=readFileSync(new URL('../ui/rp-ui.js',import.meta.url),'utf8');
const screen=readFileSync(new URL('../ui-next/screens/commerce/commerce-screen-resources-tab.js',import.meta.url),'utf8');
function fixture({modern=true}={}){
  let controller=true,selected=-1,busy=false,legal=true,locked=false,tools=false,zone='preferences';
  const buttons=[],hints=[],calls=[];
  const model={resourceZone:()=>tools?'tools':zone,resourceHighlightYields:YIELDS.slice(0,6),resourceSettlementSortItems:Object.fromEntries(Array.from({length:15},(_,i)=>i).filter(i=>modern||![6,7].includes(i)).map(i=>[i,i])),selectedResource:()=>({resourceValue:selected}),get isSlottingAvailable(){return !locked;},
    selectedSettlementSortType:()=>13,selectedSortDirection:()=>-1,
    canAssignSelectedResourceToSettlement:()=>legal,slotSelectedResource:id=>calls.push(['place',id]),
    selectedSettlementId:()=>undefined,settlementHasSlottedResources:()=>true,
    setSelectedSettlementId:id=>calls.push(['edit',id]),isInSortAndFilterMode:()=>tools,selectedResourceFilter:()=>'DEFAULT',setSelectedResourceFilter(){},tidyResources:()=>calls.push(['tidy']),
    cityIsConnectedToTradeNetwork:()=>true,getResourceContainerSelectionState:()=>legal?1:2};
  const planner={busy:()=>busy,tendency:()=> 'YIELD_FOOD',choose:()=>calls.push(['choose']),clear:()=>calls.push(['clear']),
    happinessScope:()=>'cities',settlementTarget:()=>0,cityTarget:()=>0,setHappinessScope(){},setSettlementTarget(){},setCityTarget(){},runHappiness(){},camels:()=>false,assigned:()=>false,status:()=>'',setCamels(){},setAssigned(){},resetDefaults:()=>calls.push(['reset']),sort:type=>calls.push(['sort',type]),run(){}};
  const collect=value=>{if(Array.isArray(value))value.forEach(collect);};
  const context={IsControllerActive:()=>controller,getPlanner:()=>planner,YIELDS,normalizePreferences,hasPreferences,ActionIcon:{getIconFromActionName:()=> 'button'},ActiveInputDevice:()=>1,
    t:key=>key,Locale:{compose:s=>s},UI:{getIcon:s=>s},template:()=>()=>({classList:{add(){},toggle(){}}}),insert:(_el,value)=>collect(value),
    mergeProps:(...sources)=>new Proxy({}, {get:(_t,key)=>{for(const s of [...sources].reverse())if(key in s)return s[key];}}),
    createComponent:(component,props)=>{
      if(typeof component==='function')return component(props);
      if(component==='Activatable'||component==='CheckBox'||component==='Dropdown')(props.class?.includes('rp-zone-hint')?hints:buttons).push(props);
      collect(props.children);return props;
    },For:p=>p.each.map(p.children),Show:p=>p.when?p.children:p.fallback,Activatable:'Activatable',CheckBox:'CheckBox',Dropdown:'Dropdown',DropdownItem:'DropdownItem',Icon:'Icon',Tooltip:{Text:'Tooltip'},YieldDelta:'YieldDelta',
    createMemo:fn=>fn,createSignal:value=>[()=>value,next=>value=next],createEffect:()=>{},untrack:fn=>fn(),
    useCommerceScreenContext:()=>model,useDragAndDropContext:()=>({isDragging:()=>null}),
    Cities:{get:()=>({name:'Rome'})},ResourceContainerSelectionState:{CanNotSelect:2,NotSelecting:0},
    CityResourceContainerInternal:()=>null,ComponentID:{isMatch:()=>false}};
  const ui=vm.runInNewContext(uiSource.replace(/^import .*;\n/gm,'').replace(/export /g,'')+';({PlannerToolbar,ResetPreferencesButton,SortToolbar,HappinessButton,TendencyYield,TendencyLabel,zoneActive,isControllerPlacement:typeof isControllerPlacement==="function"?isControllerPlacement:undefined})',context);
  Object.assign(context,{isControllerPlacement:ui.isControllerPlacement,zoneActive:ui.zoneActive});
  const start=screen.indexOf('const CityResourceContainer ='),end=screen.indexOf('const WarningBannerSymbol',start);
  const city=vm.runInNewContext(screen.slice(start,end)+';CityResourceContainer',context);
  return {buttons,hints,calls,model,planner,ui,city,select:value=>selected=value,controller:value=>controller=value,busy:value=>busy=value,legal:value=>legal=value,lock:value=>locked=value,zone:value=>zone=value,tools:value=>tools=value};
}
test('controller pickup removes all planner controls from navigation and cancellation restores them',()=>{
  const f=fixture();
  f.ui.PlannerToolbar({model:f.model});f.ui.ResetPreferencesButton({model:f.model});
  f.ui.HappinessButton({model:f.model,type:'RESOURCECLASS_CITY'});
  for(let i=0;i<6;i++)f.ui.TendencyYield({model:f.model,cityID:{id:2},index:()=>i,data:{}});
  f.ui.TendencyLabel({model:f.model,cityID:{id:2}});
  assert.equal(f.buttons.length,21);
  assert.ok(f.buttons.filter(b=>b.class.includes('rp-yield')||b.class.includes('rp-tendency-label')).every(b=>!b.disabled));
  f.select(52);
  assert.ok(f.buttons.every(b=>b.disabled),'every planner control must disable while carrying a resource');
  f.controller(false);
  assert.ok(f.buttons.every(b=>!b.disabled),'mouse placement keeps its existing interactions');
  f.controller(true);f.select(-1);
  assert.ok(f.buttons.filter(b=>b.class.includes('rp-yield')||b.class.includes('rp-tendency-label')).every(b=>!b.disabled),'cancel restores preference controls in their own zone');
});
test('controller confirm places on the settlement once instead of entering its nested buttons',()=>{
  const f=fixture(),id={id:2};f.zone('resources');f.select(52);
  const target=f.city({cityID:id,cityIndex:0});
  assert.equal(target.disabled,false);assert.equal(target.disableFocus,false);
  target.onActivate();
  assert.deepEqual(f.calls,[['place',id]]);
  f.legal(false);assert.equal(target.disabled,false);target.onActivate();
  assert.deepEqual(f.calls[1],['edit',id],'full settlements enter occupied slot selection');
  f.model.settlementHasSlottedResources=()=>false;assert.equal(target.disabled,true);target.onActivate();
  f.model.settlementHasSlottedResources=()=>true;
  f.legal(true);f.lock(true);assert.equal(target.disabled,true);target.onActivate();
  assert.equal(f.calls.length,2,'illegal or locked targets must not send another placement');
  f.lock(false);f.select(-1);target.onActivate();
  assert.deepEqual(f.calls[2],['edit',id],'without a picked resource, editing city resources remains available');
});


test('top sorting is skipped until the dedicated controller mode is entered',()=>{
  const f=fixture();f.ui.SortToolbar({model:f.model});
  assert.equal(f.buttons.length,22,'15 sorts and seven highlight icons');
  assert.ok(f.buttons.every(b=>b.disableFocus));
  for(const b of f.buttons)b.onActivate?.();
  assert.deepEqual(f.calls,[],'ordinary controller traversal cannot activate top tools');
  f.tools(true);assert.ok(f.buttons.every(b=>!b.disableFocus));
  assert.equal(f.buttons.filter(b=>b.autoFocus).length,1,'the current sort is the sole entry focus');
  f.buttons[0].onActivate();
  assert.deepEqual(f.calls,[['sort',10]]);
  f.tools(false);assert.ok(f.buttons.every(b=>b.disableFocus));
  f.controller(false);assert.ok(f.buttons.every(b=>!b.disableFocus),'mouse can click top controls directly');
});
test('dedicated tools mode excludes left-hand planner and settlement controls',()=>{
  const f=fixture();f.ui.PlannerToolbar({model:f.model});
  f.ui.TendencyYield({model:f.model,cityID:{id:2},index:()=>0,data:{}});
  f.ui.TendencyLabel({model:f.model,cityID:{id:2}});
  const city=f.city({cityID:{id:2},cityIndex:0});f.tools(true);
  assert.ok(f.buttons.slice(0,-1).every(b=>b.disabled));assert.equal(city.disableFocus,true);
  f.tools(false);assert.equal(city.disableFocus,true);f.zone('resources');assert.equal(city.disableFocus,false);
});

test('Antiquity toolbar omits railroad and factory while keeping expanded yield filters',()=>{
 const f=fixture({modern:false});f.ui.SortToolbar({model:f.model});f.tools(true);
 for(const b of f.buttons)b.onActivate?.();
 const sorts=f.calls.filter(c=>c[0]==='sort').map(c=>c[1]);
 assert.equal(sorts.length,13);assert.ok(!sorts.includes(6)&&!sorts.includes(7));
 assert.equal(f.buttons.length,20,'13 sorts and seven highlights');
});
test('four zones isolate main actions, preferences, tools and resource targets',()=>{
 const f=fixture();f.ui.PlannerToolbar({model:f.model});f.ui.TendencyYield({model:f.model,cityID:{id:2},index:()=>0,data:{}});
 const controls=f.buttons.slice(),city=f.city({cityID:{id:2},cityIndex:0});
 assert.ok(controls.filter(b=>!b.class.includes('rp-yield')).every(b=>b.disabled));assert.equal(controls.at(-1).disabled,false);assert.equal(city.disableFocus,true);
 f.zone('actions');assert.ok(controls.slice(0,-1).every(b=>!b.disabled));assert.equal(controls.at(-1).disabled,true);
 f.zone('resources');assert.ok(controls.every(b=>b.disabled));assert.equal(city.disableFocus,false);
 f.zone(null);assert.ok(controls.every(b=>b.disabled));assert.equal(city.disableFocus,true);
 assert.equal(f.hints.length,0,'global zone hints are provided by the bottom tray only');
 f.controller(false);assert.ok(controls.every(b=>!b.disabled));
});

test('整理留在操作区，列表底部重置属于倾向区，放置期间两者均不可用',()=>{
 const f=fixture();f.zone('actions');f.ui.PlannerToolbar({model:f.model});
 assert.ok(!f.buttons.some(b=>b.class.includes('rp-reset-defaults')));f.ui.ResetPreferencesButton({model:f.model});
 const tidy=f.buttons.find(b=>b.class.includes('rp-tidy')),reset=f.buttons.find(b=>b.class.includes('rp-reset-defaults'));
 assert.ok(tidy&&reset);assert.equal(reset.disabled,true);tidy.onActivate();f.zone('preferences');assert.equal(reset.disabled,false);reset.onActivate();assert.deepEqual(f.calls,[['tidy'],['reset']]);
 f.tools(true);assert.equal(tidy.disabled,true);assert.equal(reset.disabled,true);tidy.onActivate();reset.onActivate();assert.equal(f.calls.length,2);
 f.tools(false);f.select(42);assert.equal(tidy.disabled,true);assert.equal(reset.disabled,true);tidy.onActivate();reset.onActivate();assert.equal(f.calls.length,2);
});


test('资源提醒开关可在分配锁定时使用；有明确开关状态且放置中不可抢焦点',()=>{
 const f=fixture();let enabled=true;f.controller(false);f.lock(true);
 f.planner.reminderEnabled=()=>enabled;f.planner.toggleReminders=()=>{enabled=!enabled;};f.ui.PlannerToolbar({model:f.model});
 const button=f.buttons.find(b=>b.class.includes('rp-reminder-toggle'));
 assert.ok(button);assert.equal(button.disabled,false);assert.equal(button['aria-pressed'],'true');
 button.onActivate();assert.equal(button['aria-pressed'],'false');
 f.controller(true);f.select(52);assert.equal(button.disabled,true);
});
