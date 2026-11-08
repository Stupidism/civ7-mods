import test from 'node:test';
import assert from 'node:assert/strict';
import {BridgeSettingsStore} from '../ui/bridge-store.js';
const calibration={enabled:true,swapSticks:true,invertLeftY:false,invertPanY:false,showDebug:false};
const defaults={...calibration,enabled:false,swapSticks:false,invertPanY:true};
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
