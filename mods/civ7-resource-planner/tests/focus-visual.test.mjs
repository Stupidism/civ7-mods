import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import {homedir} from 'node:os';import {join} from 'node:path';
const ready=!!process.env.CIV7_PLAYWRIGHT_MODULE;
test('controller focus is visibly distinct from selected preference and scope state',{skip:!ready},async()=>{
 const {chromium}=createRequire(import.meta.url)(process.env.CIV7_PLAYWRIGHT_MODULE);
 const browser=await chromium.launch({headless:true,executablePath:process.env.CIV7_CHROMIUM_PATH});
 try{const page=await browser.newPage();const native=readFileSync(join(homedir(),"Library/Application Support/Steam/steamapps/common/Sid Meier's Civilization VII/CivilizationVII.app/Contents/Resources/Base/modules/core/ui/themes/default/default.css"),'utf8');await page.setContent(`<style>${native}</style><style>${readFileSync(new URL('../ui/rp-style.css',import.meta.url),'utf8')}</style><div class="rp-body-zones"><div class="rp-zone-preferences"><div tabindex="-1" class="fxs-button rp-button rp-yield rp-active">Food 20</div><div tabindex="-1" class="fxs-button rp-button rp-sort rp-active">Happy</div><div tabindex="-1" class="fxs-button rp-button rp-action rp-active">Cities first</div></div></div>`);
 await page.locator('.rp-button').evaluateAll(es=>es.forEach(e=>e.insertAdjacentHTML('afterbegin','<div class="rp-button-art"><div class="fxs-button__bg fxs-button__bg--focus" style="opacity:0"></div></div>')));
 // Retain native selectors in the fixture to detect competing focus styling.
 await page.addStyleTag({content:'.fxs-button__bg--focus{opacity:0;transition:none}'});await page.locator('.fxs-button__bg--focus').evaluateAll(es=>es.forEach(e=>e.style.removeProperty('opacity')));
 for(const selector of ['.rp-yield','.rp-sort','.rp-action']){
 const style=()=>page.locator(selector).evaluate(e=>{const s=getComputedStyle(e);return [s.borderColor,s.backgroundColor,s.boxShadow,getComputedStyle(e.querySelector('.fxs-button__bg--focus')).opacity];});
 await page.locator(selector).evaluate(e=>e.blur());const before=await style();await page.locator(selector).focus();const after=await style();
 assert.notDeepEqual(after,before,`${selector}: current focus looks identical to selection`);
 }
 }finally{await browser.close();}
});


test('neutral artwork is frameless, selection has only an outline, and yield content is centered',{skip:!ready},async()=>{
 const {chromium}=createRequire(import.meta.url)(process.env.CIV7_PLAYWRIGHT_MODULE);
 const browser=await chromium.launch({headless:true,executablePath:process.env.CIV7_CHROMIUM_PATH});
 try{
  const page=await browser.newPage();
  const native=readFileSync(join(homedir(),"Library/Application Support/Steam/steamapps/common/Sid Meier's Civilization VII/CivilizationVII.app/Contents/Resources/Base/modules/core/ui/themes/default/default.css"),'utf8');
  const source=readFileSync(new URL('../ui/rp-ui.js',import.meta.url),'utf8');
  const art=source.match(/const buttonBackground=template\('([^']+)'\)/)[1];
  const classes=['rp-action','rp-sort','rp-yield','rp-tendency-label'];
  await page.setContent(`<style>${native}</style><style>${readFileSync(new URL('../ui/rp-style.css',import.meta.url),'utf8')}</style><style>html{font-size:24px}.fixture{display:flex;align-items:center;gap:20px}.fxs-button__bg{transition:none}</style><div class="fixture">${classes.map(c=>`<div tabindex="-1" class="fxs-button fxs-button-small rp-button ${c}">${art}<div class="rp-button-content relative flex">${c==='rp-yield'?'<div class="rp-yield-icon"></div><div class="rp-yield-total">0</div>':'<span>Control</span>'}</div></div>`).join('')}</div>`);
  for(const c of classes){
   const item=page.locator('.'+c);
   const neutral=await item.evaluate(e=>{const s=getComputedStyle(e);return {border:s.borderColor,base:getComputedStyle(e.querySelector('.fxs-button__bg--base')).display,disabled:getComputedStyle(e.querySelector('.fxs-button__bg--disabled')).display,focus:getComputedStyle(e.querySelector('.fxs-button__bg--focus')).opacity};});
   assert.equal(neutral.base,'none');assert.equal(neutral.disabled,'none');assert.equal(neutral.focus,'0');if(c!=='rp-tendency-label')assert.equal(neutral.border,'rgba(0, 0, 0, 0)');
   if(c==='rp-tendency-label'){
    await item.focus();assert.equal(await item.locator('.rp-button-art').evaluate(e=>getComputedStyle(e).display),'none');
    assert.equal(await item.evaluate(e=>getComputedStyle(e).borderTopWidth),'0px');await item.evaluate(e=>e.blur());continue;
   }
   await item.evaluate(e=>e.classList.add('rp-active'));
   assert.equal(await item.evaluate(e=>getComputedStyle(e).borderColor),c==='rp-yield'?'rgb(169, 207, 163)':'rgb(232, 200, 122)');
   assert.equal(await item.locator('.fxs-button__bg--focus').evaluate(e=>getComputedStyle(e).opacity),'0');
   await item.focus();assert.equal(await item.evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(232, 200, 122, 0.24)');assert.equal(await item.locator('.rp-button-art').evaluate(e=>getComputedStyle(e).display),'none');await item.evaluate(e=>e.blur());
  }
  const yieldItem=page.locator('.rp-yield');
  for(const [state,color,edge] of [['rp-active','rgb(169, 207, 163)','borderBottomColor'],['rp-avoid','rgb(224, 68, 54)','borderTopColor']]){
   await yieldItem.evaluate((e,state)=>{e.classList.remove('rp-active','rp-avoid');e.classList.add(state);},state);
   for(const focused of [false,true]){
    await yieldItem.evaluate((e,on)=>e.classList.toggle('rp-controller-focus',on),focused);
    const stateStyle=await yieldItem.evaluate((e,edge)=>{const s=getComputedStyle(e),marker=getComputedStyle(e,'::after');return {border:s.borderColor,fill:s.backgroundColor,marker:marker[edge],width:marker.width,pointerEvents:marker.pointerEvents,top:marker.top,bottom:marker.bottom,left:marker.left,shift:new DOMMatrix(marker.transform).m41,halfWidth:parseFloat(marker.borderLeftWidth),parentWidth:e.clientWidth};},edge);
    assert.equal(stateStyle.border,color,'focus must preserve preference color');
    assert.notEqual(stateStyle.marker,'rgba(0, 0, 0, 0)','direction triangle must be visible');
    assert.equal(stateStyle.width,'0px');assert.equal(stateStyle.pointerEvents,'none');
    assert.equal(state==='rp-active'?stateStyle.top:stateStyle.bottom,'0px','triangle stays on the inner edge');
    assert.ok(Math.abs(parseFloat(stateStyle.left)+stateStyle.shift+stateStyle.halfWidth-stateStyle.parentWidth/2)<0.6,'triangle is horizontally centered');
    if(focused)assert.equal(stateStyle.fill,'rgba(232, 200, 122, 0.24)');
   }
  }
  const centers=await page.locator('.rp-yield').evaluate(e=>{const center=x=>{const r=x.getBoundingClientRect();return r.x+r.width/2;};return [center(e),center(e.querySelector('.rp-yield-icon')),center(e.querySelector('.rp-yield-total'))];});
  assert.ok(centers.every(x=>Math.abs(x-centers[0])<0.5),'icon and number must share the button center');
 }finally{await browser.close();}
});
