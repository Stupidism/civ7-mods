// In-memory, turn-scoped intent. No save/settings writes or resource operations.
export function createDeferralState(scope) {
  let token, value=null;
  const sync=()=>{const next=scope();if(next!==token){token=next;value=null;}return value;};
  return {mode:sync,pending:()=>sync()==='deferred',defer(){sync();value='deferred';},dismiss(){sync();value='closed';},reset(){token=undefined;value=null;}};
}
export function wrap(target,name,around) {
  const previous=target[name];let disposed=false;
  const hook=function(...args){const next=()=>previous.apply(this,args);return disposed?next():around.call(this,next,...args);};
  target[name]=hook;
  return ()=>{disposed=true;if(target[name]===hook)target[name]=previous;};
}
// Delay short Cancel until release; long Cancel never leaks a second close.
export function createHold({allowed,scope,short,long,now=()=>performance.now()}) {
  let press;
  return {cancel(){if(press)press.cancelled=true;},input(phase){
    if(phase==='start'){if(press)return true;if(!allowed())return false;press={scope:scope(),at:now()};return true;}
    if(!press)return false;
    if(!allowed()||scope()!==press.scope)press.cancelled=true;
    if(phase==='finish'){const p=press;press=undefined;if(!p.cancelled)(now()-p.at>=1000?long:short)();}
    return true;
  }};
}
