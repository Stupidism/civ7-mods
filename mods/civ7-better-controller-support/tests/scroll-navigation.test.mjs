import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createScrollNavigation} from '../ui/scroll-navigation.js';
const source=readFileSync(new URL('../ui/scroll-navigation.js',import.meta.url),'utf8').replace(/^export /gm,'');
const menu=readFileSync(new URL('../ui/menu-navigation.js',import.meta.url),'utf8').replace(/^export /gm,'');

test('popup ownership cancels scroll and R3 once, stops held frames, and recovers safely', () => {
  let time = 0;
  let claimsPopup = false;
  let throwNextScrollEvent = false;
  const popupEvents = [];
  const trayCalls = [];
  const activations = [];
  const classList = () => {
    const classes = new Set();
    return {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name)
    };
  };
  const element = () => {
    const el = {
      isConnected: true,
      parentElement: null,
      style: {},
      classList: classList(),
      children: [],
      append(child) { this.children.push(child); child.parentElement = this; },
      setAttribute() {},
      remove() {
        if (!this.parentElement) return;
        this.parentElement.children = this.parentElement.children.filter(child => child !== this);
        this.parentElement = null;
      },
      closest() { return null; },
      getBoundingClientRect() { return {left: 0, right: 400, top: 0, bottom: 360, width: 400, height: 360}; }
    };
    return el;
  };
  const viewport = element();
  Object.assign(viewport, {
    scrollHeight: 1200,
    clientHeight: 120,
    scrollTop: 0,
    querySelectorAll: () => [target]
  });
  const target = element();
  target.dispatchEvent = event => {
    popupEvents.push({name: event.detail.name, status: event.detail.status});
    if (throwNextScrollEvent && event.detail.name === 'scroll-pan') {
      throwNextScrollEvent = false;
      throw new Error('popup listener failed');
    }
    if (claimsPopup) event.preventDefault();
    return true;
  };
  const thumb = element();
  const track = element();
  track.querySelector = () => thumb;
  const area = element();
  area.tagName = 'SECTION';
  area.firstElementChild = viewport;
  area.querySelector = selector => selector.includes('track') ? track : viewport;
  area.contains = candidate => candidate === target;
  area.component = {setScrollThumbPosition() {}};
  const root = {querySelectorAll: () => [area]};
  const documentStub = {
    head: element(),
    createElement: () => element()
  };
  const focus = {
    currentFocus: () => target,
    setFocus: candidate => activations.push(candidate)
  };
  const statuses = {START: 1, UPDATE: 2, FINISH: 3, HOLD: 4};
  const runtime = createScrollNavigation({
    document: documentStub,
    window: {getComputedStyle: () => ({display: 'block', visibility: 'visible'})},
    focus,
    statuses,
    root: () => root,
    navigationTray: {set: entries => trayCalls.push(entries.map(entry => entry.action))},
    now: () => time
  });

  claimsPopup = true;
  assert.equal(runtime.route('scroll-pan', statuses.START, 0, -1, true), true);
  assert.equal(runtime.route('shell-action-3', statuses.START, 0, 0, true), true);
  assert.deepEqual(popupEvents.map(event => event.name), ['scroll-pan', 'shell-action-3']);
  assert.deepEqual(activations, []);
  assert.equal(viewport.scrollTop, 0);

  claimsPopup = false;
  runtime.route('scroll-pan', statuses.START, 0, -1, true);
  time += 20;
  runtime.sync(true);
  const heldTop = viewport.scrollTop;
  assert.ok(heldTop > 0);
  claimsPopup = true;
  time += 20;
  runtime.sync(true);
  const popupTop = viewport.scrollTop;
  time += 20;
  runtime.sync(true);
  assert.equal(viewport.scrollTop, popupTop);
  assert.deepEqual(trayCalls.at(-1), []);

  claimsPopup = false;
  runtime.route('scroll-pan', statuses.START, 0, -1, true);
  time += 20;
  runtime.sync(true);
  assert.ok(viewport.scrollTop > popupTop);
  assert.ok(trayCalls.at(-1).includes('shell-action-3'));
  assert.equal(track.classList.contains('mtg-owned-scroll-track'), true);
  assert.equal(track.classList.contains('mtg-active-scroll'), true);
  const heldMarker = thumb.children.at(-1);
  assert.ok(heldMarker);

  throwNextScrollEvent = true;
  const throwingBaseline = viewport.scrollTop;
  assert.equal(runtime.route('scroll-pan', statuses.START, 0, -1, true), true);
  time += 20;
  runtime.sync(true);
  assert.ok(viewport.scrollTop > throwingBaseline);

  const eventsBeforeInactive = popupEvents.length;
  const topBeforeInactive = viewport.scrollTop;
  assert.equal(runtime.route('scroll-pan', statuses.UPDATE, 0, -1, false), false);
  assert.equal(popupEvents.length, eventsBeforeInactive);
  assert.equal(viewport.scrollTop, topBeforeInactive);
  assert.deepEqual(trayCalls.at(-1), []);
  assert.equal(track.classList.contains('mtg-owned-scroll-track'), false);
  assert.equal(track.classList.contains('mtg-active-scroll'), false);
  assert.equal(thumb.children.includes(heldMarker), false);
  assert.equal(thumb.children.length, 0);
  time += 20;
  runtime.sync(true);
  assert.equal(viewport.scrollTop, topBeforeInactive);

  runtime.route('scroll-pan', statuses.START, 0, -1, true);
  time += 20;
  runtime.sync(true);
  const probeHeldTop = viewport.scrollTop;
  assert.ok(probeHeldTop > topBeforeInactive);
  assert.equal(track.classList.contains('mtg-owned-scroll-track'), true);
  assert.equal(track.classList.contains('mtg-active-scroll'), true);
  const probeMarker = thumb.children.at(-1);
  assert.ok(probeMarker);
  claimsPopup = true;
  time += 20;
  runtime.sync(true);
  assert.equal(viewport.scrollTop, probeHeldTop);
  assert.deepEqual(trayCalls.at(-1), []);
  assert.equal(track.classList.contains('mtg-owned-scroll-track'), false);
  assert.equal(track.classList.contains('mtg-active-scroll'), false);
  assert.equal(thumb.children.includes(probeMarker), false);
  assert.equal(thumb.children.length, 0);

  claimsPopup = false;
  time += 20;
  runtime.sync(true);
  assert.equal(viewport.scrollTop, probeHeldTop);
  const recoveryBaseline = viewport.scrollTop;
  runtime.route('scroll-pan', statuses.START, 0, -1, true);
  time += 20;
  runtime.sync(true);
  assert.ok(viewport.scrollTop > recoveryBaseline);
  runtime.dispose();
});
test('scroll ownership, centre focus, calibration, directions, lifecycle and read-only panes', {skip:!process.env.CIV7_PLAYWRIGHT_MODULE}, async()=>{
 const {chromium}=createRequire(import.meta.url)(process.env.CIV7_PLAYWRIGHT_MODULE);
 const browser=await chromium.launch({headless:true});
 try {
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.setContent(`<style>.panes{display:flex;gap:40px}[data-name=ScrollArea]{width:400px}.viewport{height:360px;overflow:auto}button{display:block;height:60px;width:320px}.scroll-area_track{height:360px;width:6px;position:absolute;top:0;right:0}section{position:relative}.flow-row{display:flex}nav-tray{display:block}.hidden{display:none}</style><main class=panes><section data-name=ScrollArea><div class=viewport></div><div class=scroll-area_track></div></section><section data-name=ScrollArea><div class=viewport><article style="height:1500px">Read only</article></div><div class=scroll-area_track></div></section></main><nav-tray><div class="flow-row relative w-full"><span>B Back A Load X Delete</span></div></nav-tray>`);
 await page.evaluate(source+'\n'+menu+'\nwindow.make=createScrollNavigation;window.menu=createMenuNavigation;');
 const result=await page.evaluate(()=>{
 const S={START:1,UPDATE:2,FINISH:3,HOLD:4};let time=0,active=true,activations=0,focused;
 const root=document.querySelector('main'), panes=[...root.children],v=panes[0].firstElementChild;
 for(let i=0;i<24;i++){const b=document.createElement('button');b.tabIndex=0;b.textContent='row '+i;b.onclick=()=>activations++;v.append(b);}
 const disabled=v.children[14];disabled.disabled=true;disabled.setAttribute('disabled','true');
 const focus={currentFocus:()=>focused,setFocus:el=>{focused=el;el.focus({preventScroll:true});}};
 focus.setFocus(v.children[0]);v.scrollTop=720;
 const trayCalls=[];
 const control=window.make({document,window,focus,statuses:S,root:()=>root,now:()=>time,
   navigationTray:{set:entries=>trayCalls.push(entries.map(({action,locKey})=>[locKey,action]))}});
 const delegated=[];const handler={onEngineInput:(...args)=>delegated.push(args)};
 const snap={menu:true,controller:true,focused:true,swapRoles:true,scope:'menu'};
 const patch=window.menu({actionHandler:handler,statuses:S,snapshot:()=>snap,scrollControls:control});
 patch.setConfig({enabled:true,swapSticks:true});
 const input=(n,s,x=0,y=0)=>handler.onEngineInput(n,s,x,y);
 // START immediately focuses the centre of the visible list, never the offscreen original.
 input('shell-action-3',1);const centre=focused.textContent;
 input('shell-action-3',4);input('shell-action-3',3);const noActivation=activations===0;
 // calibrated right stream arrives as nav-move; minor X noise and diagonal remain in this pane.
 input('nav-move',1,.18,-1);time+=20;patch.sync();const firstScrolled=v.scrollTop>720;
 input('nav-move',2,.9,.8);const diagonalStayed=panes[0].querySelector('.mtg-active-scroll')!==null;
 input('nav-move',2,1,0);const verticalLatch=panes[0].querySelector('.mtg-active-scroll')!==null;
 input('nav-move',3);input('nav-move',1,1,.1);
 const switched=panes[1].querySelector('.mtg-active-scroll')!==null;
 input('nav-move',4,1,0); const heldSingle=panes[1].querySelector('.mtg-active-scroll')!==null;
 input('nav-move',3);input('nav-move',1,0,-1);time+=20;patch.sync();
 const readOnlyScrolled=panes[1].firstElementChild.scrollTop>0;
 input('shell-action-3',1);input('shell-action-3',3);const readOnlyKept=focused.textContent===centre;
 const iconsMapped=trayCalls.at(-1).some(([k,a])=>k.endsWith('SWITCH')&&a==='scroll-pan');
 // return left requires neutral; focus remains until explicit R3.
 input('nav-move',3);input('nav-move',1,-1,0);const left=!!panes[0].querySelector('.mtg-active-scroll');
 snap.blocked=true;const before=v.scrollTop;time+=25;patch.sync();input('nav-move',2,0,-1);
 const blocked=v.scrollTop===before&&trayCalls.at(-1).length===0&&!document.querySelector('mtg-scroll-hints,.mtg-scroll-hints');
 snap.blocked=false;patch.setConfig({enabled:false});input('scroll-pan',1,0,-1);time+=20;patch.sync();
 const nativeMode=v.scrollTop>before;
 input('scroll-pan',3);const stopped=v.scrollTop;time+=30;patch.sync();const finishStops=v.scrollTop===stopped;
 const mouseBefore=delegated.length;input('mousewheel-down',3);const mouseDelegates=delegated.length===mouseBefore+1;
 panes[0].remove();patch.sync();const rebuilt=!!panes[1].querySelector('.mtg-active-scroll');
 const oldTop=panes[1].firstElementChild.scrollTop;input('scroll-pan',4,0,-1);time+=20;patch.sync();
 const staleHeldIgnored=panes[1].firstElementChild.scrollTop===oldTop;
 patch.dispose();const cleaned=!document.querySelector('mtg-scroll-hints,.mtg-scroll-hints,.mtg-active-scroll')&&!document.head.textContent.includes('.mtg-active-scroll{')&&trayCalls.at(-1).length===0;
 return {centre,noActivation,firstScrolled,diagonalStayed,verticalLatch,switched,heldSingle,readOnlyScrolled,readOnlyKept,iconsMapped,left,blocked,nativeMode,finishStops,mouseDelegates,rebuilt,staleHeldIgnored,cleaned};
 });
 assert.match(result.centre,/row 1[356]/); // disabled row 14 is skipped; nearest visible enabled row wins.
 for(const [key,value] of Object.entries(result))if(key!=='centre')assert.equal(value,true,key);
 }finally{await browser.close();}
});

test('original FxsScrollable component scrolls and updates its native thumb without moving focus', {skip:!process.env.CIV7_PLAYWRIGHT_MODULE}, async()=>{
 const {chromium}=createRequire(import.meta.url)(process.env.CIV7_PLAYWRIGHT_MODULE);
 const {homedir}=await import('node:os');
 const native=readFileSync(`${homedir()}/Library/Application Support/Steam/steamapps/common/Sid Meier's Civilization VII/CivilizationVII.app/Contents/Resources/Base/modules/core/ui/components/fxs-scrollable.js`,'utf8');
 const code=native.replace(/^import .*;\r?\n/gm,'').split('Controls.define(')[0];
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage();
 await page.setContent('<style>fxs-scrollable{display:block;position:relative;width:400px;height:360px}.fxs-scrollable-content-container{height:360px;overflow:auto}.fxs-scrollable-content{display:flex;flex-direction:column}.fxs-scrollbar__track--vertical{position:absolute;height:312px;width:6px;top:0;right:0}.fxs-scrollbar__thumb--vertical{height:40px}button{height:60px;flex-shrink:0}</style><main><fxs-scrollable></fxs-scrollable></main>');
 await page.evaluate(`window.Component=class{constructor(root){this.Root=root}};window.InputEngineEventName='engine-input';window.NavigateInputEventName='navigate-input';window.Layout={pixelsToScreenPixels:n=>n};window.delayByFrame=fn=>fn();window.utils={clamp:(v,a,b)=>Math.max(a,Math.min(b,v))};${code};window.NativeScroll=FxsScrollable;${source};window.make=createScrollNavigation;`);
 const result=await page.evaluate(()=>{
 const el=document.querySelector('fxs-scrollable');
 for(let i=0;i<30;i++){const b=document.createElement('button');b.tabIndex=0;b.textContent=String(i);el.append(b);}
 el.component=new window.NativeScroll(el);el.component.onInitialize();el.component.resizeScrollThumb();
 const before=document.activeElement;let clock=0;
 const runtime=window.make({document,window,statuses:{START:1,UPDATE:2,HOLD:4,FINISH:3},root:()=>document.querySelector('main'),focus:{currentFocus:()=>before,setFocus:e=>e.focus()},instruction:()=>{},now:()=>clock});
 runtime.route('scroll-pan',1,0,-1,true);clock=30;runtime.sync(true);
 const top=el.component.currentScrollOnScrollAreaInPixels;
 const thumb=el.component.scrollbarThumb.style.transform;
 runtime.route('scroll-pan',3,0,0,true);clock=60;runtime.sync(true);
 const stopped=el.component.currentScrollOnScrollAreaInPixels===top;
 runtime.dispose();return {top,thumb,stopped,kept:document.activeElement===before};
 });
 assert.ok(Math.abs(result.top-22.5)<=1); // Browser rounds native pixel scrolling to an integer.
 assert.match(result.thumb,/translateY\([1-9]/);assert.equal(result.stopped,true);assert.equal(result.kept,true);
 }finally{await browser.close();}
});

test('held vertical scroll becomes range-aware and resets on reversal/release/timeout/suspend', {skip:!process.env.CIV7_PLAYWRIGHT_MODULE}, async()=>{
 const {chromium}=createRequire(import.meta.url)(process.env.CIV7_PLAYWRIGHT_MODULE);const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage();
 await page.setContent('<main><section data-name="ScrollArea"><div style="height:360px;width:400px;overflow:auto"><article></article></div></section></main>');
 await page.evaluate(source+'\nwindow.make=createScrollNavigation;');
 const results=await page.evaluate(()=>{
 const area=document.querySelector('section'),v=area.firstElementChild,article=v.firstElementChild;let time=0;
 const r=window.make({document,window,statuses:{START:1,UPDATE:2,FINISH:3,HOLD:4},root:()=>document.querySelector('main'),focus:{currentFocus:()=>null,setFocus:()=>{}},instruction:()=>{},now:()=>time});
 const send=(status,y)=>r.route('scroll-pan',status,0,y,true);
 const step=(status=4,y=-1,dt=20)=>{v.scrollTop=100;time+=dt;send(status,y);return v.scrollTop-100;};
 function run(height){r.suspend();article.style.height=height+'px';send(1,-1);const early=step();let middle;
 for(let i=0;i<100;i++){const d=step();if(i===58)middle=d;}const late=step();return{early,middle,late};}
 const short=run(1080),long=run(36000),extreme=run(360000);
 // Reversal begins a new ramp, without needing a full stick release.
 send(2,1);const reverse=step(4,1);send(3,0);send(1,-1);const released=step();
 for(let i=0;i<100;i++)step();time+=300;r.sync(true);send(4,-1);const timeout=step();
 r.suspend();send(1,-1);const suspended=step();
 // Recentring focus / neutral diagonal / horizontal switching reset the same timer.
 send(2,0);send(1,-1);const neutral=step();
 r.dispose();return{short,long,extreme,reverse,released,timeout,suspended,neutral};
 });
 assert.equal(results.short.early,15);assert.equal(results.long.early,15);
 assert.ok(results.short.late>results.short.early&&results.long.late>results.short.late);
 assert.ok(results.long.middle>15&&results.long.middle<results.long.late);
 const expectedLongFrame=(36000-360)*20/2800;
 assert.ok(Math.abs(results.long.late-expectedLongFrame)<=1,
   `long-list late frame should follow range-derived speed: ${results.long.late} ~= ${expectedLongFrame}`);
 assert.equal(results.reverse,-15);
 for(const k of ['released','timeout','suspended','neutral'])assert.equal(results[k],15,k);
 }finally{await browser.close();}
});

test('real Chromium quantized scrolling crosses representative ranges within three seconds', {skip:!process.env.CIV7_PLAYWRIGHT_MODULE}, async()=>{
 const {chromium}=createRequire(import.meta.url)(process.env.CIV7_PLAYWRIGHT_MODULE);const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.setContent('<main><section data-name="ScrollArea"><div style="height:360px;width:400px;overflow:auto"><article style="display:block"></article></div></section></main>');
 await page.evaluate(source+'\nwindow.make=createScrollNavigation;');
 const results=await page.evaluate(()=>{
 const area=document.querySelector('section'),v=area.firstElementChild,article=v.firstElementChild;let time=0;
 const r=window.make({document,window,statuses:{START:1,UPDATE:2,FINISH:3,HOLD:4},root:()=>document.querySelector('main'),focus:{currentFocus:()=>null,setFocus:()=>{}},instruction:()=>{},now:()=>time});
 const send=(status,y)=>r.route('scroll-pan',status,0,y,true);
 const warmAtBottom=(range)=>{article.style.height=(range+360)+'px';send(3,0);v.scrollTop=range;send(1,-1);const warmStart=time;while(time-warmStart<=1800){time+=16;send(4,-1);}};
 const traverse=(range,intervals)=>{
 warmAtBottom(range);v.scrollTop=0; // Keep the full ramp and hold alive across the teleport to the top.
 const start=time;let firstMovement=0,reached=false;
 for(const dt of intervals){
 const before=v.scrollTop;time+=dt;send(4,-1);
 firstMovement||=v.scrollTop-before;
 if(v.scrollTop===range){reached=true;break;}
 }
 return {range,firstMovement,elapsed:time-start,top:v.scrollTop,reached};
 };
 const repeat=(count,pattern)=>Array.from({length:count},()=>pattern).flat();
 return [
 traverse(6000,Array(188).fill(16)),
 traverse(359640,Array(188).fill(16)),
 traverse(6000,repeat(25,[16,33,100])),
 traverse(359640,repeat(25,[16,33,100])),
 traverse(359640,[...Array(182).fill(16),100])
 ];
 });
 for(const result of results){
 assert.equal(result.firstMovement>0,true,'first post-warm browser frame should move');
 assert.equal(result.reached,true,`real browser scroll should reach ${result.range}`);
 assert.equal(result.top,result.range);
 assert.ok(result.elapsed<=3000,`range ${result.range} took ${result.elapsed}ms in Chromium`);
 }
 }finally{await browser.close();}
});

test('full deflection crosses short, long and extreme ranges within three seconds in both directions', () => {
  const classList=()=>{const classes=new Set();return{
    add:(...names)=>names.forEach(name=>classes.add(name)),
    remove:(...names)=>names.forEach(name=>classes.delete(name)),
    contains:name=>classes.has(name)
  };};
  const element=()=>{const children=[];const el={
    isConnected:true,className:'',style:{},children,classList:classList(),
    contains(){return false;},
    setAttribute(){},getAttribute(){return null;},append(child){children.push(child);child.parentElement=el;},
    remove(){if(!el.parentElement)return;el.parentElement.children=el.parentElement.children.filter(child=>child!==el);el.parentElement=null;},
    closest(){return null;},querySelector(){return null;},querySelectorAll(){return [];},
    getBoundingClientRect(){return{left:0,right:400,top:0,bottom:360,width:400,height:360};}
  };return el;};
  const makeRuntime=({height,client=360})=>{
    let time=0;const viewport=element();const track=element();const thumb=element();
    const area=element();area.tagName='SECTION';area.firstElementChild=viewport;
    area.querySelector=selector=>selector.includes('track')?track:null;
    track.querySelector=()=>thumb;
    Object.assign(viewport,{scrollHeight:height,clientHeight:client,scrollTop:0});
    const root={querySelectorAll:()=>[area]};
    const runtime=createScrollNavigation({
      document:{head:{append(){}},createElement:element},
      window:{getComputedStyle:()=>({display:'block',visibility:'visible'})},
      focus:{currentFocus:()=>null,setFocus(){}},
      statuses:{START:1,UPDATE:2,FINISH:3,HOLD:4},
      root:()=>root,navigationTray:{set(){}},now:()=>time
    });
    const advance=(dt=16,y=null)=>{time+=dt;y===null?runtime.sync(true):runtime.route('scroll-pan',4,0,y,true);};
    return {runtime,viewport,advance,time:()=>time};
  };
  const traverse=({height},direction,dt)=>{
    const range=Math.max(0,height-360);
    const {runtime,viewport,advance,time}=makeRuntime({height});
    const boundary=direction>0?0:range,start=direction>0?range:0;
    viewport.scrollTop=boundary;
    runtime.route('scroll-pan',1,0,direction,true);
    const warmStart=time();
    while(time()-warmStart<1800){advance(dt,direction);assert.equal(viewport.scrollTop,boundary);}
    viewport.scrollTop=start; // Warm the ramp at the finite bound, then move without releasing hold.
    const frameBefore=viewport.scrollTop;const firstStart=time();advance(dt,direction);
    const contentMultiplier=1+Math.min(1.5,.4*Math.sqrt(Math.max(0,height/360-1)));
    const rangeMultiplier=range/2800/.75;
    const expectedFrame=.75*Math.max(contentMultiplier,rangeMultiplier)*dt;
    assert.ok(Math.abs(viewport.scrollTop-frameBefore+direction*expectedFrame)<=1e-9,
      `first full-speed ${dt}ms frame should move ${expectedFrame}px, got ${viewport.scrollTop-frameBefore}`);
    while((direction>0?viewport.scrollTop>1e-7:viewport.scrollTop<range-1e-7)&&time()-firstStart<=3000)advance(dt,direction);
    return {elapsed:time()-firstStart,range,expectedFrame,top:viewport.scrollTop};
  };
  const heights=[
    {name:'short',height:720},
    {name:'long',height:36000},
    {name:'extreme',height:360000}
  ];
  const frameIntervals=[16,33,100];
  for(const item of heights)for(const dt of frameIntervals)for(const direction of [1,-1]){
    const result=traverse(item,direction,dt);
    assert.ok(Math.abs(result.top-(direction>0?0:result.range))<=1e-7,
      `${item.name} ${dt}ms direction ${direction} reached the bound`);
    assert.ok(result.elapsed<=3000,`${item.name} ${dt}ms direction ${direction} took ${result.elapsed}ms`);
  }

  const dynamic=makeRuntime({height:36000});
  dynamic.viewport.scrollTop=35640;
  dynamic.runtime.route('scroll-pan',1,0,-1,true);
  while(dynamic.time()<1800)dynamic.advance(100,-1);
  dynamic.viewport.scrollHeight=360000;
  dynamic.viewport.scrollTop=0;
  const dynamicFrameBefore=dynamic.viewport.scrollTop;
  const dynamicStart=dynamic.time();
  dynamic.advance(100,-1);
  const firstDynamicMovement=dynamic.viewport.scrollTop-dynamicFrameBefore;
  assert.ok(firstDynamicMovement>0,'a dynamically grown range moves on its first held update');
  while(dynamic.viewport.scrollTop<359640-1e-7&&dynamic.time()-dynamicStart<=3000)dynamic.advance(100,-1);
  assert.ok(Math.abs(dynamic.viewport.scrollTop-359640)<=1e-7);
  const dynamicElapsed=dynamic.time()-dynamicStart;
  assert.ok(dynamicElapsed>0);
  assert.ok(dynamicElapsed<=3000,`a dynamically grown range took ${dynamicElapsed}ms to cross`);

  const stale=makeRuntime({height:720});
  stale.viewport.scrollTop=360;
  stale.runtime.route('scroll-pan',1,0,-1,true);
  while(stale.time()<1800)stale.advance(16,-1);
  stale.viewport.scrollTop=0;
  stale.advance(179);
  const guarded=stale.viewport.scrollTop;
  const guardedRate=.75*Math.max(1+Math.min(1.5,.4*Math.sqrt(720/360-1)),360/2800/.75);
  assert.ok(Math.abs(guarded-guardedRate*179)<=1e-7,'a 179 ms frame moves by its guarded rate, not an unbounded jump');
  stale.advance(180);
  assert.equal(stale.viewport.scrollTop,guarded,'input at least 180 ms stale stops instead of jumping');
});
