// Real instruction renderer + both native scroll DOM shapes. Glyph artwork is a placeholder.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
const code=['scroll-navigation','instruction-hints'].map(n=>readFileSync(new URL(`../ui/${n}.js`,import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'')).join('\n');
const playwright=process.env.CIV7_PLAYWRIGHT_MODULE;
async function fixture(fn){
 const {chromium}=createRequire(import.meta.url)(playwright);const browser=await chromium.launch({headless:true});
 try{const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.setContent(`<style>html{font-size:16px}body{margin:0;background:#172230;color:#ddd;font-family:Arial}main{display:flex;margin:40px;gap:60px}section,fxs-scrollable{display:block;position:relative;width:45%;height:460px}.viewport,.fxs-scrollable-content-container{height:460px;overflow:auto}.scroll-area_track,.fxs-scrollbar__track--vertical{position:absolute;right:-12px;top:0;width:6px;height:460px;background:#788}.scroll-area_thumb,.fxs-scrollbar__thumb--vertical{position:absolute;top:120px;height:90px;width:6px;background:#ddd}fxs-nav-help,[data-name=NavHelp]{display:block;width:32px;height:32px;flex-shrink:0;background:#333;border-radius:50%;text-align:center;line-height:32px}fxs-nav-help::before,[data-name=NavHelp]::before{content:'RS'}button{display:block;height:65px;width:90%;background:#253447;color:#ddd}nav-tray{display:block;position:fixed;left:24px;right:24px;bottom:20px}.flow-row{display:flex}.relative{position:relative}.w-full{width:100%}.item{display:flex;flex-shrink:0;padding:0 12px;height:40px;align-items:center}.hidden{display:none}</style><main><fxs-scrollable><div class=fxs-scrollable-content-container></div><div class=fxs-scrollbar__track--vertical><div class=fxs-scrollbar__thumb--vertical></div></div></fxs-scrollable><section data-name=ScrollArea><div class=viewport><div style="height:1400px">Details</div></div><div class=scroll-area_track><div class=scroll-area_thumb><div data-name=NavHelp></div></div></div></section></main><nav-tray><div class="flow-row relative w-full"><div class=item>B 返回</div><div class=item>A 加载</div><div class=item>X 删除</div></div></nav-tray>`);
 await page.evaluate(code+'\nwindow.make=createScrollNavigation;window.instruction=setInstruction;');
 await page.evaluate(()=>{
 const strings={LOC_MTG_SCROLL_CENTER:'按下：焦点移至可见区域中央',LOC_MTG_SCROLL_SWITCH:'← → 切换滚动区域'};
 window.Locale={compose:k=>strings[k],stylize:k=>strings[k]};
 const left=document.querySelector('fxs-scrollable');left.component={setScrollThumbPosition(){}};
 for(let i=0;i<20;i++){const b=document.createElement('button');b.tabIndex=0;b.textContent='存档 '+i;left.firstElementChild.append(b);}
 window.runtime=window.make({document,window,focus:{currentFocus:()=>left.querySelector('button'),setFocus:()=>{}},statuses:{START:1,UPDATE:2,FINISH:3,HOLD:4},root:()=>document.querySelector('main'),instruction:window.instruction});runtime.sync(true);
 });await fn(page);
 }finally{await browser.close();}
}
test('only the active scrollbar displays the right-stick marker, switching and suspension restore originals',{skip:!playwright},async()=>fixture(async page=>{
 const state=await page.evaluate(()=>{
 const glyphs=()=>[...document.querySelectorAll('main fxs-nav-help,main [data-name=NavHelp]')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.closest('fxs-scrollable')?'left':'right');
 const initial=glyphs();runtime.route('scroll-pan',1,1,0,true);const right=glyphs();runtime.route('scroll-pan',3,0,0,true);runtime.route('scroll-pan',1,-1,0,true);const back=glyphs();runtime.suspend();const restored=glyphs();runtime.dispose();return{initial,right,back,restored};
 });assert.deepEqual(state,{initial:['left'],right:['right'],back:['left'],restored:['right']});
}));
test('real hint text remains horizontal, separated and inside the viewport in Chinese and English',{skip:!playwright},async()=>fixture(async page=>{
 for(const width of [1920,1280,720,480])for(const lang of ['zh','en']){
 await page.setViewportSize({width,height:720});
 await page.evaluate(lang=>{
 const strings=lang==='zh'?{LOC_MTG_SCROLL_CENTER:'按下：焦点移至可见区域中央',LOC_MTG_SCROLL_SWITCH:'← → 切换滚动区域'}:{LOC_MTG_SCROLL_CENTER:'Press: focus visible centre',LOC_MTG_SCROLL_SWITCH:'← → Switch scroll area'};
 document.documentElement.style.fontSize='24px';
 window.Locale={compose:k=>strings[k],stylize:k=>strings[k]};runtime.sync(true);
 },lang);
 const geometry=await page.evaluate(()=>{
 const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
 return {hints:[...document.querySelectorAll('.mtg-scroll-hints>span')].map(e=>({box:rect(e),text:rect(e.lastElementChild)})),original:[...document.querySelectorAll('.item')].map(rect)};
 });
 for(const h of geometry.hints){assert.ok(h.text.width>60,`${width}/${lang}: caption collapsed ${JSON.stringify(h)}`);assert.ok(h.text.height<45,`${width}/${lang}: vertical caption`);assert.ok(h.box.x>=0&&h.box.right<=width,`${width}/${lang}: overflow`);}
 const [a,b]=geometry.hints.map(h=>h.box);assert.ok(a.right<=b.x||a.bottom<=b.y,`${width}/${lang}: hints overlap`);
 for(const h of geometry.hints)for(const o of geometry.original)assert.ok(h.box.right<=o.x||h.box.x>=o.right||h.box.bottom<=o.y||h.box.y>=o.bottom,`${width}/${lang}: existing hints overlap`);
 if(width===1280&&lang==='zh'&&process.env.CIV7_SCROLL_PREVIEW){mkdirSync(process.env.CIV7_SCROLL_PREVIEW,{recursive:true});await page.screenshot({path:process.env.CIV7_SCROLL_PREVIEW+'/hints-layout.png'});}
 }
}));
