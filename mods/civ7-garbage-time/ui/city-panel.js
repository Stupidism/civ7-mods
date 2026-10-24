import Panel from '/core/ui/panel-support.js';
import { ContextManager } from '/core/ui/context-manager/context-manager.js';
import { ModdingRegistry } from '/core/ui/modding-registry-handler/modding-registry-handler.js';
import { FocusManager } from '/core/ui-next/services/focus-manager.js';
import NavTray from '/core/ui/navigation-tray/model-navigation-tray.js';
import { cityKey, citySettings, normalizeCity, PRESETS, YIELDS, happinessWeight } from './rules.js';
const runtime = () => globalThis.__civ7GarbageTime;
const button = (caption,action) => { const b=document.createElement('fxs-button'); b.setAttribute('caption',caption);b.setAttribute('action-key','inline-accept');b.addEventListener('action-activate',action);return b; };
const label = text => {const el=document.createElement('div');el.textContent=text;el.className='font-body text-sm';return el;};

class GarbageCityEntry extends Component {
  refresh = () => {
    const r=runtime(),city=Cities.get(UI.Player.getHeadSelectedCity());
    const valid=r&&city?.owner===GameContext.localPlayerID;
    this.Root.classList.toggle('hidden',!valid);
    if(!valid)return;
    this.check.setAttribute('selected',String(citySettings(r.config(),r.session(),city).enabled));
  };
  onInitialize(){
    super.onInitialize();
    this.Root.classList.add('gt-city-entry');
    const row=document.createElement('fxs-hslot');row.className='gt-entry-row';
    this.check=document.createElement('fxs-checkbox');this.check.setAttribute('aria-label','本定居点进入垃圾时间');
    this.check.addEventListener('component-value-changed',event=>{
      if(event.detail.forced)return;
      const r=runtime(),city=Cities.get(UI.Player.getHeadSelectedCity());
      if(!r||city?.owner!==GameContext.localPlayerID)return;
      const state=r.session(),key=cityKey(city);
      state.cities[key]={...normalizeCity(state.cities[key]),enabled:event.detail.value===true};
      r.save(state);this.refresh();
    });
    row.appendChild(this.check);row.appendChild(label('垃圾时间'));
    row.appendChild(button('配置',()=>{
      const city=Cities.get(UI.Player.getHeadSelectedCity());if(!city)return;
      ContextManager.push('screen-garbage-city',{singleton:true,createMouseGuard:true,attributes:{'city-id':JSON.stringify(city.id)}});
    }));
    this.Root.appendChild(row);
  }
  onAttach(){super.onAttach();engine.on('CitySelectionChanged',this.refresh);window.addEventListener('garbage-time-state-changed',this.refresh);this.refresh();}
  onDetach(){engine.off('CitySelectionChanged',this.refresh);window.removeEventListener('garbage-time-state-changed',this.refresh);super.onDetach();}
}
class GarbageCityScreen extends Panel {
  onInitialize(){
    super.onInitialize();
    this.city=Cities.get(JSON.parse(this.Root.getAttribute('city-id')));
    const r=runtime();this.draft=normalizeCity(r.session().cities[cityKey(this.city)]);
    if(!this.draft.override){this.draft.weights={...r.config().weights};this.draft.minHappiness=r.config().minHappiness;}
    this.Root.classList.add('gt-city-screen');
    const frame=document.createElement('fxs-frame');frame.className='gt-city-frame';frame.setAttribute('content-as','fxs-vslot');frame.setAttribute('content-class','gt-city-content');
    const title=document.createElement('fxs-header');title.setAttribute('title',Locale.compose(this.city.name)+' · 垃圾时间');title.setAttribute('filigree-style','h2');frame.appendChild(title);
    const scroll=document.createElement('fxs-scrollable');scroll.className='gt-city-scroll';
    this.main=document.createElement('fxs-vslot');this.main.className='gt-city-main';scroll.appendChild(this.main);frame.appendChild(scroll);
    const checkRow=(text,selected,handler)=>{
      const row=document.createElement('fxs-hslot');row.className='gt-edit-row';
      const c=document.createElement('fxs-checkbox');c.setAttribute('selected',String(selected));c.setAttribute('aria-label',text);
      c.addEventListener('component-value-changed',e=>{if(!e.detail.forced)handler(e.detail.value===true);});row.appendChild(label(text));row.appendChild(c);this.main.appendChild(row);return c;
    };
    checkRow('本定居点进入垃圾时间',this.draft.enabled,v=>this.draft.enabled=v);
    this.overrideCheck=checkRow('使用本城独立权重与快乐度阈值',this.draft.override,v=>{this.draft.override=v;this.refresh();});
    const help=label('关闭独立配置时跟随全局默认。城市在生产队列空闲后自动安排科研／文化项目；城镇保留原有专精。');help.classList.add('gt-help');this.main.appendChild(help);
    const presets=document.createElement('fxs-hslot');presets.className='gt-presets';
    for(const [key,text] of [['science','科研城'],['gold','金币城'],['culture','文化城']]) presets.appendChild(button(text,()=>{this.draft.override=true;this.draft.weights={...PRESETS[key]};this.refresh();}));
    this.main.appendChild(presets);
    this.controls={};
    const numberRow=(key,text,value,min,max)=>{
      const row=document.createElement('fxs-hslot');row.className='gt-edit-row';row.appendChild(label(text));
      const input=document.createElement('fxs-hslot');input.className='gt-number';
      const change=amount=>{if(!this.draft.override)return;const current=key==='minHappiness'?this.draft.minHappiness:this.draft.weights[key];const next=Math.max(min,Math.min(max,current+amount));if(key==='minHappiness')this.draft.minHappiness=next;else this.draft.weights[key]=next;this.refresh();};
      const minus=button('−',()=>change(-1)),plus=button('+',()=>change(1)),output=label(String(value));
      minus.setAttribute('aria-label',text+'减一');plus.setAttribute('aria-label',text+'加一');
      input.appendChild(minus);input.appendChild(output);input.appendChild(plus);
      row.appendChild(input);this.main.appendChild(row);this.controls[key]={minus,plus,output,min,max};
    };
    numberRow('minHappiness','净快乐度必须高于',this.draft.minHappiness,-100,100);
    const names={gold:'金币',food:'粮食',science:'科研',culture:'文化',production:'生产力',happiness:'笑脸（负幸福度时）'};
    for(const key of YIELDS)numberRow(key,names[key]+'权重',this.draft.weights[key],0,100);
    this.summary=label('');this.summary.classList.add('gt-help');this.main.appendChild(this.summary);
    this.happinessHint=label('');this.happinessHint.classList.add('gt-help');this.main.appendChild(this.happinessHint);
    const actions=document.createElement('fxs-hslot');actions.className='gt-presets';
    actions.appendChild(button('保存',()=>this.apply()));actions.appendChild(button('取消',()=>this.close()));frame.appendChild(actions);
    this.Root.appendChild(frame);this.refresh();
  }
  refresh(){
    if(!this.controls)return;
    this.overrideCheck.setAttribute('selected',String(this.draft.override));
    const settings=this.draft.override?this.draft:runtime().config();
    for(const [key,c] of Object.entries(this.controls)){const value=key==='minHappiness'?settings.minHappiness:settings.weights[key];c.minus.setAttribute('disabled',String(!this.draft.override||value<=c.min));c.plus.setAttribute('disabled',String(!this.draft.override||value>=c.max));c.output.textContent=String(value);}
    this.summary.textContent='金 / 粮 / 科 / 文 / 锤 / 笑脸：'+YIELDS.map(k=>settings.weights[k]).join(' / ');
    const happiness=runtime().adapter.happiness(this.city);
    this.happinessHint.textContent=`笑脸仅在本城净幸福度为负时计分；非负时按 0。当前折算权重：${happinessWeight(settings.weights,happiness)}。最低快乐度门槛仍生效。`;
  }
  apply(){
    const r=runtime(),city=Cities.get(this.city.id);if(city?.owner!==GameContext.localPlayerID){this.close();return;}
    const state=r.session();state.cities[cityKey(city)]=normalizeCity(this.draft);r.save(state);this.close();
  }
  input = e => {
    const cancel=e.isCancelInput?.()||['cancel','sys-menu'].includes(e.detail.name);
    const save=e.detail.name==='shell-action-1';
    if(!cancel&&!save)return;
    e.preventDefault();e.stopPropagation();
    if(e.detail.status!==InputActionStatuses.FINISH)return;
    if(cancel)this.close();else this.apply();
  };
  onAttach(){super.onAttach();this.Root.addEventListener('engine-input',this.input);}
  onDetach(){this.Root.removeEventListener('engine-input',this.input);NavTray.clear();super.onDetach();}
  onReceiveFocus(){super.onReceiveFocus();FocusManager.get().setFocus(this.main);NavTray.clear();NavTray.addOrUpdateGenericCancel();NavTray.addOrUpdateShellAction1('保存');}
}
Controls.define('garbage-city-entry',{createInstance:GarbageCityEntry});
Controls.define('screen-garbage-city',{createInstance:GarbageCityScreen,attributes:[{name:'city-id'}]});
const entry={parentID:'panel-production-chooser',componentTag:'garbage-city-entry',attributes:{'data-slot':'header'}};
if(!ModdingRegistry.modElements.some(e=>e.componentTag===entry.componentTag))ModdingRegistry.add(entry);
