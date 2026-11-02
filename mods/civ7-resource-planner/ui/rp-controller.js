import {createSignal, onCleanup, onMount, createEffect, untrack} from '/core/vendor/solid-js/dist/solid.js';
import {planAllocationAsync, planHappiness, effectsFor, cityKey} from './rp-planner.js';
import {resourceCatalog,snapshot,gameScope,preferenceKey,findAssignment,sendOperation} from './rp-game-adapter.js';
import {readSettings,writeSettings} from './rp-settings.js';
import {t,errorMessage} from './rp-l10n.js';
const controllers=new WeakMap();
export function getPlanner(model){return controllers.get(model);}
export function createPlanner(model) {
  if(controllers.has(model))return controllers.get(model);
  let saved;try{saved=readSettings();}catch(e){saved={preferences:{},games:{}};console.error('[Resource Planner] '+e.message);}
  const scope=gameScope(),catalog=resourceCatalog();
  const [tendencies,setTendencies]=createSignal(saved.games?.[scope]||{});
  const [camels,setCamels]=createSignal(false),[assigned,setAssigned]=createSignal(false);
  const [busy,setBusy]=createSignal(false),[statusData,setStatusData]=createSignal({key:'HINT',args:[]});
  const status=()=>t(statusData().key,...statusData().args);
  // Stable result code for integrations; status() is display-only and localized.
  const statusCode=()=>statusData().key;
  const setStatus=(key,...args)=>setStatusData({key,args});
  let alive=true;
  const persist=()=>{
    try {const current=readSettings();current.games||={};current.preferences||={};current.games[scope]=tendencies();current.preferences.sort=model.selectedSettlementSortType();current.preferences.direction=model.selectedSortDirection();writeSettings(current);}
    catch(e){setStatus('SETTINGS_FAILED',errorMessage(e));console.error('[Resource Planner] '+e.message);}
  };
  onMount(()=>{
    model.setSelectedSettlementSortType(saved.preferences?.sort??13);
    model.toggleSelectedSortDirection(saved.preferences?.direction??-1);
  });
  createEffect(()=>{model.selectedSettlementSortType();model.selectedSortDirection();untrack(persist);});
  const p={camels,assigned,busy,status,statusCode,tendencies,setCamels,setAssigned,
    sort(type){if(model.selectedSettlementSortType()===type)model.toggleSelectedSortDirection();else{model.setSelectedSettlementSortType(type);model.toggleSelectedSortDirection(-1);}persist();},
    tendency(id){const c=Cities.get(id);return c?tendencies()[preferenceKey(c)]:undefined;},
    clear(id){const c=Cities.get(id);if(!c)return;const next={...tendencies()};delete next[preferenceKey(c)];setTendencies(next);persist();},
    choose(id,yieldType){if(busy())return;const c=Cities.get(id);if(!c)return;setTendencies({...tendencies(),[preferenceKey(c)]:yieldType});persist();void run('tendency',cityKey(c));},
    run(mode='tendency'){void run(mode);}
  };
  controllers.set(model,p);
  onCleanup(()=>{alive=false;controllers.delete(model);});

  function restrict(data,predicate) {
    const kept=[];
    for(const r of data.resources) {
      if(predicate(r)){kept.push(r);continue;}
      if(r.original){const c=data.cities.find(c=>c.key===r.original),e=effectsFor(r,c);c.capacity+=r.bonusSlots-1;for(let i=0;i<7;i++){c.base[i]+=e.flat[i];c.multiplier[i]+=e.percent[i]/100;}}
    }
    data.resources=kept;
  }
  async function run(mode,target) {
    if(busy()||!alive)return;
    if(Players.get(GameContext.localPlayerID)?.Resources?.isResourceAssignmentLocked()){setStatus('LOCKED');return;}
    setBusy(true);setStatus('COMPUTING');
    const playerID=GameContext.localPlayerID,turn=Game.turn,age=Game.age;
    const sameGame=()=>GameContext.localPlayerID===playerID&&Game.turn===turn&&Game.age===age&&gameScope()===scope;
    const guard=()=>sameGame()&&alive;
    let data,changes=[];
    try {
      // Allow the engine to paint the busy state before the synchronous planner.
      await new Promise(resolve=>setTimeout(resolve,0));
      if(!guard())return;
      data=snapshot(model,tendencies(),catalog,{camels:camels(),assigned:assigned()});
      if(target)data.cities.forEach(c=>{if(c.key!==target)c.tendency=undefined;});
      let plan;
      if(mode==='tendency') {
        if(!data.cities.some(c=>c.tendency)){setStatus('CHOOSE_PREFERENCE');return;}
        plan=await planAllocationAsync(data.resources,data.cities,'tendency',{shouldContinue:guard});
      } else {
        restrict(data,r=>!r.bonusSlots&&r.effects.some(e=>e.yield==='YIELD_HAPPINESS'&&e.amount>0));
        plan=planHappiness(data.resources,data.cities,mode==='town-happiness');
      }
      changes=data.resources.filter(r=>(plan[r.key]||undefined)!==r.original).map(r=>({r,to:plan[r.key]}));
      if(!changes.length){setStatus('NO_CHANGES');return;}
      model.deselectSelectedResource();
      const city=k=>data.cities.find(c=>c.key===k);
      let done=0;
      for(const change of changes.filter(x=>x.r.original).sort((a,b)=>a.r.bonusSlots-b.r.bonusSlots)) {
        setStatus('REALLOCATING',++done,changes.length);
        await sendOperation(change.r,city(change.r.original),true,data.cities,guard);
      }
      // Capacity-expanding resources must be acknowledged before dependent slots.
      const adds=changes.filter(x=>x.to).sort((a,b)=>b.r.bonusSlots-a.r.bonusSlots);
      done=0;
      for(const change of adds) {
        setStatus('ASSIGNING',++done,adds.length);
        await sendOperation(change.r,city(change.to),false,data.cities,guard);
      }
      setStatus('COMPLETED',adds.length,changes.length);
    } catch(error) {
      console.error('[Resource Planner] '+error.message);
      let restored=true;
      if(data&&sameGame()) {
        // Roll back only this operation's changed resources; never clear a settlement.
        for(const {r} of [...changes].sort((a,b)=>a.r.bonusSlots-b.r.bonusSlots)) {
          const actual=findAssignment(r,data.cities);
          if(actual&&actual!==r.original)try{await sendOperation(r,data.cities.find(c=>c.key===actual),true,data.cities,sameGame);}catch{restored=false;}
        }
        for(const {r} of [...changes].sort((a,b)=>b.r.bonusSlots-a.r.bonusSlots))if(r.original&&findAssignment(r,data.cities)!==r.original)
          try{await sendOperation(r,data.cities.find(c=>c.key===r.original),false,data.cities,sameGame);}catch{restored=false;}
      } else if(changes.length)restored=false;
      setStatus(restored?'ROLLED_BACK':'RESTORE_INCOMPLETE',errorMessage(error));
    } finally {setBusy(false);}
  }
  console.log('[Resource Planner] loaded; resource effects='+catalog.size);
  return p;
}
