import {createComponent,createMemo,For,Show,mergeProps} from '/core/vendor/solid-js/dist/solid.js';
import {template,insert} from '/core/vendor/solid-js/web/dist/web.js';
import {Activatable} from '/core/ui-next/components/activatable.js';
import {CheckBox} from '/core/ui-next/components/check-box.js';
import {Icon} from '/core/ui-next/components/icon.js';
import {Tooltip} from '/core/ui-next/components/tooltip.js';
import {YieldDelta} from '/base-standard/ui-next/components/yield-delta.js';
import {getPlanner} from './rp-controller.js';
import {YIELDS,groupedSettlements} from './rp-planner.js';
export const plannerStyle='fs://game/civ7-resource-planner/ui/rp-style.css';
const div=template('<div></div>');
const label=(text,cls='')=>{const el=div();el.className=cls;insert(el,text);return el;};
const names=['粮食','生产力','金币','科技','文化','幸福度','影响力'];
function button(props) {
  return createComponent(Tooltip.Text,{get text(){return props.tip;},get children(){
    return createComponent(Activatable,mergeProps(props,{get class(){return `rp-button ${props.class||''}`;},name:'ResourcePlannerButton'}));
  }});
}
function icon(name,cls='size-7'){return createComponent(Icon,{name,isUrl:name.startsWith('url('),class:cls});}
export function PlannerToolbar({model}) {
  const p=getPlanner(model);
  const el=div();el.className='rp-toolbar flex flex-col mb-2';
  insert(el,createComponent(button,{tip:'按照定居点倾向分配。按 金/粮/科/文/锤/笑脸 = 1/2/4/4/4/8 比较整体收益；幸福度补至非负后不再计分。',
    class:'rp-auto flex flex-row items-center',get disabled(){return p.busy()||!model.isSlottingAvailable;},onActivate:()=>p.run(),
    get children(){return [icon('url(blp:ntf_discover_resource)','size-9'),label('按倾向分配','ml-2 font-title'),label(()=>p.busy()?'…':'','ml-2')];}}));
  const options=div();options.className='flex flex-col my-1';
  for(const [caption,read,write,tip] of [
    ['包含骆驼资源',p.camels,p.setCamels,'允许用骆驼扩展资源槽；同时勾选包含已分配资源时，也会比较移动已分配的骆驼。'],
    ['包含已分配资源',p.assigned,p.setAssigned,'允许重新调配已分配资源。关闭时只使用空闲资源。']]) {
    insert(options,createComponent(Tooltip.Text,{text:tip,get children(){
      const row=div();row.className='flex flex-row items-center rp-option';
      insert(row,createComponent(CheckBox,{class:'size-6 mr-1',get isChecked(){return read();},get disabled(){return p.busy();},onActivate:()=>write(!read()),'aria-label':caption}));
      insert(row,createComponent(Activatable,{class:'text-sm',get disabled(){return p.busy();},onActivate:()=>write(!read()),get children(){return caption;}}));return row;
    }}));
  }
  insert(el,options);
  insert(el,label('定居点排序','rp-caption text-xs text-accent-2'));
  const sortRow=div();sortRow.className='flex flex-row rp-sorts';
  for(const i of [2,0,3,4,1,5])insert(sortRow,createComponent(button,{
    get tip(){return `按${names[i]}排序，再点一次切换升降序`;},
    get class(){return `rp-sort ${model.selectedSettlementSortType()===i+8?'rp-active':''}`;},
    onActivate:()=>p.sort(i+8),get children(){return [icon(`url(${UI.getIcon(YIELDS[i],'YIELD')})`,'size-7'),label(()=>model.selectedSettlementSortType()===i+8?(model.selectedSortDirection()<0?'▼':'▲'):'','rp-direction')];}
  }));
  insert(el,sortRow);insert(el,label(p.status,'rp-status text-xs text-accent-2'));return el;
}
export function HappinessButton({model,type}) {
  const p=getPlanner(model);
  return createComponent(Show,{when:type==='RESOURCECLASS_CITY'||type==='RESOURCECLASS_BONUS',get children(){
    const towns=type==='RESOURCECLASS_BONUS';
    return createComponent(button,{class:'rp-happiness ml-2 flex flex-row items-center',tip:towns?'自动填充幸福度资源：仅城镇，补至非负':'自动填充幸福度资源：城市优先，城镇其次，补至非负',
      get disabled(){return p.busy()||!model.isSlottingAvailable;},onActivate:()=>p.run(towns?'town-happiness':'city-happiness'),
      get children(){return [icon('url(blp:fi_Yield_Happiness_64)','size-5'),label('填充','text-xs')];}});
  }});
}
export function TendencyYield(props) {
  const p=getPlanner(props.model),yieldType=()=>YIELDS[props.index()];
  return createComponent(button,{get tip(){return `${names[props.index()]}倾向：点击记住，并一次填入可用的相关资源`;},
    get class(){return `rp-yield ${props.index()>0?'ml-3':''} ${p.tendency(props.cityID)===yieldType()?'rp-active':''}`;},
    get disabled(){return p.busy();},
    onActivate:()=>p.choose(props.cityID,yieldType()),get children(){return createComponent(YieldDelta,{
      classList:{'flex-col-reverse':true,'text-sm':true,'mb-1':true},
      get yieldIconSrc(){return props.data.yieldIconSrc;},get yieldTotal(){return props.data.yieldTotal;},get yieldDelta(){return props.data.yieldDelta;}
    });}});
}
export function TendencyLabel({model,cityID}) {
  const p=getPlanner(model);
  return createComponent(Show,{get when(){return p.tendency(cityID);},get children(){return createComponent(button,{
    class:'rp-tendency-label ml-3 text-xs',tip:'点击清除该定居点倾向',get disabled(){return p.busy();},onActivate:()=>p.clear(cityID),
    get children(){return label(()=>`倾向：${names[YIELDS.indexOf(p.tendency(cityID))]||''} ×`);}
  });}});
}
export function createGroups(props) {
  // Keep stable group objects, so changing sort does not reset collapsed state.
  const groups=[['城市','url(blp:Yield_Cities)'],['城镇','url(blp:Yield_Towns)'],['未连入贸易网络','url(blp:trade_link_negative)']];
  return groups.map(([title,icon],i)=>({
    collapsibleContainerData:{get titleText(){return `${title}（${groupedSettlements(props.slottedResourceSectionData)[i].length}）`;},titleIcon:icon},
    get cityResources(){return groupedSettlements(props.slottedResourceSectionData)[i];},emptyResourcesDescription:'该分组暂无定居点'
  }));
}
