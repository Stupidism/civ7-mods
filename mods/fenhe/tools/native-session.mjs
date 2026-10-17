import {evaluate,waitFor,sleep} from './cdp.mjs';
import {finishCityStates} from './citystates.mjs';

export async function enterWorld(plan,{stageOnly=false}={}){
 await waitFor(()=>evaluate('({ready:typeof GameSetup!=="undefined"})','root-shell.html'),x=>x.ready);
 const setup=`(()=>{
 const plan=${JSON.stringify(plan)};
 GameSetup.setGameParameterValue('Age',plan.targetAge);
 GameSetup.setGameParameterValue('Map','{civ7-fenhe}maps/Fenhe_Intervention.Civ7Map');
 GameSetup.setGameParameterValue('MapSize',plan.mapSizeType??'MAPSIZE_HUGE');
 Configuration.editGame().clearPreviousAges();
 if(plan.sourceAge)Configuration.editGame().pushPreviousAge(Database.makeHash(plan.sourceAge));
 Configuration.editGame().setValue('CITY_STATE_COUNT',0);
 Configuration.editGame().setValue('FenheImportPhase','INIT');
 for(let i=0;i<61;i++)Configuration.editGame().clearValue('FenheMinor'+i);
 plan.polities.filter(n=>!n.major).forEach((n,i)=>Configuration.editGame().setValue('FenheMinor'+i,n.cityStateType));
 for(let id=0;id<62;id++)Configuration.editPlayer(id).setSlotStatus(SlotStatus.SS_CLOSED);
 for(const n of plan.polities){
  const p=Configuration.editPlayer(n.slot);
  if(n.major)p.setAsMajorCiv();else p.setCivilizationLevelTypeName('CIVILIZATION_LEVEL_CITY_STATE');
  p.setSlotStatus(n.slot===plan.humanSlot?SlotStatus.SS_TAKEN:SlotStatus.SS_COMPUTER);
  p.setCivilizationTypeName(n.major?n.civilization:'CIVILIZATION_PLACEHOLDER_CITYSTATE');p.setLeaderTypeName(n.leader);p.setTeam(n.slot);p.setAlive(true);
  p.clearPreviousCivilizations();
  if(n.major&&n.previousCivilization)p.pushPreviousCivilization(Database.makeHash(n.previousCivilization));
  // IndependentTribeIndex/Type are native typed variants, not JS numbers.
  // Only the native independent creation path may populate these values.
 }
 const identities=plan.polities.map(n=>{const p=Configuration.getPlayer(n.slot);return {slot:n.slot,civ:p.civilizationTypeName,leader:p.leaderTypeName,level:p.civilizationLevelTypeName};});
 return {age:GameSetup.findGameParameter('Age').value.value,map:Configuration.getMap().script,mapName:Configuration.getMap().getValue('Name'),mapSize:Configuration.getMap().mapSizeTypeName,mapSizeHash:Configuration.getMap().mapSize,max:Configuration.getMap().maxMajorPlayers,identities};
 })()`;
 const configured=await evaluate(setup,'root-shell.html');
 if(configured.age!==plan.targetAge||configured.mapSize!==(plan.mapSizeType??'MAPSIZE_HUGE')||configured.identities.some((p,i)=>p.civ!==(plan.polities[i].major?plan.polities[i].civilization:'CIVILIZATION_PLACEHOLDER_CITYSTATE')||p.leader!==plan.polities[i].leader))throw Error('游戏重置了国家或地图配置；已停止启动。');
 if(!configured.mapName||configured.mapSizeHash==null)throw Error('地图名称或尺寸标识缺失');
 console.log('配置国家',configured.identities.length,'时代',configured.age,'地图',configured.mapSize,configured.mapSizeHash,'名称',configured.mapName);
 await evaluate('engine.call("startGame")','root-shell.html');
 await waitFor(()=>evaluate('({ready:typeof Game!=="undefined"&&Loading.isLoaded,age:typeof Game!=="undefined"?GameInfo.Ages.lookup(Game.age).AgeType:null})'),s=>s.ready&&s.age===plan.targetAge,{timeout:240000});
 await evaluate('UI.notifyUIReady()');
 await sleep(2000);
 if(stageOnly)return inspectWorld();
 const changes=await finishCityStates(plan);
 const actual=await inspectWorld();
 const errors=verifyWorld(plan,actual);
 if(errors.length)throw Error('世界写回核对失败：'+errors.join('；'));
 return {...actual,changes};
}
export async function reloadWorld(saveName){
 try{await evaluate('engine.call("exitToMainMenu")');}catch(e){if(!e.message.includes('界面尚未就绪'))throw e;}
 await waitFor(()=>evaluate('true','root-shell.html'),x=>x);
 await evaluate(`Network.loadGame({Location:SaveLocations.LOCAL_STORAGE,LocationCategories:SaveLocationCategories.NORMAL,Type:SaveTypes.SINGLE_PLAYER,ContentType:SaveFileTypes.GAME_STATE,FileName:${JSON.stringify(saveName)}},ServerType.SERVER_TYPE_NONE)`,'root-shell.html');
 await waitFor(()=>evaluate('Loading.isLoaded'),x=>x,{timeout:240000});
 await evaluate('UI.notifyUIReady()');await sleep(1500);
 return inspectWorld();
}
export async function inspectWorld(){return evaluate(`(()=>({age:GameInfo.Ages.lookup(Game.age).AgeType,turn:Game.turn,local:GameContext.localPlayerID,players:Players.getAliveIds().map(id=>{const p=Players.get(id);return {slot:id,major:p.isMajor,human:p.isHuman,independent:p.isIndependent,level:Configuration.getPlayer(id).civilizationLevelTypeName,cityStateType:GameInfo.CityStateTypes.lookup(p.getCityStateCityStateType())?.CityStateType,tribe:p.Influence?.tribeTypeHash,gold:p.Treasury?.goldBalance,civilization:GameInfo.Civilizations.lookup(p.civilizationType)?.CivilizationType,leader:GameInfo.Leaders.lookup(p.leaderType)?.LeaderType,cities:p.Cities?.getCities().map(c=>({x:c.location.x,y:c.location.y,name:Locale.compose(c.name),owner:c.owner,population:c.population,plots:c.getPurchasedPlots().length,buildings:c.Constructibles.getIds().length,capital:c.isCapital}))??[]}})}))()`);}
export function verifyWorld(plan,actual){
 const errors=[];
 if(actual.age!==plan.targetAge)errors.push('时代不匹配');
 if(actual.local!==plan.humanSlot)errors.push('玩家控制权不匹配');
 if(actual.players.filter(p=>p.human).length!==1||!actual.players.find(p=>p.slot===plan.humanSlot)?.human)errors.push('人类玩家登记不匹配');
 const settlements=new Map(actual.players.flatMap(p=>p.cities.map(c=>[c.y*plan.width+c.x,c])));
 for(const expected of plan.settlements){const c=settlements.get(expected.plot);if(!c||c.owner!==expected.owner)errors.push('定居点'+expected.plot+'归属不匹配');}
 if(settlements.size!==plan.settlements.length)errors.push('定居点数量不匹配');
 for(const n of plan.polities){const p=actual.players.find(p=>p.slot===n.slot);if(!p||p.major!==n.major||p.civilization!==n.civilization||(n.major&&p.leader!==n.leader))errors.push('国家'+n.id+'身份不匹配');}
 for(const n of plan.polities){const p=actual.players.find(p=>p.slot===n.slot);if(!p||Math.abs(p.gold-n.gold)>0.02)errors.push('国家'+n.id+'国库不匹配');}
 for(const n of plan.polities.filter(n=>!n.major)){const p=actual.players.find(p=>p.slot===n.slot);if(!p||p.level!=='CIVILIZATION_LEVEL_CITY_STATE'||!p.cityStateType||(n.cityStateType&&p.cityStateType!==n.cityStateType))errors.push('城邦'+n.id+'类别或原生等级未恢复');if(p?.cities.filter(c=>c.capital).length!==1)errors.push('城邦'+n.id+'没有唯一首都');}
 return errors;
}
