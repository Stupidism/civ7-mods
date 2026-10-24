import test from 'node:test';
import assert from 'node:assert/strict';
import {bindDialogNavigation} from '../ui/dialog-navigation.js';
function harness(){
  const listeners=new Map(), calls=[];
  function node(tag,disabled=false){return {tagName:tag,style:{},getAttribute:()=>String(disabled),
    closest(selector){return selector.split(', ').includes(tag)?this:null;},scrollIntoView(){}};}
  const field=node('fxs-textbox'), first=node('fxs-button'), disabled=node('fxs-button',true), middle=node('fxs-button'), last=node('fxs-button');
  let current=first;
  const root={querySelectorAll:()=>[field,first,disabled,middle,last],addEventListener:(n,fn)=>listeners.set(n,fn),removeEventListener:n=>listeners.delete(n)};
  const cleanup=bindDialogNavigation(root,{focus:{currentFocus:()=>current,setFocus:n=>{current=n;}},statuses:{FINISH:2},directions:{UP:1,DOWN:2,LEFT:3,RIGHT:4,PREVIOUS:5,NEXT:6},activate:n=>calls.push(n)});
  return {field,first,middle,last,calls,cleanup,listeners,get current(){return current;},set current(n){current=n;},
    send(type,detail){const e={detail,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};listeners.get(type)?.(e);return e;}};
}
test('dialog pad navigation reaches middle choices, skips disabled and wraps',()=>{
  const h=harness();
  h.send('navigate-input',{navigation:2,status:1});assert.equal(h.current,h.first);
  h.send('navigate-input',{navigation:2,status:2});assert.equal(h.current,h.middle);
  h.send('engine-input',{name:'accept',status:1});assert.equal(h.calls.length,0);
  h.send('engine-input',{name:'accept',status:2});assert.deepEqual(h.calls,[h.middle]);
  h.send('navigate-input',{navigation:2,status:2});assert.equal(h.current,h.last);
  h.send('navigate-input',{navigation:2,status:2});assert.equal(h.current,h.field);
  h.send('navigate-input',{navigation:1,status:2});assert.equal(h.current,h.last);
});
test('text editing and native cancel remain native; detach removes both listeners',()=>{
  const h=harness();h.current=h.field;
  assert.equal(h.send('engine-input',{name:'accept',status:2}).prevented,undefined);
  assert.equal(h.send('navigate-input',{navigation:4,status:2}).prevented,undefined);
  assert.equal(h.send('engine-input',{name:'cancel',status:2}).prevented,undefined);
  assert.equal(h.calls.length,0);h.cleanup();assert.equal(h.listeners.size,0);
});
test('accept from an inner label activates its owning focused button once',()=>{
  const h=harness();h.current={closest:s=>s==='fxs-button'?h.middle:null};
  assert.equal(h.send('engine-input',{name:'accept',status:2}).stopped,true);
  assert.deepEqual(h.calls,[h.middle]);
});
