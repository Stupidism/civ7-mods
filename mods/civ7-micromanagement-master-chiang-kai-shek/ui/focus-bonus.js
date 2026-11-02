// A hidden native story attaches these combat modifiers in both new and existing
// games. Narrative tag indexes (NOT hashes) are required by Player.Identity.
export function createFocusBonus(api) {
  const {GameInfo, Players, GameContext, GlobalParameters, Online, Configuration, engine, ComponentID,
    setTimeout, clearTimeout} = api;
  const bits = [1,2,4,8,16,32,64];
  const tag = n => GameInfo.NarrativeTags?.lookup('NARRATIVE_TAG_WC_FOCUS_' + n);
  const identity = () => Players.get(GameContext.localPlayerID)?.Identity;
  const rows = name => Array.from(GameInfo[name] ?? []);
  const modifiers = new Map(rows('Modifiers').map(row => [row.ModifierId,row]));
  const effects = new Map(rows('DynamicModifiers').map(row => [row.ModifierType,row.EffectType]));
  const argumentsById = new Map();
  for (const row of rows('ModifierArguments')) {
    if (!argumentsById.has(row.ModifierId)) argumentsById.set(row.ModifierId,{});
    argumentsById.get(row.ModifierId)[row.Name] = row.Value;
  }
  let active = null, timer = null, disposed = false;
  const supported = () => !Configuration.getGame().isAnyMultiplayer && !!identity();
  function count(n) {
    const definition=tag(n);
    if (!Number.isInteger(definition?.$index) || definition.$index < 0) throw Error('Focus bonus definitions missing');
    return identity().getNarrativeTagPoints(definition.$index);
  }
  function set(n,value) {
    const old=count(n);
    if(old!==value) identity().changeNarrativeTagPoints(tag(n).$index,value-old);
    if(count(n)!==value) throw Error('Focus bonus switch failed');
  }
  function clear() {
    if(timer!==null) clearTimeout(timer);
    timer=null; active=null;
    if (!supported()) return;
    for(const n of bits) if(tag(n)) set(n,0);
  }
  function ready() {
    try { return !disposed && supported() && count('READY')===1 && bits.every(n=>Number.isInteger(tag(n)?.$index)); }
    catch { return false; }
  }
  function modifierAmount(id, stack=1) {
    const modifier=modifiers.get(id);
    if(!modifier || effects.get(modifier.ModifierType)!=='EFFECT_ADJUST_UNIT_FOCUSED_ATTACK_DAMAGE') return 0;
    const args=argumentsById.get(id) ?? {};
    if(!['true','1'].includes(String(args.IsAllTypes).toLowerCase()) && args.CombatType!=='COMBAT_RANGED') return 0;
    // Native built-in focused-fire modifiers have no further requirements.
    // Refuse an unfamiliar conditional modifier rather than silently overbuff.
    if(modifier.OwnerRequirementSetId || modifier.SubjectRequirementSetId) throw Error('Conditional focused-fire modifier');
    const amount=Number(args.Amount);
    if(!Number.isFinite(amount)) throw Error('Unknown focused-fire amount');
    return amount*stack;
  }
  function amount(unit) {
    let total=Number(GlobalParameters.COMBAT_FOCUSED_ATTACK_BASE_BONUS);
    // Barrage is an aura on the FIRING UNIT, and may come from an overlapping
    // commander. Reading only the selected commander's promotions loses it.
    for(const row of rows('UnitAbilityModifiers')) {
      const ability=GameInfo.UnitAbilities?.lookup(row.UnitAbilityType);
      if(!ability) continue;
      const stack=unit.getAbilityCount?.(ability.$hash) ?? 0;
      if(stack>0) total+=modifierAmount(row.ModifierId,stack);
    }
    const equipped=new Set((Online.Metaprogression.getEquippedMementos(unit.owner) ?? []).map(m=>m.mementoTypeId));
    for(const row of rows('MementoModifiers')) if(equipped.has(row.MementoType)) total+=modifierAmount(row.ModifierId);
    if(!Number.isInteger(total) || total<0 || total>127) throw Error('Unsupported focused-fire total');
    return total;
  }
  function begin(unit) {
    if(active || !ready()) return false;
    try {
      const total=amount(unit);
      for(const n of bits) set(n,(total & n)?1:0);
      active=unit.id;
      timer=setTimeout(clear,20000);
      return true;
    } catch { clear(); return false; }
  }
  const finish=id=>{if(active && ComponentID.isMatch(id,active))clear();};
  const combat=data=>finish(data.attacker);
  const deactivated=data=>finish(data.unit);
  // A save can be made during an animation. Never restore a transient attack
  // bonus from that save as a permanent buff when loading it later.
  clear();
  engine.on('Combat',combat);
  engine.on('UnitOperationDeactivated',deactivated);
  engine.on('PlayerTurnDeactivated',clear);
  return {supported,ready,amount,begin,clear,get active(){return active;},dispose(){
    if(disposed)return; disposed=true;clear();
    engine.off('Combat',combat);engine.off('UnitOperationDeactivated',deactivated);engine.off('PlayerTurnDeactivated',clear);
  }};
}
