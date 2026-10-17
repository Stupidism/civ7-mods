import {YIELDS, cityKey, resourceKey, effectsFor} from './rp-planner.js';
const truth=v=>v===true||v===1||v==='1'||v==='true';
const rows=t=>{const a=[];t?.forEach(v=>a.push(v));return a;};

export function resourceCatalog(info=GameInfo) {
  const args=new Map(), dynamics=new Map(rows(info.DynamicModifiers).map(r=>[r.ModifierType,r]));
  rows(info.ModifierArguments).forEach(r=>{if(!args.has(r.ModifierId))args.set(r.ModifierId,{});args.get(r.ModifierId)[r.Name]=r.Value;});
  const requirements=new Map(rows(info.Requirements).map(r=>[r.RequirementId,r]));
  const sets=new Map(rows(info.RequirementSets).map(r=>[r.RequirementSetId,r]));
  const members=rows(info.RequirementSetRequirements);
  const active=new Set(rows(info.GameModifiers).map(r=>r.ModifierId));
  const result=new Map();
  for(const m of rows(info.Modifiers)) {
    if(!active.has(m.ModifierId) || m.OwnerRequirementSetId)continue;
    const a=args.get(m.ModifierId),d=dynamics.get(m.ModifierType);
    if(!a?.ResourceType || !d || truth(a.Empire))continue;
    let kind;
    if(d.EffectType==='EFFECT_CITY_ADJUST_YIELD_PER_RESOURCE')kind=truth(a.PercentMultiplier)?'percent':'flat';
    else if(d.EffectType==='EFFECT_CITY_ADJUST_CONSTRUCTIBLE_YIELD_PER_RESOURCE')kind='flat';
    else if(d.EffectType==='EFFECT_CITY_ADJUST_UNIT_PRODUCTION_PER_RESOURCE'||d.EffectType==='EFFECT_CITY_ADJUST_CONSTRUCTIBLE_PRODUCTION_PER_RESOURCE')kind='construction';
    else continue; // Empire-wide ownership bonuses and situational production are not slot yields.
    const e={yield:kind==='construction'?'YIELD_PRODUCTION':a.YieldType,amount:Number(a.Amount??a.Percent),kind,tag:a.Tag};
    if(kind==='construction')e.queue={kind:d.EffectType.includes('_UNIT_')?'unit':'building',type:a.ConstructibleType,tag:a.UnitTag,class:a.ConstructibleClass,domain:a.Domain};
    if(!YIELDS.includes(e.yield)||!Number.isFinite(e.amount))continue;
    if(d.CollectionType==='COLLECTION_ALL_CAPITAL_CITIES')e.capital=true;
    else if(d.CollectionType!=='COLLECTION_ALL_CITIES')continue;
    let supported=true;
    if(m.SubjectRequirementSetId) {
      const set=sets.get(m.SubjectRequirementSetId);
      if(!set || set.RequirementSetType!=='REQUIREMENTSET_TEST_ALL')continue;
      for(const link of members.filter(x=>x.RequirementSetId===m.SubjectRequirementSetId)) {
        const r=requirements.get(link.RequirementId),yes=!truth(r?.Inverse);
        switch(r?.RequirementType) {
          case 'REQUIREMENT_CITY_IS_TOWN':e.town=yes;break;
          case 'REQUIREMENT_CITY_IS_CITY':case 'REQUIREMENT_CITY_HAS_BUILD_QUEUE':e.town=!yes;break;
          case 'REQUIREMENT_CITY_IS_CAPITAL':e.capital=yes;break;
          case 'REQUIREMENT_CITY_IS_DISTANT_LANDS':e.distant=yes;break;
          default:supported=false;
        }
      }
    }
    if(!supported)continue;
    if(!result.has(a.ResourceType))result.set(a.ResourceType,[]);
    result.get(a.ResourceType).push(e);
  }
  return result;
}

export function gameScope() {return `${Configuration.getMap().mapSeed}:${GameContext.localPlayerID}`;}
export function preferenceKey(city) {return `${city.originalOwner}:${city.location.x}:${city.location.y}`;}
export function assignmentArgs(resource,city,remove=false) {
  const args={City:city.id.id,ID:resource.isOffMap?resource.value:-1,Flags:!!resource.isOffMap};
  if(!resource.isOffMap)args.Location=GameplayMap.getLocationFromIndex(resource.value);
  if(remove)args.Action=PlayerOperationParameters.Deactivate;
  return args;
}

export function snapshot(model,tendencies,catalog,options) {
  const player=Players.get(GameContext.localPlayerID), live=player.Cities.getCities();
  const resourceMap=new Map();
  const toResource=(raw,original)=>{
    const def=GameInfo.Resources.lookup(raw.uniqueResource.resource);
    const r={key:resourceKey(raw),value:raw.value,isOffMap:!!raw.isOffMap,type:def.ResourceType,definition:def,
      // BonusResourceSlots is the NET usable expansion. The engine cap also
      // includes the camel's own slot (observed: four camels changed 8 to 20).
      original,bonusSlots:Number(def.BonusResourceSlots)>0?Number(def.BonusResourceSlots)+1:0,effects:catalog.get(def.ResourceType)||[]};
    resourceMap.set(r.key,r);return r;
  };
  const cityByKey=new Map();
  const cities=live.filter(c=>c.Resources).map(c=>{
    const key=cityKey(c), assigned=c.Resources.getAssignedResources().map(r=>toResource(r,key));
    const values=c.Yields.getYields(),base=Array(7).fill(0),multiplier=Array(7).fill(1),offset=Array(7).fill(0),postMultiplier=Array(7).fill(1);
    GameInfo.Yields.forEach((y,i)=>{
      const target=YIELDS.indexOf(y.YieldType),v=values[i];if(target<0||!v)return;
      const income=v.base?.steps?.find(s=>s.id===Game.getHash('ATTR_YIELD_INCOME'));
      if(income) {
        base[target]=Number(income.base?.value??income.value)||0;
        multiplier[target]=1+(Number(income.modifier?.value)||0)/100;
        offset[target]=Number(v.base.value)-Number(income.value);
        postMultiplier[target]=1+(Number(v.modifier?.value)||0)/100;
      } else {
        base[target]=Number(v.base?.value??v.value)||0;
        multiplier[target]=base[target]?Number(v.value)/base[target]:1;
      }
    });
    const tags={};
    c.Constructibles?.getIds().forEach(id=>{
      const object=Constructibles.getByComponentID(id);if(!object||object.damaged)return;
      const def=GameInfo.Constructibles.lookup(object.type);if(!def)return;
      GameInfo.TypeTags.forEach(row=>{if(row.Type===def.ConstructibleType)tags[row.Tag]=(tags[row.Tag]||0)+1;});
    });
    const city={key,id:c.id,name:Locale.compose(c.name),isTown:c.isTown,isCapital:c.isCapital,isDistantLands:c.isDistantLands,
      connected:!!c.Trade?.isInTradeNetwork(),base,multiplier,offset,postMultiplier,tags,assigned,live:c,
      capacity:c.Resources.getAssignedResourcesCap()-assigned.length,tendency:tendencies[preferenceKey(c)]};
    const head=c.BuildQueue?.getQueue()?.[0];
    if(head?.kind===ProductionKind.UNIT) {
      const def=GameInfo.Units.lookup(head.unitType);
      city.queue={kind:'unit',type:def?.UnitType,domain:def?.Domain,tags:rows(GameInfo.TypeTags).filter(t=>t.Type===def?.UnitType).map(t=>t.Tag)};
    } else if(head?.kind===ProductionKind.CONSTRUCTIBLE) {
      const def=GameInfo.Constructibles.lookup(head.constructibleType);
      city.queue={kind:'building',type:def?.ConstructibleType,class:def?.ConstructibleClass,tags:[]};
    }
    cityByKey.set(key,city);return city;
  });
  const tab=model.data.resourceTabData;
  const available=new Set();
  tab.availableResourceSectionData.forEach(s=>s.subSections.forEach(sub=>sub.resourceSlotData.forEach(r=>available.add(`${r.isOffMap?'off':'plot'}:${r.resourceValue}`))));
  player.Resources.getResources().forEach(r=>{if(!resourceMap.has(resourceKey(r))&&available.has(resourceKey(r)))toResource(r);});
  const candidates=[...resourceMap.values()].filter(r=>{
    if(r.bonusSlots && !options.camels)return false;
    if(!r.bonusSlots && !r.effects.length)return false;
    if(r.original && !options.assigned)return false;
    return true;
  });
  for(const r of candidates) {
    if(r.original) {
      const c=cityByKey.get(r.original),e=effectsFor(r,c);
      c.capacity+=1-r.bonusSlots;
      for(let i=0;i<7;i++) {c.base[i]-=e.flat[i];c.multiplier[i]-=e.percent[i]/100;}
    }
    r.allowed=cities.filter(c=>{
      if(r.original===c.key)return true;
      if(r.definition.ResourceClassType==='RESOURCECLASS_CITY' && c.isTown)return false;
      if(!r.isOffMap) {
        const origin=Cities.get(Game.Resources.getOriginCity(r.value));
        if(!origin)return false;
        if(origin.owner===GameContext.localPlayerID && !origin.Trade?.isInTradeNetwork())return cityKey(origin)===c.key;
      }
      if(!c.connected)return false;
      // Engine checks account for coastal/factory restrictions when a slot exists.
      if(c.live.Resources.getAssignedResourcesCap()>c.live.Resources.getAssignedResources().length)
        return !!Game.PlayerOperations.canStart(GameContext.localPlayerID,PlayerOperationTypes.ASSIGN_RESOURCE,assignmentArgs(r,c),false).Success;
      if(truth(r.definition.AssignCoastal)||truth(r.definition.AssignInland)||r.definition.ResourceClassType==='RESOURCECLASS_FACTORY')return false;
      return true;
    }).map(c=>c.key);
  }
  return {resources:candidates,cities};
}

export function findAssignment(r,cities) {
  return cities.find(c=>Cities.get(c.id)?.Resources?.getAssignedResources().some(x=>resourceKey(x)===r.key))?.key;
}
export async function sendOperation(r,city,remove,cities,guard) {
  if(!guard())throw new Error('玩家、回合或界面已改变');
  const args=assignmentArgs(r,city,remove);
  const check=Game.PlayerOperations.canStart(GameContext.localPlayerID,PlayerOperationTypes.ASSIGN_RESOURCE,args,false);
  if(!check.Success)throw new Error(`${city.name} 无法${remove?'卸下':'装入'} ${Locale.compose(r.definition.Name)}`);
  Game.PlayerOperations.sendRequest(GameContext.localPlayerID,PlayerOperationTypes.ASSIGN_RESOURCE,args);
  const start=Date.now();
  while(Date.now()-start<4000) {
    const actual=findAssignment(r,cities);
    if(remove?actual!==city.key:actual===city.key)return;
    await new Promise(resolve=>setTimeout(resolve,80));
  }
  throw new Error('游戏未确认资源操作，已停止继续发送');
}
