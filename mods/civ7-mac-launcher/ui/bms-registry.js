export const STORAGE_KEY='modSettings';
export const NAMESPACE='civ7-better-mod-support-v1';
const validId=id=>typeof id==='string'&&/^[a-z][a-z0-9-]{2,79}$/.test(id);
const copy=value=>JSON.parse(JSON.stringify(value));
export function createRegistry({storage,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}) {
  const entries=new Map(),listeners=new Set(),pending=new Map();let token=null,lastSeen=0,states={},sequence=0;
  const session=now().toString(36)+'-'+Math.random().toString(36).slice(2);
  function shared(){const raw=storage.getItem(STORAGE_KEY);if(!raw)return {};const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid-settings');return value;}
  function read(){const value=shared()[NAMESPACE]??{};if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid-settings');return value;}
  function normalize(spec,value={}){const result={enabled:value.enabled===true,settings:{}};for(const field of spec.settings??[]){const v=value.settings?.[field.id];result.settings[field.id]=field.type==='boolean'?(typeof v==='boolean'?v:field.default):field.choices.some(c=>c.value===v)?v:field.default;}return result;}
  const changed=()=>{for(const listener of listeners)try{listener();}catch(error){console.warn(error);}};
  const api={
    register(spec){
      if(!spec||spec.apiVersion!==1||!validId(spec.id)||typeof spec.title!=='string'||typeof spec.description!=='string'||entries.has(spec.id))throw Error('invalid-or-duplicate-registration');
      if((spec.settings??[]).length>32)throw Error('too-many-settings');
      const seen=new Set();for(const f of spec.settings??[]){if(!/^[a-z][a-z0-9-]{0,39}$/.test(f.id)||seen.has(f.id)||typeof f.label!=='string'||typeof f.description!=='string')throw Error('invalid-setting');seen.add(f.id);if(f.type==='boolean'){if(typeof f.default!=='boolean')throw Error('invalid-default');}else if(f.type==='choice'){if(!Array.isArray(f.choices)||!f.choices.length||f.choices.length>32||f.choices.some(c=>typeof c.value!=='string'||typeof c.label!=='string')||new Set(f.choices.map(c=>c.value)).size!==f.choices.length||!f.choices.some(c=>c.value===f.default))throw Error('invalid-choices');}else throw Error('invalid-setting-type');}
      const owned=copy(spec);entries.set(spec.id,owned);changed();return()=>{if(entries.get(spec.id)===owned){entries.delete(spec.id);changed();}};
    },
    list:()=>[...entries.values()].map(copy),
    preferences(){const saved=read();return Object.fromEntries([...entries].map(([id,spec])=>[id,normalize(spec,saved[id])]));},
    save(values){const saved=read();for(const [id,value] of Object.entries(values)){const spec=entries.get(id);if(!spec)throw Error('unregistered-extension');saved[id]=normalize(spec,value);}const root=shared();root[NAMESPACE]=saved;storage.setItem(STORAGE_KEY,JSON.stringify(root));changed();},
    defaults:()=>Object.fromEntries([...entries].map(([id,spec])=>[id,normalize(spec)])),
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    status(id){return now()-lastSeen<3000&&token?copy(id==null?{state:'connected'}:states[id]??{state:'not-installed'}):{state:'disconnected'};},
    request(extension,method,payload){
      if(!entries.has(extension)||!api.preferences()[extension]?.enabled)return Promise.reject(Error('extension-disabled'));
      if(api.status(extension).state!=='running')return Promise.reject(Error('host-unavailable'));
      if(pending.size>=16)return Promise.reject(Error('too-many-requests'));
      const id=String(++sequence);return new Promise((resolve,reject)=>{const timer=setTimer(()=>{pending.delete(id);reject(Error('request-timeout'));},60000);pending.set(id,{id,extension,method,payload:copy(payload??null),resolve,reject,timer});});
    },
    connect(value,context={}){
      if(!/^[a-f0-9]{64}$/.test(value??''))return null;
      if(token&&token!==value){for(const p of pending.values()){clearTimer(p.timer);p.reject(Error('host-restarted'));}pending.clear();}
      token=value;lastSeen=now();return {session,...context,registrations:Object.entries(api.preferences()).map(([id,p])=>({id,...p})),requests:[...pending.values()].map(({id,extension,method,payload})=>({id,extension,method,payload}))};
    },
    receive(value,status,responses){if(!token||value!==token)return;lastSeen=now();states=status;for(const r of responses){const p=pending.get(r.id);if(!p)continue;pending.delete(r.id);clearTimer(p.timer);if(r.error){const error=Error(r.error);error.content=r.content;p.reject(error);}else p.resolve(r.result);}changed();},
    dispose(){for(const p of pending.values()){clearTimer(p.timer);p.reject(Error('context-closed'));}pending.clear();listeners.clear();entries.clear();token=null;},
  };return api;
}
