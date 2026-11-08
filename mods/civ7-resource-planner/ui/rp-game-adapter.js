import {isResourceDamaged} from './card-reminders-runtime.js';
import {t} from './rp-l10n.js';
import {bareYields,cityYieldVector,YIELDS, cityKey, resourceKey, effectsFor} from './rp-planner.js';
const truth=v=>v===true||v===1||v==='1'||v==='true';
const rows=t=>{const a=[];t?.forEach(v=>a.push(v));return a;};
const PRODUCTION_YIELD='YIELD_PRODUCTION';
const FOOD_YIELD='YIELD_FOOD';

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

function currentQueueProgress(queue,head) {
  let invested,required,currentKind,currentType;
  try {
    invested=queue?.currentBuildProgress;
    required=queue?.currentBuildProgressRequired;
    currentKind=queue?.currentProductionKind;
    currentType=queue?.currentProductionTypeHash;
  }catch{return undefined;}
  // These are live numeric engine values. Do not coerce null/string values to
  // zero, and do not attach totals that still describe an earlier queue head.
  if(typeof invested!=='number'||!Number.isFinite(invested)||invested<0)return undefined;
  if(typeof required!=='number'||!Number.isFinite(required)||required<=0)return undefined;
  if(typeof currentKind!=='number'||!Number.isFinite(currentKind))return undefined;
  if(typeof head?.kind!=='number'||!Number.isFinite(head.kind))return undefined;
  if(typeof currentType!=='number'||!Number.isFinite(currentType))return undefined;
  if(typeof head?.type!=='number'||!Number.isFinite(head.type))return undefined;
  if(currentKind!==head.kind||currentType!==head.type)return undefined;
  return {invested,required};
}

function productionProgressYield(city,{info,icon,locale}) {
  const lookupYield=type=>{
    if(typeof type!=='string'&&!(typeof type==='number'&&Number.isFinite(type)))return undefined;
    try{return info?.Yields?.lookup?.(type);}catch{return undefined;}
  };
  let source;
  try{source=city?.Production?.productionYieldSource;}catch{}
  const yieldType=lookupYield(source)?.YieldType===FOOD_YIELD?FOOD_YIELD:PRODUCTION_YIELD;
  const definition=lookupYield(yieldType);
  let value;
  try{value=icon?.getYieldIcon?.(yieldType);}catch{}
  const nameKey=definition?.Name||`LOC_${yieldType}_NAME`;
  let yieldName=yieldType;
  try{
    const localized=locale?.compose?.(nameKey);
    if(typeof localized==='string'&&localized)yieldName=localized;
  }catch{}
  return {
    yieldType,
    yieldName,
    icon:value?`url(${value})`:undefined,
    iconIsUrl:!!value
  };
}

// The verified native signature accepts a core production category, NOT a
// concrete unit hash. This is a unit-category baseline; subtype bonuses remain
// unverified. Only the unit category has live evidence for this salt use case.
function nativeProductionRate(city,progress,info=globalThis.GameInfo) {
  if(progress?.yieldType!==PRODUCTION_YIELD)return undefined;
  try {
    const index=info?.Yields?.lookup?.(PRODUCTION_YIELD)?.$index;
    const kind=globalThis.ProductionKind?.UNIT;
    if(!Number.isInteger(index)||index<0||!Number.isInteger(kind))return undefined;
    if(city?.BuildQueue?.currentProductionKind!==kind)return undefined;
    const rate=city?.Yields?.calculateProductionSpecificYield?.(index,kind,false)?.value;
    return Number.isFinite(rate)&&rate>=0?rate:undefined;
  }catch{return undefined;}
}

function withQueueProgress(production,city,head,options) {
  const numeric=currentQueueProgress(city?.BuildQueue,head);
  return numeric?{...production,progress:{...numeric,...productionProgressYield(city,options)}}:production;
}

// One read of the live build queue for both allocation scoring and the
// commerce-card label. Only the first queue item is current production; later
// items must never make salt or a unit-production bonus applicable.
export function currentProduction(city,{info=globalThis.GameInfo,icon=globalThis.Icon,locale=globalThis.Locale,kinds=globalThis.ProductionKind}={}) {
  const town=!!city?.isTown, unknown={kind:'unknown',isTown:town};
  if(!city)return unknown;
  let head;
  try{head=city.BuildQueue?.getQueue?.()?.[0];}catch{return unknown;}
  if(!head)return {kind:'none',isTown:town};
  const name=def=>def?.Name&&locale?locale.compose(def.Name):undefined;
  const iconUrl=(getter,def)=>{const value=def&&getter?.(def);return value?`url(${value})`:undefined;};
  if(kinds?.UNIT!==undefined&&head.kind===kinds.UNIT) {
    const def=info?.Units?.lookup?.(head.unitType);
    if(!def?.UnitType)return unknown;
    const tags=rows(info.TypeTags).filter(t=>t.Type===def.UnitType).map(t=>t.Tag);
    return withQueueProgress({kind:'unit',isTown:town,type:def.UnitType,name:name(def),rawName:def.Name,
      icon:iconUrl(icon?.getUnitIconFromDefinition,def),queue:{kind:'unit',type:def.UnitType,domain:def.Domain,tags}},city,head,{info,icon,locale});
  }
  if(kinds?.CONSTRUCTIBLE!==undefined&&head.kind===kinds.CONSTRUCTIBLE) {
    const def=info?.Constructibles?.lookup?.(head.constructibleType);
    if(!def?.ConstructibleType)return unknown;
    return withQueueProgress({kind:'building',isTown:town,type:def.ConstructibleType,name:name(def),rawName:def.Name,
      icon:iconUrl(icon?.getConstructibleIconFromDefinition,def),
      queue:{kind:'building',type:def.ConstructibleType,class:def.ConstructibleClass,tags:[]}},city,head,{info,icon,locale});
  }
  if(kinds?.PROJECT!==undefined&&head.kind===kinds.PROJECT) {
    const def=info?.Projects?.lookup?.(head.projectType);
    if(!def?.ProjectType)return unknown;
    return withQueueProgress({kind:'project',isTown:town,type:def.ProjectType,name:name(def),rawName:def.Name,
      icon:iconUrl(icon?.getProjectIconFromDefinition,def),queue:{kind:'project',type:def.ProjectType}},city,head,{info,icon,locale});
  }
  return unknown;
}

// Bind the caller's ES imports once. The commerce model's Icon is a module
// import, not a global, so relying on globalThis.Icon would silently lose the
// native unit flag in the running game.
export function productionReader(options={}) {
  return city=>currentProduction(city,options);
}

// Compact, non-focusable label. Unit cards say that this is current training,
// then the localized unit name beside the native unit-flag icon.
export function productionText(production) {
  const name=production?.name||t('PRODUCTION_UNKNOWN');
  switch(production?.kind) {
    case 'unit':return t('PRODUCTION_TRAINING',name);
    case 'building':return t('PRODUCTION_BUILDING',name);
    case 'project':return t('PRODUCTION_PROJECT',name);
    case 'none':return production.isTown?'':t('PRODUCTION_NONE');
    default:return t('PRODUCTION_UNKNOWN');
  }
}

function localeNumber(value,format,locale) {
  try {
    const formatted=locale?.toNumber?.(value,format);
    if(typeof formatted==='string'&&formatted)return formatted;
  }catch{}
  return String(value);
}

export function productionProgressText(production,locale=globalThis.Locale) {
  const progress=production?.progress;
  if(typeof progress?.invested!=='number'||!Number.isFinite(progress.invested)||progress.invested<0)return '';
  if(typeof progress?.required!=='number'||!Number.isFinite(progress.required)||progress.required<=0)return '';
  const invested=Math.round(progress.invested*100)/100;
  const required=Math.round(progress.required*100)/100;
  return `${localeNumber(invested,Number.isInteger(invested)?'0':'0.##',locale)} / ${localeNumber(required,Number.isInteger(required)?'0':'0.##',locale)}`;
}

function productionBaseTitle(production,name) {
  switch(production?.kind) {
    case 'unit':return t('PRODUCTION_TRAINING_TIP',name);
    case 'building':return t('PRODUCTION_BUILDING_TIP',name);
    case 'project':return t('PRODUCTION_PROJECT_TIP',name);
    default:return productionText(production);
  }
}

export function productionTitle(production) {
  const name=production?.name||t('PRODUCTION_UNKNOWN');
  const progress=production?.progress;
  if(typeof progress?.invested!=='number'||!Number.isFinite(progress.invested)||progress.invested<0)return productionBaseTitle(production,name);
  if(typeof progress?.required!=='number'||!Number.isFinite(progress.required)||progress.required<=0)return productionBaseTitle(production,name);
  const exact=value=>localeNumber(value,Number.isInteger(value)?'0':'0.'+'#'.repeat(20),globalThis.Locale);
  return `${productionBaseTitle(production,name)}\n${t('PRODUCTION_PROGRESS_TIP',progress.yieldName||progress.yieldType,exact(progress.invested),exact(progress.required))}`;
}

// Queue events only replace this display field; settlement order and resource
// slots are not touched, so a production change cannot reorder the list.
export function updateProduction(cityRows,lookup,read=currentProduction) {
  for(const row of cityRows||[]) {
    const city=lookup?.(row.cityID);
    if(!city)continue;
    row.settlementNameData.production=read(city);
  }
  return cityRows;
}
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
  const cityByKey=new Map(),nativeRates=new Map();
  const cities=live.filter(c=>c.Resources).map(c=>{
    const key=cityKey(c), occupied=c.Resources.getAssignedResources();
    const assigned=occupied.filter(r=>!isResourceDamaged(r)).map(r=>toResource(r,key));
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
      preferenceID:preferenceKey(c),connected:!!c.Trade?.isInTradeNetwork(),base,multiplier,offset,postMultiplier,tags,assigned,live:c,
      construction:0,capacity:c.Resources.getAssignedResourcesCap()-occupied.length,tendency:tendencies[preferenceKey(c)],productionRateOffset:0};
    const production=currentProduction(c);
    if(production.queue)city.queue=production.queue;
    if(production.progress?.yieldType===PRODUCTION_YIELD) {
      const remaining=production.progress.required-production.progress.invested;
      if(Number.isFinite(remaining))city.productionRemaining=Math.max(0,remaining);
      const nativeRate=nativeProductionRate(c,production.progress);
      if(nativeRate!==undefined)nativeRates.set(key,nativeRate);
    }
    city.bareBase=bareYields(city,assigned);
    cityByKey.set(key,city);return city;
  });
  if(options.defaultsOnly)return {cities,resources:[]};
  const tab=model.data.resourceTabData;
  const available=new Set();
  tab.availableResourceSectionData.forEach(s=>s.subSections.forEach(sub=>sub.resourceSlotData.forEach(r=>available.add(`${r.isOffMap?'off':'plot'}:${r.resourceValue}`))));
  player.Resources.getResources().forEach(r=>{if(!resourceMap.has(resourceKey(r))&&available.has(resourceKey(r))&&!isResourceDamaged(r))toResource(r);});
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
  // Assigned resources that are not candidates remain fixed in the city.
  // Their conditional production must stay in the baseline; candidate copies
  // are added by cityYieldVector, so this is never counted twice.
  const candidateKeys=new Set(candidates.map(r=>r.key));
  for(const c of cities)c.construction=c.assigned
    .filter(r=>!candidateKeys.has(r.key))
    .reduce((sum,r)=>sum+effectsFor(r,c).construction,0);
  // The native query describes the physical assignments at snapshot time. Only
  // after candidate subtraction/fixed-construction reconstruction can it be
  // compared with the model; use that difference solely as the scoring offset.
  for(const c of cities) {
    if(!nativeRates.has(c.key))continue;
    const modeledRate=cityYieldVector(c,c.assigned.filter(r=>candidateKeys.has(r.key)))[1];
    const correction=nativeRates.get(c.key)-modeledRate;
    if(Number.isFinite(correction))c.productionRateOffset=correction;
  }
  return {resources:candidates,cities};
}

export function findAssignment(r,cities) {
  return cities.find(c=>Cities.get(c.id)?.Resources?.getAssignedResources().some(x=>resourceKey(x)===r.key))?.key;
}
export async function sendOperation(r,city,remove,cities,guard) {
  if(!guard())throw new Error('LOC_RP_CONTEXT_CHANGED');
  const args=assignmentArgs(r,city,remove);
  const check=!isResourceDamaged(r) && Game.PlayerOperations.canStart(GameContext.localPlayerID,PlayerOperationTypes.ASSIGN_RESOURCE,args,false);
  if(!check.Success)throw new Error(t(remove?'CANNOT_REMOVE':'CANNOT_ASSIGN',city.name,Locale.compose(r.definition.Name)));
  Game.PlayerOperations.sendRequest(GameContext.localPlayerID,PlayerOperationTypes.ASSIGN_RESOURCE,args);
  const start=Date.now();
  while(Date.now()-start<4000) {
    const actual=findAssignment(r,cities);
    if(remove?actual!==city.key:actual===city.key)return;
    await new Promise(resolve=>setTimeout(resolve,80));
  }
  throw new Error('LOC_RP_OPERATION_TIMEOUT');
}
