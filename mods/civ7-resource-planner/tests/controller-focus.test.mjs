import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../ui/rp-ui.js',import.meta.url),'utf8');
const body=source.slice(source.indexOf('export function installControllerFocus'),source.indexOf('const div=template')).replace('export ','');
function fixture(){
 const pending=new Map();let id=0,controller=true,active=false,current=null,repairs=0;
 const listeners=new Map(),deviceListeners=new Map();let mutation;
 const MutationObserver=class{constructor(fn){mutation=fn}observe(){}disconnect(){}};
 const root={isConnected:true,contains:t=>t?.inside===true,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 const target={inside:true,isConnected:true,hasAttribute:()=>true,classes:new Set(),matches:()=>true,classList:{contains:name=>target.classes.has(name),add:name=>target.classes.add(name),remove:name=>target.classes.delete(name)}};
 const focus={setFocus:t=>{current=t;active=false},currentFocus:()=>current,isFocusActive:()=>active,realizeFocus:()=>{repairs++;active=true}};
 const original=focus.setFocus;
 const install=vm.runInNewContext(body+';installControllerFocus',{MutationObserver,window:{addEventListener:(n,fn)=>deviceListeners.set(n,fn),removeEventListener:n=>deviceListeners.delete(n)},setTimeout:fn=>{pending.set(++id,fn);return id},clearTimeout:id=>pending.delete(id)});
 const cleanup=install(focus,root,()=>controller);
 return {focus,root,target,original,cleanup,mutate:()=>mutation?.(),blur:()=>{active=false;listeners.get('focusout')?.({target})},flush:()=>{for(const fn of pending.values())fn();pending.clear()},get repairs(){return repairs},setController:x=>{controller=x;deviceListeners.get('active-device-type-changed')?.();}};
}
test('repairs delayed panel focus without moving focus to an obsolete target',()=>{
 const x=fixture();x.focus.setFocus(x.target);assert.equal(x.repairs,0);x.flush();assert.equal(x.repairs,1);
 x.focus.setFocus(x.target);x.focus.setFocus({...x.target,inside:false});x.flush();assert.equal(x.repairs,1);
});
test('deferred focus respects device changes, disabled targets and disposal',()=>{
 const x=fixture();x.focus.setFocus(x.target);x.setController(false);x.flush();assert.equal(x.repairs,0);
 x.setController(true);x.focus.setFocus(x.target);x.target.classList.contains=()=>true;x.flush();assert.equal(x.repairs,0);
 x.target.classList.contains=()=>false;x.focus.setFocus(x.target);x.cleanup();x.flush();assert.equal(x.repairs,0);assert.equal(x.focus.setFocus,x.original);
 const y=fixture(),later=()=>{};y.focus.setFocus=later;y.cleanup();assert.equal(y.focus.setFocus,later);
});

test('pending native focus may be requested before the resource joins the panel',()=>{
 const x=fixture();x.target.inside=false;x.target.isConnected=false;x.focus.setFocus(x.target);
 x.target.inside=true;x.target.isConnected=true;x.flush();assert.equal(x.repairs,1);
});

test('a later layout blur is repaired only while logical focus still belongs to that target',()=>{
 const x=fixture();x.focus.setFocus(x.target);x.flush();x.blur();x.flush();assert.equal(x.repairs,2);
 x.blur();x.focus.setFocus({...x.target,inside:false});x.flush();assert.equal(x.repairs,2);
});

test('exactly the current button is highlighted, and device change and cleanup clear it',()=>{
 const x=fixture();x.focus.setFocus(x.target);assert.ok(x.target.classes.has('rp-controller-focus'));
 x.setController(false);assert.ok(!x.target.classes.has('rp-controller-focus'));
 x.setController(true);assert.ok(x.target.classes.has('rp-controller-focus'));
 x.focus.setFocus({...x.target,inside:false});assert.ok(!x.target.classes.has('rp-controller-focus'));
 x.focus.setFocus(x.target);x.cleanup();assert.ok(!x.target.classes.has('rp-controller-focus'));
});

test('reactive selection class changes preserve current native focus artwork',()=>{
 const x=fixture();x.focus.setFocus(x.target);x.flush();
 x.target.classes.delete('rp-controller-focus');x.mutate();
 assert.ok(x.target.classes.has('rp-controller-focus'));
 x.cleanup();x.mutate();assert.ok(!x.target.classes.has('rp-controller-focus'));
});
