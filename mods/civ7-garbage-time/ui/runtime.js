import { InterfaceMode } from '/core/ui/interface-modes/interface-modes.js';
import ViewManager from '/core/ui/views/view-manager.js';
import { createConfigStore, createSessionStore } from './storage.js';
import { createGameAdapter } from './game-adapter.js';
import { createAutomation } from './automation.js';
import { cityKey } from './rules.js';
import { createResourceAutomation } from './resource-automation.js';
import { runResourcePlanner } from './resource-bridge.js';

function install(){
  globalThis.__civ7GarbageTime?.dispose();
  const configs=createConfigStore(localStorage),sessions=createSessionStore();
  let config=configs.load(),state=sessions.load(),disposed=false,timer=null;
  const errors=new Set();
  function report(label,error){const key=label+String(error);if(!errors.has(key)){errors.add(key);console.error('[Garbage Time] '+key);}}
  function save(value){state=sessions.save(value);window.dispatchEvent(new CustomEvent('garbage-time-state-changed'));}
  const style=document.createElement('link');style.rel='stylesheet';style.href='fs://game/civ7-garbage-time/ui/garbage-time.css';document.head.appendChild(style);
  const alerts=document.createElement('fxs-scrollable');alerts.className='gt-alerts';
  const alertList=document.createElement('fxs-vslot');alerts.appendChild(alertList);
  const api=createGameAdapter();
  const blocked=()=>!ViewManager.isWorldInputAllowed || !!document.querySelector('screen-options,screen-garbage-city') || !['INTERFACEMODE_DEFAULT','INTERFACEMODE_UNIT_SELECTED'].includes(InterfaceMode.getCurrent());
  const resources=createResourceAutomation({
    run:guard=>runResourcePlanner(guard,config.resourceOptions),getSession:()=>state,saveSession:save,
    context:()=>({scope:api.context(),turn:api.turn()}),canRun:api.canRun,blocked,
    ready:()=>!api.player()?.Resources?.isResourceAssignmentLocked(),report
  });
  const automation=createAutomation(api,{
    getConfig:()=>config,getSession:()=>state,saveSession:save,report,
    blocked:()=>blocked()||resources.busy
  });
  let alertKey='';
  function renderAlerts(){
    const host=document.querySelector('panel-action');
    if(host&&!alerts.isConnected)host.appendChild(alerts);
    const key=JSON.stringify(automation.status.alerts.map(a=>[cityKey(a.city),a.happiness,a.threshold]));
    if(key===alertKey)return;alertKey=key;while(alertList.firstChild)alertList.removeChild(alertList.firstChild);
    alerts.classList.toggle('hidden',automation.status.alerts.length===0);
    for(const a of automation.status.alerts){
      const b=document.createElement('fxs-button');
      const name=Locale.compose(a.city.name);b.setAttribute('caption',`${name}：快乐度 ${a.happiness ?? '?'} ≤ ${a.threshold}`);
      b.setAttribute('data-tooltip-content','垃圾时间行动提醒：人口自动分配已暂停。点击打开该定居点。');
      b.addEventListener('action-activate',()=>{if(Cities.get(a.city.id)?.owner===GameContext.localPlayerID)UI.Player.selectCity(a.city.id);});
      alertList.appendChild(b);
    }
  }
  function tick(){if(disposed)return;try{resources.tick();automation.tick();renderAlerts();}catch(e){report('Tick',e);}}
  function applied(){config=configs.load();state=sessions.load();automation.reset();tick();}
  window.addEventListener('garbage-time-settings-applied',applied);
  function refresh(){if(timer===null)timer=setTimeout(()=>{timer=null;tick();},250);}
  const events=['PlayerTurnActivated','CityPopulationChanged','CityProductionQueueChanged','CityYieldChanged','WorkerAdded','UnitMoveComplete','UnitAddedToMap','ProgressionTreeNodeUnlocked','LoadComplete'];
  for(const name of events)engine.on(name,refresh);
  const interval=setInterval(tick,750);
  const dispose=()=>{if(disposed)return;disposed=true;clearInterval(interval);if(timer!==null)clearTimeout(timer);resources.dispose();automation.dispose();for(const name of events)engine.off(name,refresh);window.removeEventListener('garbage-time-settings-applied',applied);engine.off('BeforeUnload',dispose);style.remove();alerts.remove();};
  engine.on('BeforeUnload',dispose);
  globalThis.__civ7GarbageTime={version:'0.1.4',config:()=>config,session:()=>state,save,tick,status:automation.status,resources:resources.status,adapter:api,dispose};
  console.warn('[Garbage Time] Automation 0.1.4 loaded; all new-save switches off.');
  tick();
}
engine.whenReady.then(install).catch(e=>console.error('[Garbage Time] Load failed: '+String(e)));
