import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {BridgeSettingsStore,STORE} from '../ui/bridge-store.js';
import {createSharedControllerStorage,SHARED_KEY,NAMESPACE} from '../ui/bridge-shared-storage.js';
import {installBridgeOptions} from '../ui/bridge-options.js';
const config={enabled:true,swapSticks:true,invertLeftY:false,invertPanY:false,showDebug:false};
const defaults={...config,enabled:false,swapSticks:false,invertPanY:true};
function fixture(document,blind=true){
 const rows=new Map(document===undefined?[]:[[SHARED_KEY,JSON.stringify(document)]]);
 const storage={get length(){return rows.size;},key(i){return blind?null:[...rows.keys()][i]??null;},
 getItem(key){return blind?[...rows.values()][0]??null:rows.get(key)??null;},
 setItem(key,value){rows.set(key,value);},removeItem(key){rows.delete(key);},clear(){rows.clear();}};
 const errors=[],backend=createSharedControllerStorage(storage),store=new BridgeSettingsStore(backend,e=>errors.push(e),defaults);
 return {rows,storage,store,backend,errors};
}
test('single shared record survives a new session with empty native options and preserves other settings',()=>{
 const f=fixture({other:{keep:17}});f.store.save(config);
 const next=new BridgeSettingsStore(createSharedControllerStorage(f.storage),undefined,defaults);
 assert.deepEqual(next.load(),config);assert.equal(f.rows.size,1);
 assert.deepEqual(JSON.parse(f.rows.get(SHARED_KEY)).other,{keep:17});assert.equal(f.rows.has(STORE),false);
});
test('replayed clear-on-second-key community helper preserves BCS when using its shared document',()=>{
 const f=fixture();f.store.save(config);
 for(let i=0;i<3;i++){
  if(f.storage.length>1)f.storage.clear();
  const doc=JSON.parse(f.storage.getItem(SHARED_KEY)||'{}');doc.LFPolicyYieldsSettings={IsColorful:!!i};
  f.storage.setItem(SHARED_KEY,JSON.stringify(doc));assert.deepEqual(f.store.load(),config);
 }
 assert.equal(f.rows.size,1);
});
test('multi-key key-blind read is rejected before touching rows, retains known calibration and reports once',()=>{
 const f=fixture();f.store.save(config);f.rows.set('aaa-other','{"foreign":true}');
 const before=[...f.rows];assert.deepEqual(f.store.load(),config);f.store.load();assert.equal(f.errors.length,1);
 assert.throws(()=>f.store.save({...config,swapSticks:false}),/multi-key/);assert.deepEqual([...f.rows],before);
 const fresh=new BridgeSettingsStore(f.backend,e=>f.errors.push(e),defaults);assert.deepEqual(fresh.load(),defaults);assert.equal(f.errors.length,2);
});
test('legacy bare config is never guessed and an unknown sole row is not duplicated',()=>{
 const legacy=fixture(config);assert.throws(()=>legacy.backend.getItem(STORE),/Unrecognized/);
 const f=fixture();f.rows.set('foreign',JSON.stringify({other:{v:7}}));const before=[...f.rows];
 assert.throws(()=>f.store.save(config),/second key/);assert.deepEqual([...f.rows],before);
 const normal=fixture(undefined,false);normal.rows.set('foreign','{}');assert.throws(()=>normal.store.save(config),/Invalid shared settings/);
});
test('invalid version, missing switch, malformed JSON, or removed namespace never silently resets a known calibration',()=>{
 const f=fixture();f.store.save(config);
 for(const raw of ['{bad',JSON.stringify({[NAMESPACE]:{version:2,controller:config}}),JSON.stringify({[NAMESPACE]:{version:1,controller:{enabled:true}}}),'{}']){
  f.rows.set(SHARED_KEY,raw);assert.deepEqual(f.store.load(),config);
 }
 assert.equal(f.errors.length,3);
});
test('a failed write read-back never notifies or activates new calibration',()=>{
 const f=fixture();f.store.save(config);const notified=[];f.store.subscribe(c=>notified.push(c));
 f.storage.setItem=()=>{};
 assert.throws(()=>f.store.save({...config,swapSticks:false}),/read-back/);assert.deepEqual(f.store.load(),config);assert.equal(notified.length,0);
});
test('native option reset and Confirm/Cancel retain semantics without resetting another mod',()=>{
 const f=fixture({other:{keep:23}});f.store.save(config);
 const options={data:new Map(),init(){this.data.clear();},addOption(o){this.data.set(o.id,o);o.initListener(o);},restore(){},commitOptions(){},resetOptionsToDefault(){}};
 installBridgeOptions({options,optionType:{Switch:1},categories:{},store:f.store});options.init();
 const swap=options.data.get('controller-bridge-swapSticks');swap.updateListener(swap,false);options.restore('configuration');options.commitOptions('configuration');assert.equal(f.store.load().swapSticks,true);
 swap.updateListener(swap,false);options.commitOptions('configuration');assert.equal(f.store.load().swapSticks,false);
 options.resetOptionsToDefault();assert.deepEqual(f.store.load(),defaults);assert.deepEqual(JSON.parse(f.rows.get(SHARED_KEY)).other,{keep:23});
});
test('actual settings entry uses the guarded shared adapter and reports ambiguity visibly',async()=>{
 const f=fixture();f.store.save(config);const notices=[];
 const box={createSharedControllerStorage,BridgeSettingsStore,localStorage:f.storage,platformDefaults:()=>defaults,standaloneBridgeEnabled:()=>false,NATIVE_INPUT_ONLY:false,
 Options:{},OptionType:{},CategoryData:{},DialogBoxManager:{createDialog_Confirm:x=>notices.push(x)},installBridgeOptions:()=>({dispose(){}}),installMenuNavigation(){},window:{addEventListener(){}},engine:{whenReady:Promise.resolve()},console:{log(){},error(){}}};
 const source=readFileSync(new URL('../ui/bridge-settings.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
 vm.runInNewContext(source+'\nglobalThis.testStore=settingsStore;',box);assert.deepEqual({...box.testStore.load()},config);
 f.rows.set('extra','{}');box.testStore.load();box.testStore.load();await Promise.resolve();assert.equal(notices.length,1);
});
