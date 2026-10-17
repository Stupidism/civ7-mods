import {createSignal, onCleanup, onMount, createEffect, untrack} from '/core/vendor/solid-js/dist/solid.js';
import {planAllocation, planHappiness, effectsFor, cityKey} from './rp-planner.js';
import {resourceCatalog,snapshot,gameScope,preferenceKey,findAssignment,sendOperation} from './rp-game-adapter.js';
import {readSettings,writeSettings} from './rp-settings.js';
const controllers=new WeakMap();
export function getPlanner(model){return controllers.get(model);}
export function createPlanner(model) {
  if(controllers.has(model))return controllers.get(model);
  let saved;try{saved=readSettings();}catch(e){saved={preferences:{},games:{}};console.error('[Resource Planner] '+e.message);}
  const scope=gameScope(),catalog=resourceCatalog();
  const [tendencies,setTendencies]=createSignal(saved.games?.[scope]||{});
  const [camels,setCamels]=createSignal(false),[assigned,setAssigned]=createSignal(false);
  const [busy,setBusy]=createSignal(false),[status,setStatus]=createSignal('点击产出图标：记住倾向并填充资源');
  let alive=true;
  const persist=()=>{
    try {const current=readSettings();current.games||={};current.preferences||={};current.games[scope]=tendencies();current.preferences.sort=model.selectedSettlementSortType();current.preferences.direction=model.selectedSortDirection();writeSettings(current);}
    catch(e){setStatus('设置保存失败：'+e.message);console.error('[Resource Planner] '+e.message);}
  };
  onMount(()=>{
    model.setSelectedSettlementSortType(saved.preferences?.sort??13);
    model.toggleSelectedSortDirection(saved.preferences?.direction??-1);
  });
  createEffect(()=>{model.selectedSettlementSortType();model.selectedSortDirection();untrack(persist);});
  const p={camels,assigned,busy,status,tendencies,setCamels,setAssigned,
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
    if(Players.get(GameContext.localPlayerID)?.Resources?.isResourceAssignmentLocked()){setStatus('本回合资源分配已锁定');return;}
    setBusy(true);setStatus('正在计算整体收益…');
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
        if(!data.cities.some(c=>c.tendency)){setStatus('先点击定居点的产出图标，设置倾向');return;}
        plan=planAllocation(data.resources,data.cities);
      } else {
        restrict(data,r=>!r.bonusSlots&&r.effects.some(e=>e.yield==='YIELD_HAPPINESS'&&e.amount>0));
        plan=planHappiness(data.resources,data.cities,mode==='town-happiness');
      }
      changes=data.resources.filter(r=>(plan[r.key]||undefined)!==r.original).map(r=>({r,to:plan[r.key]}));
      if(!changes.length){setStatus('无需调整：没有可用资源、空槽或更高收益的分配');return;}
      model.deselectSelectedResource();
      const city=k=>data.cities.find(c=>c.key===k);
      let done=0;
      for(const change of changes.filter(x=>x.r.original).sort((a,b)=>a.r.bonusSlots-b.r.bonusSlots)) {
        setStatus(`正在重新调配：${++done} / ${changes.length}`);
        await sendOperation(change.r,city(change.r.original),true,data.cities,guard);
      }
      // Capacity-expanding resources must be acknowledged before dependent slots.
      const adds=changes.filter(x=>x.to).sort((a,b)=>b.r.bonusSlots-a.r.bonusSlots);
      done=0;
      for(const change of adds) {
        setStatus(`正在分配：${++done} / ${adds.length}`);
        await sendOperation(change.r,city(change.to),false,data.cities,guard);
      }
      model.onSortResources();
      setStatus(`已完成：装入 ${adds.length} 份资源，调整 ${changes.length} 份`);
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
      setStatus(`${error.message}；${restored?'本次调整已撤回':'部分资源未恢复，请检查空闲资源'}`);
    } finally {setBusy(false);}
  }
  console.log('[Resource Planner] loaded; resource effects='+catalog.size);
  return p;
}
