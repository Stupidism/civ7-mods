// Detached rendering only: actual grouping/SlottedResourcesContainer and native
// CollapsibleContainer with a ScrollArea-shaped shell; no game connection.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {catalogs} from './locale-fixture.mjs';
const root=new URL('../',import.meta.url);
const game=process.env.CIV7_MODULES_PATH||join(homedir(),"Library/Application Support/Steam/steamapps/common/Sid Meier's Civilization VII/CivilizationVII.app/Contents/Resources/Base/modules");
const read=p=>readFileSync(new URL(p,root),'utf8');
const native=p=>readFileSync(join(game,p),'utf8');
const ready=!!process.env.CIV7_PLAYWRIGHT_MODULE&&existsSync(game);
const screen=read('ui-next/screens/commerce/commerce-screen-resources-tab.js');
const slotted=screen.slice(screen.indexOf('const SlottedResourcesContainer ='),screen.indexOf('// const pillClassList'));
const groups=read('ui/rp-ui.js').slice(read('ui/rp-ui.js').indexOf('export function createGroups')).replace('export ','');
function markup(n){const m=screen.match(new RegExp('  _tmpl\\$'+n+' = template\\(`([^`]+)`\\)'));assert.ok(m);return m[1];}

for(const lang of ['zh_Hans_CN','en_US'])test(`stacked resource groups work standalone and coexist with BCS and Action Order in ${lang}`,{skip:!ready},async()=>{
 const {chromium}=createRequire(import.meta.url)(process.env.CIV7_PLAYWRIGHT_MODULE);
 const browser=await chromium.launch({headless:true,executablePath:process.env.CIV7_CHROMIUM_PATH});
 const errors=[];
 const program=`import {createRoot,createSignal,createMemo,createComponent,mergeProps,For,Show,createRenderEffect,createEffect,untrack} from './solid.js';
 import {template,insert,className} from './web.js';
 import {groupedSettlements} from './planner.js';
 const dictionary=${JSON.stringify(catalogs[lang])};
 const t=(key,...args)=>(dictionary['LOC_RP_'+key]||key).replace(/\\{(\\d+)\\}/g,(_,i)=>args[i-1]);
 const [controller,setController]=createSignal(false);window.setController=setController;
 const IsControllerActive=controller,isMobile=()=>false;
 const model={selectedResource:()=>({resourceValue:-1}),focusedSettlementId:()=>undefined,selectedSettlementId:()=>undefined,isSlottingAvailable:true};
 const useCommerceScreenContext=()=>model,zoneActive=()=>true,useAudio=()=>()=>{};
 const ComponentRegistry={register:o=>o.createInstance};
 const div=()=>document.createElement('div');
 const AudioContextProvider=p=>p.children;
 const Activatable=p=>{const e=div();createRenderEffect(()=>e.className=p.class||'');insert(e,()=>p.children);return e;};
 const Icon=p=>{const e=div();e.textContent='◈';return e;};
 const L10n={Compose:p=>p.text};
 const CardFrame=p=>{const e=div();e.className=p.class;insert(e,()=>p.children);return e;};
 const ResetPreferencesButton=()=>{const e=document.createElement('button');e.textContent=t('RESET_DEFAULTS');return e;};
 const ConfirmationDialog=()=>()=>controller()?null:'↩';
 ${native('core/ui-next/components/collapsible-container.js').replace(/^import .*;\n/gm,'').replace(/^export .*;$/gm,'').replace(/\b_tmpl\$/g,'_collapse$')}
 const ScrollArea=p=>{const e=div();e.className='flex '+p.class;e.innerHTML='<div class="overflow-auto w-full"><div></div></div>';insert(e.firstChild.firstChild,()=>p.children);return e;};
 const _tmpl$8=template(${JSON.stringify(markup(8))}),_tmpl$9=template(${JSON.stringify(markup(9))}),_tmpl$10=template(${JSON.stringify(markup(10))});
 const CityResourceContainer=p=>{const e=div();e.className='resource-card';e.dataset.name=p.cityID+'-city-resource-activatable';e.dataset.cityIndex=p.cityIndex;
 e.innerHTML='<div class="text-lg">'+p.settlementNameData.name+'</div><div class="rp-settlement-body flex flex-row"><div class="rp-zone-preferences flex">'+Array.from({length:7},()=>'<button class="rp-yield">◈<br>123</button>').join('')+'</div><div class="rp-card-divider"></div><div class="rp-zone-resources flex flex-wrap">'+Array.from({length:9},()=>'<button class="slot">◈</button>').join('')+'</div></div>';return e;};
 ${groups}
 ${slotted}
 createRoot(()=>{
 const city=(id,town)=>({cityID:id,settlementNameData:{isTown:town,name:(town?t('TOWNS'):t('CITIES'))+' '+id},slottedResources:[]});
 const a=city('a',true),b=city('b',false),c=city('c',false);
 const [sections,setSections]=createSignal([{cityResources:[a,b]},{cityResources:[c]}]);
 window.originalRows=[a,b,c];window.changeSlots=()=>{a.slottedResources.push({id:1});setSections([{cityResources:[a,b]},{cityResources:[c]}]);};
 insert(document.querySelector('.rp-center'),createComponent(SlottedResourcesContainer,{get slottedResourceSectionData(){return sections();}}));
 window.ready=true;
 });`;
 const base=`*{box-sizing:border-box}html{font-size:18px}body{margin:0;background:#10141b;color:#ddd2b5;font-family:Arial,'PingFang SC'}screen-resource-allocation{display:flex;flex-direction:column;padding:1rem}.flex{display:flex}.flex-col{flex-direction:column}.flex-row{flex-direction:row}.flex-wrap{flex-wrap:wrap}.flex-auto{flex:1 1 auto}.w-full{width:100%}.relative{position:relative}.absolute{position:absolute}.hidden{display:none}.self-end{align-self:flex-end}.overflow-auto{overflow:auto}.resource-card{background:#202731;border:1px solid #71644c;padding:.3rem;margin-top:.5rem}.slot{width:3rem;height:3rem;flex:0 0 3rem;margin:.15rem}button{background:#303743;color:#eee;border:1px solid #71644c}.rp-commerce-tabs{display:flex;margin:auto}.rp-commerce-tabs>div{flex:1}.rp-body-zones{height:45rem}.rp-toolbar,.rp-unassigned{border:1px solid #71644c}.rp-resource-column .text-base{font-size:1rem}`;
 const labels=lang==='en_US'?['Resources','Trade','Empire']:['资源','贸易','帝国资源'];
 const html=`<html><head><meta charset="utf-8"><style>${base}</style><style id="planner">${read('ui/rp-style.css')}</style></head><body><small>Offline layout fixture · Placeholder icons</small><screen-resource-allocation><div class="rp-commerce-tabs" data-name="TabList">${labels.map(s=>'<div data-name="TabListItem">'+s+'</div>').join('')}</div><div class="rp-body-zones flex"><aside class="rp-toolbar">${lang==='en_US'?'Planner actions':'分配操作'}</aside><div class="rp-center flex flex-col"></div><aside class="rp-unassigned">${lang==='en_US'?'Unassigned':'未分配资源'}</aside></div></screen-resource-allocation><script type="module" src="/main.js"></script></body></html>`;
 try{
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));
  const assets={'/':html,'/main.js':program,'/solid.js':native('core/vendor/solid-js/dist/solid.js'),'/web.js':native('core/vendor/solid-js/web/dist/web.js').replaceAll('../../dist/solid.js','./solid.js'),'/planner.js':read('ui/rp-planner.js'),'/valuation/rp-valuation-weights.js':read('ui/valuation/rp-valuation-weights.js')};
  await page.route('https://fixture.invalid/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({body:assets[path]??'',contentType:path.endsWith('.js')?'text/javascript':'text/html'});});
  await page.goto('https://fixture.invalid/');await page.waitForFunction(()=>window.ready);
  const measure=()=>page.evaluate(()=>{const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,right:r.right,bottom:r.bottom};};return {groups:[...document.querySelectorAll('.rp-resource-column')].map(rect),tabs:rect(document.querySelector('.rp-commerce-tabs')),panel:rect(document.querySelector('screen-resource-allocation')),overflow:document.documentElement.scrollWidth>innerWidth,cards:[...document.querySelectorAll('.resource-card')].map(e=>({id:e.dataset.name,index:+e.dataset.cityIndex,overflow:e.scrollWidth>e.clientWidth+1,direction:getComputedStyle(e.querySelector('.rp-settlement-body')).flexDirection})),yieldFit:[...document.querySelectorAll('.rp-zone-preferences')].every(e=>e.scrollWidth<=e.clientWidth+1)};});
  for(const width of [1366,1920,2560])for(const font of [16,24]){
   await page.setViewportSize({width,height:1080});await page.evaluate(f=>document.documentElement.style.fontSize=f+'px',font);
   const before=await measure();assert.equal(before.groups.length,3);assert.ok(before.groups.every(r=>Math.abs(r.x-before.groups[0].x)<1&&Math.abs(r.w-before.groups[0].w)<1));assert.ok(before.groups[0].bottom<=before.groups[1].y+1&&before.groups[1].bottom<=before.groups[2].y+1,'groups must stack vertically without overlap');
   assert.equal(before.overflow,false);assert.equal(before.yieldFit,true);assert.ok(before.cards.every(c=>!c.overflow&&c.direction==='row'));assert.ok(Math.abs(before.tabs.w-(before.panel.w-2*font))<1,'tabs fill the panel content width, preserving its padding');
   assert.deepEqual(before.cards.map(c=>c.index),[1,0,2],'original first city is the sole autofocus candidate');
   await page.evaluate(()=>{window.setController(true);window.changeSlots();});assert.deepEqual(await measure(),before,'device and resource changes keep layout/identity stable');
   assert.equal(await page.locator('.rp-resource-scroll .self-end button').count(),1,'switching devices keeps Reset available at the end of the settlement list');
   const css=['tests/fixtures/legacy-compat/civ7-map-tools-gamepad/ui/map-tools-gamepad.css','tests/fixtures/legacy-compat/civ7-action-order/ui/action-order.css'].map(path=>readFileSync(new URL(path,root),'utf8')).join('\n');
   await page.addStyleTag({content:css});await page.evaluate(()=>document.documentElement.classList.add('mtg-compact-controller'));assert.deepEqual(await measure(),before,'BCS and AOA must not change resource layout');
   await page.evaluate(()=>document.head.insertBefore(document.head.querySelector('style:last-child'),document.querySelector('#planner')));assert.deepEqual(await measure(),before,'style load order must not change resource layout');
   await page.evaluate(()=>{document.querySelector('#planner').previousElementSibling.remove();window.setController(false);});
  }
  const out=process.env.CIV7_TEST_ARTIFACTS_DIR;if(out){mkdirSync(out,{recursive:true});await page.setViewportSize({width:1920,height:1080});await page.evaluate(()=>document.documentElement.style.fontSize='18px');await page.screenshot({path:join(out,'resource-owned-'+lang+'.png')});}
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
