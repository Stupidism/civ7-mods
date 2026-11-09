import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const modelSource=readFileSync(new URL('../ui-next/screens/commerce/commerce-screen-model.js',import.meta.url),'utf8');
const uiSource=readFileSync(new URL('../ui/rp-ui.js',import.meta.url),'utf8');
function fixture(){
 let selected=-1,busy=false,plannerBusy=false,controller=true,time=1000,focused={resourceValue:-1};
 const model={selectedResource:()=>({resourceValue:selected}),resourceActionBusy:()=>busy,
 data:{resourceTabData:{availableResourceSectionData:[],slottedResourceSectionData:[]}}};
 const code=modelSource.slice(modelSource.indexOf('  const [resourceZone,setResourceZone]'),modelSource.indexOf('  const [tabName'));
 Object.assign(model,vm.runInNewContext(code+';({resourceZone,resourceZoneCandidate,focusResourceZone,cycleResourceZone,enterResourceZone})',{
  createSignal:v=>[()=>v,n=>v=n],model,INVALID_RESOURCE_VALUE:-1,batch:fn=>fn(),setSelectedSettlementId(){},
  focusedResource:()=>focused,setFocusedResource:v=>focused=v,ComponentID:{isMatch:()=>false}
 }));
 const navigation=vm.runInNewContext(uiSource.slice(uiSource.indexOf('export function createZoneNavigation'),uiSource.indexOf('export function ZoneEntry')).replace('export ', '')+';createZoneNavigation',{
  InputNavigationAction:{RIGHT:4,LEFT:3,UP:1,DOWN:2},InputActionStatuses:{START:1,UPDATE:2,FINISH:3}
 })(model,()=>controller,()=>plannerBusy,()=>time);
 return {model,setPicked:v=>selected=v,setBusy:v=>busy=v,setPlannerBusy:v=>plannerBusy=v,setController:v=>controller=v,
  send(name,status=1,navigationDirection=4){let consumed=false;navigation({detail:{name,status,navigation:navigationDirection},preventDefault(){consumed=true;},stopPropagation(){}});return consumed;},advance:()=>time+=250};
}
test('left stick selects zones without entering; confirm and cancel preserve the zone candidate',()=>{
 const f=fixture(),m=f.model;
 assert.equal(m.resourceZone(),null);assert.equal(m.resourceZoneCandidate(),'actions');
 f.send('nav-move');assert.equal(m.resourceZoneCandidate(),'tools');assert.equal(m.resourceZone(),null);
 f.send('nav-move',2);assert.equal(m.resourceZoneCandidate(),'tools','held updates are throttled');
 f.send('nav-move',3);assert.equal(m.resourceZoneCandidate(),'tools','release cannot step twice');
 f.send('nav-move');assert.equal(m.resourceZoneCandidate(),'preferences');
 f.send('nav-move',3);f.send('nav-move');assert.equal(m.resourceZoneCandidate(),'resources');
 m.enterResourceZone(m.resourceZoneCandidate());assert.equal(m.resourceZone(),'resources');
 assert.equal(f.send('nav-move'),false,'inside a zone native navigation owns the stick');
 m.enterResourceZone(null);assert.equal(m.resourceZoneCandidate(),'resources');
 f.send('nav-left',1,3);assert.equal(m.resourceZoneCandidate(),'preferences');
});
test('triggers select at overview and switch active zones once on release; pickup and busy block switching',()=>{
 const f=fixture(),m=f.model;
 f.send('nav-shell-next');assert.equal(m.resourceZoneCandidate(),'actions');
 f.send('nav-shell-next',3);assert.equal(m.resourceZoneCandidate(),'tools');assert.equal(m.resourceZone(),null);
 m.enterResourceZone('tools');f.send('nav-shell-next',3);assert.equal(m.resourceZone(),'preferences');
 f.send('nav-shell-next',3);assert.equal(m.resourceZone(),'resources');
 f.send('nav-shell-next',3);assert.equal(m.resourceZone(),'actions');
 f.send('nav-shell-previous',3);assert.equal(m.resourceZone(),'resources');
 f.setPicked(52);assert.equal(f.send('nav-shell-next',3),true);assert.equal(m.resourceZone(),'resources');
 f.setPicked(-1);f.setBusy(true);f.send('nav-shell-next',3);assert.equal(m.resourceZone(),'resources');
 f.setBusy(false);f.setPlannerBusy(true);f.send('nav-shell-next',3);assert.equal(m.resourceZone(),'resources');
 f.setPlannerBusy(false);f.setController(false);assert.equal(f.send('nav-shell-next',3),false);
});
