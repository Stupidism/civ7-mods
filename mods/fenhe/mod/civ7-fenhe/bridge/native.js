// Retail 1.5.0 native operations, verified against actual ownership and UI state.
// Never interpret a request's return value as a completed world mutation.
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, predicate, timeout = 8000) {
 const deadline = Date.now() + timeout;
 do { const value = read(); if (predicate(value)) return value; await delay(50); } while (Date.now() < deadline);
 throw Error('原生引擎未在限时内完成操作；已停止后续写入。');
}
function singlePlayer() {
 if (Configuration.getGame().isAnyMultiplayer) throw Error('分合仅支持本地单人游戏。');
}
export function inspectSettlement(location) {
 const c = Cities.getAtLocation(location);
 if (!c) return null;
 return {id:c.id,owner:c.owner,location:c.location,name:c.name,population:c.population,
  capital:c.isCapital,town:c.isTown,
  plots:Array.from(c.getPurchasedPlots()).sort((a,b)=>a-b),
  buildings:c.Constructibles.getIds().map(id=>Constructibles.get(id)?.type).sort((a,b)=>a-b)};
}
export async function transferSettlement(location, expectedOwner, targetOwner) {
 singlePlayer();
 const before=inspectSettlement(location), target=Players.get(targetOwner);
 if (!before || before.owner!==expectedOwner) throw Error('定居点归属与介入方案不符。');
 if (!target?.isAlive) throw Error('目标国家尚未在原生世界中建立。');
 if (expectedOwner===targetOwner) return {before,after:before,changed:false};
 const deal={direction:DiplomacyDealDirection.OUTGOING,player1:expectedOwner,player2:targetOwner};
 Game.DiplomacyDeals.clearWorkingDeal(deal);
 // The capital is omitted by the normal trade picker, but the native transfer
 // itself supports it. All fields below come from the engine's city deal item.
 const item={id:0,from:expectedOwner,to:targetOwner,dealId:0,
  type:DiplomacyDealItemTypes.CITIES,subType:DiplomacyDealItemCityTransferTypes.OFFER,
  enactTurn:-1,duration:0,cityId:before.id,cityTransferType:DiplomacyDealItemCityTransferTypes.OFFER};
 Game.DiplomacyDeals.addItemToWorkingDeal(deal,item);
 Game.DiplomacyDeals.sendWorkingDeal(deal,DiplomacyDealProposalActions.ACCEPTED);
 const after=await until(()=>inspectSettlement(location),c=>c?.owner===targetOwner);
 const plotsPreserved=JSON.stringify(before.plots)===JSON.stringify(after.plots);
 const buildingsPreserved=JSON.stringify(before.buildings)===JSON.stringify(after.buildings);
 if (!plotsPreserved || !buildingsPreserved) throw Error('原生转移改变了地块或建筑，已停止后续写入；请恢复介入前备份。');
 return {before,after,changed:true,populationDelta:after.population-before.population};
}
export async function switchControl(playerID) {
 // Retail Autoplay setters can update the local view without updating the
 // human slot, and repeated switches can stall. Do not mutate either here.
 // The verified path assigns the selected nation during enterWorld setup.
 throw Error('同一局内即时切换控制权尚不稳定；请在分合面板选择国家并进入新时代。');
}
export function exportWorld(fileName, includeCityStates=true) {
 singlePlayer();
 if (!/^Fenhe_[a-zA-Z0-9_-]{1,90}$/.test(fileName)) throw Error('世界导出名称必须属于分合命名空间。');
 WorldBuilderContext.save({FileName:fileName,ContentType:SaveFileTypes.GAME_TRANSITION,
  ContentOptions:{ContentRange:'Complete',ContentFilter:includeCityStates?'Default':'Transition'}});
 return {requested:true,fileName:fileName+'.Civ7Map',verified:false};
}
