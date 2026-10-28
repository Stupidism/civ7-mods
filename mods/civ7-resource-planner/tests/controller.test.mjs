import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {useGameLanguage} from './locale-fixture.mjs';
import {t,errorMessage} from '../ui/rp-l10n.js';
import {finishResourceRun} from '../../civ7-garbage-time/ui/resource-model.js';

const source=readFileSync(new URL('../ui/rp-controller.js',import.meta.url),'utf8')
  .replace(/^import .*;\n/gm,'').replace(/export /g,'');
function fixture(options={}){
  useGameLanguage(options.language);
  const mounts=[],cleanups=[];
  let sorts=0,assignments=0,sortType=13,direction=-1;
  let settings={preferences:{sort:13,direction:-1},games:{}};
  const model={selectedSettlementSortType:()=>sortType,selectedSortDirection:()=>direction,
    setSelectedSettlementSortType:type=>{sortType=type;},
    toggleSelectedSortDirection:value=>{direction=value??-direction;sorts++;},
    onSortResources:()=>{sorts++;},deselectSelectedResource:()=>{}
  };
  const create=vm.runInNewContext(source+';createPlanner',{
    t,errorMessage,
    createSignal:initial=>{let value=initial;return [()=>value,next=>{value=typeof next==='function'?next(value):next;}];},
    onMount:fn=>mounts.push(fn),onCleanup:fn=>cleanups.push(fn),createEffect:fn=>fn(),untrack:fn=>fn(),
    readSettings:()=>structuredClone(settings),writeSettings:value=>{if(options.settingsError)throw Error('LOC_RP_INVALID_SETTINGS');settings=value;},
    gameScope:()=> 'test-map',resourceCatalog:()=>new Map(),
    GameContext:{localPlayerID:0},Game:{turn:1,age:1},
    Players:{get:()=>({Resources:{isResourceAssignmentLocked:()=>!!options.locked}})},
    snapshot:()=>({cities:[{key:'city',tendency:options.noPreference?undefined:'YIELD_CULTURE'},{key:'old'}],
      resources:[{key:'resource',original:options.restoreError?'old':undefined}]}),
    planAllocationAsync:async()=>{if(options.error)throw Error(options.error);return options.noChanges?{}:{resource:'city'};},
    findAssignment:()=>undefined,sendOperation:async(_resource,_city,remove)=>{
      if(options.restoreError&&!remove)throw Error('LOC_RP_OPERATION_TIMEOUT');
      assignments++;
    },
    setTimeout,console:{log(){},error:message=>{if(!options.error&&!options.settingsError&&!options.restoreError)throw Error(message);}}
  });
  return {model,get sorts(){return sorts;},get assignments(){return assignments;},
    open(){const p=create(model);mounts.splice(0).forEach(fn=>fn());return p;},
    close(){cleanups.splice(0).forEach(fn=>fn());}
  };
}
test('opening, explicit sort clicks, and reopening each request a fresh sort',()=>{
  const f=fixture(),p=f.open();
  assert.equal(f.sorts,1);
  p.sort(10);
  assert.equal(f.sorts,2);
  assert.equal(f.model.selectedSettlementSortType(),10);
  assert.equal(f.model.selectedSortDirection(),-1);
  p.sort(10);
  assert.equal(f.sorts,3);
  assert.equal(f.model.selectedSortDirection(),1);
  f.close();f.open();
  assert.equal(f.sorts,4);
  assert.equal(f.model.selectedSortDirection(),1);
  f.close();
});

for(const language of ['en_US','zh_Hans_CN','fr_FR'])test(`controller status and failure paths use game language ${language}`,async()=>{
  for(const options of [{}, {locked:true}, {noPreference:true}, {noChanges:true}, {error:'LOC_RP_CONTEXT_CHANGED'}, {error:'LOC_RP_OPERATION_TIMEOUT'}, {settingsError:true}]){
    const f=fixture({...options,language}),p=f.open();
    if(options.settingsError){
      assert.equal(p.status(),t('SETTINGS_FAILED',t('INVALID_SETTINGS')));
    }else{
      assert.equal(p.status(),t('HINT'));
      p.run();await new Promise(resolve=>setTimeout(resolve,10));
      const expected=options.locked?t('LOCKED'):options.noPreference?t('CHOOSE_PREFERENCE'):options.noChanges?t('NO_CHANGES'):
        options.error?t('ROLLED_BACK',Locale.compose(options.error)):t('COMPLETED',1,1);
      assert.equal(p.status(),expected);
    }
    if(language!=='zh_Hans_CN')assert.doesNotMatch(p.status(),/[\p{Script=Han}]|LOC_RP_/u);
    assert.equal(p.busy(),false);
    f.close();
  }
});
test('completing an allocation never requests a resource or settlement re-sort',async()=>{
  const f=fixture(),p=f.open();
  p.run();
  // The production controller yields one timer before computing the plan.
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(p.busy(),false);
  assert.match(p.status(),/已完成/);
  assert.equal(f.assignments,1);
  assert.equal(f.sorts,1,'only the initial opening sorts; allocation preserves order');
  f.close();
});

for(const language of ['en_US','zh_Hans_CN','fr_FR'])test(`Garbage Time acknowledges only successful planner results in ${language}`,async()=>{
  for(const [options,code,success] of [
    [{error:'LOC_RP_OPERATION_TIMEOUT'},'ROLLED_BACK',false],
    [{restoreError:true},'RESTORE_INCOMPLETE',false],
    [{locked:true},'LOCKED',false],
    [{noPreference:true},'CHOOSE_PREFERENCE',false],
    [{},'COMPLETED',true],
    [{noChanges:true},'NO_CHANGES',true]
  ]){
    const f=fixture({...options,language}),p=f.open();
    let acknowledgements=0;
    p.run();
    const result=await finishResourceRun(p,()=>f.close(),()=>true,()=>acknowledgements++,
      ()=>new Promise(resolve=>setTimeout(resolve,0)));
    assert.equal(acknowledgements,Number(success),`${code}: ${p.status()}`);
    assert.equal(result.error,!success,code);
    assert.equal(p.statusCode(),code);
  }
});
