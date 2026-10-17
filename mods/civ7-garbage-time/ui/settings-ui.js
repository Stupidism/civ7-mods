import { Options, OptionType } from '/core/ui/options/model-options.js';
import { CategoryData } from '/core/ui/options/options-helpers.js';
import { DialogBoxManager } from '/core/ui/dialog-box/manager-dialog-box.js';
import { createConfigStore, createSessionStore } from './storage.js';
import { YIELDS, cityKey, normalizeConfig, normalizeSession } from './rules.js';

function install() {
  globalThis.__civ7GarbageOptions?.dispose();
  const store = createConfigStore(localStorage);
  const sessions = createSessionStore();
  let config, state, baseline;
  let entries = [];
  let active = true;
  const hooks = [];
  function reload() {
    config = store.load(); state = sessions.load();
    baseline = JSON.stringify({config,state});
  }
  function notifyError(error) {
    console.error('[Garbage Time] Settings: '+String(error));
    DialogBoxManager.createDialog_Confirm({title:'垃圾时间设置未保存',body:String(error)});
  }
  const category = CategoryData.mods ?? {title:'LOC_UI_CONTENT_MGR_SUBTITLE',description:'LOC_UI_CONTENT_MGR_SUBTITLE_DESCRIPTION'};
  CategoryData.mods = category;
  function add(entry) {
    entry.category = 'mods'; entry.id = 'garbage-time-'+entry.id;
    Options.addOption(entry); entries.push(entry);
  }
  function checkbox(id,label,description,get,set,gameOnly=false,group='garbage_time') {
    add({id,label,description,group,type:OptionType.Checkbox,
      initListener(info) { info.currentValue=get(); info.isDisabled=gameOnly&&!sessions.available(); },
      updateListener(info,value) { if(active && typeof value==='boolean') {set(value);info.currentValue=value;} }
    });
  }
  function stepper(id,label,description,get,set,min,max,group='garbage_weights') {
    dropdown(id,label,description,()=>Array.from({length:max-min+1},(_,i)=>({label:String(min+i),value:min+i})),get,set,group);
  }
  function dropdown(id,label,description,getItems,getValue,setValue,group='garbage_time',gameOnly=false) {
    let items=[];
    add({id,label,description,group,type:OptionType.Dropdown,
      initListener(info) { items=getItems();info.dropdownItems=items.map(v=>({label:v.label}));info.selectedItemIndex=Math.max(0,items.findIndex(i=>i.value===getValue()));info.isDisabled=gameOnly&&!sessions.available(); },
      updateListener(info,value) { const index=Number(value);if(active&&items[index]) {setValue(items[index].value);info.selectedItemIndex=index;} }
    });
  }
  function register() {
    entries=[];
    checkbox('military','军事垃圾时间','开启后自动集结并休眠；装载单位随指挥官一起移动。仅当前存档、当前时代生效。',()=>state.military,v=>state.military=v,true);
    dropdown('military-mode','军事集结方式','两种方式互斥。城市中心满员时使用该城其他可通行地块。',()=>[
      {label:'就近进入自己的城市并休眠',value:'nearest'}, {label:'集合到指定城市并休眠',value:'rally'}
    ],()=>config.militaryMode,v=>config.militaryMode=v);
    dropdown('rally-city','指定集结城市','指定模式需要选择目标。城市丢失后暂停集结。',()=>[
      {label:'请选择集结城市',value:''}, ...(sessions.available()?Players.get(GameContext.localPlayerID).Cities.getCities().map(c=>({label:Locale.compose(c.name),value:cityKey(c)})):[])
    ],()=>state.rallyCity,v=>state.rallyCity=v,'garbage_time',true);
    checkbox('treasure','宝藏船垃圾时间','自动返回最近可达的本土定居点，进入本土定居点范围后自动兑现宝藏。',()=>state.treasure,v=>state.treasure=v,true);
    checkbox('religion','宗教垃圾时间','传教士前往最近可达、尚未信奉本宗教的定居点，并在可用时传播宗教。',()=>state.religion,v=>state.religion=v,true);
    checkbox('technology','科技垃圾时间','当前研究完成后自动选择未完成科技；优先普通科技与精通，最后研究未来科技。',()=>state.technology,v=>state.technology=v,true);
    checkbox('culture','文化垃圾时间','当前研究完成后自动选择未完成市政，包括可用的文明专属市政。',()=>state.culture,v=>state.culture=v,true);
    checkbox('resources','资源分配垃圾时间','每个己方回合按资源规划 Mod 记住的定居点倾向自动分配一次；无需打开资源面板，锁定时等待解锁。需要启用资源规划 Mod。',()=>state.resources,v=>state.resources=v,true);
    checkbox('resource-camels','资源自动分配：包含骆驼','允许资源规划 Mod 使用骆驼扩充资源槽。默认关闭。',()=>config.resourceOptions.camels,v=>config.resourceOptions.camels=v);
    checkbox('resource-assigned','资源自动分配：包含已分配资源','允许资源规划 Mod 重新调配已分配资源。默认关闭时只填充空闲资源。',()=>config.resourceOptions.assigned,v=>config.resourceOptions.assigned=v);
    for(const [key,label] of [['own','本国'],['cityStates','城邦'],['foreign','其他国家']]) checkbox('religion-'+key,label,'宗教垃圾时间允许前往的定居点范围。三个范围独立；默认只选择本国。',()=>config.religionTargets[key],v=>config.religionTargets[key]=v,false,'garbage_religion');
    stepper('happiness','净快乐度必须高于','只有预计分配后的每回合净快乐度严格大于该值，才会自动分配人口。低于或等于此值时在右下角提醒。',()=>config.minHappiness,v=>config.minHappiness=v,-100,100);
    const labels={gold:'金币',food:'粮食',science:'科研',culture:'文化',production:'生产力',happiness:'笑脸（负幸福度时）'};
    for(const key of YIELDS) stepper('weight-'+key,labels[key]+'权重',key==='happiness'?'当前定居点每回合净幸福度为负时使用此权重，默认 8；为正或为 0 时折算权重固定为 0。原有最低快乐度门槛仍须满足。':'每增加 1 点该产出折算的分值。人口选择净收益总分最高的合法地块；项目始终选科研、文化权重较高且可用的一项，同分优先科研。',()=>config.weights[key],v=>config.weights[key]=v,0,100);
    add({id:'reset',label:'恢复垃圾时间默认设置',description:'关闭本页自动化；恢复 1 / 2 / 4 / 4 / 4 / 8 和快乐度阈值 0。定居点独立开关保持原值。确认变更后生效。',group:'garbage_weights',type:OptionType.Editor,caption:'恢复本页默认',activateListener(){
      config=normalizeConfig();state={...state,...normalizeSession(),cities:state.cities,projects:state.projects,orders:state.orders};
      for(const e of entries){e.initListener?.(e);e.forceRender?.();}return true;
    }});
  }
  function wrap(name,before,after) {
    const previous=Options[name];
    const wrapper=function(...args){if(active)before?.(args);const result=previous.apply(this,args);if(active)after?.(args);return result;};
    Options[name]=wrapper; if(Options[name]!==wrapper)throw new Error('无法接入原版设置：'+name);
    hooks.push(()=>{if(Options[name]===wrapper)Options[name]=previous;});
  }
  function persist() {
    if(JSON.stringify({config,state})===baseline)return;
    try {
      config=store.save(config);
      if(sessions.available())state=sessions.save(state);
      baseline=JSON.stringify({config,state});
      window.dispatchEvent(new CustomEvent('garbage-time-settings-applied'));
    } catch(error){notifyError(error);throw error;}
  }
  function dispose(){active=false;hooks.reverse().forEach(f=>f());for(const e of entries)if(Options.data.get(e.id)===e)Options.data.delete(e.id);}
  reload();
  wrap('init',reload,register);
  wrap('commitOptions',args=>{if(args[0]==null||args[0]==='configuration')persist();});
  wrap('restore',args=>{if(args[0]==null||args[0]==='configuration')reload();});
  if(Options.data.size)register();
  globalThis.__civ7GarbageOptions={dispose};
  console.warn('[Garbage Time] Additional Content settings 0.1.4 loaded');
}
engine.whenReady.then(install).catch(e=>console.error('[Garbage Time] Settings load failed: '+String(e)));
