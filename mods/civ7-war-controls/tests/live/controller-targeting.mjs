// Live Cohtml/game-core regression. Run only with WarControls_TurnStart loaded.
import assert from 'node:assert/strict';
const scenario = process.argv[2] ?? 'exit';
const cancelling = process.argv.includes('--cancel');
const pages = await (await fetch('http://127.0.0.1:9444/json')).json();
const page = pages.find(p => p.url === 'fs://game/root-game.html');
assert(page, 'Load the disposable WarControls_TurnStart save first');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let serial = 0;
async function evaluate(expression) {
  const id = ++serial;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Debugger timeout')), 10000);
    const listener = event => {
      const data = JSON.parse(event.data);
      if (data.id !== id) return;
      clearTimeout(timer); socket.removeEventListener('message', listener);
      if (data.result?.exceptionDetails || data.result?.result?.subtype === 'error') reject(Error(JSON.stringify(data.result)));
      else resolve(data.result?.result?.value);
    };
    socket.addEventListener('message', listener);
    socket.send(JSON.stringify({id, method:'Runtime.evaluate', params:{expression, returnByValue:true}}));
  });
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await evaluate(`globalThis.__wcReproReady=false; Promise.all([
    import('/core/ui/input/action-handler.js'),
    import('/core/ui/context-manager/context-manager.js'),
    import('/core/ui/input/input-support.js'),
    import('/core/ui-next/services/focus-manager.js'),
    import('/core/ui/interface-modes/interface-modes.js'),
    import('/core/ui/input/plot-cursor.js'),
    import('/base-standard/ui/world-input/world-input.js')
  ]).then(([a,c,i,f,m,p,w])=>{
    globalThis.__wcRepro={action:a.default,context:c.ContextManager,input:i,focus:f.FocusManager.get(),mode:m.InterfaceMode,cursor:p.PlotCursor,world:w.default,id:{owner:0,id:524294,type:26},commander:{owner:0,id:3211268,type:26}};
    globalThis.__wcReproReady=true;
  }); 'loading'`);
  for(let n=0; n<30 && !await evaluate('globalThis.__wcReproReady'); n++) await pause(100);
  assert.equal(await evaluate('Game.turn'),122,'Disposable fixture must be on turn 122');
  await evaluate(`__wcRepro.snapshot=()=>{const r=__wcRepro,u=Units.get(r.id),c=Units.get(r.commander),f=r.focus.currentFocus();return {version:__civ7WarControls.version,profile:__civ7WarControls.activeProfile,mode:r.mode.getCurrent(),unitLocation:u.location,unitMoves:u.Movement.movementMovesRemaining,commanderLocation:c.location,commanderMoves:c.Movement.movementMovesRemaining,packed:Armies.get(c.armyId).getUnitIds().some(id=>id.id===r.id.id),focus:f?.outerHTML?.slice(0,700),worldFocused:r.focus.isWorldFocused()};}; UI.Player.deselectAllUnits(); __wcRepro.mode.switchToDefault(); 'reset selection'`);
  await pause(600);
  if(scenario==='join') {
    await evaluate(`(()=>{const r=__wcRepro;if(!r.snapshot().packed)return 'already out';const result=Game.UnitCommands.canStart(r.id,'UNITCOMMAND_REMOVE_FROM_ARMY',{},false);if(!result.Success||!result.Plots?.length)throw Error('Cannot prepare unpacked fixture');const p=GameplayMap.getLocationFromIndex(result.Plots.find(p=>p!==GameplayMap.getIndexFromLocation(Units.get(r.commander).location)));Game.UnitCommands.sendRequest(r.id,'UNITCOMMAND_REMOVE_FROM_ARMY',{X:p.x,Y:p.y});return 'fixture unpacked';})()`);
    await pause(1000);
  } else if (!await evaluate('__wcRepro.snapshot().packed')) {
    await evaluate(`(()=>{const r=__wcRepro,p=Units.get(r.commander).location;const result=Game.UnitCommands.canStart(r.id,'UNITCOMMAND_ADD_TO_ARMY',{},false);if(!result.Success||!result.Plots.includes(GameplayMap.getIndexFromLocation(p)))throw Error('Cannot prepare packed fixture');Game.UnitCommands.sendRequest(r.id,'UNITCOMMAND_ADD_TO_ARMY',{X:p.x,Y:p.y});return 'fixture packed';})()`);
    await pause(1000);
  }
  await evaluate(`engine.trigger('input-source-changed',InputDeviceType.Controller,__wcRepro.action.deviceLayout); UI.Player.selectUnit(__wcRepro.id); Camera.lookAtPlot(Units.get(__wcRepro.commander).location); 'selected'`);
  await pause(1200);
  const before = JSON.parse(await evaluate('JSON.stringify(__wcRepro.snapshot())'));
  assert.equal(before.mode, scenario === 'join' ? 'INTERFACEMODE_ADD_TO_ARMY' : 'INTERFACEMODE_REMOVE_FROM_ARMY', 'Automatic target mode must be active before confirming');
  const target = JSON.parse(await evaluate(`JSON.stringify((()=>{const r=__wcRepro;if(${JSON.stringify(scenario)}==='join')return Units.get(r.commander).location;const result=Game.UnitCommands.canStart(r.id,'UNITCOMMAND_REMOVE_FROM_ARMY',{},false);if(!result.Success||!result.Plots?.length)throw Error('No legal exit target');return GameplayMap.getLocationFromIndex(result.Plots.find(p=>p!==GameplayMap.getIndexFromLocation(Units.get(r.commander).location)));})())`));
  await evaluate(`__wcRepro.cursor.plotCursorCoords=${JSON.stringify(target)}; 'target cursor'`);
  await pause(250);
  if(process.argv.includes('--clear-focus')) await evaluate(`__wcRepro.focus.clearFocus(); 'cleared focus only'`);
  await evaluate(`__wcRepro.moves=[]; __wcRepro.originalMove=__wcRepro.world.requestMoveOperation; __wcRepro.world.requestMoveOperation=function(...args){__wcRepro.moves.push(args);return __wcRepro.originalMove.apply(this,args);}; 'trace move requests'`);
  const input = cancelling ? 'cancel' : 'accept';
  await evaluate(`__wcRepro.context.handleInput(new __wcRepro.input.InputEngineEvent('${input}',InputActionStatuses.START,0,0,false,false)); __wcRepro.context.handleInput(new __wcRepro.input.InputEngineEvent('${input}',InputActionStatuses.FINISH,0,0,false,false)); 'confirmed'`);
  await pause(1400);
  const after = JSON.parse(await evaluate('JSON.stringify(__wcRepro.snapshot())'));
  const moveRequests=JSON.parse(await evaluate('JSON.stringify(__wcRepro.moves)'));
  console.log(JSON.stringify({scenario,cancelling,before,target,after,moveRequests},null,2));
  if(cancelling){
    assert.equal(after.mode,'INTERFACEMODE_UNIT_SELECTED','B must return to default unit control');
    assert.equal(after.packed,before.packed);
    assert.deepEqual(after.unitLocation,before.unitLocation);
    assert.equal(after.unitMoves,before.unitMoves);
  } else {
    assert.equal(after.packed,scenario==='join',`${scenario}: controller confirm must ${scenario==='join'?'pack':'unpack'} the selected unit`);
    if(scenario==='exit') assert.deepEqual(after.unitLocation,target,'Exit must place the unit on the confirmed tile');
    assert.equal(after.unitMoves,before.unitMoves-(scenario==='join'?1:0),'Only native packing cost is allowed');
  }
  assert.equal(moveRequests.length,0,'No Move order may be sent');
  assert.deepEqual(after.commanderLocation,before.commanderLocation,'Commander must not swap tiles');
  assert.equal(after.commanderMoves,before.commanderMoves,'Commander movement must be unchanged');
  console.log(`PASS controller ${scenario}${cancelling?' cancel':''}: actual game-core membership, position and movement verified`);
} finally {
  await evaluate(`if(globalThis.__wcRepro?.originalMove){__wcRepro.world.requestMoveOperation=__wcRepro.originalMove;delete __wcRepro.originalMove;} 'trace removed'`).catch(()=>{});
  socket.close();
}
