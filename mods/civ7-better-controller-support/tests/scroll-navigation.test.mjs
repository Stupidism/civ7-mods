import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const source=readFileSync(new URL('../ui/scroll-navigation.js',import.meta.url),'utf8').replace(/^export /gm,'');
const menu=readFileSync(new URL('../ui/menu-navigation.js',import.meta.url),'utf8').replace(/^export /gm,'');
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
 const instructions=[];
 const control=window.make({document,window,focus,statuses:S,root:()=>root,now:()=>time,instruction:(e,k,a)=>{e.textContent=k;instructions.push([k,a]);}});
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
 const iconsMapped=instructions.some(([k,a])=>k.endsWith('SWITCH')&&a==='scroll-pan');
 // return left requires neutral; focus remains until explicit R3.
 input('nav-move',3);input('nav-move',1,-1,0);const left=!!panes[0].querySelector('.mtg-active-scroll');
 snap.blocked=true;const before=v.scrollTop;time+=25;patch.sync();input('nav-move',2,0,-1);
 const blocked=v.scrollTop===before&&!document.querySelector('.mtg-scroll-hints');
 snap.blocked=false;patch.setConfig({enabled:false});input('scroll-pan',1,0,-1);time+=20;patch.sync();
 const nativeMode=v.scrollTop>before;
 input('scroll-pan',3);const stopped=v.scrollTop;time+=30;patch.sync();const finishStops=v.scrollTop===stopped;
 const mouseBefore=delegated.length;input('mousewheel-down',3);const mouseDelegates=delegated.length===mouseBefore+1;
 panes[0].remove();patch.sync();const rebuilt=!!panes[1].querySelector('.mtg-active-scroll');
 const oldTop=panes[1].firstElementChild.scrollTop;input('scroll-pan',4,0,-1);time+=20;patch.sync();
 const staleHeldIgnored=panes[1].firstElementChild.scrollTop===oldTop;
 patch.dispose();const cleaned=!document.querySelector('.mtg-scroll-hints,.mtg-active-scroll')&&!document.head.textContent.includes('.mtg-active-scroll{');
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

test('held vertical scroll accelerates with content length, stays bounded and resets on reversal/release/timeout/suspend', {skip:!process.env.CIV7_PLAYWRIGHT_MODULE}, async()=>{
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
 assert.ok(results.long.late<=38&&results.extreme.late<=38);
 assert.equal(results.reverse,-15);
 for(const k of ['released','timeout','suspended','neutral'])assert.equal(results[k],15,k);
 }finally{await browser.close();}
});
