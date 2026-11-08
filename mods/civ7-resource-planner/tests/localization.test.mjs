import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import {catalogs,useGameLanguage} from './locale-fixture.mjs';
import {t,errorMessage} from '../ui/rp-l10n.js';
import {YIELDS,groupedSettlements,normalizePreferences,hasPreferences} from '../ui/rp-planner.js';
import {readSettings} from '../ui/rp-settings.js';

const root=new URL('../',import.meta.url);
test('English and Chinese catalogs have identical keys and interpolation parameters',()=>{
  assert.deepEqual(Object.keys(catalogs.en_US).sort(),Object.keys(catalogs.zh_Hans_CN).sort());
  for(const [key,en] of Object.entries(catalogs.en_US)){
    const zh=catalogs.zh_Hans_CN[key];
    assert.ok(en.trim()&&zh.trim(),key);
    assert.deepEqual((en.match(/\{\d+\}/g)||[]).sort(),(zh.match(/\{\d+\}/g)||[]).sort(),key);
    assert.doesNotMatch(en,/[\p{Script=Han}]/u,key);
  }
});
test('localization is loaded in both shell and game; runtime has no Chinese literals',()=>{
  const manifest=readFileSync(new URL('resource-planner.modinfo',root),'utf8');
  for(const scope of ['shell','game']){
    const group=[...manifest.matchAll(/<ActionGroup\b[^>]*scope="([^"]+)"[^>]*>([\s\S]*?)<\/ActionGroup>/g)].find(row=>row[1]===scope);
    assert.match(group?.[2]||'',/<UpdateText><Item>text\/resource-planner.xml<\/Item><\/UpdateText>/);
  }
  assert.match(manifest,/<Name>LOC_RP_MOD_NAME<\/Name>/);
  assert.match(manifest,/<Item>ui\/rp-l10n.js<\/Item>/);
  const files=[...readdirSync(new URL('ui/',root)).filter(name=>name.endsWith('.js')).map(name=>'ui/'+name),
    'ui-next/screens/commerce/commerce-screen-resources-tab.js'];
  for(const file of files){
    const source=readFileSync(new URL(file,root),'utf8');
    assert.doesNotMatch(source,/[\p{Script=Han}]/u,file);
    for(const [key] of source.matchAll(/LOC_RP_[A-Z_]+/g)){
      if (key === 'LOC_RP_AO_') continue; // namespace prefix; expanded keys checked in shared tests
      assert.ok(catalogs.en_US[key]&&catalogs.zh_Hans_CN[key],key);
    }
    for(const [,key] of source.matchAll(/(?:\bt|setStatus)\(['"]([A-Z_]+)['"]/g)){
      assert.ok(catalogs.en_US['LOC_RP_'+key]&&catalogs.zh_Hans_CN['LOC_RP_'+key],key);
    }
  }
});

function renderUI(language){
  useGameLanguage(language);
  const strings=[],buttons=[],tooltips=[];
  const collect=value=>{
    if(typeof value==='function')collect(value());
    else if(Array.isArray(value))value.forEach(collect);
    else if(typeof value==='string')strings.push(value);
  };
  const planner={happinessScope:()=>'cities',settlementTarget:()=>0,cityTarget:()=>0,setHappinessScope(){},setSettlementTarget(){},setCityTarget(){},runHappiness(){},camels:()=>false,assigned:()=>false,busy:()=>false,status:()=>t('HINT'),
    tendency:()=> 'YIELD_FOOD',setCamels(){},setAssigned(){},sort(){},choose(){},clear(){},run(){}};
  const model={resourceZone:()=>'preferences',resourceSettlementSortItems:Object.fromEntries(Array.from({length:15},(_,i)=>[i,i])),resourceHighlightYields:YIELDS,isSlottingAvailable:true,selectedSettlementSortType:()=>13,selectedSortDirection:()=>-1,
    isInSortAndFilterMode:()=>false,selectedResourceFilter:()=>'DEFAULT',setSelectedResourceFilter(){},selectedResource:()=>({resourceValue:-1})};
  const source=readFileSync(new URL('ui/rp-ui.js',root),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  const ui=vm.runInNewContext(source+';({PlannerToolbar,ResetPreferencesButton,SortToolbar,HappinessButton,TendencyYield,TendencyLabel,createGroups})',{
    IsControllerActive:()=>false,t,Locale,YIELDS,groupedSettlements,normalizePreferences,hasPreferences,createEffect:()=>{},getPlanner:()=>planner,
    template:()=>()=>({classList:{add(){},toggle(){}}}),insert:(_node,value)=>collect(value),
    mergeProps:(...sources)=>new Proxy({}, {has:(_target,key)=>sources.some(s=>key in s),get:(_target,key)=>{for(const s of [...sources].reverse())if(key in s)return s[key];}}),createMemo:fn=>fn,
    createComponent:(component,props)=>{
      if(typeof component==='function')return component(props);
      if(component==='Activatable')buttons.push(props);
      if(component==='Tooltip')tooltips.push(props);
      for(const key of ['text','aria-label','children'])if(key in props)collect(props[key]);
      return props;
    },
    For:props=>props.each.map(props.children),Show:props=>props.when?props.children:props.fallback,
    Activatable:'Activatable',CheckBox:'CheckBox',Dropdown:'Dropdown',DropdownItem:'DropdownItem',Icon:'Icon',Tooltip:{Text:'Tooltip'},YieldDelta:'YieldDelta',UI:{getIcon:name=>name}
  });
  ui.PlannerToolbar({model});ui.ResetPreferencesButton({model});ui.SortToolbar({model});
  for(const type of ['RESOURCECLASS_CITY','RESOURCECLASS_BONUS'])ui.HappinessButton({model,type});
  for(let i=0;i<7;i++)ui.TendencyYield({model,cityID:{id:1},index:()=>i,data:{}});
  ui.TendencyLabel({model,cityID:{id:1}});
  for(const group of ui.createGroups({slottedResourceSectionData:[]})){
    collect(group.collapsibleContainerData.titleText);collect(group.emptyResourcesDescription);
  }
  return {strings,buttons,tooltips,model,planner};
}
for(const language of ['en_US','zh_Hans_CN'])test(`focus and hover tips describe the next action and update in place in ${language}`,()=>{
  const {buttons,tooltips,model,planner}=renderUI(language);
  const tip=button=>{
    const text=button['aria-label'];
    assert.ok(tooltips.some(tooltip=>tooltip.text===text),'native focus/hover tooltip matches accessible action');
    assert.doesNotMatch(text,/LOC_RP_|\{\d+\}/);
    return text;
  };
  const sorts=buttons.filter(b=>b.class.split(' ').includes('rp-sort'));
  const gold=Locale.compose('LOC_YIELD_GOLD_NAME');
  assert.equal(tip(sorts[0]),t('SORT_TIP',gold));
  model.selectedSettlementSortType=()=>10;
  assert.equal(tip(sorts[0]),t('SORT_REVERSE_TIP',gold));
  assert.equal(tip(sorts[15]),t('FILTER_ALL_TIP'));
  assert.equal(tip(sorts[16]),t('FILTER_YIELD_TIP',Locale.compose('LOC_YIELD_FOOD_NAME')));
  const food=buttons.find(b=>b.class.split(' ').includes('rp-yield'));
  for(const [weight,next,currentKey,nextKey] of [[1,2,'NEUTRAL','PREFER'],[2,0,'PREFER','AVOID'],[0,1,'AVOID','NEUTRAL']]){
    planner.tendency=()=>weight===1?{}:{YIELD_FOOD:weight};
    assert.equal(tip(food),t('PREFERENCE_STATE_TIP',Locale.compose('LOC_YIELD_FOOD_NAME'),t(currentKey),weight,t(nextKey),next));
  }
  model.selectedResource=()=>({resourceValue:52});
  assert.equal(tip(food),t('PLACE_TIP'),'carrying a resource keeps the placement explanation');
});
for(const language of ['en_US','zh_Hans_CN','de_DE'])test(`actual UI labels, tooltips and accessible buttons resolve in ${language}`,()=>{
  const {strings,buttons}=renderUI(language);
  assert.ok(strings.includes(t('AUTO_ASSIGN')));
  assert.ok(strings.includes(t('INCLUDE_ASSIGNED')));
  assert.ok(strings.includes(t('FILL_CITIES')));
  assert.ok(strings.includes(t('GROUP_COUNT',t('DISCONNECTED'),0)));
  assert.ok(strings.some(s=>s.includes(Locale.compose('LOC_YIELD_FOOD_NAME'))));
  assert.ok(strings.some(s=>s.includes(t('PREFER'))&&s.includes('×2')));
  assert.ok(strings.some(s=>s.includes('×0')));
  for(const key of ['SETTLEMENT_TARGET','CITY_TARGET','FILL_SELECTED'])assert.ok(strings.includes(t(key)));
  assert.ok(buttons.filter(p=>p['aria-label']).length>=10);
  assert.doesNotMatch(strings.join('\n'),/LOC_RP_|\{\d+\}/);
  if(language!=='zh_Hans_CN')assert.doesNotMatch(strings.join('\n'),/[\p{Script=Han}]/u);
});
test('pure settings errors are translated at the UI boundary and external errors are retained',()=>{
  let error;
  try{readSettings({getItem:()=> '[]'});}catch(e){error=e;}
  assert.equal(error.message,'LOC_RP_INVALID_SETTINGS');
  for(const language of ['en_US','zh_Hans_CN']){
    useGameLanguage(language);
    assert.equal(errorMessage(error),t('INVALID_SETTINGS'));
    assert.equal(errorMessage(Error('engine error 42')),'engine error 42');
    for(const key of ['CANNOT_REMOVE','CANNOT_ASSIGN'])assert.doesNotMatch(t(key,'Rome','Spices'),/\{\d+\}/);
    assert.ok(t('RESTORE_INCOMPLETE',t('OPERATION_TIMEOUT')).includes(t('OPERATION_TIMEOUT')));
  }
});
test('engine rejection reports a complete translated sentence and sends no assignment',async()=>{
  const source=readFileSync(new URL('ui/rp-game-adapter.js',root),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  for(const language of ['en_US','zh_Hans_CN']){
    useGameLanguage(language);
    const send=vm.runInNewContext(source+';sendOperation',{
      isResourceDamaged:()=>false,t,Locale,GameContext:{localPlayerID:0},PlayerOperationTypes:{ASSIGN_RESOURCE:1},PlayerOperationParameters:{Deactivate:2},
      Game:{PlayerOperations:{canStart:()=>({Success:false}),sendRequest:()=>assert.fail('illegal operation sent')}}
    });
    for(const remove of [true,false])await assert.rejects(
      ()=>send({isOffMap:true,value:52,definition:{Name:'LOC_YIELD_FOOD'}},{id:{id:1},name:'Rome'},remove,[],()=>true),
      error=>error.message===t(remove?'CANNOT_REMOVE':'CANNOT_ASSIGN','Rome',Locale.compose('LOC_YIELD_FOOD'))
    );
  }
});
