import {createComponent,createMemo,For,Show,mergeProps} from '/core/vendor/solid-js/dist/solid.js';
import {template,insert} from '/core/vendor/solid-js/web/dist/web.js';
import {Activatable} from '/core/ui-next/components/activatable.js';
import {CheckBox} from '/core/ui-next/components/check-box.js';
import {Icon} from '/core/ui-next/components/icon.js';
import {Tooltip} from '/core/ui-next/components/tooltip.js';
import {YieldDelta} from '/base-standard/ui-next/components/yield-delta.js';
import {getPlanner} from './rp-controller.js';
import {YIELDS,groupedSettlements} from './rp-planner.js';
import {t} from './rp-l10n.js';
export const plannerStyle='fs://game/civ7-resource-planner/ui/rp-style.css';
const div=template('<div></div>');
const label=(text,cls='')=>{const el=div();el.className=cls;insert(el,text);return el;};
const yieldName=i=>YIELDS[i]?Locale.compose(`LOC_${YIELDS[i]}_NAME`):'';
function button(props) {
  return createComponent(Tooltip.Text,{get text(){return props.tip;},get children(){
    return createComponent(Activatable,mergeProps(props,{get 'aria-label'(){return props.tip;},get class(){return `rp-button ${props.class||''}`;},name:'ResourcePlannerButton'}));
  }});
}
function icon(name,cls='size-7'){return createComponent(Icon,{name,isUrl:name.startsWith('url('),class:cls});}
export function PlannerToolbar({model}) {
  const p=getPlanner(model);
  const el=div();el.className='rp-toolbar flex flex-col mb-2';
  insert(el,createComponent(button,{get tip(){return t('AUTO_TIP');},
    class:'rp-auto flex flex-row items-center',get disabled(){return p.busy()||!model.isSlottingAvailable;},onActivate:()=>p.run(),
    get children(){return [icon('url(blp:ntf_discover_resource)','size-9'),label(()=>t('AUTO_ASSIGN'),'ml-2 font-title'),label(()=>p.busy()?'…':'','ml-2')];}}));
  const options=div();options.className='flex flex-col my-1';
  for(const [caption,read,write,tip] of [
    ['INCLUDE_CAMELS',p.camels,p.setCamels,'CAMELS_TIP'],
    ['INCLUDE_ASSIGNED',p.assigned,p.setAssigned,'ASSIGNED_TIP']]) {
    insert(options,createComponent(Tooltip.Text,{get text(){return t(tip);},get children(){
      const row=div();row.className='flex flex-row items-center rp-option';
      insert(row,createComponent(CheckBox,{class:'size-6 mr-1',get isChecked(){return read();},get disabled(){return p.busy();},onActivate:()=>write(!read()),get 'aria-label'(){return t(caption);}}));
      insert(row,createComponent(Activatable,{class:'text-sm',get disabled(){return p.busy();},onActivate:()=>write(!read()),get children(){return t(caption);}}));return row;
    }}));
  }
  insert(el,options);
  insert(el,label(()=>t('SORT_SETTLEMENTS'),'rp-caption text-xs text-accent-2'));
  const sortRow=div();sortRow.className='flex flex-row rp-sorts';
  for(const i of [2,0,3,4,1,5])insert(sortRow,createComponent(button,{
    get tip(){return t('SORT_TIP',yieldName(i));},
    get class(){return `rp-sort ${model.selectedSettlementSortType()===i+8?'rp-active':''}`;},
    onActivate:()=>p.sort(i+8),get children(){return [icon(`url(${UI.getIcon(YIELDS[i],'YIELD')})`,'size-7'),label(()=>model.selectedSettlementSortType()===i+8?(model.selectedSortDirection()<0?'▼':'▲'):'','rp-direction')];}
  }));
  insert(el,sortRow);insert(el,label(p.status,'rp-status text-xs text-accent-2'));return el;
}
export function HappinessButton({model,type}) {
  const p=getPlanner(model);
  return createComponent(Show,{when:type==='RESOURCECLASS_CITY'||type==='RESOURCECLASS_BONUS',get children(){
    const towns=type==='RESOURCECLASS_BONUS';
    return createComponent(button,{class:'rp-happiness ml-2 flex flex-row items-center',get tip(){return t(towns?'FILL_TOWNS_TIP':'FILL_CITIES_TIP');},
      get disabled(){return p.busy()||!model.isSlottingAvailable;},onActivate:()=>p.run(towns?'town-happiness':'city-happiness'),
      get children(){return [icon('url(blp:fi_Yield_Happiness_64)','size-5'),label(()=>t('FILL'),'text-xs')];}});
  }});
}
export function TendencyYield(props) {
  const p=getPlanner(props.model),yieldType=()=>YIELDS[props.index()];
  return createComponent(button,{get tip(){return props.model.selectedResource().resourceValue!==-1?t('PLACE_TIP'):t('PREFERENCE_TIP',yieldName(props.index()));},
    get class(){return `rp-yield ${props.index()>0?'ml-3':''} ${p.tendency(props.cityID)===yieldType()?'rp-active':''}`;},
    get disabled(){return p.busy();},
    onActivate:()=>{
      // Yield buttons are inside the city target: picking up a resource takes
      // precedence over changing preferences or launching automatic allocation.
      if(props.model.selectedResource().resourceValue!==-1){
        if(props.model.isSlottingAvailable&&props.model.canAssignSelectedResourceToSettlement(props.cityID))props.model.slotSelectedResource(props.cityID);
        return;
      }
      p.choose(props.cityID,yieldType());
    },get children(){return createComponent(YieldDelta,{
      classList:{'flex-col-reverse':true,'text-sm':true,'mb-1':true},
      get yieldIconSrc(){return props.data.yieldIconSrc;},get yieldTotal(){return props.data.yieldTotal;},get yieldDelta(){return props.data.yieldDelta;}
    });}});
}
export function TendencyLabel({model,cityID}) {
  const p=getPlanner(model);
  return createComponent(Show,{get when(){return p.tendency(cityID);},get children(){return createComponent(button,{
    class:'rp-tendency-label ml-3 text-xs',get tip(){return t('CLEAR_PREFERENCE_TIP');},get disabled(){return p.busy();},onActivate:()=>p.clear(cityID),
    get children(){return label(()=>t('PREFERENCE_LABEL',yieldName(YIELDS.indexOf(p.tendency(cityID)))));}
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
