// Resource identity and sequential quick operations, independent of input device.
export const sameResource=(a,b)=>a.resourceValue===b.resourceValue&&!!a.isOffMap===!!b.isOffMap;
const sameCity=(a,b)=>a?.id===b?.id&&a?.owner===b?.owner&&a?.type===b?.type;
export function resourcePool(data,resource){
  function matchingCopies(slots) {
    const selected=slots.find(r=>sameResource(r,resource));
    if(!selected || selected.resourceProps?.isDamaged)return [];
    return slots.filter(r=>r.resourceType===selected.resourceType && !r.resourceProps?.isDamaged);
  }
  for(let index=0;index<data.slottedResourceSectionData.length;index++){
    if(resource.cityID){
      const city=data.slottedResourceSectionData[index].cityResources.find(c=>sameCity(c.cityID,resource.cityID));
      if(city)return {index,resources:matchingCopies(city.slottedResources)};
    }else{
      for(const section of data.availableResourceSectionData[index]?.subSections||[]){
        const selected=section.resourceSlotData.find(r=>sameResource(r,resource));
        if(selected)return {index,resources:matchingCopies(section.resourceSlotData)};
      }
    }
  }
  return {index:0,resources:[]};
}
export function createResourceActions({read,request,swap,onSwapConfirmed,context,allowed,onState,wait=()=>new Promise(r=>setTimeout(r,50)),now=()=>Date.now()}){
  let running=false,generation=0;
  const assignedTo=(resource,cityID)=>read().slottedResourceSectionData.some(section=>section.cityResources.some(city=>
    (!cityID||sameCity(city.cityID,cityID))&&city.slottedResources.some(r=>sameResource(r,resource))));
  async function run(resource,target,mode='move'){
    if(running||!allowed())return;
    running=true;const token=++generation,origin=context();let completed=0;
    const valid=()=>token===generation&&origin===context()&&allowed();
    onState(true,'QUICK_WORKING',0);
    try{
      const pool=resourcePool(read(),resource);
      const resources=(mode==='remove-one'?pool.resources.filter(r=>sameResource(r,resource)):pool.resources).map(r=>({...r}));
      const targets=mode==='fill'?read().slottedResourceSectionData[pool.index].cityResources.map(c=>c.cityID):[target];
      for(const cityID of targets){
        for(const item of resources){
          if(!valid())throw Error('QUICK_CANCELLED');
          const remove=mode.startsWith('remove');
          const destination=remove?resource.cityID:cityID;
          if(!destination)break;
          // Another action may have moved this resource since the pool snapshot.
          if(!resourcePool(read(),{...item,cityID:resource.cityID}).resources.some(r=>sameResource(r,item)))continue;
          if(!request(item,destination,remove))break;
          const deadline=now()+8000;
          while(remove?assignedTo(item):!assignedTo(item,destination)){
            if(!valid())throw Error('QUICK_CANCELLED');
            if(now()>=deadline)throw Error('QUICK_TIMEOUT');
            await wait();
          }
          completed++;
          onState(true,'QUICK_WORKING',completed);
        }
        if(completed)break; // Quick fill targets one settlement, as middle-click does.
      }
      onState(false,completed?'QUICK_DONE':'NO_CHANGES',completed);
    }catch(error){
      onState(false,['QUICK_CANCELLED','QUICK_TIMEOUT'].includes(error.message)?error.message:'QUICK_FAILED',completed);
    }finally{running=false;}
  }
  // One exchange owns the same queue as bulk moves. Every mutation is confirmed
  // before the next; cancellation never silently rolls back completed changes.
  async function replace(incoming, outgoing) {
    if(running||!allowed()||!outgoing.cityID||sameResource(incoming,outgoing)||sameCity(incoming.cityID,outgoing.cityID))return;
    incoming={...incoming};outgoing={...outgoing};
    const exists=r=>resourcePool(read(),r).resources.some(x=>sameResource(x,r));
    if(!exists(incoming)||!exists(outgoing))return;
    running=true;const token=++generation,origin=context();let completed=0;
    const valid=()=>token===generation&&origin===context()&&allowed();
    const check=()=>{if(!valid())throw Error('QUICK_CANCELLED');};
    async function confirmed(predicate) {
      const deadline=now()+8000;
      while(!predicate()) {check();if(now()>=deadline)throw Error('QUICK_TIMEOUT');await wait();}
      check();completed++;onState(true,'QUICK_WORKING',completed);
    }
    onState(true,'QUICK_WORKING',0);
    try {
      check();
      if(swap?.(incoming,outgoing)) {
        await confirmed(()=>assignedTo(incoming,outgoing.cityID) &&
          (incoming.cityID?assignedTo(outgoing,incoming.cityID):!assignedTo(outgoing)));
        onSwapConfirmed?.(incoming,outgoing);
      } else {
        // A two-way swap may be illegal only because the outgoing resource cannot
        // return to the source. Free the destination, then check the incoming move.
        check();if(!request(outgoing,outgoing.cityID,true))throw Error('QUICK_FAILED');
        await confirmed(()=>!assignedTo(outgoing));
        check();
        if(!exists(incoming)||!request(incoming,outgoing.cityID,false)) {
          // Incoming stayed put. Restore only the resource displaced by this try.
          check();
          if(request(outgoing,outgoing.cityID,false))await confirmed(()=>assignedTo(outgoing,outgoing.cityID));
          throw Error('QUICK_FAILED');
        }
        await confirmed(()=>assignedTo(incoming,outgoing.cityID));
        check();
        if(incoming.cityID&&request(outgoing,incoming.cityID,false)) {
          await confirmed(()=>assignedTo(outgoing,incoming.cityID));
        }
        // Otherwise outgoing deliberately remains unassigned.
      }
      onState(false,'QUICK_DONE',completed);
    } catch(error) {
      onState(false,['QUICK_CANCELLED','QUICK_TIMEOUT'].includes(error.message)?error.message:'QUICK_FAILED',completed);
    } finally {running=false;}
  }
  return {run,replace,busy:()=>running,cancel(){generation++;}};
}
