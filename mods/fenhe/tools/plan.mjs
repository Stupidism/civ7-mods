import {interventionOptions,cityStateType} from '../sim/engine.js';

// Allocate stable native slots once. The selected state is never silently
// compressed to fit the map's ordinary eight-player limit.
export function makePlan(world,run,round,faction,civilizationChoices={}) {
 const state=run.history[round];
 if(!state?.settlements||!state.polities)throw Error('缺少完整推演快照');
 const originals=new Map(world.players.map(p=>[p.id,p]));
 const eligible=interventionOptions(world,run,round);
 faction??=eligible.preferred??eligible.options.find(p=>p.major)?.id??eligible.fallback.find(p=>p.major)?.id;
 const groups=state.polities.map(p=>({...p,major:p.major??(originals.get(p.id)?.major??p.type===null)}));
 const selected=groups.find(p=>p.id===faction);
 if(!selected?.major)throw Error('请选择可以控制的大文明；独立城邦保持原生城邦身份。');
 const majors=groups.filter(p=>p.major).sort((a,b)=>Number(b.id===faction)-Number(a.id===faction)),minors=groups.filter(p=>!p.major);
 if(majors.length>32||groups.length>62)throw Error('推演势力超出本版本验证范围，不能截断版图。');
 const nations=[...majors,...minors].map((p,slot)=>({
  ...p,slot,originNative:originals.get(p.origin)?.nativeId,previousCivilization:originals.get(p.origin)?.civilization,
  civilization:p.major?(civilizationChoices[p.id]??p.civilization):'CIVILIZATION_INDEPENDENT',
  leader:p.major?p.leader:'LEADER_MINOR_CIV_DEFAULT',gold:Math.max(0,p.gold)
 }));
 if(nations.some(n=>!Number.isInteger(n.originNative)||!n.leader||!n.civilization))throw Error('推演国家缺少可加载的原生身份');
 const slots=new Map(nations.map(n=>[n.id,n.slot]));
 const byId=new Map(world.settlements.map(s=>[s.id,s]));
 const settlements=state.settlements.map(s=>{const source=byId.get(s.id);if(!source)throw Error('快照中的定居点不存在');return {...s,owner:slots.get(s.owner),plot:source.y*world.map.width+source.x,x:source.x,y:source.y,name:source.name,population:source.population,isCity:source.isCity,capital:!!source.isCapital};});
 const categories={gold:'ECONOMIC',food:'EXPANSIONIST',science:'SCIENTIFIC',culture:'CULTURAL',production:'MILITARISTIC',military:'MILITARISTIC',diplomacy:'DIPLOMATIC'};
 for(const n of nations.filter(n=>!n.major)){
  const s=settlements.find(s=>s.owner===n.slot),original=originals.get(n.id);
  n.cityStateType=original?.cityStateType??categories[n.type??cityStateType(byId.get(s.id))];
  if(!Object.values(categories).includes(n.cityStateType))throw Error('城邦类别缺失：'+n.id);
 }
 if(settlements.some(s=>s.owner===undefined)||new Set(settlements.map(s=>s.plot)).size!==world.settlements.length)throw Error('定居点归属方案不完整');
 const ages=['AGE_ANTIQUITY','AGE_EXPLORATION','AGE_MODERN'],ageIndex=ages.indexOf(world.provenance.age);
 if(ageIndex<0||ageIndex>=2)throw Error('当前版本仅支持古典→探索、探索→近世。');
 return {schemaVersion:1,title:`分合 · 第${round}轮`,round,sourceAge:ages[ageIndex],targetAge:ages[ageIndex+1],mapSizeType:majors.length>12?'MAPSIZE_FENHE':'MAPSIZE_HUGE',width:world.map.width,height:world.map.height,majorCount:majors.length,humanSlot:slots.get(faction),faction,polities:nations,settlements,source:world.provenance};
}

