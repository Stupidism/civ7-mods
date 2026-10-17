// Resource Planner only needs the available-resource list and sort accessors.
// A full commerce-screen model acknowledges resource assignment on cleanup,
// even when interrupted. Keep background planning independent of that UI action.
export function createResourceModel(player, info, preferences={}) {
  const key=r=>`${r.isOffMap?'off':'plot'}:${r.value}`;
  const assigned=new Set(player.Cities.getCities().flatMap(c=>c.Resources?.getAssignedResources()??[]).map(key));
  const slots=player.Resources.getResources().filter(r=>{
    const def=info.Resources.lookup(r.uniqueResource.resource);
    return def && !assigned.has(key(r)) && !['RESOURCECLASS_EMPIRE','RESOURCECLASS_TREASURE'].includes(def.ResourceClassType);
  }).map(r=>({resourceValue:r.value,isOffMap:!!r.isOffMap}));
  let sort=preferences.sort??13,direction=preferences.direction??-1;
  return {
    data:{resourceTabData:{availableResourceSectionData:[{subSections:[{resourceSlotData:slots}]}]}},
    selectedSettlementSortType:()=>sort,selectedSortDirection:()=>direction,
    setSelectedSettlementSortType:value=>{sort=value;},
    toggleSelectedSortDirection:value=>{direction=value??-direction;},
    deselectSelectedResource(){},onSortResources(){}
  };
}

export async function finishResourceRun(planner,dispose,guard,acknowledge,wait) {
  let aborted=false;
  try {
    while(planner.busy()) {
      if(!guard()&&!aborted){aborted=true;dispose();}
      // Disposing the planner cancels further writes. Wait for its own rollback
      // before releasing the scheduler and before considering an acknowledgement.
      await wait();
    }
    if(aborted||!guard())return;
    const message=planner.status();
    const error=/失败|无法|未确认|未恢复|已撤回/.test(message);
    if(!error)acknowledge();
    return {message,error};
  } finally {dispose();}
}
