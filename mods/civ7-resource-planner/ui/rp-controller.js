import {createSignal, onCleanup, onMount, createEffect, untrack} from '/core/vendor/solid-js/dist/solid.js';
import {planAllocationAsync, planHappiness, restoreAssignedResource, cityKey, cyclePreference, hasPreferences, defaultPreferences} from './rp-planner.js';
import {resourceCatalog,snapshot,gameScope,preferenceKey,findAssignment,sendOperation} from './rp-game-adapter.js';
import {readSettings,writeSettings} from './rp-settings.js';
import {t,errorMessage} from './rp-l10n.js';
import {resourceDeferral} from './rp-defer.js';
const controllers=new WeakMap();
export function getPlanner(model){return controllers.get(model);}
export function createPlanner(model) {
  if(controllers.has(model))return controllers.get(model);
  let saved;try{saved=readSettings();}catch(e){saved={preferences:{},games:{}};console.error('[Resource Planner] '+e.message);}
  const scope=gameScope(),catalog=resourceCatalog();
  const initial=saved.games?.[scope]||{};
  const [tendencies,setTendencies]=createSignal(initial);
  // Existing saved marks belong to the user. Never replace them on migration.
  const [preferenceMode,setPreferenceMode]=createSignal(saved.preferenceModes?.[scope]??(Object.values(initial).some(hasPreferences)?'manual':'auto'));
  const allocation=saved.preferences?.allocation||{};
  const [camels,setCamelsValue]=createSignal(allocation.camels===true),[assigned,setAssignedValue]=createSignal(allocation.assigned===true);
  const happy=saved.preferences?.happiness||{};
  const [happinessScope,setHappinessScopeValue]=createSignal(happy.scope==='towns'?'towns':'cities');
  const [settlementTarget,setSettlementTargetValue]=createSignal(happy.settlementTarget===5?5:0);
  const [cityTarget,setCityTargetValue]=createSignal(happy.cityTarget===20?20:0);
  const [busy,setBusy]=createSignal(false),[statusData,setStatusData]=createSignal({key:'HINT',args:[]});
  const [reminderEnabled,setReminderEnabled]=createSignal(saved.preferences?.resourceReminders!==false);
  const status=()=>t(statusData().key,...statusData().args);
  // Stable result code for integrations; status() is display-only and localized.
  const statusCode=()=>statusData().key;
  const setStatus=(key,...args)=>setStatusData({key,args});
  let alive=true;
  const persist=()=>{
    try {
      const current=readSettings();
      current.games||={};
      current.games[scope]=tendencies();
      current.preferenceModes||={};
      current.preferenceModes[scope]=preferenceMode();
      current.preferences||={};
      current.preferences.sort=model.selectedSettlementSortType();
      current.preferences.direction=model.selectedSortDirection();
      current.preferences.happiness={scope:happinessScope(),settlementTarget:settlementTarget(),cityTarget:cityTarget()};
      current.preferences.allocation={...current.preferences.allocation,camels:camels(),assigned:assigned()};
      writeSettings(current);
    }
    catch(e){setStatus('SETTINGS_FAILED',errorMessage(e));console.error('[Resource Planner] '+e.message);}
  };
  const refreshDefaults=()=>{
    if(preferenceMode()!=='auto')return;
    const data=snapshot(model,tendencies(),catalog,{defaultsOnly:true});
    setTendencies(defaultPreferences(data.cities));persist();
  };
  onMount(()=>{
    const allowed=Object.values(model.resourceSettlementSortItems??{});
    const requested=saved.preferences?.sort??13;
    model.setSelectedSettlementSortType(!allowed.length||allowed.includes(requested)?requested:13);
    model.toggleSelectedSortDirection(saved.preferences?.direction??-1);
    try{refreshDefaults();}catch(e){setStatus('DEFAULTS_FAILED',errorMessage(e));console.error('[Resource Planner] '+e.message);}
  });
  createEffect(()=>{model.selectedSettlementSortType();model.selectedSortDirection();untrack(persist);});
  const changePreference=(write,choices,value)=>{if(busy()||model.resourceActionBusy?.()||!alive||!choices.includes(value))return;write(value);persist();};
  const p={camels,assigned,busy,status,statusCode,tendencies,preferenceMode,
    setCamels:value=>changePreference(setCamelsValue,[true,false],value),
    setAssigned:value=>changePreference(setAssignedValue,[true,false],value),
    reminderEnabled,toggleReminders(){if(busy()||model.resourceActionBusy?.()||!alive)return;const value=!reminderEnabled();if(resourceDeferral().setRemindersEnabled(value))setReminderEnabled(value);else setStatus('SETTINGS_FAILED','');},
    happinessScope,settlementTarget,cityTarget,
    setHappinessScope:value=>changePreference(setHappinessScopeValue,['cities','towns'],value),
    setSettlementTarget:value=>changePreference(setSettlementTargetValue,[0,5],value),
    setCityTarget:value=>changePreference(setCityTargetValue,[0,20],value),
    runHappiness:()=>{void run(happinessScope()==='towns'?'town-happiness':'city-happiness');},
    sort(type){if(model.selectedSettlementSortType()===type)model.toggleSelectedSortDirection();else{model.setSelectedSettlementSortType(type);model.toggleSelectedSortDirection(-1);}persist();},
    tendency(id){const c=Cities.get(id);return c?tendencies()[preferenceKey(c)]:undefined;},
    clear(id){if(busy()||model.resourceActionBusy?.()||!alive)return;const c=Cities.get(id);if(!c)return;const next={...tendencies()};delete next[preferenceKey(c)];setPreferenceMode('manual');setTendencies(next);persist();},
    choose(id,yieldType){if(busy()||model.resourceActionBusy?.()||!alive)return;const c=Cities.get(id);if(!c)return;const key=preferenceKey(c),next={...tendencies()},value=cyclePreference(next[key],yieldType);if(hasPreferences(value))next[key]=value;else delete next[key];setPreferenceMode('manual');setTendencies(next);setStatus('HINT');persist();},
    resetDefaults(){
      if(busy()||model.resourceActionBusy?.()||!alive)return;
      try{
        const data=snapshot(model,tendencies(),catalog,{defaultsOnly:true});
        setTendencies(defaultPreferences(data.cities));setPreferenceMode('auto');setStatus('HINT');persist();
      }catch(e){setStatus('DEFAULTS_FAILED',errorMessage(e));console.error('[Resource Planner] '+e.message);}
    },
    run(mode='score'){void run(mode);}
  };
  controllers.set(model,p);
  onCleanup(()=>{alive=false;controllers.delete(model);});

  function restrict(data,predicate) {
    const kept=[];
    for(const r of data.resources) {
      if(predicate(r)){kept.push(r);continue;}
      if(r.original){const c=data.cities.find(c=>c.key===r.original);restoreAssignedResource(c,r);}
    }
    data.resources=kept;
  }
  async function run(mode,target) {
    if(busy()||model.resourceActionBusy?.()||!alive)return;
    model.clearResourceActionStatus?.();
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
      if(mode==='score'||mode==='tendency')refreshDefaults();
      data=snapshot(model,tendencies(),catalog,{camels:camels(),assigned:assigned()});
      if(target)data.cities.forEach(c=>{if(c.key!==target)c.tendency=undefined;});
      let plan;
      if(mode==='score'||mode==='tendency') {
        plan=await planAllocationAsync(data.resources,data.cities,'score',{shouldContinue:guard});
      } else {
        restrict(data,r=>!r.bonusSlots&&r.effects.some(e=>e.yield==='YIELD_HAPPINESS'&&e.amount>0));
        plan=planHappiness(data.resources,data.cities,mode==='town-happiness',{settlementTarget:settlementTarget(),cityTarget:cityTarget()});
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
