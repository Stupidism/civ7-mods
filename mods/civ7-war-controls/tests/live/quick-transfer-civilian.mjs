// 原生实机验收：仅在已完整备份、隔离读档且持有游戏锁时执行。
// 不替换原生合法性、单位或完成事件。inspect 只读；run 消耗正常移动力。
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {evaluate} from '../../../fenhe/tools/cdp.mjs';
const args=process.argv.slice(2), mode=args[0]??'inspect';
const option=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const out=option('--out',null);assert(out,'必须指定 --out 证据路径');
const lock=fileURLToPath(new URL('../../../../scripts/game-lock.py',import.meta.url));
function guard(){execFileSync('/usr/bin/python3',[lock,'assert'],{stdio:'pipe'});}
async function ev(code){guard();return evaluate(code,'root-game.html',20000);}
const result={时间:new Date().toISOString(),模式:mode,结论:'未完成'};
const save=()=>writeFileSync(out,JSON.stringify(result,null,2)+'\n');
try {
 result.场景=await ev(`(()=>{if(!Loading.isLoaded||!UI.isInGame()||document.querySelector('.c7r-root')||globalThis.__civ7RestGuardActivityV1)throw Error('前置条件：加载或休息限制未解除');const a=GameInfo.UnitAbilities.lookup('ABILITY_MOVE_AFTER_UNPACKING');const units=Players.get(GameContext.localPlayerID).Units.getUnitIds().map(id=>Units.get(id));const commanders=units.filter(c=>c.isCommanderUnit&&c.Movement.movementMovesRemaining>0&&c.getAbilityCount(a.$hash)>0);return {turn:Game.turn,seed:Configuration.getGame().gameSeed,version:__civ7WarControls.version,config:__civ7WarControls.config,candidates:commanders.flatMap(c=>GameplayMap.getPlotIndicesInRadius(c.location.x,c.location.y,1).flatMap(i=>{const p=GameplayMap.getLocationFromIndex(i),ids=MapUnits.getUnits(p.x,p.y);if(!ids.length||!ids.every(id=>GameInfo.Units.lookup(Units.get(id)?.type)?.FormationClass==='FORMATION_CLASS_CIVILIAN'))return [];return [{commander:c.id,via:c.location,target:p,occupants:ids.map(id=>({id,type:GameInfo.Units.lookup(Units.get(id).type).UnitType,location:Units.get(id).location})),members:Armies.get(c.armyId).getUnitIds(),unpack:Game.UnitCommands.canStart(c.id,'UNITCOMMAND_UNPACK_ARMY',{},false)}]}))};})()`);
 if(mode==='inspect'){result.结论=result.场景.candidates.length?'找到平民占格候选，尚未测试':'场景不满足：没有相邻平民占格候选';save();console.log(JSON.stringify(result));process.exitCode=result.场景.candidates.length?0:2;}
 else {
 assert.equal(mode,'run');const fixture=JSON.parse(readFileSync(option('--fixture',''),'utf8'));assert(fixture.verified&&fixture.files&&fixture.archive&&existsSync(fixture.archive),'必须传入本轮完整备份清单');
 const unit=JSON.parse(option('--unit','null')),commander=JSON.parse(option('--commander','null')),target=JSON.parse(option('--target','null')),source=JSON.parse(option('--source','null'));assert(unit&&commander&&target&&source,'必须指定源单位、指挥官、目标和准备展开格');
 const device=option('--device','mouse');assert(['mouse','controller'].includes(device));result.输入=device;result.输入边界=device==='controller'?'原生输入注入，显式准备地图焦点；不验证实体手柄或自动焦点':'原生地图选择调用链；不验证操作系统鼠标硬件';
 result.结果=await ev(`(async()=>{
 const unit=${JSON.stringify(unit)},commander=${JSON.stringify(commander)},target=${JSON.stringify(target)},source=${JSON.stringify(source)},device=${JSON.stringify(device)};
 const assert=(v,m)=>{if(!v)throw Error(m)},wait=ms=>new Promise(r=>setTimeout(r,ms));const poll=async(f,m)=>{for(let i=0;i<60;i++){if(f())return;await wait(100)}throw Error(m)};
 const {InterfaceMode}=await import('/core/ui/interface-modes/interface-modes.js');const world=(await import('/base-standard/ui/world-input/world-input.js')).default;
 const idmatch=(a,b)=>a&&b&&a.id===b.id&&a.owner===b.owner&&a.type===b.type,locsame=(a,b)=>a.x===b.x&&a.y===b.y;
 const packed=()=>Armies.get(Units.get(commander).armyId).getUnitIds().some(id=>idmatch(id,unit));
 const snap=()=>({unit:{id:unit,location:{...Units.get(unit).location},moves:Units.get(unit).Movement.movementMovesRemaining,packed:packed()},commander:{location:{...Units.get(commander).location},moves:Units.get(commander).Movement.movementMovesRemaining},occupants:MapUnits.getUnits(target.x,target.y).map(id=>({id,location:{...Units.get(id).location},type:GameInfo.Units.lookup(Units.get(id).type).UnitType}))});
 assert(!globalThis.__wcCivilianQA,'重复运行未清理');const civilians=MapUnits.getUnits(target.x,target.y);assert(civilians.length&&civilians.every(id=>GameInfo.Units.lookup(Units.get(id).type)?.FormationClass==='FORMATION_CLASS_CIVILIAN'),'前置条件：目标必须全部为真实平民');
 if(packed()){const q=Game.UnitCommands.canStart(unit,'UNITCOMMAND_REMOVE_FROM_ARMY',{X:source.x,Y:source.y},false);assert(q.Success,'前置条件：无法合法准备展开单位');Game.UnitCommands.sendRequest(unit,'UNITCOMMAND_REMOVE_FROM_ARMY',{X:source.x,Y:source.y});await poll(()=>!packed(),'准备展开超时');}
 assert(locsame(Units.get(unit).location,source),'展开位置不符');assert(Units.get(unit).Movement.movementMovesRemaining>=1,'前置条件：单位移动力耗尽');assert(!Units.get(unit).isEmbarked,'前置条件：不能用已登船单位测试陆军转移');assert(Units.get(unit).Combat.isCombat,'前置条件：源单位须为军队');assert(Units.getReachableTargets(unit).length===0,'前置条件：附近有优先攻击目标，不能当作快速转移失败');
 if(!${args.includes('--prepared')}) { Input.setActiveDeviceType(device==='mouse'?InputDeviceType.Mouse:InputDeviceType.Controller);engine.trigger('input-source-changed',device==='mouse'?InputDeviceType.Mouse:InputDeviceType.Controller,InputDeviceLayout.XBox);InterfaceMode.switchToDefault();UI.Player.deselectAllUnits();UI.Player.selectUnit(unit);Camera.lookAtPlot(target);await wait(1800); }
 const before=snap(),events=[],requests=[],queries=[],plots=[];const original=Game.UnitCommands.sendRequest,can=Game.UnitCommands.canStart,op=Game.UnitOperations.sendRequest,selected=world.handleSelectedPlot;const selectPlot=function(p,...a){plots.push({...p});assert(locsame(p,target),'测试输入：实际选择格与目标不一致');return selected.call(this,p,...a)};const handlers=[];
 for(const name of ['UnitAddedToArmy','UnitRemovedFromArmy']){const fn=e=>events.push({name,event:e,at:Date.now()});engine.on(name,fn);handlers.push([name,fn]);}
 const send=function(...a){requests.push({kind:'command',id:a[0],type:a[1],args:a[2],at:Date.now()});return original.apply(this,a)};
 const operation=function(...a){requests.push({kind:'operation',id:a[0],type:a[1],args:a[2],at:Date.now()});return op.apply(this,a)};
 const query=function(...a){const r=can.apply(this,a);queries.push({id:a[0],type:a[1],args:a[2],result:r,at:Date.now()});return r};
 world.handleSelectedPlot=selectPlot;globalThis.__wcCivilianQA=true;Game.UnitCommands.sendRequest=send;Game.UnitCommands.canStart=query;Game.UnitOperations.sendRequest=operation;
 try {
 if(device==='mouse')world.handleSelectedPlot(target,null);
 else {const PlotCursor=(await import('/core/ui/input/plot-cursor.js')).default;const {ContextManager}=await import('/core/ui/context-manager/context-manager.js');const {InputEngineEvent}=await import('/core/ui/input/input-support.js');const focus=(await import('/core/ui-next/services/focus-manager.js')).FocusManager.get();focus.clearFocus();PlotCursor.plotCursorCoords=target;await wait(300);assert(locsame(PlotCursor.plotCursorCoords,target),'测试输入：光标尚未稳定在目标格');for(const status of [InputActionStatuses.START,InputActionStatuses.FINISH]){ContextManager.handleInput(new InputEngineEvent('accept',status,0,0,false,false));await wait(100);}}
 await poll(()=>events.some(e=>e.name==='UnitRemovedFromArmy'&&idmatch(e.event.secondaryUnit,unit))||requests.some(r=>r.type==='UNITCOMMAND_ADD_TO_ARMY')&&queries.some(q=>q.type==='UNITCOMMAND_REMOVE_FROM_ARMY'&&!q.result.Success),'未发生加入/部署或原生拒绝');await wait(400);
 return {before,after:snap(),events,requests,queries,plots,turn:Game.turn};
 } catch(e){return {error:String(e),before,after:snap(),events,requests,queries,plots,turn:Game.turn}}
 finally {if(world.handleSelectedPlot===selectPlot)world.handleSelectedPlot=selected;if(Game.UnitCommands.sendRequest===send)Game.UnitCommands.sendRequest=original;if(Game.UnitCommands.canStart===query)Game.UnitCommands.canStart=can;if(Game.UnitOperations.sendRequest===operation)Game.UnitOperations.sendRequest=op;for(const [n,f]of handlers)engine.off(n,f);delete globalThis.__wcCivilianQA;}
 })()`);
 const r=result.结果;assert(!r.error,r.error);const add=r.requests.filter(x=>x.type==='UNITCOMMAND_ADD_TO_ARMY'),remove=r.requests.filter(x=>x.type==='UNITCOMMAND_REMOVE_FROM_ARMY');const match=(a,b)=>a?.id===b.id&&a?.owner===b.owner&&a?.type===b.type;const joined=r.events.filter(e=>e.name==='UnitAddedToArmy'&&match(e.event.secondaryUnit,unit)&&match(e.event.initiatingUnit,commander)),deployed=r.events.filter(e=>e.name==='UnitRemovedFromArmy'&&match(e.event.secondaryUnit,unit)&&match(e.event.initiatingUnit,commander));assert.equal(joined.length,1,'应收到一次真实加入事件');assert.equal(deployed.length,1,'应收到一次真实移出事件');assert(joined[0].at<=deployed[0].at,'加入事件必须先于部署完成');assert.equal(add.length,1,'应恰好加入一次');assert.equal(remove.length,1,'应恰好部署一次');assert.equal(r.requests.filter(x=>x.kind==='operation').length,0,'不得发出步行等操作');assert.deepEqual(r.after.unit.location,target);assert.equal(r.after.unit.packed,false);assert.equal(r.after.unit.moves,r.before.unit.moves-1);assert.deepEqual(r.after.commander,r.before.commander);for(const c of r.before.occupants)assert(r.after.occupants.some(x=>x.id.id===c.id.id&&x.id.owner===c.id.owner&&JSON.stringify(x.location)===JSON.stringify(c.location)),'平民必须保持原位');assert.equal(r.turn,result.场景.turn);result.结论='通过：真实加入、部署、位置、移动力和平民原位断言通过';save();console.log(result.结论);
 }
} catch(error){result.结论='未通过或场景阻塞';result.错误=String(error);save();console.error(error);process.exitCode=1;}
