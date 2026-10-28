import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture, REMOVE, ATTACK, REINFORCE} from './game-fixture.mjs';
const FOCUS='INTERFACEMODE_FOCUSED_ATTACK_LAND_RANGED';
function soldier(f,id,x=0,extra={}) {
 const unit={...f.state.unit,id:{owner:0,id,type:26},location:{x,y:0},Movement:{movementMovesRemaining:2},Combat:{isCombat:true,attacksRemaining:1},...extra};
 f.state.units.set(id,unit);return unit;
}
function deploy(f) {
 f.context.Game.UnitCommands.sendRequest(f.id,REMOVE,{X:2,Y:0});
 f.state.members=f.state.members.filter(id=>id.id!==f.id.id);
 f.state.unit.location={x:2,y:0};
 f.emit('UnitRemovedFromArmy',{initiatingUnit:f.id});f.tick();f.flush();
}
async function battlefield(config, nativeDefaults = false) {
 const f=await fixture(nativeDefaults ? config : {...config,mouse:{focusNoMove:true,focusFarFirst:true,focusExclude:true,...config?.mouse}});f.unpack();
 f.state.operations.set(ATTACK,{Success:true,Plots:[5],Modifiers:[1]});
 f.state.atPlot.set(5,[{owner:1,id:90,type:26}]);
 f.state.reachable=[5];
 return f;
}
function target(f) {f.state.mode=FOCUS;f.nativeModes.get(FOCUS).decorateHover({x:5,y:0});}
const framePlots=f=>f.state.formationFrames.map(vfx=>vfx[1].x);
const filledPlots=f=>f.state.tacticalOverlays.filter(o=>o.style.fillColor.y>0.5).flatMap(o=>o.plots);
function fire(f) {target(f);f.nativeModes.get(FOCUS).selectPlot({x:5,y:0});}
function click(f,label) {
 const panel=f.state.elements.filter(e=>e.className?.includes('war-controls-tactical')&&!e.removed).at(-1);
 const button=panel?.children.find(e=>e.attrs.caption===label);
 assert.ok(button,'missing button '+label);button.events['action-activate']({stopPropagation(){}});
}
function finished(f,id) { f.emit('Combat',{attacker:id});f.emit('UnitOperationDeactivated',{unit:id,data1:0});f.flush(); }

test('default focus preview delegates the actual shot to native commander focus fire',async()=>{
 const f=await battlefield(undefined,true);target(f);
 assert.ok(f.state.formationFrames.length);assert.equal(f.state.requests.length,0);
 fire(f);assert.deepEqual(f.state.requests.map(r=>r.type),['UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED']);
 assert.equal(f.state.requests[0].id.id,f.state.commander.id.id);
 assert.equal(f.state.formationFrames.length,0);assert.equal(f.state.costRequests,undefined);
});
test('default manual exclusion is inactive and preview-off also retains native focus fire',async()=>{
 const f=await battlefield(undefined,true);target(f);const h=f.nativeModes.get(FOCUS);
 h.selectPlot(f.state.unit.location);assert.deepEqual(filledPlots(f),[0]);
 const cfg=f.state.settings.getConfig();cfg.mouse.focusPreview=false;f.state.settings.save(cfg);
 fire(f);assert.equal(f.state.requests[0].type,'UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED');
});
test('no-movement alone filters moving shots without imposing farthest-first order',async()=>{
 const f=await battlefield({mouse:{focusNoMove:true}},true);f.state.unit.location={x:4,y:0};soldier(f,8,0);soldier(f,9,2);
 f.state.operations.set(ATTACK,(id,args)=>args.X!==undefined?{Success:true}:{Success:true,Plots:[5],Modifiers:[id.id===9?0:1]});
 fire(f);finished(f,f.id);assert.deepEqual(f.state.requests.map(r=>r.id.id),[7,8]);
 assert.ok(f.state.requests.every(r=>r.args.Modifiers===undefined));
});
test('farthest-first alone uses native attack movement flags and does not impose stationary filtering',async()=>{
 const f=await battlefield({mouse:{focusFarFirst:true}},true);f.state.unit.location={x:4,y:0};soldier(f,8,0);
 f.state.operations.set(ATTACK,(_id,args)=>args.X!==undefined?{Success:true}:{Success:true,Plots:[5],Modifiers:[0]});
 fire(f);assert.equal(f.state.requests[0].id.id,8);finished(f,{owner:0,id:8,type:26});
 assert.deepEqual(f.state.requests.map(r=>r.id.id),[8,7]);assert.ok(f.state.requests.every(r=>r.args.Modifiers===3));
});
test('manual exclusion alone omits the clicked unit and permits native attack movement',async()=>{
 const f=await battlefield({mouse:{focusExclude:true}},true);const excluded=soldier(f,8,3);soldier(f,9,4);
 target(f);f.nativeModes.get(FOCUS).selectPlot(excluded.location);fire(f);finished(f,f.id);
 assert.deepEqual(f.state.requests.map(r=>r.id.id),[7,9]);assert.ok(f.state.requests.every(r=>r.args.Modifiers===3));
});
test('moving ranged shots cannot fall through into melee or an illegal move',async()=>{
 const f=await battlefield({mouse:{focusFarFirst:true}},true);f.context.Game.Combat.testAttackInto=()=>0;
 fire(f);assert.equal(f.state.requests.length,0);assert.equal(f.state.moves.length,0);
});
for(const profile of ['mouse','gamepad']) for(const bits of [0,1,2,3,4,5,6,7]) test(`focus options are independent for ${profile}: ${bits}`,async()=>{
 const focusNoMove=!!(bits&1),focusFarFirst=!!(bits&2),focusExclude=!!(bits&4);
 const f=await battlefield({[profile]:{focusNoMove,focusFarFirst,focusExclude}},true);f.device(profile==='gamepad');
 f.state.unit.location={x:4,y:0};const far=soldier(f,8,0);const omitted=soldier(f,9,3);
 const h=f.nativeModes.get(FOCUS);target(f);h.selectPlot(omitted.location);fire(f);
 if(bits===0) {assert.equal(f.state.requests[0].type,'UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED');return;}
 const order=focusFarFirst?[far.id,omitted.id,f.id]:[f.id,far.id,omitted.id];
 const expected=order.filter(id=>!focusExclude||id.id!==omitted.id.id);
 for(let i=0;i<expected.length;i++) {assert.equal(f.state.requests[i].id.id,expected[i].id);finished(f,expected[i]);}
 assert.equal(f.state.requests.length,expected.length);
 assert.ok(f.state.requests.every(r=>focusNoMove?r.args.Modifiers===undefined:r.args.Modifiers===3));
});
test('an exclusion checkbox alone cannot change native fire while its preview prerequisite is off',async()=>{
 const f=await battlefield({mouse:{focusExclude:true,focusPreview:false}},true);fire(f);
 assert.equal(f.state.requests[0].type,'UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED');
});

test('deployment selects the next mobile military unit, skipping scout, civilian and spent soldier',async()=>{
 const f=await fixture();f.state.definitions.set('SCOUT',{CoreClass:'CORE_CLASS_RECON'});
 const scout=soldier(f,8,-9999,{type:'SCOUT'}), civilian=soldier(f,9,-9999,{Combat:{isCombat:false}}),spent=soldier(f,10,-9999,{Movement:{movementMovesRemaining:0}}),ready=soldier(f,11,-9999);
 f.state.members=[f.id,scout.id,civilian.id,spent.id,ready.id];deploy(f);
 assert.equal(f.state.head.id,11);assert.equal(f.state.modes.at(-1).type,REMOVE);
});
test('deployment checks actual legal exit plots, not movement alone',async()=>{
 const f=await fixture();const blocked=soldier(f,8,-9999),ready=soldier(f,9,-9999);f.state.members=[f.id,blocked.id,ready.id];
 f.state.commands.set(REMOVE,id=>({Success:true,Plots:id.id===8?[]:[2]}));deploy(f);assert.equal(f.state.head.id,9);
});
test('keep commander focus remains independently usable when automatic next is off',async()=>{
 const f=await fixture({mouse:{nextDeployable:false}});const next=soldier(f,8,-9999);f.state.members.push(next.id);deploy(f);assert.equal(f.state.head.id,1);
});
test('automatic next is independent of keep commander focus',async()=>{
 const f=await fixture({mouse:{keepCommanderFocus:false}});const next=soldier(f,8,-9999);f.state.members.push(next.id);deploy(f);assert.equal(f.state.head.id,8);
});
test('empty army or only civilians and scouts never reselects commander',async()=>{
 const f=await fixture();const civil=soldier(f,8,-9999,{Combat:{isCombat:false}});f.state.members.push(civil.id);deploy(f);assert.equal(f.state.selections.length,0);
});
test('manual ranged attack chooses same-type ready attacker under same commander with a real target',async()=>{
 const f=await battlefield();soldier(f,8,3,{type:'MELEE'});soldier(f,9,10);soldier(f,10,3,{Combat:{isCombat:true,attacksRemaining:0}});soldier(f,11,3);
 f.context.Game.UnitOperations.sendRequest(f.id,ATTACK,{X:5,Y:0});f.state.unit.Combat.attacksRemaining=0;
 finished(f,f.id);f.tick();assert.equal(f.state.head.id,11);
});
test('next attacker does not replace a deliberate selection made during animation',async()=>{
 const f=await battlefield();const next=soldier(f,8,3);
 f.context.Game.UnitOperations.sendRequest(f.id,ATTACK,{X:5,Y:0});f.select(next.id);finished(f,f.id);f.tick();assert.equal(f.state.selections.length,0);
});
test('next attacker switch disables only attack chaining',async()=>{
 const f=await battlefield({mouse:{nextRanged:false}});soldier(f,8,3);
 f.context.Game.UnitOperations.sendRequest(f.id,ATTACK,{X:5,Y:0});finished(f,f.id);f.tick();assert.equal(f.state.selections.length,0);
});
test('concentrated fire waits for confirmation, permits map exclusions, and fires farthest first without moving',async()=>{
 const f=await battlefield();const far=soldier(f,8,1),near=soldier(f,9,4);
 target(f);assert.equal(f.state.requests.length,0);
 f.nativeModes.get(FOCUS).selectPlot(near.location);fire(f);
 assert.equal(f.state.requests.length,1);assert.equal(f.state.requests[0].id.id,7);
 finished(f,f.id);assert.equal(f.state.requests.length,2);assert.equal(f.state.requests[1].id.id,far.id.id);
 finished(f,far.id);assert.equal(f.state.requests.length,2);assert.equal(f.state.moves.length,0);
 assert.ok(f.state.requests.every(r=>r.type===ATTACK));
});
test('killing the target stops later shots and preserves the closest unit',async()=>{
 const f=await battlefield({mouse:{focusExclude:false}});soldier(f,8,1);soldier(f,9,4);fire(f);
 assert.equal(f.state.requests.length,1);
 f.state.atPlot.set(5,[]);finished(f,f.id);assert.equal(f.state.requests.length,1);
});
test('native unreachable modifiers and target-only Success cannot include a unit',async()=>{
 const f=await battlefield({mouse:{focusExclude:false}});soldier(f,8,1);soldier(f,9,4);
 f.state.operations.set(ATTACK,(id,args)=>args.X!==undefined?{Success:true}:{Success:true,Plots:[5],Modifiers:[id.id===8?1:0]});
 fire(f);assert.equal(f.state.requests.length,1);assert.equal(f.state.requests[0].id.id,8);
});
test('all excluded units submit no order and remain editable',async()=>{
 const f=await battlefield();target(f);f.nativeModes.get(FOCUS).selectPlot(f.state.unit.location);fire(f);assert.equal(f.state.requests.length,0);
});
test('preview off disables exclusions but retains stationary fire behavior',async()=>{
 const f=await battlefield({mouse:{focusPreview:false,focusExclude:true}});fire(f);assert.equal(f.state.requests.length,1);assert.equal(f.state.requests[0].type,ATTACK);
});
test('cancel during volley and settings changes invalidate pending shots',async()=>{
 const f=await battlefield({mouse:{focusExclude:false}});soldier(f,8,2);fire(f);
 f.emitWindow('engine-input',{isCancelInput:()=>true});finished(f,f.id);assert.equal(f.state.requests.length,1);
});
test('reinforcement initially previews nearest eligible commander without dispatching',async()=>{
 const f=await fixture();f.unpack();const other={...f.state.commander,id:{owner:0,id:2,type:26},location:{x:8,y:0}};f.state.units.set(2,other);f.state.atPlot.set(8,[other.id]);
 f.state.operations.set(REINFORCE,{Success:true,Plots:[8]});f.handlers.switchToActionInterfaceMode(REINFORCE,{UnitID:f.id});f.flush();
 assert.equal(f.state.cameras.at(-1).x,8);assert.equal(f.state.requests.length,0);
 click(f,'确认增援');
 assert.equal(f.state.requests.length,1);assert.equal(f.state.requests[0].args.X,8);
});
test('initial reinforcement target checks per-target eligibility and nearest distance',async()=>{
 const f=await fixture();f.unpack();
 for(const [id,x] of [[2,12],[3,6],[4,3]]) f.state.units.set(id,{...f.state.commander,id:{owner:0,id,type:26},location:{x,y:0}});
 f.state.operations.set(REINFORCE,(_id,args)=>({Success:args.X!==1&&args.X!==3,Plots:[1,3,6,12]}));
 f.handlers.switchToActionInterfaceMode(REINFORCE,{UnitID:f.id});f.flush();
 assert.equal(f.state.cameras.at(-1).x,6);assert.equal(f.state.requests.length,0);
});
for(const input of ['button','mousebutton-right','keyboard-escape','cancel']) test('reinforcement cancellation restores originating unit and camera: '+input,async()=>{
 const f=await fixture({mouse:{singleReinforcement:false}});f.unpack();f.select();
 f.state.operations.set(REINFORCE,{Success:true,Plots:[1]});
 f.handlers.switchToActionInterfaceMode(REINFORCE,{UnitID:f.id});f.flush();
 let consumed=0;
 if(input==='button') click(f,'取消');
 else {
  const event=status=>({detail:{name:input,status},isCancelInput:()=>true,preventDefault(){},stopImmediatePropagation(){consumed++;}});
  f.emitWindow('engine-input',event(0));
  assert.equal(f.state.mode,'INTERFACEMODE_REINFORCE_ARMY');
  f.emitWindow('engine-input',event(2));
  assert.equal(consumed,2);
 }
 f.flush();f.tick();f.flush();
 assert.equal(f.state.head.id,f.id.id);
 assert.equal(f.state.mode,'INTERFACEMODE_UNIT_SELECTED');
 assert.equal(f.state.cameras.at(-1).x,0);
 assert.equal(f.context.PlotCursor.plotCursorCoords.x,0);
 assert.equal(f.state.requests.length,0);assert.equal(f.state.moves.length,0);
 assert.equal(f.state.elements.filter(e=>e.className?.includes('war-controls-tactical')&&!e.removed).length,0);
});
for(const [name,event]of [
 ['keydown',{key:'ArrowDown'}],['wheel',{deltaY:1}],['engine-input',{detail:{name:'nav-shell-next',status:2}}],['navigate-input',{detail:{name:'nav-shell-next',status:2}}]
]) test('reinforcement navigation accepts '+name,async()=>{
 const f=await fixture();f.unpack();const other={...f.state.commander,id:{owner:0,id:2,type:26},location:{x:8,y:0}};f.state.units.set(2,other);
 f.state.operations.set(REINFORCE,{Success:true,Plots:[1]});f.handlers.switchToActionInterfaceMode(REINFORCE,{UnitID:f.id});f.flush();
 f.emitWindow(name,event);assert.equal(f.state.cameras.at(-1).x,8);assert.equal(f.state.requests.length,0);
});
test('reinforcement picker survives device switches before right-click cancellation',async()=>{
 const f=await fixture({mouse:{singleReinforcement:false}});f.unpack();
 f.state.operations.set(REINFORCE,{Success:true,Plots:[1]});
 f.handlers.switchToActionInterfaceMode(REINFORCE,{UnitID:f.id});f.flush();
 f.device(true);f.device(false);
 f.emitWindow('engine-input',{detail:{name:'mousebutton-right',status:2},isCancelInput:()=>true});f.flush();
 assert.equal(f.state.cameras.at(-1).x,0);assert.equal(f.state.requests.length,0);
 assert.equal(f.state.mode,'INTERFACEMODE_UNIT_SELECTED');
});
test('reinforcement cancel before first preview prevents a delayed camera jump',async()=>{
 const f=await fixture({mouse:{singleReinforcement:false}});f.unpack();
 f.state.operations.set(REINFORCE,{Success:true,Plots:[1]});
 f.handlers.switchToActionInterfaceMode(REINFORCE,{UnitID:f.id});
 f.emitWindow('engine-input',{detail:{name:'keyboard-escape',status:2},isCancelInput:()=>true});f.flush();
 assert.deepEqual(f.state.cameras.map(p=>p.x),[0]);assert.equal(f.state.requests.length,0);
});
test('reinforcement with no eligible targets cannot confirm and can still cancel',async()=>{
 const f=await fixture();f.unpack();
 f.state.operations.set(REINFORCE,{Success:false,Plots:[1]});
 f.handlers.switchToActionInterfaceMode(REINFORCE,{UnitID:f.id});f.flush();
 click(f,'确认增援');assert.equal(f.state.requests.length,0);
 click(f,'取消');assert.equal(f.state.cameras.at(-1).x,0);
});
test('reinforcement confirmation rechecks eligibility without sending an invalid order',async()=>{
 const f=await fixture({mouse:{singleReinforcement:false}});f.unpack();
 f.state.operations.set(REINFORCE,{Success:true,Plots:[1]});
 f.handlers.switchToActionInterfaceMode(REINFORCE,{UnitID:f.id});f.flush();
 f.state.targetAllowed=false;click(f,'确认增援');
 assert.equal(f.state.requests.length,0);click(f,'取消');assert.equal(f.state.cameras.at(-1).x,0);
});
test('reinforcement cycle can be switched off',async()=>{
 const f=await fixture({mouse:{reinforcementCycle:false,singleReinforcement:false}});f.unpack();f.state.operations.set(REINFORCE,{Success:true,Plots:[1]});
 f.handlers.switchToActionInterfaceMode(REINFORCE,{UnitID:f.id});f.flush();assert.equal(f.state.cameras.length,0);
});
test('unload restores focused attack hooks and cancels deferred selection',async()=>{
 const f=await fixture();const next=soldier(f,8,-9999);f.state.members.push(next.id);
 f.context.Game.UnitCommands.sendRequest(f.id,REMOVE,{X:2,Y:0});f.emit('UnitRemovedFromArmy',{initiatingUnit:f.id});
 f.context.__civ7WarControls.dispose();f.tick();f.flush();assert.equal(f.state.selections.length,0);
});

test('army portrait highlight follows actual selection and disappears on unload',async()=>{
 const f=await fixture();const next=soldier(f,8,-9999);f.state.members.push(next.id);
 const first=f.armyPanel.createArmyUnitButton(f.id),second=f.armyPanel.createArmyUnitButton(next.id);f.flush();
 assert.match(first.style.outline,/3px/);assert.equal(second.style.outline,'');deploy(f);
 assert.equal(first.style.outline,'');assert.match(second.style.outline,/3px/);
 f.context.__civ7WarControls.dispose();assert.equal(second.style.outline,'');
});
test('another native order cancels the queue but waits for the buffed shot',async()=>{
 const f=await battlefield();soldier(f,8,2);fire(f);
 f.context.Game.UnitOperations.sendRequest(f.state.commander.id,'UNITOPERATION_MOVE_TO',{X:3,Y:0});
 finished(f,f.id);assert.equal(f.state.requests.length,1);
});
test('settings update stops the pending volley',async()=>{
 const f=await battlefield();soldier(f,8,2);fire(f);
 const config=f.state.settings.getConfig();config.mouse.focusPreview=false;f.state.settings.save(config);
 finished(f,f.id);assert.equal(f.state.requests.length,1);
});
test('a replacement enemy on the same tile is not attacked by a stale volley',async()=>{
 const f=await battlefield();soldier(f,8,2);fire(f);
 f.state.atPlot.set(5,[{owner:1,id:91,type:26}]);finished(f,f.id);assert.equal(f.state.requests.length,1);
});
test('controller reinforcement targeting keeps delayed action panel focus on the map',async()=>{
 const f=await fixture({gamepad:{singleReinforcement:false}});f.device(true);f.unpack();
 f.state.operations.set(REINFORCE,{Success:true,Plots:[1]});f.handlers.switchToActionInterfaceMode(REINFORCE,{UnitID:f.id});f.flush();
 f.panel.realizeFocus();assert.equal(f.state.focus,'world');
});
test('deliberately selecting another unit stops the volley',async()=>{
 const f=await battlefield();const other=soldier(f,8,2);fire(f);f.select(other.id);
 finished(f,f.id);assert.equal(f.state.requests.length,1);
});

test('focused fire hooks a native handler registered after mod startup',async()=>{
 const f=await battlefield();let nativeShots=0;
 const replacement={Context:{UnitID:f.state.commander.id},decorateHover(){},selectPlot(){nativeShots++;}};
 f.context.InterfaceMode.addHandler(FOCUS,replacement);
 target(f);assert.equal(nativeShots,0);assert.equal(f.state.requests.length,0);
 fire(f);assert.equal(f.state.requests.length,1);
});

for (const focusExclude of [true,false]) test('map-only volley confirms without a selection panel, exclusion='+focusExclude,async()=>{
 const f=await battlefield({mouse:{focusExclude}});target(f);
 assert.equal(f.state.elements.filter(e=>e.className?.includes('war-controls-tactical')&&!e.removed).length,0);
 assert.equal(f.state.requests.length,0);fire(f);assert.equal(f.state.requests.length,1);
});
test('candidate frames persist while clicks toggle only participation fill',async()=>{
 const f=await battlefield();const near=soldier(f,9,4);
 f.state.mode=FOCUS;f.nativeModes.get(FOCUS).decorate();
 const painted=()=>f.state.tacticalOverlays.find(o=>o.plots.includes(4))?.style;
 assert.ok(painted().fillColor.w>0);assert.deepEqual(framePlots(f),[0,4]);
 assert.ok(f.state.formationFrames.every(vfx=>vfx[0]==='VFX_3dUI_PlotCursor_01'));
 target(f);assert.equal(f.state.attackArrows.length,2);
 f.nativeModes.get(FOCUS).decorateHover(near.location);
 assert.ok(painted());assert.equal(f.state.attackArrows.length,0);
 f.nativeModes.get(FOCUS).selectPlot(near.location);assert.equal(painted(),undefined);assert.deepEqual(framePlots(f),[0,4]);
 target(f);assert.equal(f.state.attackArrows.length,1);assert.equal(painted(),undefined);
 f.nativeModes.get(FOCUS).decorateHover(near.location);
 f.nativeModes.get(FOCUS).selectPlot(near.location);assert.ok(painted());
 fire(f);finished(f,f.id);assert.equal(f.state.requests.at(-1).id.id,near.id.id);
});
test('map-only preview can be cancelled without firing',async()=>{
 const f=await battlefield();target(f);f.emitWindow('engine-input',{isCancelInput:()=>true});
 assert.equal(f.state.requests.length,0);assert.equal(f.state.tacticalOverlays.length,0);assert.equal(f.state.formationFrames.length,0);
 assert.equal(f.state.attackArrows.length,0);
});

test('formation can be edited before hovering any enemy; empty plots never turn red or fire',async()=>{
 const f=await battlefield();const near=soldier(f,8,3);soldier(f,9,4);
 f.state.mode=FOCUS;const h=f.nativeModes.get(FOCUS);h.decorate();
 assert.deepEqual(filledPlots(f),[0,3,4]);assert.equal(f.state.attackArrows.length,0);assert.deepEqual(framePlots(f),[0,3,4]);
 h.selectPlot(near.location);
 for(const x of [2,12,3]) {
   h.decorateHover({x,y:0});h.selectPlot({x:12,y:0});
   assert.deepEqual(filledPlots(f),[0,4]);assert.deepEqual(framePlots(f),[0,3,4]);
   assert.equal(f.state.attackArrows.length,0);assert.equal(f.state.requests.length,0);
 }
 fire(f);finished(f,f.id);assert.equal(f.state.requests.at(-1).id.id,9);
});

test('arrows come from selected units with a legal stationary shot, not every gold frame',async()=>{
 const f=await battlefield();soldier(f,8,1);soldier(f,9,4);
 f.state.operations.set(ATTACK,(id,args)=>args.X!==undefined?{Success:true}:{Success:true,Plots:[5],Modifiers:[id.id===8?0:1]});
 target(f);assert.equal(f.state.attackArrows.length,2);
 assert.deepEqual(f.state.attackArrows.map(a=>a[3].constants.source_position),[[0,0,0],[4,0,0]]);
 for(const arrow of f.state.attackArrows) {
   assert.equal(arrow[0],'VFX_3DUI_Ranged_Attack_Preview');
   assert.deepEqual(arrow[3].constants.target_position,[5,0,0]);
 }
 assert.deepEqual(framePlots(f),[0,1,4]);assert.deepEqual(filledPlots(f),[0,4]);
 fire(f);finished(f,f.id);
 assert.deepEqual(f.state.requests.map(r=>r.id.id),[7,9]);
 assert.equal(f.state.attackArrows.length,0);
});

test('changing hovered enemies narrows arrows without restoring an excluded unit',async()=>{
 const f=await battlefield();const near=soldier(f,8,3);soldier(f,9,4);
 f.state.atPlot.set(6,[{owner:1,id:91,type:26}]);
 f.state.operations.set(ATTACK,(id,args)=>args.X!==undefined?{Success:true}:{Success:true,Plots:id.id===9?[5]:[5,6],Modifiers:id.id===9?[1]:[1,1]});
 target(f);const h=f.nativeModes.get(FOCUS);h.selectPlot(near.location);
 h.decorateHover({x:6,y:0});assert.equal(f.state.attackArrows.length,1);
 assert.deepEqual(filledPlots(f),[0]);assert.deepEqual(framePlots(f),[0,3,4]);
 assert.deepEqual(f.state.attackArrows[0][3].constants.source_position,[0,0,0]);
 h.decorateHover({x:5,y:0});assert.equal(f.state.attackArrows.length,2);
 assert.deepEqual(filledPlots(f),[0,4]);assert.deepEqual(framePlots(f),[0,3,4]);
 assert.ok(!f.state.tacticalOverlays.some(o=>o.plots.includes(3)));
 h.decorateHover({x:12,y:0});assert.deepEqual(filledPlots(f),[0,4]);
});

test('enemy out of range removes all fill without erasing manual selection',async()=>{
 const f=await battlefield();const excluded=soldier(f,8,3);soldier(f,9,4);
 const h=f.nativeModes.get(FOCUS);target(f);h.selectPlot(excluded.location);
 f.state.atPlot.set(6,[{owner:1,id:91,type:26}]);
 h.decorateHover({x:6,y:0});assert.deepEqual(filledPlots(f),[]);assert.equal(f.state.attackArrows.length,0);
 assert.deepEqual(framePlots(f),[0,3,4]);
 h.decorateHover({x:12,y:0});assert.deepEqual(filledPlots(f),[0,4]);
 target(f);assert.deepEqual(filledPlots(f),[0,4]);
 fire(f);finished(f,f.id);assert.deepEqual(f.state.requests.map(r=>r.id.id),[7,9]);
});

test('spent units cannot appear as focus-fire candidates',async()=>{
 const f=await battlefield();soldier(f,8,3,{Movement:{movementMovesRemaining:0}});
 soldier(f,9,4,{Combat:{isCombat:true,attacksRemaining:0}});
 const h=f.nativeModes.get(FOCUS);f.state.mode=FOCUS;h.decorate();
 assert.deepEqual(framePlots(f),[0]);assert.deepEqual(filledPlots(f),[0]);
});

test('out-of-command units, scouts, civilians, packed units and land melee do not enter the formation',async()=>{
 const f=await battlefield();soldier(f,8,12);
 f.state.definitions.set('SCOUT',{CoreClass:'CORE_CLASS_RECON'});
 f.state.definitions.set('MELEE',{CoreClass:'CORE_CLASS_MELEE'});
 soldier(f,9,3,{type:'SCOUT'});soldier(f,10,2,{Combat:{isCombat:false}});
 const packed=soldier(f,11,1,{armyId:f.state.commander.armyId});f.state.members.push(packed.id);
 soldier(f,12,4,{type:'MELEE'});
 f.state.operations.set(ATTACK,id=>id.id===12?{Success:false}:{Success:true,Plots:[5],Modifiers:[1]});
 target(f);assert.equal(f.state.attackArrows.length,1);
 assert.deepEqual(framePlots(f),[0]);
});

test('preview disabled paints neither frames nor arrows and cannot exclude units',async()=>{
 const f=await battlefield({mouse:{focusPreview:false}});const near=soldier(f,8,3);
 target(f);f.nativeModes.get(FOCUS).selectPlot(near.location);
 assert.equal(f.state.tacticalOverlays.length,0);assert.equal(f.state.attackArrows.length,0);assert.equal(f.state.formationFrames.length,0);
 fire(f);finished(f,f.id);assert.equal(f.state.requests.length,2);
});

test('native mode exit clears arrows and a new entry selects the full formation again',async()=>{
 const f=await battlefield();const near=soldier(f,8,3);const h=f.nativeModes.get(FOCUS);
 target(f);h.selectPlot(near.location);target(f);assert.equal(f.state.attackArrows.length,1);
 h.reset();assert.equal(f.state.attackArrows.length,0);assert.equal(f.state.tacticalOverlays.length,0);assert.equal(f.state.formationFrames.length,0);
 h.decorate();target(f);assert.equal(f.state.attackArrows.length,2);
 f.context.__civ7WarControls.dispose();assert.equal(f.state.attackArrows.length,0);assert.equal(f.state.formationFrames.length,0);
});

test('naval formation uses the same native attack arrows and excludes land units',async()=>{
 const f=await battlefield();f.state.definitions.set('SHIP',{Domain:'DOMAIN_SEA'});
 const ship=soldier(f,8,3,{type:'SHIP'});
 const name='INTERFACEMODE_FOCUSED_ATTACK_SEA_RANGED',operation='UNITOPERATION_NAVAL_ATTACK';
 f.state.operations.set(operation,{Success:true,Plots:[5]});f.state.mode=name;
 const h=f.nativeModes.get(name);h.decorate();h.decorateHover({x:5,y:0});
 assert.equal(f.state.attackArrows.length,1);assert.deepEqual(f.state.attackArrows[0][3].constants.source_position,[3,0,0]);
 h.selectPlot({x:5,y:0});assert.equal(f.state.requests[0].id.id,ship.id.id);assert.equal(f.state.requests[0].type,operation);
});

for (const remaining of [0,0.5]) test(`focused fire requires one full commander movement point: ${remaining}`,async()=>{
 const f=await battlefield();f.state.commander.Movement.movementMovesRemaining=remaining;fire(f);
 assert.equal(f.state.requests.length,0);
 assert.ok(f.state.notices.some(n=>n.includes('至少需要 1 点移动力')));
 assert.equal(f.state.commander.Movement.movementMovesRemaining,remaining);
});
test('commander movement is rechecked after targeting begins',async()=>{
 const f=await battlefield();target(f);f.state.commander.Movement.movementMovesRemaining=0;
 f.nativeModes.get(FOCUS).selectPlot({x:5,y:0});assert.equal(f.state.requests.length,0);
});

test('only actual first combat spends commander movement; the remaining volley pays once',async()=>{
 const f=await battlefield();soldier(f,8,1);fire(f);
 assert.equal(f.state.commander.Movement.movementMovesRemaining,4);
 finished(f,f.id);assert.equal(f.state.commander.Movement.movementMovesRemaining,0);
 assert.equal(f.state.commander.Movement.maxMoves,2);
 assert.equal(f.state.requests.length,2);
 finished(f,{owner:0,id:8,type:26});assert.equal(f.state.costRequests.length,1);
});
test('one movement point is sufficient and canceling before firing is free',async()=>{
 const f=await battlefield();f.state.commander.Movement.movementMovesRemaining=1;
 target(f);f.emitWindow('engine-input',{isCancelInput:()=>true});
 assert.equal(f.state.commander.Movement.movementMovesRemaining,1);assert.equal(f.state.costRequests,undefined);
 fire(f);finished(f,f.id);assert.equal(f.state.commander.Movement.movementMovesRemaining,0);
});
test('canceling a volley after its first order still charges actual combat',async()=>{
 const f=await battlefield();soldier(f,8,1);fire(f);
 f.emitWindow('engine-input',{isCancelInput:()=>true});finished(f,f.id);
 assert.equal(f.state.commander.Movement.movementMovesRemaining,0);assert.equal(f.state.requests.length,1);
});
test('a deactivated attack without combat does not charge the commander',async()=>{
 const f=await battlefield();fire(f);f.emit('UnitOperationDeactivated',{unit:f.id});f.flush();
 assert.equal(f.state.commander.Movement.movementMovesRemaining,4);assert.equal(f.state.costRequests,undefined);
});
