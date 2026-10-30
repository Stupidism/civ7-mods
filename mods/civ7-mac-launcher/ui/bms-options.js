export const CATEGORY='enhanced-mods';
export function installEnhancedOptions({options,types,categories,registry,statusLabel}) {
  const hooks=[],owned=new Map();let draft={},saved={},active=true;
  const category={title:'LOC_BMS_TAB',description:'LOC_BMS_TAB_DESCRIPTION'};
  if(categories[CATEGORY])throw Error('enhanced-category-conflict');categories[CATEGORY]=category;
  function reload(){saved=registry.preferences();draft=JSON.parse(JSON.stringify(saved));}
  function commit(){const changes={};for(const [id,value]of Object.entries(draft))if(JSON.stringify(value)!==JSON.stringify(saved[id]))changes[id]=value;if(Object.keys(changes).length){registry.save(changes);reload();}}
  function add(entry){options.addOption(entry);owned.set(entry.id,entry);}
  function register(){
    for(const [id,e]of owned)if(options.data.get(id)===e)options.data.delete(id);owned.clear();
    add({id:'bms-host-status',category:CATEGORY,group:'bms-status',type:types.Editor,label:'LOC_BMS_CONNECTION',description:'LOC_BMS_CONNECTION_DESCRIPTION',caption:statusLabel(),activateListener(){return true;}});
    for(const spec of registry.list()){
      draft[spec.id]??=registry.preferences()[spec.id];saved[spec.id]??=JSON.parse(JSON.stringify(draft[spec.id]));
      const common={category:CATEGORY,group:spec.id};
      add({...common,id:`bms-${spec.id}-enabled`,type:types.Switch,label:spec.title,description:spec.description,
        initListener(info){info.currentValue=draft[spec.id].enabled;},updateListener(info,value){if(typeof value==='boolean'){draft[spec.id].enabled=value;info.currentValue=value;}}});
      add({...common,id:`bms-${spec.id}-status`,type:types.Editor,label:'LOC_BMS_STATE',description:'LOC_BMS_STATE_DESCRIPTION',caption:statusLabel(spec.id),activateListener(){return true;}});
      for(const field of spec.settings??[]){const choices=field.choices;add({...common,id:`bms-${spec.id}-${field.id}`,type:choices?types.Dropdown:types.Switch,label:field.label,description:field.description,...(choices?{dropdownItems:choices.map(c=>({label:c.label}))}:{}),
        initListener(info){if(choices)info.selectedItemIndex=choices.findIndex(c=>c.value===draft[spec.id].settings[field.id]);else info.currentValue=draft[spec.id].settings[field.id];},
        updateListener(info,value){if(choices){if(!Number.isInteger(value)||!choices[value])return;draft[spec.id].settings[field.id]=choices[value].value;info.selectedItemIndex=value;}else if(typeof value==='boolean'){draft[spec.id].settings[field.id]=value;info.currentValue=value;}},
      });}
    }
  }
  function wrap(name,before,after){const previous=options[name];const wrapper=function(...args){if(active)before?.(args);const result=previous.apply(this,args);if(active)after?.(args);return result;};options[name]=wrapper;hooks.push({name,previous,wrapper});}
  const configuration=args=>args[0]==null||args[0]==='configuration';
  reload();wrap('init',reload,register);wrap('commitOptions',args=>{if(configuration(args))commit();});wrap('restore',args=>{if(configuration(args))reload();});wrap('resetOptionsToDefault',()=>{draft=registry.defaults();commit();});
  if(options.data.size)register();
  // Registrations can arrive after the framework. Rebuild only when the set
  // changes; host heartbeats update captions without discarding pending drafts.
  let ids=registry.list().map(s=>s.id).join(',');
  const unsubscribe=registry.subscribe(()=>{const next=registry.list().map(s=>s.id).join(',');if(next!==ids){ids=next;if(options.data.size)register();}else for(const [id,e]of owned)if(id.endsWith('-status')){const nextLabel=statusLabel(id==='bms-host-status'?undefined:e.group);if(e.caption!==nextLabel){e.caption=nextLabel;e.forceRender?.();}}});
  return {dispose(){active=false;unsubscribe();for(const h of hooks)if(options[h.name]===h.wrapper)options[h.name]=h.previous;for(const [id,e]of owned)if(options.data.get(id)===e)options.data.delete(id);if(categories[CATEGORY]===category)delete categories[CATEGORY];}};
}
