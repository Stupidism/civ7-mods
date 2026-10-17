import {createResourceModel,finishResourceRun} from './resource-model.js';
let modules;
export async function runResourcePlanner(guard, options) {
  if(Players.get(GameContext.localPlayerID)?.Resources?.isResourceAssignmentLocked())
    return {retry:true,message:'本回合资源分配已锁定，等待解锁'};
  // Optional integration: other automation remains usable without this mod.
  modules ??= Promise.all([
    import('/core/vendor/solid-js/dist/solid.js'),
    import('/civ7-resource-planner/ui/rp-settings.js'),
    import('/civ7-resource-planner/ui/rp-controller.js')
  ]);
  let loaded;
  try {loaded=await modules;}catch{throw new Error('请启用资源规划 Mod（civ7-resource-planner）后使用资源分配垃圾时间');}
  if(!guard())return;
  const [{createRoot},{readSettings},{createPlanner}]=loaded;
  let dispose, planner;
  const cleanup=()=>{const current=dispose;dispose=null;current?.();};
  try {
    createRoot(cleanup=>{
      dispose=cleanup;
      planner=createPlanner(createResourceModel(Players.get(GameContext.localPlayerID),GameInfo,readSettings().preferences));
      planner.setCamels(options.camels);planner.setAssigned(options.assigned);
    });
    if(!guard())return;
    planner.run();
    return await finishResourceRun(planner,cleanup,guard,()=>{
      const id=GameContext.localPlayerID,type=PlayerOperationTypes.CONSIDER_ASSIGN_RESOURCE;
      if(Game.PlayerOperations.canStart(id,type,{},false).Success)Game.PlayerOperations.sendRequest(id,type,{});
    },()=>new Promise(resolve=>setTimeout(resolve,80)));
  } finally {cleanup();}
}
