import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../ui/city-panel.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
function harness(){
  const classes=new Map(),calls=[];
  class Panel{onAttach(){} onDetach(){} onReceiveFocus(){} close(){calls.push('cancel');}}
  const tray={clear:()=>calls.push('tray-clear'),addOrUpdateGenericCancel:()=>calls.push('hint-cancel'),addOrUpdateShellAction1:()=>calls.push('hint-save')};
  vm.runInNewContext(source,{Panel,Component:class{},Controls:{define:(name,def)=>classes.set(name,def.createInstance)},
    ModdingRegistry:{modElements:[],add(){}},InputActionStatuses:{START:1,FINISH:2},NavTray:tray,
    FocusManager:{get:()=>({setFocus:n=>calls.push(n)})}});
  const Screen=classes.get('screen-garbage-city'),screen=new Screen();screen.apply=()=>calls.push('save');screen.main='main';
  const events=new Map();screen.Root={addEventListener:(n,fn)=>events.set(n,fn),removeEventListener:n=>events.delete(n)};
  return {screen,calls,events,send(name,status=2){const e={detail:{name,status},preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};screen.input(e);return e;}};
}
test('city controller cancel discards draft and shell save commits only at FINISH',()=>{
  const h=harness();h.send('shell-action-1',1);assert.deepEqual(h.calls,[]);
  assert.equal(h.send('shell-action-1').prevented,true);assert.deepEqual(h.calls,['save']);
  h.send('cancel',1);assert.deepEqual(h.calls,['save']);h.send('cancel');assert.deepEqual(h.calls,['save','cancel']);
  assert.equal(h.send('accept').prevented,undefined,'A belongs to the focused native control');
});
test('city panel focuses native navigation slot and cleans its listeners and hints',()=>{
  const h=harness();h.screen.onAttach();h.screen.onReceiveFocus();
  assert.deepEqual(h.calls,['main','tray-clear','hint-cancel','hint-save']);
  assert.equal(h.events.size,1);h.screen.onDetach();assert.equal(h.events.size,0);assert.equal(h.calls.at(-1),'tray-clear');
});
