// Once per local turn, including across saves. The runner owns and cleans up
// its temporary Resource Planner model; no resource UI needs to be open.
export function createResourceAutomation({run, getSession, saveSession, context, canRun, blocked, ready=()=>true, report}) {
  let disposed=false, pending=null, attempted='';
  const status={phase:'off',message:'',turn:null};
  function tick() {
    const state=getSession(), current=context(), key=`${current.scope}:${current.turn}`;
    if(disposed || !state.resources){status.phase='off';return;}
    if(!canRun() || blocked())return;
    if(pending || attempted===key || state.resourceTurn===current.turn)return;
    if(!ready()){Object.assign(status,{phase:'waiting',message:'本回合资源分配已锁定，等待解锁',turn:current.turn});return;}
    attempted=key;
    const token={key};pending=token;
    const guard=()=>!disposed && pending===token && getSession().resources && canRun() &&
      !blocked() && context().scope===current.scope && context().turn===current.turn;
    Object.assign(status,{phase:'running',message:'正在按定居点倾向分配资源',turn:current.turn});
    Promise.resolve().then(()=>guard()?run(guard):null).then(result=>{
      if(!guard())return;
      if(result?.retry){attempted='';Object.assign(status,{phase:'waiting',message:result.message});return;}
      const latest=getSession();saveSession({...latest,resourceTurn:current.turn});
      Object.assign(status,{phase:result?.error?'error':'done',message:result?.message??'本回合资源分配已完成'});
    }).catch(error=>{
      if(guard()){Object.assign(status,{phase:'error',message:String(error.message??error)});report('资源分配',error);}
    }).finally(()=>{if(pending===token)pending=null;});
  }
  return {tick,status,get busy(){return !!pending;},dispose(){disposed=true;pending=null;}};
}
