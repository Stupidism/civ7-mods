import test from 'node:test';
import assert from 'node:assert/strict';
import {BridgeSettingsStore} from '../ui/bridge-store.js';
import {createSharedControllerStorage,SHARED_KEY,NAMESPACE} from '../ui/bridge-shared-storage.js';
const calibration={enabled:true,swapSticks:true,invertLeftY:false,invertPanY:false,showDebug:false};
const defaults={...calibration,enabled:false,swapSticks:false,invertPanY:true};
function sharedFixture(document) {
 const rows=document===undefined?new Map():new Map([[SHARED_KEY,JSON.stringify(document)]]);
 const storage={get length(){return rows.size},key(){return null},getItem:key=>rows.get(key)??null,
  setItem(key,value){rows.set(key,value)},removeItem(key){rows.delete(key)},clear(){rows.clear()}};
 const backend=createSharedControllerStorage(storage);
 const errors=[];
 return {rows,storage,backend,store:new BridgeSettingsStore(backend,error=>errors.push(error),defaults),errors};
}
test('a foreign settings read cannot silently erase a known calibration',()=>{
 let raw=JSON.stringify(calibration);const errors=[];
 const store=new BridgeSettingsStore({getItem:()=>raw},e=>errors.push(e),defaults);
 assert.deepEqual(store.load(),calibration);
 raw=JSON.stringify({LFPolicyYieldsSettings:{IsColorful:true}});
 assert.deepEqual(store.load(),calibration);
 assert.equal(errors.length,1);
 store.load();assert.equal(errors.length,1,'same failure is reported only once');
 raw=null;assert.deepEqual(store.load(),calibration);
});
test('malformed data keeps last good settings; failed read-back never notifies',()=>{
 let raw=JSON.stringify(calibration);const errors=[],applied=[];
 const store=new BridgeSettingsStore({getItem:()=>raw,setItem(){}},e=>errors.push(e),defaults);
 store.subscribe(v=>applied.push(v));store.load();raw='{broken';
 assert.deepEqual(store.load(),calibration);
 raw=JSON.stringify(calibration);
 assert.throws(()=>store.save({...calibration,swapSticks:false}),/read.back/i);
 assert.equal(applied.length,0);
});
test('a plain write that persists and then throws restores the exact prior row',()=>{
 let raw=JSON.stringify(calibration);const next={...calibration,swapSticks:false};
 const storage={getItem:()=>raw,setItem(_key,value){raw=value;throw new Error('persisted then failed');},removeItem(){raw=null;}};
 const store=new BridgeSettingsStore(storage,undefined,defaults);
 store.load();assert.throws(()=>store.save(next),/persisted then failed/);
 assert.equal(raw,JSON.stringify(calibration));assert.deepEqual(store.load(),calibration);
});
test('a failed adapter read-back never overwrites an intervening foreign mutation',()=>{
 const f=sharedFixture({other:{keep:1},[NAMESPACE]:{version:1,controller:calibration}});
 const original=f.storage.setItem;f.store.load();const applied=[];f.store.subscribe(value=>applied.push(value));
 f.storage.setItem=(key,value)=>{original(key,value);f.rows.set(SHARED_KEY,'{broken');};
 assert.throws(()=>f.store.save({...calibration,swapSticks:false}),/Controller settings rollback failed/);
 assert.equal(f.rows.get(SHARED_KEY),'{broken');assert.equal(applied.length,0);
 assert.deepEqual(new BridgeSettingsStore(f.backend,undefined,defaults).load(),defaults);
});
test('a failure during the store final verification rolls back and never notifies',()=>{
 const f=sharedFixture({[NAMESPACE]:{version:1,controller:calibration}});f.store.load();const applied=[];
 f.store.subscribe(value=>applied.push(value));const originalGet=f.backend.getItem;
 f.backend.getItem=()=>{throw new Error('final verify read failed');};
 assert.throws(()=>f.store.save({...calibration,swapSticks:false}),/final verify read failed/);
 f.backend.getItem=originalGet;
 assert.deepEqual(f.store.load(),calibration);assert.equal(applied.length,0);
 assert.deepEqual(new BridgeSettingsStore(f.backend,undefined,defaults).load(),calibration);
});
test('a failed first shared save restores absence and reports rollback failure distinctly',()=>{
 const f=sharedFixture();const applied=[];f.store.subscribe(value=>applied.push(value));
 const originalGet=f.backend.getItem;f.backend.getItem=()=>{throw new Error('final verify read failed');};
 const originalRemove=f.storage.removeItem;f.storage.removeItem=()=>{throw new Error('removal denied');};
 assert.throws(()=>f.store.save(calibration),/Controller settings rollback failed/);
 f.backend.getItem=originalGet;f.storage.removeItem=originalRemove;
 assert.deepEqual(JSON.parse(f.rows.get(SHARED_KEY))[NAMESPACE].controller,calibration);
 assert.equal(applied.length,0);assert.deepEqual(f.store.load(),defaults);
 assert.deepEqual(new BridgeSettingsStore(f.backend,undefined,defaults).load(),calibration);

 const recoverable=sharedFixture();recoverable.backend.getItem=()=>{throw new Error('final verify read failed');};
 assert.throws(()=>recoverable.store.save(calibration),/final verify read failed/);
 assert.equal(recoverable.rows.has(SHARED_KEY),false);
 assert.deepEqual(new BridgeSettingsStore(recoverable.backend,undefined,defaults).load(),defaults);
});
test('namespace rollback preserves foreign root fields changed during the failed save',()=>{
 const old={...calibration,swapSticks:false};
 const f=sharedFixture({other:{keep:1},[NAMESPACE]:{version:1,controller:old}});f.store.load();
 const originalGet=f.backend.getItem;
 f.backend.getItem=()=>{
  const document=JSON.parse(f.rows.get(SHARED_KEY));
  document.other={changed:true};f.rows.set(SHARED_KEY,JSON.stringify(document));
  throw new Error('final verify read failed');
 };
 assert.throws(()=>f.store.save(calibration),/final verify read failed/);
 f.backend.getItem=originalGet;
 const document=JSON.parse(f.rows.get(SHARED_KEY));
 assert.deepEqual(document.other,{changed:true});
 assert.deepEqual(document[NAMESPACE].controller,old);
 assert.deepEqual(f.store.load(),old);
});
