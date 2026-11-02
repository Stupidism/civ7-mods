// The native Units.restoreMovement request restores the current allowance from
// the effective maximum. A momentary database modifier clamps that maximum
// below zero, so this request spends movement without moving/embedding a unit.
// Only the requested commander is restored; other units keep their allowance.
export function createFocusCost(api, onSettled = () => {}) {
  const {Units,Players,GameContext,GameInfo,Configuration,ComponentID,engine,setTimeout,clearTimeout} = api;
  const definition = name => GameInfo.NarrativeTags?.lookup('NARRATIVE_TAG_WC_COST_' + name);
  const identity = () => Players.get(GameContext.localPlayerID)?.Identity;
  const names = ['READY','UNIT','TYPE','ACTIVE'];
  let armed=null, pending=null, timer=null, disposed=false;
  const same=(a,b)=>a&&b&&ComponentID.isMatch(a,b);
  function read(name) {return identity().getNarrativeTagPoints(definition(name).$index);}
  function write(name,value) {const delta=value-read(name);if(delta)identity().changeNarrativeTagPoints(definition(name).$index,delta);}
  function supported() {return !Configuration.getGame().isAnyMultiplayer && !!identity() && names.every(n=>Number.isInteger(definition(n)?.$index) && definition(n).$index>=0);}
  function ready() {try{return !disposed && supported() && read('READY')===1 && !pending && !armed && read('UNIT')===0;}catch{return false;}}
  function clearTimer() {if(timer!==null)clearTimeout(timer);timer=null;}
  function stop(success) {
    clearTimer();
    // Keep the unpaid unit in the save on failure/unload; loading retries it.
    write('ACTIVE',0);
    if(success){write('UNIT',0);write('TYPE',0);}
    pending=null;
    onSettled(success);
  }
  function drive() {
    if(disposed || !pending)return;
    const p=pending, unit=Units.get(p.id);
    if(!unit || unit.owner!==GameContext.localPlayerID || !unit.isCommanderUnit){stop(true);return;}
    try {
      if(p.phase==='enable' && read('ACTIVE')===1 && unit.Movement?.maxMoves<=0) {
        p.phase='drain';
        Units.restoreMovement(p.id);
      }
      if(p.phase==='drain' && Units.get(p.id)?.Movement?.movementMovesRemaining===0) {
        p.phase='restore';write('ACTIVE',0);
      }
      if(p.phase==='restore' && read('ACTIVE')===0 && Units.get(p.id)?.Movement?.maxMoves>0) {stop(true);return;}
      if(++p.polls>=200){stop(false);return;}
      timer=setTimeout(()=>{timer=null;drive();},25);
    } catch {stop(false);}
  }
  function commit(id) {
    armed=null;
    // Persist the debt before enabling the transient modifier. A save during
    // the first shot must not refund the commander's movement on reload.
    pending={id,phase:'enable',polls:0};
    try {write('TYPE',id.type);write('UNIT',id.id+1);write('ACTIVE',1);drive();}
    catch {stop(false);}
  }
  function arm(commander,attacker) {
    if(!ready())return false;
    armed={commander,attacker};return true;
  }
  function reject() {armed=null;}
  const combat=data=>{if(armed && same(armed.attacker,data.attacker))commit(armed.commander);};
  const deactivated=data=>{
    if(armed && same(armed.attacker,data.unit)){armed=null;onSettled(false);}
  };
  engine.on('Combat',combat);
  engine.on('UnitOperationDeactivated',deactivated);
  // Resume only a recorded, actually fired volley. Never charge a preview.
  if(supported()) {
    if(read('UNIT')>0 && read('READY')===1)commit({owner:GameContext.localPlayerID,id:read('UNIT')-1,type:read('TYPE')});
    else write('ACTIVE',0);
  }
  return {ready,arm,reject,get busy(){return !!pending||!!armed;},dispose(){
    disposed=true;clearTimer();armed=null;
    if(supported())write('ACTIVE',0);
    engine.off('Combat',combat);engine.off('UnitOperationDeactivated',deactivated);
  }};
}
