import {PanelAction} from '/base-standard/ui/action/panel-action.js';
import {ContextManager} from '/core/ui/context-manager/context-manager.js';
import ActionHandler from '/core/ui/input/action-handler.js';
import ViewManager from '/core/ui/views/view-manager.js';
import InputFilter from '/core/ui/input/input-filter.js';
import {InputEngineEvent,InputHandlerState} from '/core/ui/input/input-support.js';
import {FocusManager} from '/core/ui-next/services/focus-manager.js';
import {IsControllerActive} from '/core/ui-next/services/input.js';
import {createDeferralState,createHold,wrap} from './rp-defer-runtime.js';
import {readSettings,writeSettings} from './rp-settings.js';
const KEY='__civ7ResourceDeferralV1';
export function resourceDeferral() {
  if(globalThis[KEY])return globalThis[KEY];
  const scope=()=>`${Configuration.getGame().gameSeed}:${GameContext.localPlayerID}:${Game.age}:${Game.turn}`;
  const state=createDeferralState(scope),panels=new Set(),consumers=new Set(),guardConsumers=new Set(),frames=new Set();let refreshDepth=0,forceDepth=0,queued=false,disposed=false;
  let remindersEnabled=true;
  try { remindersEnabled=readSettings().preferences?.resourceReminders!==false; } catch { /* Preserve damaged settings; default to reminders. */ }
  const active=()=>UI.isInGame()&&Players.get(GameContext.localPlayerID)?.isTurnActive&&!GameContext.hasSentTurnComplete()&&!Configuration.getGame().isPaused&&!Autoplay.isActive;
  const pending=()=>remindersEnabled&&active()&&state.pending();
  // An explicit v1 capability transfers reminder guards as well as display.
  // Legacy display-only consumers retain the standalone guard behavior.
  const guardPending=()=>!guardConsumers.size&&pending();
  const tail=panel=>!consumers.size&&pending()&&Game.Notifications.getEndTurnBlockingType(GameContext.localPlayerID)===EndTurnBlockingTypes.NONE&&!panel.showRemainingMovesState();
  const open=()=>ContextManager.push('screen-resource-allocation',{singleton:true,createMouseGuard:true});
  function refresh(){if(queued||disposed)return;queued=true;queueMicrotask(()=>{queued=false;if(disposed)return;refreshDepth++;try{for(const p of panels)if(p.Root.isConnected)p.refreshActionButton(GameContext.localPlayerID);}finally{refreshDepth--;}});}
  const undo=[
    wrap(PanelAction.prototype,'refreshActionButton',function(next,player){panels.add(this);const result=next();if(player!==GameContext.localPlayerID||!tail(this))return result;
      this.pleaseWaitAnimation.stop();
      const paint=()=>{this.notificationIcon.style.backgroundImage=`url(${UI.getIconURL('NOTIFICATION_ASSIGN_NEW_RESOURCES','BUBBLE')})`;};paint();
      const frame=requestAnimationFrame(()=>{frames.delete(frame);if(!disposed&&this.Root.isConnected&&tail(this))paint();});frames.add(frame);
      this.actionText.innerHTML=Locale.stylize('LOC_RP_DEFER_PENDING');this.actionButton.setAttribute('data-tooltip-content',Locale.compose('LOC_RP_DEFER_PENDING'));this.Root.classList.add('new-notification');return result;}),
    wrap(PanelAction.prototype,'activateBlockingNotification',function(next){return tail(this)?open():next();}),
    wrap(PanelAction.prototype,'updatePlayerFocus',function(next){if(!tail(this))return next();}),
    wrap(PanelAction.prototype,'canEndTurn',function(next){return next()&&!guardPending();}),
    wrap(PanelAction.prototype,'sendEndTurn',function(next){if(!refreshDepth&&(forceDepth||!guardPending()))return next();}),
    wrap(PanelAction.prototype,'onEngineInput',function(next,event){const force=event.detail.name==='force-end-turn'&&event.detail.status===InputActionStatuses.FINISH;if(force)forceDepth++;try{return next();}finally{if(force)forceDepth--;}}),
    wrap(PanelAction.prototype,'onDetach',function(next){panels.delete(this);return next();})
  ];
  const reset=()=>{state.reset();refresh();};
  const service={version:1,scope,mode:state.mode,pending,claim(consumer,{turnGuards=false}={}){consumers.add(consumer);if(turnGuards)guardConsumers.add(consumer);return ()=>{consumers.delete(consumer);guardConsumers.delete(consumer);};},
    remindersEnabled:()=>remindersEnabled,
    setRemindersEnabled(value){
      try {const current=readSettings();current.preferences||={};current.preferences.resourceReminders=!!value;writeSettings(current);remindersEnabled=!!value;refresh();return true;}
      catch(error){console.error('[Resource Planner] Reminder setting: '+error);return false;}
    },
    defer(){state.defer();refresh();},dismiss(){state.dismiss();refresh();},
    dispose(){disposed=true;undo.reverse().forEach(fn=>fn());panels.clear();consumers.clear();guardConsumers.clear();for(const frame of frames)cancelAnimationFrame(frame);frames.clear();for(const e of ['GameStarted','LocalPlayerChanged'])engine.off(e,reset);engine.off('BeforeUnload',service.dispose);if(globalThis[KEY]===service)delete globalThis[KEY];}};
  globalThis[KEY]=service;for(const e of ['GameStarted','LocalPlayerChanged'])engine.on(e,reset);engine.on('BeforeUnload',service.dispose);
  return service;
}
export function installDeferInput(root,model,busy) {
  resourceDeferral();let focused=true,disposed=false;
  const allowed=()=>!disposed&&focused&&!document.hidden&&root.isConnected&&ContextManager.getCurrentTarget()===root&&
    !!root.querySelector('[data-name="available-resources-container"]')?.getBoundingClientRect?.().width&&
    ViewManager.isViewInputAllowed&&!FocusManager.get().isFocusLocked()&&!busy()&&!model.resourceActionBusy()&&
    (model.selectedResource?.()?.resourceValue ?? -1) === -1 && !model.isInSortAndFilterMode?.() &&
    Players.get(GameContext.localPlayerID)?.isTurnActive&&!GameContext.hasSentTurnComplete()&&!Configuration.getGame().isPaused&&
    !document.querySelector('.c7r-overlay')&&!globalThis.__civ7BeforeEndTurnV1?.busy&&
    InputFilter.handleInput(new InputEngineEvent('cancel',InputActionStatuses.FINISH,0,0,false,false))!==InputHandlerState.Handled;
  // Cancel/B remains entirely native, including its placement-cancel semantics.
  // The shared resource owner handles the same long-X skip as the policy page.
  const blur=()=>{focused=false;},focus=()=>{focused=true;};
  window.addEventListener('blur',blur);window.addEventListener('focus',focus);
  root.__civ7ResourceSkipAllowed=allowed;
  return ()=>{disposed=true;delete root.__civ7ResourceSkipAllowed;window.removeEventListener('blur',blur);window.removeEventListener('focus',focus);};
}
