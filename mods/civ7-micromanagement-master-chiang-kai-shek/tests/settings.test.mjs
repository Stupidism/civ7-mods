import test from 'node:test';
import assert from 'node:assert/strict';
import {createSettingsStore, normalizeConfig, FEATURE_KEYS, PROFILES, isFeatureApplicable} from '../ui/settings-store.js';
import {fixture, ADD, REMOVE, ATTACK, REINFORCE} from './game-fixture.mjs';

test('balance-affecting fire options default off in both independent profiles',()=>{
  const config=normalizeConfig();
  for(const p of PROFILES) for(const k of FEATURE_KEYS) assert.equal(config[p][k],!['focusNoMove','focusFarFirst','focusExclude'].includes(k),p+'.'+k);
  config.mouse.autoExit=false;assert.equal(config.gamepad.autoExit,true);
});
test('version-1 balance defaults reset once without changing other settings or writing on load',()=>{
 let raw=JSON.stringify({other:{keep:42},'civ7-war-controls':{version:1,config:{mouse:{autoAttack:false,focusExclude:true},gamepad:{focusExclude:true}}}}), writes=0;
 const store=createSettingsStore({getItem:()=>raw,setItem:(_,v)=>{raw=v;writes++;}});
 const config=store.load().config;
 assert.equal(config.mouse.autoAttack,false);assert.equal(config.mouse.focusExclude,false);assert.equal(config.gamepad.focusExclude,false);assert.equal(writes,0);
 config.mouse.focusExclude=true;config.gamepad.focusFarFirst=true;store.save(config);
 assert.equal(store.load().config.mouse.focusExclude,true);assert.equal(store.load().config.gamepad.focusFarFirst,true);
 assert.deepEqual(JSON.parse(raw).other,{keep:42});assert.equal(JSON.parse(raw)['civ7-war-controls'].version,2);
});
test('invalid values use defaults; explicit false and other profile survive',()=>{
  const config=normalizeConfig({mouse:{autoAttack:false,autoJoin:'false'},gamepad:{autoExit:false}});
  assert.equal(config.mouse.autoAttack,false);assert.equal(config.mouse.autoJoin,true);
  assert.equal(config.gamepad.autoExit,false);assert.equal(config.gamepad.autoAttack,true);
});
test('saving rereads shared settings, preserving new namespaces added after load',()=>{
  let raw=JSON.stringify({other:{theme:'gold'}});
  const store=createSettingsStore({getItem:()=>raw,setItem:(_,v)=>raw=v});
  const config=store.load().config;config.gamepad.autoAttack=false;
  raw=JSON.stringify({other:{theme:'blue'},added:[1,2]});store.save(config);
  assert.deepEqual(JSON.parse(raw).other,{theme:'blue'});assert.deepEqual(JSON.parse(raw).added,[1,2]);
  assert.equal(store.load().config.gamepad.autoAttack,false);assert.equal(store.load().config.mouse.autoAttack,true);
});
for(const raw of ['{broken','[]','null','false'])test('corrupt shared data is never overwritten: '+raw,()=>{
  let writes=0;const store=createSettingsStore({getItem:()=>raw,setItem:()=>writes++});
  assert.ok(store.load().error);assert.throws(()=>store.save(normalizeConfig()));assert.equal(writes,0);
});
test('storage failures propagate to the settings dialog',()=>{
  const store=createSettingsStore({getItem:()=>null,setItem:()=>{throw Error('disk failure');}});
  assert.throws(()=>store.save(normalizeConfig()),/disk failure/);
});

async function scenario(key,profile,value){
  const config=normalizeConfig();config[profile][key]=value;
  const f=await fixture(config);f.device(profile==='gamepad');
  if(key!=='autoExit')f.unpack();
  if(key==='autoAttack'){
    f.state.reachable=[3];f.state.atPlot.set(3,[{owner:1,id:90,type:26}]);
    f.state.operations.set(ATTACK,{Success:true,Plots:[3]});
  }
  if(key==='autoJoin'||key==='rightClickJoin')f.state.commands.set(ADD,{Success:true,Plots:[1]});
  if(key==='singleReinforcement')f.state.operations.set(REINFORCE,{Success:true,Plots:[1]});
  if(key==='rightClickJoin'){f.state.atPlot.set(1,[f.state.commander.id,{owner:0,id:8,type:26}]);f.state.units.set(8,{...f.state.unit,id:{owner:0,id:8,type:26}});}
  const run=()=>{
    f.state.mode='INTERFACEMODE_UNIT_SELECTED';f.state.modes=[];f.state.requests=[];f.state.moves=[];
    if(key==='rightClickJoin'){f.world.actionMouseRightButton({X:1,Y:0});return f.state.requests.length===1;}
    if(key==='singleReinforcement'){f.handlers.switchToActionInterfaceMode(REINFORCE,{UnitID:f.id});return f.state.requests.length===1;}
    if(key==='emptyMarker'){f.emit('UnitRemovedFromArmy');f.flush();return f.state.markers.length>0;}
    f.emit('UnitSelectionChanged',{unit:f.id,selected:false});f.select();return f.state.modes.length>0;
  };
  return {f,run};
}
for(const profile of PROFILES)for(const key of FEATURE_KEYS.filter(k=>['autoAttack','autoJoin','rightClickJoin','autoExit','singleReinforcement','emptyMarker'].includes(k)&&isFeatureApplicable(profile,k)))test(`${profile} ${key}: disabled locally, independent in other profile`,async()=>{
  const {f,run}=await scenario(key,profile,false);
  assert.equal(run(),false);f.device(profile!=='gamepad');assert.equal(run(),isFeatureApplicable(profile==='mouse'?'gamepad':'mouse',key));
});
test('legacy controller right-click setting never enables Join in controller mode',async()=>{
  const {f,run}=await scenario('rightClickJoin','gamepad',true);
  assert.equal(run(),false);assert.equal(f.state.requests.length,0);
  f.device(false);assert.equal(run(),true);
});
test('saving a setting changes behavior immediately and survives adapter reload',async()=>{
  const f=await fixture();const config=f.state.settings.getConfig();config.mouse.autoExit=false;
  f.state.settings.save(config);f.select();assert.equal(f.state.modes.length,0);
  f.context.install();f.select();assert.equal(f.state.modes.length,0);
  f.device(true);f.emit('UnitSelectionChanged',{unit:f.id,selected:false});f.select();
  assert.equal(f.state.modes[0].type,REMOVE);
});
test('editing a draft cannot modify live settings before Save',async()=>{
  const f=await fixture();const draft=f.state.settings.getConfig();draft.mouse.autoExit=false;
  f.select();assert.equal(f.state.modes[0].type,REMOVE);
});
test('settings modal blocks selection assists, Join and Reinforce submission',async()=>{
  const f=await fixture();f.state.settingsOpen=true;f.select();assert.equal(f.state.modes.length,0);
  f.unpack();f.state.commands.set(ADD,{Success:true,Plots:[1]});
  f.state.operations.set(REINFORCE,{Success:true,Plots:[1]});
  f.world.actionMouseRightButton({X:1,Y:0});f.handlers.switchToActionInterfaceMode(REINFORCE,{UnitID:f.id});
  assert.equal(f.state.requests.length,0);
});
