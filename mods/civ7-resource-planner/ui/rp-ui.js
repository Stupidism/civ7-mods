import {createComponent,createMemo,createEffect,For,Show,mergeProps} from '/core/vendor/solid-js/dist/solid.js';
import {template,insert} from '/core/vendor/solid-js/web/dist/web.js';
import {IsControllerActive,ActiveInputDevice} from '/core/ui-next/services/input.js';
import {Activatable} from '/core/ui-next/components/activatable.js';
import {Icon as ActionIcon} from '/core/ui/utilities/utilities-image.js';
import {Icon} from '/core/ui-next/components/icon.js';
import {Tooltip} from '/core/ui-next/components/tooltip.js';
import {getPlanner} from './rp-controller.js';
import {productionProgressText,productionText,productionTitle} from './rp-game-adapter.js';
import {YIELDS,groupedSettlements,normalizePreferences,hasPreferences} from './rp-planner.js';
import {t} from './rp-l10n.js';
// During controller placement only settlement cards should receive focus.
export const isControllerPlacement=model=>IsControllerActive()&&model.selectedResource().resourceValue!==-1;
export const zoneActive=(model,zone)=>!IsControllerActive()||model.resourceZone()===zone;
export const isPlannerControlDisabled=(model,zone='preferences')=>isControllerPlacement(model)||!!model.resourceActionBusy?.()||!zoneActive(model,zone);
export const plannerStyle='fs://game/civ7-resource-planner/ui/rp-style.css';
// Some Mac builds return unprefixed gesture names even with hasPrefix=true.
// Use the same device prefix as the native controller mapping editor. Scope the
// repair to this panel so its native tray and placement hints use real glyphs.
export function installControllerGlyphs() {
  const original=ActionIcon.getIconFromActionName;
  function resolved(action,device,context,hasPrefix) {
    const name=original(action,device,context,hasPrefix);
    if(hasPrefix===false||!/^icon_/.test(name??''))return name;
    const prefix=Input.getPrefix(device??InputDeviceType.Controller);
    return prefix?`blp:${prefix}${name}`:name;
  }
  ActionIcon.getIconFromActionName=resolved;
  return ()=>{if(ActionIcon.getIconFromActionName===resolved)ActionIcon.getIconFromActionName=original;};
}
// Native Solid focus can be cleared during a zone's layout pass. Repair only
// a still-current, enabled target in this panel after that pass has settled.
export function installControllerFocus(focus,root,isController) {
  const original=focus.setFocus,timers=new Set();
  let marked=null,disposed=false;
  // Reactive class updates (for example normal -> prefer -> avoid) replace
  // className without moving focus. Keep the native focus artwork attached.
  const observer=typeof MutationObserver==='function'?new MutationObserver(()=>paint()):null;
  function paint(event) {
    if(disposed)return;
    const target=event?.type==='focusin'?event.target:focus.currentFocus();
    const next=isController()&&root.isConnected&&target?.isConnected&&root.contains(target)&&
      !target.classList.contains('disabled')&&target.hasAttribute('tabindex')&&
      target.matches?.('.rp-button, .draggable-resource, [data-name$="-city-resource-activatable"]')?target:null;
    if(marked!==next){observer?.disconnect();marked?.classList.remove('rp-controller-focus');marked=next;if(marked)observer?.observe(marked,{attributes:true,attributeFilter:['class']});}
    if(marked&&!marked.classList.contains('rp-controller-focus'))marked.classList.add('rp-controller-focus');
  }
  function schedule(target) {
    if(!target)return;
    const timer=setTimeout(()=>{
      timers.delete(timer);
      paint();
      if(root.isConnected&&target.isConnected&&root.contains(target)&&target.hasAttribute('tabindex')&&!target.classList.contains('disabled')&&isController()&&!focus.isFocusLocked?.()&&focus.currentFocus()===target&&!focus.isFocusActive())focus.realizeFocus(false);
    },100);
    timers.add(timer);
  }
  function setPanelFocus(target,...args) {
    const result=original.call(this,target,...args);
    if(disposed)return result;
    paint();schedule(target);
    return result;
  }
  const onFocusOut=event=>schedule(event.target);
  root.addEventListener('focusout',onFocusOut,true);
  root.addEventListener('focusin',paint,true);
  window.addEventListener('active-device-type-changed',paint);
  paint();
  focus.setFocus=setPanelFocus;
  return ()=>{
    disposed=true;
    observer?.disconnect();
    root.removeEventListener('focusout',onFocusOut,true);
    root.removeEventListener('focusin',paint,true);
    window.removeEventListener('active-device-type-changed',paint);
    marked?.classList.remove('rp-controller-focus');marked=null;
    for(const timer of timers)clearTimeout(timer);
    timers.clear();
    if(focus.setFocus===setPanelFocus)focus.setFocus=original;
  };
}
const div=template('<div></div>');
const label=(text,cls='')=>{const el=div();el.className=cls;insert(el,text,null);return el;};
const productionTemplate=template('<div class="rp-production flex flex-row items-center"><div class="rp-production-icon"></div><div class="rp-production-label text-xs"></div><div class="rp-production-progress"><div class="rp-production-value text-xs"></div></div></div>');
export function SettlementProduction(props) {
  // Keep props reactive: reading props.production here lets Solid track a
  // getter or function supplied by the commerce model and update in place.
  const read=()=>{const value=props.production;return typeof value==='function'?value():value;};
  return createComponent(Tooltip.Text,{get text(){return productionTitle(read());},get children(){
    const el=productionTemplate(),iconEl=el.firstChild,labelEl=iconEl.nextSibling,
      progressEl=labelEl.nextSibling,valueEl=progressEl.firstChild;
    createEffect(()=>{
      const p=read()||{kind:'none'};
      const tip=productionTitle(p);
      const hidden=p.kind==='none'&&p.isTown===true;
      el.setAttribute('aria-label',tip);
      el.style.display=hidden?'none':'';
      iconEl.style.backgroundImage=p.icon||'';
      iconEl.style.display=p.icon?'block':'none';
      el.classList.toggle('rp-production-empty',p.kind==='none'||p.kind==='unknown');
      progressEl.style.display=p.progress?'flex':'none';
    });
    insert(labelEl,()=>productionText(read()),null);
    // Keep the native Icon component in the rendering path. The adapter gets
    // its yield URL from the explicitly injected native Icon utility, then this
    // component remains responsible for image-cache-aware presentation.
    insert(progressEl,createComponent(Icon,{get name(){const progress=read()?.progress;return progress?.icon||progress?.yieldType||'';},get isUrl(){return read()?.progress?.iconIsUrl===true;},class:'rp-production-yield-icon'}),valueEl);
    insert(valueEl,()=>productionProgressText(read()),null);
    return el;
  }});
}
const yieldName=i=>YIELDS[i]?Locale.compose(`LOC_${YIELDS[i]}_NAME`):'';
const buttonBackground=template('<div class="absolute inset-0 rp-button-art"><div class="absolute inset-0 fxs-button__bg fxs-button__bg--base"></div><div class="absolute inset-0 opacity-0 fxs-button__bg fxs-button__bg--focus"></div><div class="absolute inset-0 opacity-0 fxs-button__bg fxs-button__bg--active"></div><div class="absolute inset-0 opacity-0 fxs-button__bg fxs-button__bg--disabled"></div></div>');
function button(props) {
  return createComponent(Tooltip.Text,{get text(){return props.tip;},get children(){
    return createComponent(Activatable,mergeProps(props,{get 'aria-label'(){return props.tip;},get class(){return `fxs-button fxs-button-small rp-button ${props.class||''}`;},name:'ResourcePlannerButton',get children(){const content=div();content.className='rp-button-content relative flex';insert(content,()=>props.children,null);return [buttonBackground(),content];}}));
  }});
}
export function markZone(el,model,zone) {
  el.classList.add('rp-zone',`rp-zone-${zone}`);
  createEffect(()=>{
    el.classList.toggle('rp-zone-active',IsControllerActive()&&model.resourceZone()===zone);
    el.classList.toggle('rp-zone-candidate',IsControllerActive()&&model.resourceZone()===null&&model.resourceZoneCandidate?.()===zone);
  });
  return el;
}
// Navigation actions (including triggers) arrive as navigate-input, not
// engine-input. Consume their release so it cannot move native focus again.
export function createZoneNavigation(model,isController,isBusy,now=()=>Date.now()) {
  let lastMove=-Infinity;
  return event=>{
    if(!isController())return;
    const {name,status,navigation}=event.detail??{};
    const trigger=name==='nav-shell-next'||name==='nav-shell-previous';
    const direction=navigation===InputNavigationAction.RIGHT||navigation===InputNavigationAction.DOWN?1:
      navigation===InputNavigationAction.LEFT||navigation===InputNavigationAction.UP?-1:0;
    if(!trigger&&(model.resourceZone()!==null||!direction))return;
    event.preventDefault();event.stopPropagation();
    if(isBusy()||model.resourceActionBusy()||model.selectedResource().resourceValue!==-1)return;
    if(trigger){if(status===InputActionStatuses.FINISH)model.cycleResourceZone(name==='nav-shell-next'?1:-1);return;}
    if(status===InputActionStatuses.FINISH){lastMove=-Infinity;return;}
    const time=now();
    if(status===InputActionStatuses.START||time-lastMove>=220){lastMove=time;model.cycleResourceZone(direction);}
  };
}
export function ZoneEntry({model,zone}) {
  return createComponent(Show,{get when(){return IsControllerActive()&&model.resourceZone()===null;},get children(){return createComponent(button,{
    class:'rp-zone-entry rp-action', 'data-rp-zone-entry':zone,
    get tip(){return t('ZONE_SELECT_TIP',t(zone==='actions'?'ZONE_NAME_ACTIONS':zone==='preferences'?'ZONE_NAME_PREFERENCES':zone==='tools'?'ZONE_NAME_TOOLS':'ZONE_NAME_RESOURCES'));},
    get autoFocus(){return model.resourceZoneCandidate?.()===zone;},
    onActivate:()=>model.enterResourceZone(zone),
    get children(){return label(()=>t(zone==='actions'?'ZONE_NAME_ACTIONS':zone==='preferences'?'ZONE_NAME_PREFERENCES':zone==='tools'?'ZONE_NAME_TOOLS':'ZONE_NAME_RESOURCES'),'text-sm');}
  });}});
}
function icon(name,cls='size-7'){return createComponent(Icon,{name,isUrl:name.startsWith('url('),class:cls});}
export function ResetPreferencesButton({model}) {
  const p=getPlanner(model);
  return createComponent(button,{class:'rp-reset-defaults rp-action flex flex-row items-center',
    get tip(){return t('RESET_DEFAULTS_TIP');},get disabled(){return p.busy()||isPlannerControlDisabled(model,'preferences');},
    onActivate:()=>{if(!isPlannerControlDisabled(model,'preferences')&&!p.busy())p.resetDefaults();},
    get children(){return [icon('url(blp:resource_return_button_default.png)','rp-action-icon'),label(()=>t('RESET_DEFAULTS'),'text-sm')];}
  });
}
export function PlannerToolbar({model}) {
  const p=getPlanner(model);
  const el=div();el.className='rp-toolbar flex flex-col';markZone(el,model,'actions');

  insert(el,createComponent(ZoneEntry,{model,zone:'actions'}),null);
  insert(el,createComponent(button,{get tip(){return t('AUTO_TIP');},
    class:'rp-auto rp-action flex flex-row items-center',get autoFocus(){return IsControllerActive()&&model.resourceZone()==='actions';},get disabled(){return p.busy()||!model.isSlottingAvailable||isPlannerControlDisabled(model,'actions');},onActivate:()=>p.run(),
    get children(){return [icon('url(blp:ntf_discover_resource)','size-9'),label(()=>t('AUTO_ASSIGN'),'ml-2 font-body'),label(()=>p.busy()?'…':'','ml-2')];}}),null);
  const utilities=div();utilities.className='rp-utility-actions flex flex-col';
  insert(utilities,createComponent(button,{class:'rp-happiness rp-action flex flex-row items-center',
    get tip(){return t('FILL_SELECTED_TIP',p.settlementTarget(),Math.max(p.settlementTarget(),p.cityTarget()));},
    get disabled(){return p.busy()||!model.isSlottingAvailable||isPlannerControlDisabled(model,'actions');},
    onActivate:()=>{if(!p.busy()&&model.isSlottingAvailable&&!isPlannerControlDisabled(model,'actions'))p.runHappiness();},
    get children(){return [icon('url(blp:fi_Yield_Happiness_64)','rp-action-icon'),label(()=>t('FILL_SELECTED'),'text-sm')];}
  }),null);
  insert(utilities,createComponent(button,{class:'rp-tidy rp-action flex flex-row items-center',
    get tip(){return t('TIDY_TIP');},get disabled(){return p.busy()||isPlannerControlDisabled(model,'actions');},
    onActivate:()=>{if(!isPlannerControlDisabled(model,'actions')&&!p.busy())model.tidyResources();},
    get children(){return [icon('url(blp:shell_arrow-button)','rp-action-icon'),label(()=>t('TIDY'),'text-sm')];}
  }),null);
  insert(el,utilities,null);
  insert(el,label(()=>model.resourceActionStatus?.()||(p.status()===t('HINT')?'':p.status()),'rp-status text-xs text-accent-2'),null);
  const spacer=div();
  spacer.className='rp-settings-spacer';
  insert(el,spacer,null);
  const settings=div();settings.className='rp-toolbar-settings flex flex-col';
  insert(settings,createComponent(button,{
    get class(){return `rp-reminder-toggle rp-option rp-action flex flex-row items-center ${p.reminderEnabled?.()!==false?'rp-active':''}`;},
    get tip(){return t('REMINDERS_TIP');},get disabled(){return p.busy()||isPlannerControlDisabled(model,'actions');},
    get 'aria-pressed'(){return p.reminderEnabled?.()!==false?'true':'false';},onActivate:()=>p.toggleReminders(),
    get children(){return [icon('url(blp:ntf_discover_resource)'),label(()=>t(p.reminderEnabled?.()!==false?'REMINDERS_ON':'REMINDERS_OFF'),'ml-2 font-body')];}}),null);
  const optionGroup=div();optionGroup.className='rp-target-group rp-allocation-options flex flex-col';
  const optionHeading=div();optionHeading.className='rp-target-heading flex flex-row items-center';
  insert(optionHeading,icon('url(blp:ntf_discover_resource)','rp-action-icon'),null);
  insert(optionHeading,label(()=>t('ALLOCATION_OPTIONS'),'text-xs'),null);
  insert(optionGroup,optionHeading,null);
  const options=div();options.className='rp-options rp-target-options flex flex-col';
  for(const [caption,read,write,tip,src] of [
    ['INCLUDE_CAMELS',p.camels,p.setCamels,'CAMELS_TIP',()=>UI.getIcon('RESOURCE_CAMELS','RESOURCE')],
    ['INCLUDE_ASSIGNED',p.assigned,p.setAssigned,'ASSIGNED_TIP',()=> 'blp:ntf_discover_resource']]) {
    insert(options,createComponent(button,{
      get class(){return `rp-option rp-action flex flex-row items-center ${read()?'rp-active':''}`;},
      get tip(){return t(tip);},get 'aria-pressed'(){return !!read();},
      get disabled(){return p.busy()||isPlannerControlDisabled(model,'actions');},
      onActivate:()=>{if(!p.busy()&&!isPlannerControlDisabled(model,'actions'))write(!read());},
      get children(){return [icon(`url(${src()})`,'rp-action-icon'),label(()=>t(caption),'text-sm')];}
    }),null);
  }
  insert(optionGroup,options,null);insert(settings,optionGroup,null);
  const scope=div();scope.className='rp-happiness-scope flex flex-col';
  for(const value of ['cities','towns'])insert(scope,createComponent(button,{
    get class(){return `rp-action rp-scope-option flex flex-row items-center ${p.happinessScope()===value?'rp-active':''}`;},
    get tip(){return t(value==='towns'?'SCOPE_TOWNS_TIP':'SCOPE_CITIES_TIP');},get 'aria-pressed'(){return p.happinessScope()===value;},
    get disabled(){return p.busy()||isPlannerControlDisabled(model,'actions');},
    onActivate:()=>{if(!p.busy()&&!isPlannerControlDisabled(model,'actions'))p.setHappinessScope(value);},
    get children(){return [icon(value==='towns'?'url(blp:Yield_Towns)':'url(blp:Yield_Cities)','rp-action-icon'),label(()=>t(value==='towns'?'SCOPE_TOWNS':'SCOPE_CITIES'),'text-sm')];}
  }),null);
  insert(settings,scope,null);
  for(const [title,read,write,values,src,townsDisabled] of [
    ['SETTLEMENT_TARGET',p.settlementTarget,p.setSettlementTarget,[0,5],'blp:fi_Yield_Happiness_64',false],
    ['CITY_TARGET',p.cityTarget,p.setCityTarget,[0,20],'blp:Yield_Cities',true]]) {
    const group=div();group.className='rp-target-group flex flex-col';
    const heading=div();heading.className='rp-target-heading flex flex-row items-center';
    insert(heading,icon(`url(${src})`,'rp-action-icon'),null);insert(heading,label(()=>t(title),'text-xs'),null);insert(group,heading,null);
    const row=div();row.className='rp-target-options flex flex-row';
    for(const value of values)insert(row,createComponent(button,{
      get class(){return `rp-target-option rp-action ${read()===value?'rp-active':''}`;},
      get tip(){return t(townsDisabled?'CITY_TARGET_TIP':'SETTLEMENT_TARGET_TIP',value);},
      get 'aria-pressed'(){return read()===value;},
      get disabled(){return p.busy()||isPlannerControlDisabled(model,'actions')||(townsDisabled&&p.happinessScope()==='towns');},
      onActivate:()=>{if(!p.busy()&&!isPlannerControlDisabled(model,'actions')&&!(townsDisabled&&p.happinessScope()==='towns'))write(value);},
      get children(){return label(()=>t('TARGET_VALUE',value),'text-sm');}
    }),null);
    insert(group,row,null);insert(settings,group,null);
  }
  insert(el,settings,null);return el;
}
export function SortToolbar({model}) {
  const p=getPlanner(model),el=div();el.className='rp-sort-toolbar flex flex-col';markZone(el,model,'tools');

  const inactive=()=>!zoneActive(model,'tools');
  const blocked=()=>p.busy()||!!model.resourceActionBusy?.()||isControllerPlacement(model);
  insert(el,createComponent(ZoneEntry,{model,zone:'tools'}),null);
  const row=div();row.className='rp-sort-icons flex flex-row flex-wrap items-center';
  insert(row,label(()=>t('SORT_SETTLEMENTS'),'text-sm mr-2'),null);
  const extra=[
    [0,'blp:fi_city_urban_64','SORT_TYPE'],[1,'blp:fi_city_urban_64','SORT_NAME'],[2,'blp:ntf_discover_resource','SORT_OPEN'],
    [3,'blp:ntf_discover_resource','SORT_TOTAL'],[4,'blp:fi_yield_warehouse_64','SORT_WAREHOUSE'],
    [5,'blp:ntf_discover_continent','SORT_DISTANCE'],[6,'blp:trade_link_positive','SORT_RAIL'],[7,'blp:restype_factory_v2','SORT_FACTORY']
  ];
  const entries=[...[2,0,3,4,1,5,6].map(i=>[i+8,()=>UI.getIcon(YIELDS[i],'YIELD'),()=>yieldName(i)]),
    ...extra.map(([type,name,key])=>[type,()=>name,()=>t(key)])];
  const allowed=new Set(Object.values(model.resourceSettlementSortItems));
  for(const [type,src,title] of entries.filter(([type])=>allowed.has(type)))insert(row,createComponent(button,{
    get tip(){return t(model.selectedSettlementSortType()===type?'SORT_REVERSE_TIP':'SORT_TIP',title());},get class(){return `rp-sort ${model.selectedSettlementSortType()===type?'rp-active':''}`;},
    get disabled(){return blocked();},get disableFocus(){return inactive();},
    get autoFocus(){return IsControllerActive()&&model.isInSortAndFilterMode()&&type===model.selectedSettlementSortType();},
    onActivate:()=>{if(!inactive()&&!blocked())p.sort(type);},
    get children(){return [icon(`url(${src()})`,'size-7'),label(()=>model.selectedSettlementSortType()===type?(model.selectedSortDirection()<0?'▼':'▲'):'','rp-direction')];}
  }),null);
  insert(el,row,null);
  const tools=div();tools.className='flex flex-row items-center mt-1 rp-sort-options';
  insert(tools,label(()=>t('FILTER_RESOURCES'),'text-sm mr-2'),null);
  const filters=['DEFAULT',...YIELDS.filter(y=>model.resourceHighlightYields.includes(y))];
  for(const value of filters)insert(tools,createComponent(button,{
    get class(){return `rp-sort ${model.selectedResourceFilter()===value?'rp-active':''}`;},
    get tip(){return value==='DEFAULT'?t('FILTER_ALL_TIP'):t('FILTER_YIELD_TIP',Locale.compose(`LOC_${value}_NAME`));},
    get disableFocus(){return inactive();},get disabled(){return blocked();},
    onActivate:()=>{if(!inactive()&&!blocked())model.setSelectedResourceFilter(value);},
    get children(){return icon(value==='DEFAULT'?'url(blp:ntf_discover_resource)':`url(${UI.getIcon(value,'YIELD')})`,'size-7');}
  }),null);
  insert(el,tools,null);return el;
}

export function HappinessButton({model,type}) {
  const p=getPlanner(model);
  return createComponent(Show,{when:type==='RESOURCECLASS_CITY'||type==='RESOURCECLASS_BONUS',get children(){
    const towns=type==='RESOURCECLASS_BONUS';
    return createComponent(button,{class:'rp-happiness rp-action flex flex-row items-center',get tip(){return t(towns?'FILL_TOWNS_TIP':'FILL_CITIES_TIP');},
      get disabled(){return p.busy()||!model.isSlottingAvailable||isPlannerControlDisabled(model,'actions');},onActivate:()=>p.run(towns?'town-happiness':'city-happiness'),
      get children(){return [icon(towns?'url(blp:Yield_Towns)':'url(blp:Yield_Cities)','rp-action-icon'),icon('url(blp:fi_Yield_Happiness_64)','rp-action-icon'),label(()=>t(towns?'FILL_TOWNS':'FILL_CITIES'),'rp-action-caption text-sm')];}});
  }});
}
export function TendencyYield(props) {
  const p=getPlanner(props.model),yieldType=()=>YIELDS[props.index()];
  return createComponent(button,{get tip(){
      if(props.model.selectedResource().resourceValue!==-1)return t('PLACE_TIP');
      const weight=normalizePreferences(p.tendency(props.cityID))[yieldType()]??1;
      const next=weight===1?2:weight===2?0:1;
      const state=value=>t(value===2?'PREFER':value===0?'AVOID':'NEUTRAL');
      return t('PREFERENCE_STATE_TIP',yieldName(props.index()),state(weight),weight,state(next),next);
    },
    get class(){return `rp-yield ${props.index()>0?'ml-3':''} ${normalizePreferences(p.tendency(props.cityID))[yieldType()]===2?'rp-active':normalizePreferences(p.tendency(props.cityID))[yieldType()]===0?'rp-avoid':''}`;},
    get disabled(){return p.busy()||isPlannerControlDisabled(props.model);},
    onActivate:()=>{
      if(isControllerPlacement(props.model))return;
      // Yield buttons are inside the city target: picking up a resource takes
      // precedence over changing preferences or launching automatic allocation.
      if(props.model.selectedResource().resourceValue!==-1){
        if(props.model.isSlottingAvailable&&props.model.canAssignSelectedResourceToSettlement(props.cityID))props.model.slotSelectedResource(props.cityID);
        return;
      }
      p.choose(props.cityID,yieldType());
    },get children(){return [createComponent(Icon,{get name(){return props.data.yieldIconSrc;},isUrl:true,class:'rp-yield-icon'}),label(()=>props.data.yieldTotal,'rp-yield-total')];}});
}
export function TendencyLabel({model,cityID}) {
  const p=getPlanner(model);
  return createComponent(Show,{get when(){return hasPreferences(p.tendency(cityID));},get children(){return createComponent(button,{
    class:'rp-tendency-label',get tip(){return t('CLEAR_PREFERENCE_TIP');},get disabled(){return p.busy()||isPlannerControlDisabled(model);},onActivate:()=>{if(!p.busy()&&!isPlannerControlDisabled(model))p.clear(cityID);},
    get children(){return icon('url(blp:resource_return_button_default.png)','size-6');}
  });}});
}

export function createGroups(props) {
  // Keep stable group objects, so changing sort does not reset collapsed state.
  const groups=[['CITIES','url(blp:Yield_Cities)'],['TOWNS','url(blp:Yield_Towns)'],['DISCONNECTED','url(blp:trade_link_negative)']];
  return groups.map(([title,icon],i)=>({
    collapsibleContainerData:{get titleText(){return t('GROUP_COUNT',t(title),groupedSettlements(props.slottedResourceSectionData)[i].length);},titleIcon:icon},
    get cityResources(){return groupedSettlements(props.slottedResourceSectionData)[i];},get emptyResourcesDescription(){return t('EMPTY_GROUP');}
  }));
}
