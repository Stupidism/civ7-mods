import {evaluate} from './cdp.mjs';

// Keep all game mutations on the game's own single-player request queue.
export async function finishCityStates(plan){
 const result=await evaluate(`(async()=>{
  const plan=${JSON.stringify(plan)};
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const until=async(read,ok)=>{for(let i=0;i<100;i++){const v=read();if(ok(v))return v;await sleep(100);}throw Error('城邦原生操作超时');};
  const inspect=c=>({id:c.id,owner:c.owner,name:c.name,location:c.location,population:c.population,plots:Array.from(c.getPurchasedPlots()).sort((a,b)=>a-b),buildings:c.Constructibles.getIds().map(id=>({type:Constructibles.get(id).type,location:Constructibles.get(id).location}))});
  if(Configuration.getGame().isAnyMultiplayer)throw Error('仅限本地单人');
  const audit=[],mapping=[];
  const minors=plan.polities.filter(n=>!n.major);
  // Native births can allocate the configured slots in a different order.
  // Bind identities by the independent hash, never by assumed spawn order.
  for(let i=0;i<minors.length;i++){
   const n=minors[i],def=GameInfo.Independents.lookup('INDEPENDENT_FENHE_'+i);
   if(!def||def.CityStateType!==n.cityStateType)throw Error('城邦类别数据库未生效：'+i);
   const p=Players.getAliveIds().map(id=>Players.get(id)).find(p=>!p.isMajor&&p.Influence?.tribeTypeHash===def.$hash);
   if(!p)throw Error('原生城邦身份尚未出生：'+i);
   mapping.push({from:n.slot,to:p.id});
   const tempCities=p.Cities.getCities().map(c=>c.location);
   if(!p.Cities.numCities){
    p.Influence.setSuzerain(plan.humanSlot);
    const born=await until(()=>p.Cities.getCities(),v=>v.length>0);
    tempCities.push(...born.map(c=>c.location));
   }
   for(const s of plan.settlements.filter(s=>s.owner===n.slot)){
    const location={x:s.x,y:s.y},city=Cities.getAtLocation(location);
    if(!city||city.owner!==plan.humanSlot)throw Error('城邦待移交定居点缺失：'+s.name);
    const before=inspect(city),deal={direction:DiplomacyDealDirection.OUTGOING,player1:city.owner,player2:p.id};
    Game.DiplomacyDeals.clearWorkingDeal(deal);
    Game.DiplomacyDeals.addItemToWorkingDeal(deal,{id:0,from:city.owner,to:p.id,dealId:0,type:DiplomacyDealItemTypes.CITIES,subType:DiplomacyDealItemCityTransferTypes.OFFER,enactTurn:-1,duration:0,cityId:city.id,cityTransferType:DiplomacyDealItemCityTransferTypes.OFFER});
    Game.DiplomacyDeals.sendWorkingDeal(deal,DiplomacyDealProposalActions.ACCEPTED);
    const transferred=await until(()=>Cities.getAtLocation(location),c=>c?.owner===p.id);
    const after=inspect(transferred);
    if(JSON.stringify(before.plots)!==JSON.stringify(after.plots))throw Error('城邦转移改变了地块：'+s.name);
    audit.push({settlement:s.id,logicalNation:n.id,before,after});
   }
   // The official capital effect requires a live old capital. UI operations
   // cannot SELECT_CAPITAL for a nonlocal player, so use a scenario-only marker.
   const target=plan.settlements.find(s=>s.owner===n.slot);
   const capitalCity=Cities.getAtLocation({x:target.x,y:target.y});
   if(!p.Cities.getCapital())throw Error('城邦临时首都缺失，停止迁都');
   const marker=GameInfo.Constructibles.lookup('BUILDING_FENHE_CAPITAL_MARKER');
   if(!marker)throw Error('城邦迁都效果未加载');
   Game.PlayerOperations.sendRequest(GameContext.localPlayerID,'CREATE_ELEMENT',{Kind:'CONSTRUCTIBLE',Type:marker.$index,Location:capitalCity.location,Owner:p.id,Parent:capitalCity.id,Progress:100});
   await until(()=>p.Cities.getCapital(),c=>c?.location.x===target.x&&c?.location.y===target.y);
   const markers=capitalCity.Constructibles.getIds().filter(id=>Constructibles.get(id)?.type===marker.$hash);
   for(const id of markers)Game.PlayerOperations.sendRequest(GameContext.localPlayerID,'DESTROY_ELEMENT',{Kind:'CONSTRUCTIBLE',Owner:id.owner,LocalID:id.id});
   await until(()=>capitalCity.Constructibles.getIds().filter(id=>Constructibles.get(id)?.type===marker.$hash),v=>v.length===0);
   // Destroy only cities created by the native village promotion in this step.
   for(const loc of tempCities){const c=Cities.getAtLocation(loc);if(c&&c.owner===p.id)p.Cities.destroy(c.id);}
   await until(()=>p.Cities.getCities(),v=>v.length===plan.settlements.filter(s=>s.owner===n.slot).length);
   p.Influence.setSuzerain(-1);
   await until(()=>p.Influence.getSuzerain(),x=>x===-1);
   if(!p.Cities.getCapital()?.isCapital)throw Error('城邦首都未保留');
  }
  const remap=new Map(mapping.map(x=>[x.from,x.to]));
  for(const n of plan.polities){const id=remap.get(n.slot)??n.slot;const p=Players.get(id);p.Treasury.changeGoldBalance(n.gold-p.Treasury.goldBalance,-1);}
  return {mapping,audit,phase:Configuration.getGame().getValue('FenheImportPhase'),turn:Game.turn};
 })()`, 'root-game.html', 120000);
 const remap=new Map(result.mapping.map(x=>[x.from,x.to]));
 for(const s of plan.settlements)s.owner=remap.get(s.owner)??s.owner;
 for(const n of plan.polities)n.slot=remap.get(n.slot)??n.slot;
 return result;
}
