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
test('legacy bare config is never guessed and an unknown sole row is retained with the attempted write',()=>{
 const legacy=fixture(config);assert.throws(()=>legacy.backend.getItem(STORE),/Unrecognized/);
 const f=fixture();f.rows.set('foreign',JSON.stringify({other:{v:7}}));const before=[...f.rows];
 assert.throws(()=>f.store.save(config),/rollback unverified.*ambiguous/);
 assert.equal(f.rows.size,2);
 assert.equal(f.rows.get('foreign'),JSON.stringify({other:{v:7}}));
 assert.deepEqual(JSON.parse(f.rows.get(SHARED_KEY)),{other:{v:7},[NAMESPACE]:{version:1,controller:config}});
 const errors=[];
 const fresh=new BridgeSettingsStore(createSharedControllerStorage(f.storage),e=>errors.push(e),defaults);
 assert.deepEqual(fresh.load(),defaults);
 assert.equal(errors[0].message,'Ambiguous multi-key settings storage; verified migration required');
 const normal=fixture(undefined,false);normal.rows.set('foreign','{}');normal.store.save(config);
 assert.deepEqual([...normal.rows.keys()].sort(),['foreign',SHARED_KEY].sort());
 assert.equal(normal.rows.get('foreign'),'{}');
});
test('keyed multi-row storage reads and saves valid settings without touching foreign rows',()=>{
 const newer={...config,swapSticks:false};
 const f=fixture({other:{keep:17},[NAMESPACE]:{version:1,controller:config}},false);
 f.rows.set('foreign-row','exact foreign bytes');
 assert.deepEqual(f.store.load(),config);f.store.save(newer);
 assert.equal(f.rows.get('foreign-row'),'exact foreign bytes');
 assert.deepEqual(JSON.parse(f.rows.get(SHARED_KEY)).other,{keep:17});
 assert.deepEqual(JSON.parse(f.rows.get(SHARED_KEY))[NAMESPACE].controller,newer);
});
test('an initially empty keyed backend remains keyed after an unrelated row appears',()=>{
 const f=fixture(undefined,false);f.store.save(config);f.rows.set('z-unrelated','{"foreign":true}');
 assert.deepEqual(f.store.load(),config);f.store.save({...config,swapSticks:false});
 assert.equal(f.rows.size,2);assert.equal(f.rows.get('z-unrelated'),'{"foreign":true}');
});
test('keyed legacy rows load partially and migrate only after an explicit save',()=>{
 const old={enabled:true,invertPanY:false};
 const f=fixture(undefined,false);f.rows.set(STORE,JSON.stringify(old));
 assert.deepEqual(f.store.load(),{...defaults,...old});
 assert.equal(f.rows.has(SHARED_KEY),false);
 f.store.save({...config,invertPanY:false});
 const document=JSON.parse(f.rows.get(SHARED_KEY));
 assert.deepEqual(document[NAMESPACE].controller,{...config,invertPanY:false});
 assert.equal(f.rows.has(STORE),false);
});
test('keyed migration preserves shared foreign fields and a newer namespace wins over legacy',()=>{
 const newer={...config,swapSticks:false};
 const f=fixture({other:{keep:9},[NAMESPACE]:{version:1,controller:newer}},false);
 f.rows.set(STORE,JSON.stringify(config));
 assert.deepEqual(f.store.load(),newer);f.store.save(newer);
 assert.deepEqual(JSON.parse(f.rows.get(SHARED_KEY)).other,{keep:9});
 assert.equal(f.rows.get(STORE),JSON.stringify(config),'the authoritative namespace does not mutate a legacy row');
});
test('a keyed probe failure is unknown and can never authorize removal of existing rows',()=>{
 const rows=new Map([[SHARED_KEY,JSON.stringify({other:{keep:1},[NAMESPACE]:{version:1,controller:config}})],['foreign-key','foreign-value']]);
 let probeFailures=2;
 const storage={get length(){return rows.size},key(){return null},
  getItem(key){if(key==='__bcs-controller-storage-key-probe-20261109__'&&probeFailures-->0)throw new Error('probe backend unavailable');return rows.get(key)??null;},
  setItem(key,value){rows.set(key,value)},removeItem(key){rows.delete(key)},clear(){rows.clear()}};
 const before=[...rows];const backend=createSharedControllerStorage(storage);
 assert.throws(()=>new BridgeSettingsStore(backend,undefined,defaults).save(config),/probe backend unavailable/);
 assert.deepEqual([...rows],before);
});
test('reliable keyed shared metadata may contain root primitives during migration and first save',()=>{
 const metadata={version:3,foreign:{x:1}};
 const migrated=fixture(metadata,false);migrated.rows.set(STORE,JSON.stringify({enabled:true,invertPanY:false}));
 migrated.store.save(config);
 let document=JSON.parse(migrated.rows.get(SHARED_KEY));
 assert.deepEqual({version:document.version,foreign:document.foreign},metadata);
 assert.deepEqual(document[NAMESPACE].controller,config);assert.equal(migrated.rows.has(STORE),false);
 assert.deepEqual(new BridgeSettingsStore(createSharedControllerStorage(migrated.storage),undefined,defaults).load(),config);

 const first=fixture(metadata,false);first.store.save({...config,swapSticks:false});
 document=JSON.parse(first.rows.get(SHARED_KEY));
 assert.deepEqual({version:document.version,foreign:document.foreign},metadata);
 assert.deepEqual(document[NAMESPACE].controller,{...config,swapSticks:false});
});
test('a valid namespace outranks a malformed legacy row without mutating it',()=>{
 const newer={...config,swapSticks:false};const malformed='{"enabled":"yes","invertPanY":false}';
 const f=fixture({[NAMESPACE]:{version:1,controller:config}},false);f.rows.set(STORE,malformed);
 assert.deepEqual(f.store.load(),config);f.store.save(newer);
 assert.deepEqual(JSON.parse(f.rows.get(SHARED_KEY))[NAMESPACE].controller,newer);
 assert.equal(f.rows.get(STORE),malformed);
});
test('malformed legacy or shared namespace rows are never overwritten by a save',()=>{
 const malformed=fixture(undefined,false);malformed.rows.set(STORE,'{"enabled":"yes","invertPanY":false}');
 const before=[...malformed.rows];assert.throws(()=>malformed.backend.getItem(STORE),/Invalid legacy/);
 assert.throws(()=>malformed.store.save(config),/Invalid legacy/);assert.deepEqual([...malformed.rows],before);

 const shared=fixture({[NAMESPACE]:{version:1,controller:{enabled:true}}},false);
 shared.rows.set(STORE,JSON.stringify({enabled:false,invertPanY:true}));
 const sharedBefore=[...shared.rows];assert.throws(()=>shared.backend.getItem(STORE),/Invalid shared/);
 assert.throws(()=>shared.store.save(config),/Invalid shared/);assert.deepEqual([...shared.rows],sharedBefore);
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
test('first creation on empty key-blind storage is removed after transient final verification fails',()=>{
 const f=fixture();const next={...config,swapSticks:false};
 assert.throws(()=>f.backend.verifiedSetItem(STORE,JSON.stringify(next),()=>{throw new Error('transient final read failed');}),/transient final read failed/);
 assert.equal(f.rows.size,0);
 assert.deepEqual(new BridgeSettingsStore(createSharedControllerStorage(f.storage),undefined,defaults).load(),defaults);
});
test('a failed first creation preserves a foreign root field on keyed and key-blind storage',()=>{
 for(const blind of [false,true]){
  const f=fixture(undefined,blind);const next={...config,swapSticks:false};
  const originalSet=f.storage.setItem;
  f.storage.setItem=(key,value)=>{
   originalSet(key,value);
   const document=JSON.parse(f.rows.get(SHARED_KEY));
   document.foreignRoot={keep:31};
   originalSet(SHARED_KEY,JSON.stringify(document));
  };
  assert.throws(()=>f.backend.verifiedSetItem(STORE,JSON.stringify(next)),/read-back failed/,blind?'key-blind':'keyed');
  assert.equal(f.rows.size,1,blind?'key-blind':'keyed');
  assert.deepEqual(JSON.parse(f.rows.get(SHARED_KEY)),{foreignRoot:{keep:31}});
  const errors=[];const fresh=new BridgeSettingsStore(createSharedControllerStorage(f.storage),e=>errors.push(e),defaults);
  assert.deepEqual(fresh.load(),defaults);
  assert.equal(errors.length,0);
 }
});
test('a rejected empty write before mutation is already rolled back',()=>{
 const f=fixture();
 f.storage.setItem=()=>{throw new Error('backend unavailable');};
 assert.throws(()=>f.backend.verifiedSetItem(STORE,JSON.stringify(config)),/backend unavailable/);
 assert.equal(f.rows.size,0);
});
test('key-blind rollback of a known shared row preserves an independent new foreign key',()=>{
 const old={...config,swapSticks:false};const next={...config,swapSticks:true};
 const f=fixture({other:{keep:23},[NAMESPACE]:{version:1,controller:old}},true);
 f.store.load();
 const originalSet=f.storage.setItem;
 f.storage.setItem=(key,value)=>{
  originalSet(key,value);
  f.rows.set('foreign-key','foreign-value');
  throw new Error('persisted then failed');
 };
 assert.throws(()=>f.backend.verifiedSetItem(STORE,JSON.stringify(next)),/persisted then failed/);
 assert.equal(f.rows.size,2);
 assert.deepEqual(JSON.parse(f.rows.get(SHARED_KEY)),{other:{keep:23},[NAMESPACE]:{version:1,controller:old}});
 assert.equal(f.rows.get('foreign-key'),'foreign-value');
});
test('key-blind rollback preserves an unknown sole row and its new shared row without guessing',()=>{
 const f=fixture(undefined,true);
 const original=JSON.stringify({other:{keep:19}});
 f.rows.set('aaa-other',original);
 const before=[...f.rows];
 assert.throws(()=>f.store.save(config),/rollback unverified.*ambiguous/);
 assert.equal(f.rows.size,2);
 assert.equal(f.rows.get('aaa-other'),original);
 assert.deepEqual(JSON.parse(f.rows.get(SHARED_KEY)),{other:{keep:19},[NAMESPACE]:{version:1,controller:config}});
 const errors=[];
 const fresh=new BridgeSettingsStore(createSharedControllerStorage(f.storage),e=>errors.push(e),defaults);
 assert.deepEqual(fresh.load(),defaults);
 assert.equal(errors[0].message,'Ambiguous multi-key settings storage; verified migration required');
 assert.deepEqual([...f.rows],[...before,[SHARED_KEY,JSON.stringify({other:{keep:19},[NAMESPACE]:{version:1,controller:config}})]]);
});
test('key-blind rollback never removes an unchanged shared row beside a setter-created foreign key',()=>{
 for(const noOpShared of [false,true]){
  const requested=noOpShared?{...config,swapSticks:false}:config;
  const f=fixture({[NAMESPACE]:{version:1,controller:config}},true);
  const original=f.rows.get(SHARED_KEY);
  const originalSet=f.storage.setItem;
  f.storage.setItem=(key,value)=>{
   if(key!==SHARED_KEY) return originalSet(key,value);
   if(!noOpShared) originalSet(key,value);
   f.rows.set('foreign-key','foreign-value');
   if(noOpShared) return undefined;
  };
  assert.throws(()=>f.store.save(requested),/Controller settings rollback unverified after Shared settings write created a second key; migration required: shared-row identity is ambiguous/);
  assert.equal(f.rows.size,2);
  assert.equal(f.rows.get(SHARED_KEY),original);
  assert.equal(f.rows.get('foreign-key'),'foreign-value');
 }
});
test('a shared write that persists and then throws restores only its detectable namespace',()=>{
 const old={...config,swapSticks:false};const next={...config,swapSticks:true};
 const f=fixture({[NAMESPACE]:{version:1,controller:old}});
 const original=f.storage.setItem;const before=f.rows.get(SHARED_KEY);
 f.storage.setItem=(key,value)=>{original(key,value);throw new Error('persisted then failed');};
 assert.throws(()=>f.backend.verifiedSetItem(STORE,JSON.stringify(next)),/persisted then failed/);
 assert.equal(f.rows.get(SHARED_KEY),before);
 assert.deepEqual(f.store.load(),old);
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
