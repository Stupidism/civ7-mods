import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const sources=['civ7-fenhe-ui','civ7-fenhe'].map(name=>readFileSync(new URL(`../mod/${name}/ui/fenhe.js`,import.meta.url),'utf8'));
function harness(source){
  class Node {
    constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.style={};this.events={};this.className='';}
    setAttribute(k,v){this.attrs[k]=v;} getAttribute(k){return this.attrs[k]??null;}
    appendChild(n){this.children.push(n);n.parent=this;} remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}
    get isConnected(){return !!this.parent||this.tag==='body'||this.tag==='head';}
    set textContent(v){this.text=v;this.children=[];} get textContent(){return this.text;}
    matches(s){return s[0]==='.'?this.className.split(' ').includes(s.slice(1)):s==='[data-fh-action]'?!!this.attrs['data-fh-action']:this.tag===s;}
    closest(s){return this.matches(s)?this:this.parent?.closest(s);}
    contains(n){return this===n||this.children.some(c=>c.contains(n));}
    querySelectorAll(s){return this.children.flatMap(n=>[...(n.matches(s)?[n]:[]),...n.querySelectorAll(s)]);}
    querySelector(s){return this.querySelectorAll(s)[0]??null;}
    addEventListener(n,fn){this.events[n]=fn;} scrollIntoView(){}
  }
  const body=new Node('body'),head=new Node('head'),bar=new Node('panel-system-bar'),slot=new Node('fxs-hslot');body.appendChild(bar);bar.appendChild(slot);
  let current=bar,obscured=false,phase='',delegate=0,timer;
  const menus=[];
  const ContextManager={handleInput(){delegate++;return 'native';},handleNavigation(){delegate++;return 'native';}};
  const ctx=vm.createContext({document:{body,head,createElement:t=>new Node(t),querySelector:s=>s==='screen-dialog-box, .c7r-overlay'?(obscured?{}:null):body.querySelector(s)},
    ContextManager,FocusManager:{get:()=>({currentFocus:()=>current,setFocus:n=>{current=n;}})},Cursor:{target:null},
    InputActionStatuses:{START:1,FINISH:2},InputNavigationAction:{UP:1,DOWN:2,LEFT:3,RIGHT:4,PREVIOUS:5,NEXT:6},
    Configuration:{getGame:()=>({getValue:()=>phase})},captureWorld(){},console:{log(){}},
    setInterval:fn=>{timer=fn;return 1;},clearInterval(){},
    getRadialMenus:()=>menus,registerRadialMenu:m=>menus.push({...m,items:[]}),registerRadialMenuItem:(s,item)=>menus.find(m=>m.symbol===s).items.push(item),NavigationType:{FOCUS:1}});
  vm.runInContext(source.replace(/^import .*;\n/gm,''),ctx);
  const api=ctx.__fenheV1;
  return {api,ctx,slot,menus,ContextManager,get current(){return current;},get delegate(){return delegate;},set obscured(v){obscured=v;},
    phase(v){phase=v;timer();},send(kind,detail){const e={detail,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};ContextManager[kind](e);return e;}};
}
for(const [index,source] of sources.entries()){
  test(`package ${index}: native radial launch, focused accept, navigation and B return`,()=>{
    const h=harness(source);
    assert.equal(h.menus[0].items[0].navigation.value(),'.fh-launch');
    assert.equal(h.slot.children[0].tag,'fxs-activatable');
    h.slot.children[0].events['action-activate']();
    assert.equal(h.current.getAttribute('data-fh-action'),'run');
    const event=h.send('handleNavigation',{navigation:2,status:2});assert.equal(event.prevented,true);
    assert.equal(h.current.getAttribute('data-fh-action'),'close');
    h.send('handleInput',{name:'accept',status:1});assert.equal(h.current.getAttribute('data-fh-action'),'close');
    h.send('handleInput',{name:'accept',status:2});assert.equal(h.current.tag,'panel-system-bar');
    assert.equal(h.delegate,0,'overlay input must not leak to the map');
    h.api.open();h.send('handleInput',{name:'cancel',status:2});assert.equal(h.current.tag,'panel-system-bar');
    h.api.destroy();h.send('handleInput',{name:'accept',status:2});assert.equal(h.delegate,1);
  });
  test(`package ${index}: higher dialogs receive input; import overlay blocks actions`,()=>{
    const h=harness(source);h.api.open();h.obscured=true;
    h.send('handleInput',{name:'accept',status:2});h.send('handleNavigation',{navigation:2,status:2});
    assert.equal(h.delegate,2);assert.equal(h.current.getAttribute('data-fh-action'),'run');
    h.obscured=false;h.phase('INIT');
    const e=h.send('handleInput',{name:'cancel',status:2});assert.equal(e.stopped,true);
    h.send('handleNavigation',{navigation:2,status:2});assert.equal(h.delegate,2);
    h.phase('');h.send('handleInput',{name:'accept',status:2});assert.equal(h.delegate,3);
  });
}
