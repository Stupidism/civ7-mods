import {pathToFileURL} from 'node:url';
// Runtime-neutral lifecycle, injected in tests. Only declaratively discovered
// modules may load. UI requests never supply an executable or module path.
export function createExtensionHost({catalog,load=entry=>import(pathToFileURL(entry)),context={}}) {
  const running=new Map(), errors=new Map(), failed=new Map();let stopped=false, chain=Promise.resolve();
  const serial=fn=>{const p=chain.then(fn);chain=p.catch(()=>{});return p;};
  const validId=id=>typeof id==='string'&&/^[a-z][a-z0-9-]{2,79}$/.test(id);
  async function close(id){const record=running.get(id);if(!record)return;await record.instance.close();running.delete(id);}
  return {
    sync(registrations) {return serial(async()=>{
      if(stopped)return;
      if(!Array.isArray(registrations)||registrations.length>128)throw Error('invalid-registration-list');
      const wanted=new Map();for(const r of registrations){if(!validId(r.id)||wanted.has(r.id)||typeof r.enabled!=='boolean')throw Error('invalid-registration');wanted.set(r.id,r);}
      for(const id of running.keys())if(!wanted.get(id)?.enabled)await close(id);
      for(const [id,r] of wanted){
        if(!r.enabled){errors.delete(id);failed.delete(id);continue;}
        const spec=catalog.get(id);if(!spec||spec.error){errors.set(id,spec?.error??'not-installed');continue;}
        const signature=JSON.stringify(r.settings??{});
        if(failed.get(id)===signature)continue;
        try{
          const current=running.get(id);
          if(current&&current.signature!==signature){await close(id);}
          if(!running.has(id)){
            const module=await load(spec.entry);
            if(typeof module.createExtension!=='function')throw Error('invalid-extension-interface');
            const instance=await module.createExtension(Object.freeze({...context,root:spec.root,settings:structuredClone(r.settings??{})}));
            if(!instance||typeof instance.close!=='function'||typeof instance.request!=='function'){await instance?.close?.();throw Error('invalid-extension-interface');}
            running.set(id,{instance,signature});
          }
          errors.delete(id);failed.delete(id);
        }catch(error){errors.set(id,error.message);failed.set(id,signature);}
      }
    });},
    request(id,method,payload){return serial(async()=>{
      if(stopped||!running.has(id))throw Error('extension-disabled');
      if(typeof method!=='string'||method.length>100)throw Error('invalid-method');
      return running.get(id).instance.request(method,payload);
    });},
    async status(){const result={};for(const [id,spec] of catalog){const r=running.get(id);let detail;try{detail=await r?.instance.status?.();}catch{detail={error:'status-unavailable'};}result[id]={state:r?'running':errors.has(id)?'error':'disabled',error:errors.get(id)??spec.error,...(detail?{detail}:{})};}return result;},
    close(){return serial(async()=>{stopped=true;const failures=[];for(const id of [...running.keys()].reverse())try{await close(id);}catch(e){failures.push(e);}if(failures.length)throw new AggregateError(failures,'extension-shutdown-failed');});},
  };
}
