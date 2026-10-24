import test from 'node:test';
import assert from 'node:assert/strict';
import { installNativeOptions, CATEGORY, optionID } from '../ui/native-options.js';
import { createSettingsStore, normalizeConfig } from '../ui/settings-store.js';

function fixture() {
  let raw = JSON.stringify({other:{keep:42}});
  const calls=[], applied=[], errors=[];
  const storage={getItem:()=>raw,setItem:(_,value)=>{raw=value;}};
  const store=createSettingsStore(storage);
  const options={
    data:new Map(),
    addOption(info){this.data.set(info.id,info);info.initListener?.(info);},
    init(...args){calls.push(['init',this,...args]);},
    commitOptions(...args){calls.push(['commit',this,...args]);return 71;},
    restore(...args){calls.push(['restore',this,...args]);for(const entry of this.data.values())entry.initListener?.(entry);},
    resetOptionsToDefault(...args){calls.push(['defaults',this,...args]);return 81;}
  };
  const original={...options};
  const categories={existing:{title:'existing'}};
  const dependencies={options,optionType:{Checkbox:1,Editor:0},categories,store,applied:c=>applied.push(c),reportError:(e,saving)=>errors.push({e,saving})};
  let integration=installNativeOptions(dependencies);
  options.init();
  const entry=(profile='mouse',key='autoExit')=>options.data.get(optionID(profile,key));
  const change=(profile='mouse',key='autoExit',value=false)=>{const e=entry(profile,key);e.updateListener(e,value);};
  return {options,original,categories,store,storage,calls,applied,errors,entry,change,dependencies,get integration(){return integration;},reinstall(){integration.dispose();integration=installNativeOptions(dependencies);options.init();}};
}
test('shared Mods category registers 23 native checkboxes, no inapplicable control, and a reset',()=>{
  const f=fixture();assert.equal(CATEGORY,'mods');assert.equal(f.options.data.size,24);
  assert.equal(f.categories[CATEGORY].title,'LOC_UI_CONTENT_MGR_SUBTITLE');
  assert.equal(f.entry('gamepad','rightClickJoin'),undefined);
  assert.equal(Array.from(f.options.data.values()).filter(o=>o.type===1).length,23);
  f.options.init();assert.equal(f.options.data.size,24);
  f.options.data.clear();f.options.init();assert.equal(f.options.data.size,24);
  assert.equal(f.entry().currentValue,true);assert.equal(f.entry('gamepad').currentValue,true);
});
test('native Confirm persists the draft and notifies the running game',()=>{
  const f=fixture();f.change();assert.equal(f.store.load().config.mouse.autoExit,true);assert.equal(f.applied.length,0);
  assert.equal(f.options.commitOptions(),71);assert.equal(f.store.load().config.mouse.autoExit,false);
  assert.equal(f.store.load().config.gamepad.autoExit,true);assert.equal(f.applied.length,1);
  const call=f.calls.find(c=>c[0]==='commit');assert.equal(call[1],f.options);
});
test('native Cancel discards changes without saving',()=>{
  const f=fixture();f.change();f.options.restore();assert.equal(f.entry().currentValue,true);
  f.options.commitOptions();assert.equal(f.applied.length,0);assert.equal(f.store.load().config.mouse.autoExit,true);
});
test('sound/graphics commits do not save or discard the Mod draft',()=>{
  const f=fixture();f.change();f.options.commitOptions('sound');f.options.restore('graphics');
  assert.equal(f.store.load().config.mouse.autoExit,true);assert.equal(f.entry().currentValue,false);
  f.options.commitOptions('configuration');assert.equal(f.store.load().config.mouse.autoExit,false);
});
test('page reset only updates the Mod draft; Cancel and Confirm retain native meaning',()=>{
  const f=fixture();f.change();f.options.commitOptions();f.options.init();
  f.options.data.get('war-controls-reset-page').activateListener();
  assert.equal(f.entry().currentValue,true);assert.equal(f.store.load().config.mouse.autoExit,false);
  assert.equal(f.calls.some(c=>c[0]==='defaults'),false);
  f.options.restore();assert.equal(f.entry().currentValue,false);
  f.options.data.get('war-controls-reset-page').activateListener();f.options.commitOptions();
  assert.deepEqual(f.store.load().config,normalizeConfig());
});
test('native global reset also restores the Mod defaults and preserves native return',()=>{
  const f=fixture();f.change();f.options.commitOptions();assert.equal(f.options.resetOptionsToDefault(),81);
  assert.deepEqual(f.store.load().config,normalizeConfig());
});
test('failed Mod save blocks Confirm, retains draft and reports the error',()=>{
  const f=fixture();f.change();f.storage.setItem=()=>{throw Error('disk failure');};
  assert.throws(()=>f.options.commitOptions(),/disk failure/);
  assert.equal(f.calls.some(c=>c[0]==='commit'),false);assert.equal(f.entry().currentValue,false);
  assert.equal(f.applied.length,0);assert.equal(f.errors.at(-1).saving,true);
});
test('reinstall preserves saved values without duplicate entries or notifications',()=>{
  const f=fixture();f.change();f.options.commitOptions();f.reinstall();
  assert.equal(f.options.data.size,24);assert.equal(f.entry().currentValue,false);
  f.change('gamepad');f.options.commitOptions();assert.equal(f.applied.length,2);
});
test('dispose removes only its own entries, category, and current wrappers',()=>{
  const f=fixture();const foreign={id:'foreign'};f.options.data.set(foreign.id,foreign);
  const wrapper=f.options.commitOptions;const later=function(...args){return wrapper.apply(this,args);};
  f.options.commitOptions=later;f.integration.dispose();
  assert.equal(f.options.commitOptions,later);assert.equal(f.options.init,f.original.init);
  assert.equal(f.options.data.size,1);assert.equal(f.options.data.get('foreign'),foreign);
  assert.equal(f.categories[CATEGORY],undefined);assert.deepEqual(f.categories.existing,{title:'existing'});
  f.options.commitOptions();assert.equal(f.applied.length,0);
});
test('shared Mods category survives disposal when another Mod still uses it',()=>{
  const f=fixture();const category=f.categories[CATEGORY];
  f.options.data.set('other-mod',{id:'other-mod',category:CATEGORY});
  f.integration.dispose();assert.equal(f.categories[CATEGORY],category);
});
test('an existing Mods category and saved profile choices are reused without replacement',()=>{
  const f=fixture();f.integration.dispose();
  const existing={title:'shared-title',description:'shared-description'};f.categories[CATEGORY]=existing;
  const config=normalizeConfig();config.mouse.autoJoin=false;config.gamepad.autoAttack=false;config.gamepad.rightClickJoin=false;
  f.store.save(config);f.reinstall();assert.equal(f.categories[CATEGORY],existing);
  assert.equal(f.entry('mouse','autoJoin').currentValue,false);assert.equal(f.entry('gamepad','autoAttack').currentValue,false);
  assert.equal(f.entry('gamepad','rightClickJoin'),undefined);
  f.change();f.options.commitOptions();assert.equal(f.store.load().config.gamepad.rightClickJoin,false);
  f.integration.dispose();assert.equal(f.categories[CATEGORY],existing);
});
