import test from 'node:test';
import assert from 'node:assert/strict';
import {createFocusBonus} from '../ui/focus-bonus.js';
function fixture({ready=1,stack=0,memento=false,saved=0}={}) {
 const tags=new Map([[0,ready],[2,saved]]),events=new Map(),timers=new Map();let serial=0;
 const id={owner:0,id:7,type:26};
 const unit={id,owner:0,getAbilityCount:()=>stack};
 const api={
  Configuration:{getGame:()=>({isAnyMultiplayer:false})},GameContext:{localPlayerID:0},GlobalParameters:{COMBAT_FOCUSED_ATTACK_BASE_BONUS:2},
  Players:{get:()=>({Identity:{getNarrativeTagPoints:i=>tags.get(i)??0,changeNarrativeTagPoints:(i,n)=>tags.set(i,(tags.get(i)??0)+n)}})},
  Online:{Metaprogression:{getEquippedMementos:()=>memento?[{mementoTypeId:'CROWN'}]:[]}},
  GameInfo:{
   NarrativeTags:{lookup:n=>({$index:['READY','1','2','4','8','16','32','64'].indexOf(n.replace('NARRATIVE_TAG_WC_FOCUS_',''))})},
   UnitAbilities:{lookup:()=>({$hash:99})},UnitAbilityModifiers:[{UnitAbilityType:'BARRAGE',ModifierId:'BARRAGE'}],
   MementoModifiers:[{MementoType:'CROWN',ModifierId:'CROWN'}],
   Modifiers:[{ModifierId:'BARRAGE',ModifierType:'FOCUS'},{ModifierId:'CROWN',ModifierType:'FOCUS'}],
   DynamicModifiers:[{ModifierType:'FOCUS',EffectType:'EFFECT_ADJUST_UNIT_FOCUSED_ATTACK_DAMAGE'}],
   ModifierArguments:[{ModifierId:'BARRAGE',Name:'Amount',Value:'5'},{ModifierId:'BARRAGE',Name:'CombatType',Value:'COMBAT_RANGED'},{ModifierId:'CROWN',Name:'Amount',Value:'2'},{ModifierId:'CROWN',Name:'IsAllTypes',Value:'True'}]
  },
  ComponentID:{isMatch:(a,b)=>a?.owner===b?.owner&&a?.id===b?.id},
  engine:{on:(k,f)=>events.set(k,f),off:k=>events.delete(k)},
  setTimeout:f=>{timers.set(++serial,f);return serial;},clearTimeout:k=>timers.delete(k)
 };
 const service=createFocusBonus(api);
 return {api,id,unit,tags,service,events,timers,total:()=>[1,2,4,8,16,32,64].reduce((n,b,i)=>n+b*(tags.get(i+1)??0),0)};
}
test('ordinary focused volley toggles the native base bonus for one shot',()=>{
 const f=fixture();assert.equal(f.total(),0);assert.ok(f.service.begin(f.unit));assert.equal(f.total(),2);
 f.events.get('Combat')({attacker:{owner:0,id:8}});assert.equal(f.total(),2);
 f.events.get('Combat')({attacker:f.id});assert.equal(f.total(),0);assert.equal(f.service.active,null);
});
test('reads Barrage from the firing unit and preserves equipped memento strength',()=>{
 const f=fixture({stack:1,memento:true});assert.equal(f.service.amount(f.unit),9);f.service.begin(f.unit);assert.equal(f.total(),9);
});
test('initialization missing or duplicated refuses the shot',()=>{
 for(const ready of [0,2]){const f=fixture({ready});assert.equal(f.service.begin(f.unit),false);assert.equal(f.total(),0);}
});
test('saved transient tags are cleared on load',()=>{const f=fixture({saved:1});assert.equal(f.total(),0);assert.equal(f.tags.get(0),1);});
test('cannot overlap two shots, operation rejection and timeouts clear the bonus',()=>{
 const f=fixture();f.service.begin(f.unit);assert.equal(f.service.begin(f.unit),false);
 f.events.get('UnitOperationDeactivated')({unit:f.id});assert.equal(f.total(),0);
 f.service.begin(f.unit);[...f.timers.values()][0]();assert.equal(f.total(),0);
});
test('unsupported totals and conditional bonuses fail closed',()=>{
 const f=fixture({stack:1});f.api.GameInfo.Modifiers[0].OwnerRequirementSetId='UNKNOWN';assert.equal(f.service.begin(f.unit),false);assert.equal(f.total(),0);
 const g=fixture();g.api.GlobalParameters.COMBAT_FOCUSED_ATTACK_BASE_BONUS=128;assert.equal(g.service.begin(g.unit),false);assert.equal(g.total(),0);
});
test('unload removes listeners and residual tags',()=>{const f=fixture();f.service.begin(f.unit);f.service.dispose();assert.equal(f.total(),0);assert.equal(f.events.size,0);});
test('multiplayer never enables temporary player combat tags',()=>{
 const f=fixture();f.api.Configuration.getGame=()=>({isAnyMultiplayer:true});
 assert.equal(f.service.supported(),false);assert.equal(f.service.begin(f.unit),false);assert.equal(f.total(),0);
});
