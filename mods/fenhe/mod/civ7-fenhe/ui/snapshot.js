export function captureWorld() {
 const loc=s=>Locale.compose(s), rawPlayers=Players.getAliveIds().map(id=>Players.get(id)), settlements=[];
 const yieldDefs=Array.from(GameInfo.Yields), happinessBuildings=Array.from(GameInfo.Constructible_YieldChanges).filter(r=>r.YieldType==='YIELD_HAPPINESS'&&r.YieldChange>0);
 const players=rawPlayers.map(p=>({id:'p'+p.id,nativeId:p.id,name:loc(p.civilizationName),leader:GameInfo.Leaders.lookup(p.leaderType)?.LeaderType??null,leaderName:loc(p.leaderName),civilization:GameInfo.Civilizations.lookup(p.civilizationType)?.CivilizationType??null,human:p.isHuman,major:p.isMajor,independent:p.isIndependent,cityStateType:p.isMajor?null:GameInfo.CityStateTypes.lookup(p.getCityStateCityStateType())?.CityStateType,gold:p.Treasury?.goldBalance??0}));
 for(const p of rawPlayers) for(const c of p.Cities?.getCities()??[]) {
  const ys=c.Yields.getYields(), plots=Array.from(c.getPurchasedPlots()), candidates=[];
  for(const row of happinessBuildings){const d=GameInfo.Constructibles.lookup(row.ConstructibleType),b=GameInfo.Buildings.lookup(row.ConstructibleType); if(!d||!b?.Purchasable||b.Capital||b.TraitType||d.Age!==GameInfo.Ages.lookup(Game.age)?.AgeType||c.Constructibles.hasConstructible(row.ConstructibleType,false))continue;const cost=c.Gold.getBuildingPurchaseCost(YieldTypes.YIELD_GOLD,row.ConstructibleType);if(Number.isFinite(cost)&&cost>0)candidates.push({type:row.ConstructibleType,name:loc(d.Name),cost,happiness:row.YieldChange});}
  settlements.push({id:'s'+c.location.x+'_'+c.location.y,nativeId:c.id,name:loc(c.name),owner:'p'+p.id,originalOwner:'p'+c.originalOwner,isCity:!c.isTown,isCapital:c.isCapital,x:c.location.x,y:c.location.y,population:c.population,happiness:c.Happiness.netHappinessPerTurn,focus:GameInfo.Projects.lookup(c.Growth.projectType)?.ProjectType??null,yields:Object.fromEntries(yieldDefs.map(d=>[d.YieldType.slice(6).toLowerCase(),ys[d.$index]?.value??0])),plots,buildings:candidates,military:0});
 }
 const distances={}; for(const a of settlements){distances[a.id]={};for(const b of settlements)distances[a.id][b.id]=GameplayMap.getPlotDistance(a.x,a.y,b.x,b.y);}
 const units=[]; for(const p of rawPlayers) for(const u of p.Units?.getUnits()??[]){
  if(!u.isCombat||u.isDead||u.isCommanderUnit)continue;
  const strength=Math.max(u.Combat?.getMeleeStrength(false)??0,u.Combat?.rangedStrength??0,u.Combat?.bombardStrength??0)*(1-(u.Health?.damage??0)/(u.Health?.maxDamage??100));
  const own=settlements.filter(s=>s.owner==='p'+p.id).sort((a,b)=>GameplayMap.getPlotDistance(a.x,a.y,u.location.x,u.location.y)-GameplayMap.getPlotDistance(b.x,b.y,u.location.x,u.location.y));
  if(own[0])own[0].military+=strength;
  units.push({owner:'p'+p.id,type:u.typeName,x:u.location.x,y:u.location.y,strength,assignedSettlement:own[0]?.id??null});
 }
 const claim=new Map();for(const s of settlements)for(const i of s.plots)claim.set(i,s.id);
 const edges=new Set();for(const [i,s] of claim){const pos=GameplayMap.getLocationFromIndex(i);for(let d=0;d<6;d++){const q=GameplayMap.getAdjacentPlotLocation(pos,d);if(!q||!GameplayMap.isValidLocation(q))continue;const t=claim.get(GameplayMap.getIndexFromLocation(q));if(t&&t!==s)edges.add([s,t].sort().join('|'));}}
 const tiles=[];for(let i=0;i<GameplayMap.getPlotCount();i++){const pos=GameplayMap.getLocationFromIndex(i);tiles.push({i,x:pos.x,y:pos.y,water:GameplayMap.isWater(pos.x,pos.y),impassable:GameplayMap.isImpassable(pos.x,pos.y),neighbors:[0,1,2,3,4,5].map(d=>GameplayMap.getAdjacentPlotLocation(pos,d)).filter(q=>q&&GameplayMap.isValidLocation(q)).map(q=>GameplayMap.getIndexFromLocation(q)),settlement:claim.get(i)??null});}
 return {schemaVersion:1,provenance:{source:'Civ7 official Cohtml live game API',extractedAt:new Date().toISOString(),gameVersion:'1.5.0',turn:Game.turn,displayTurn:Game.turn,age:GameInfo.Ages.lookup(Game.age)?.AgeType,localPlayer:'p'+GameContext.localPlayerID,buildingCaveat:'Positive engine purchase cost, not all placement/prerequisite legality checks; external simulation abstraction'},map:{width:GameplayMap.getGridWidth(),height:GameplayMap.getGridHeight(),tiles},players:players.filter(p=>settlements.some(s=>s.owner===p.id)),settlements,edges:Array.from(edges).map(x=>x.split('|')),distances,units,leaders:Array.from(GameInfo.Leaders).filter(x=>x.IsMajorLeader).map(x=>({id:x.LeaderType,name:loc(x.Name)}))};
}
