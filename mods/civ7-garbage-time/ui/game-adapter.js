import { cityKey, targetAllowed, rankRoutes } from './rules.js';
const yieldNames = { gold:'YIELD_GOLD', food:'YIELD_FOOD', science:'YIELD_SCIENCE', culture:'YIELD_CULTURE', production:'YIELD_PRODUCTION', happiness:'YIELD_HAPPINESS' };
const same = (a,b) => !!a && !!b && Number.isFinite(a.x) && a.x === b.x && a.y === b.y;
export function createGameAdapter(g = globalThis) {
  const { Game, GameInfo, GameContext, Players, Cities, Units, GameplayMap } = g;
  const player = () => Players.get(GameContext.localPlayerID);
  const cities = () => player()?.Cities?.getCities() ?? [];
  const delta = values => Object.fromEntries(Object.entries(yieldNames).map(([k,type]) => [k, values?.[GameInfo.Yields.lookup(type)?.$index]]));
  const cityCommand = (city,type,args) => Game.CityCommands.canStart(city.id,type,args,false).Success;
  const playerOp = (type,args) => Game.PlayerOperations.canStart(GameContext.localPlayerID,type,args,false).Success;
  const unitOp = (unit,type,args={}) => Game.UnitOperations.canStart(unit.id,type,args,false).Success;
  function canRedeemTreasure(unit) {
    // DISBAND is the native treasure-unload command. Restrict it to loaded
    // treasure fleets at an owned homeland settlement, never ordinary units.
    if (unit.id?.owner !== GameContext.localPlayerID ||
        !GameInfo.Units.lookup(unit.type)?.UnitType?.startsWith('UNIT_TREASURE_FLEET') ||
        !(unit.getDisbandBaseAmount() > 0)) return false;
    if (!(unit.location?.x >= 0 && unit.location?.y >= 0)) return false;
    const plot = GameplayMap.getIndexFromLocation(unit.location);
    if (!cities().some(city => !player().isDistantLands(city.location) && city.getPurchasedPlots().includes(plot))) return false;
    return Game.UnitCommands.canStart(unit.id,'UNITCOMMAND_DISBAND',{},false).Success;
  }
  function growthCandidates(city) {
    const candidates = [];
    const result = Game.CityCommands.canStart(city.id, g.CityCommandTypes.EXPAND, {}, false);
    if (result.Success && result.Plots?.length) {
      const all = city.Yields?.calculateAllBuildingsPlacements();
      result.Plots.forEach((plot,i) => {
        // EXPAND returns database row indices; placement previews use hashes.
        const constructible=GameInfo.Constructibles[result.ConstructibleTypes?.[i]];
        const placement = all?.buildings.find(b => b.constructibleType === constructible?.$hash)?.placements.find(p => p.plotID === plot);
        if (!placement?.yieldChanges) return;
        const loc = GameplayMap.getLocationFromIndex(plot);
        const args = { X:loc.x, Y:loc.y };
        candidates.push({ plot, kind:'expand', args, delta:delta(placement.yieldChanges), legal:cityCommand(city,g.CityCommandTypes.EXPAND,args) });
      });
    }
    if (!city.isTown) for (const info of city.Workers?.GetAllPlacementInfo() ?? []) {
      if (info.IsBlocked || info.NumWorkers >= info.MaxWorkers) continue;
      const args = { Location:info.PlotIndex, Amount:1 };
      const changes = info.NextYields.map((next,i) => next - info.CurrentYields[i] - (info.NextMaintenance[i] - info.CurrentMaintenance[i]));
      candidates.push({ plot:info.PlotIndex, kind:'worker', args, delta:delta(changes), legal:playerOp(g.PlayerOperationTypes.ASSIGN_WORKER,args) });
    }
    return candidates;
  }
  function research(kind) {
    const p = player();
    const library = kind === 'technology' ? p.Techs : p.Culture;
    const current=library.getResearching?.();
    // Tree IN_PROGRESS means accumulated points, not necessarily the active
    // choice. A newly selected node can still have zero progress / OPEN state.
    if(current?.type != null && current.type !== -1)return {active:true,candidates:[]};
    const type = kind === 'technology' ? g.PlayerOperationTypes.SET_TECH_TREE_NODE : g.PlayerOperationTypes.SET_CULTURE_TREE_NODE;
    const trees = kind === 'technology' ? [library.getTreeType()] : library.getAvailableTrees();
    const nodes = trees.flatMap(tree => Game.ProgressionTrees.getTree(p.id,tree)?.nodes ?? []);
    const candidates = nodes.filter(n => n.state !== g.ProgressionTreeNodeState.NODE_STATE_CLOSED &&
      n.state !== g.ProgressionTreeNodeState.NODE_STATE_INVALID && n.state !== g.ProgressionTreeNodeState.NODE_STATE_FULLY_UNLOCKED)
      .map(n => ({ ...n, type, args:{ProgressionTreeNodeType:n.nodeType}, turns:library.getTurnsForNode(n.nodeType),
        repeat: (n.repeatedDepth ?? 0) > 0 || /FUTURE/.test(GameInfo.ProgressionTreeNodes.lookup(n.nodeType)?.ProgressionTreeNodeType ?? '') }))
      .filter(n => playerOp(type,n.args));
    candidates.sort((a,b) => Number(a.repeat)-Number(b.repeat) || a.turns-b.turns || a.nodeType-b.nodeType);
    return {active:false,candidates};
  }
  function validRoute(unit, plot) {
    const location = GameplayMap.getLocationFromIndex(plot);
    if (same(unit.location,location)) return { plot, location, cost:0 };
    // Movement only. No swap, attack modifier, or declaration-of-war request.
    const args = { X:location.x, Y:location.y, Modifiers:g.UnitOperationMoveModifiers.NONE };
    if (!unitOp(unit,'UNITOPERATION_MOVE_TO',args)) return null;
    const path = Units.getPathTo(unit.id,location);
    if (!path?.plots?.length || path.plots[path.plots.length-1] !== plot) return null;
    if (path.plots.some(index => {
      const p=GameplayMap.getLocationFromIndex(index);
      if (g.MapUnits.getUnits(p.x,p.y).some(id => id.owner !== unit.owner && player()?.Diplomacy?.isAtWarWith(id.owner))) return true;
      const owner=GameplayMap.getOwningCityFromXY?.(p.x,p.y)?.owner;
      if (owner != null && owner >= 0 && owner !== unit.owner && player()?.Diplomacy?.isAtWarWith(owner)) return true;
      const districtID=g.MapCities?.getDistrict(p.x,p.y);
      const district=districtID ? g.Districts?.get(districtID) : null;
      // Unoccupied hostile/independent districts can otherwise be captured by
      // a plain MOVE_TO. Never let a military return order enter one.
      return district?.owner >= 0 && district.owner !== unit.owner && (unit.isCombat || unit.isCommanderUnit);
    })) return null;
    return { plot, location, args, cost:(path.turns?.[path.turns.length-1] ?? path.plots.length) * 10000 + path.plots.length };
  }
  function routeToCities(unit, choices, allowTerritory, reservations = new Set()) {
    const routes = [];
    const current = GameplayMap.getIndexFromLocation(unit.location);
    const air=GameInfo.Units.lookup(unit.type)?.Domain==='DOMAIN_AIR';
    if (allowTerritory && !reservations.has(current)) {
      const city=choices.find(c=>c.getPurchasedPlots().includes(current));
      if(city)return {plot:current,location:unit.location,cost:0,city};
    }
    if(air){
      // Air units use the same legal rebasing plots as the native rebase UI.
      const available=Game.UnitOperations.canStart(unit.id,'UNITOPERATION_REBASE',{},false);
      for(const plot of available.Plots??[]){
        const city=choices.find(c=>c.getPurchasedPlots().includes(plot));
        if(!city)continue;
        const location=GameplayMap.getLocationFromIndex(plot),args={X:location.x,Y:location.y};
        if(unitOp(unit,'UNITOPERATION_REBASE',args))routes.push({plot,location,city,args,operation:'UNITOPERATION_REBASE',cost:GameplayMap.getPlotDistance(unit.location.x,unit.location.y,location.x,location.y)});
      }
      return rankRoutes(routes)[0]??null;
    }
    for (const city of choices) {
      const center = GameplayMap.getIndexFromLocation(city.location);
      const centerRoute = reservations.has(center) ? null : validRoute(unit,center);
      if (centerRoute) { routes.push({...centerRoute,city}); continue; }
      if (!allowTerritory) continue;
      for (const plot of city.getPurchasedPlots()) {
        if (reservations.has(plot)) continue;
        const r = validRoute(unit,plot);
        if (r) routes.push({...r,city});
      }
    }
    return rankRoutes(routes)[0] ?? null;
  }
  function routeToReligion(unit, choices) {
    const religion=player().Religion?.getReligionType();
    if(unit.Religion?.spreadCharges <= 0 || unit.Religion?.religionType !== religion)return null;
    const routes=[];
    for(const city of choices) {
      if(unit.Religion.isNoForeignSpread && city.owner!==unit.owner)continue;
      // A settlement can have different urban and rural religions. Going only
      // to its center can strand a missionary after its urban area converts.
      for(const plot of city.getPurchasedPlots()) {
        const loc=GameplayMap.getLocationFromIndex(plot),id=g.MapCities.getDistrict(loc.x,loc.y);
        const district=id?g.Districts.get(id):null;
        if(!district)continue;
        if((district.isUrbanCore?city.Religion.urbanReligion:city.Religion.ruralReligion)===religion)continue;
        const route=validRoute(unit,plot);
        if(route)routes.push({...route,city});
      }
    }
    return rankRoutes(routes)[0]??null;
  }
  function religionCities(targets) {
    const p = player();
    if (!p.Religion?.hasCreatedReligion()) return [];
    const religion = p.Religion.getReligionType();
    const result = [];
    for (const owner of Players.getAlive()) {
      if(owner.isIndependent)continue;
      if (!targetAllowed(owner.id,p.id,owner.isMinor,targets)) continue;
      for (const city of owner.Cities?.getCities() ?? []) {
        if (GameplayMap.getRevealedState(p.id,city.location.x,city.location.y) === g.RevealedStates.HIDDEN) continue;
        if (city.Religion?.majorityReligion !== religion) result.push(city);
      }
    }
    return result;
  }
  return {
    player, cities, units:() => player()?.Units?.getUnits() ?? [],
    turn:() => Game.turn, context:() => `${Game.age}:${GameContext.localPlayerID}`,
    canRun:() => !!player()?.isTurnActive && !g.Configuration.getGame().isAnyMultiplayer,
    happiness:city => city.Happiness?.netHappinessPerTurn,
    growthReady:city => city.Growth?.isReadyToPlacePopulation === true,
    growthFingerprint:city => `${Game.turn}:${city.population}:${city.pendingPopulation}:${city.getPurchasedPlots().length}:${JSON.stringify(city.Workers?.GetAllPlacementInfo()?.map(i=>[i.PlotIndex,i.NumWorkers]))}`,
    growthCandidates,
    assign(city,c) {
      if (c.kind === 'expand' && cityCommand(city,g.CityCommandTypes.EXPAND,c.args)) Game.CityCommands.sendRequest(city.id,g.CityCommandTypes.EXPAND,c.args);
      else if (c.kind === 'worker' && playerOp(g.PlayerOperationTypes.ASSIGN_WORKER,c.args)) Game.PlayerOperations.sendRequest(GameContext.localPlayerID,g.PlayerOperationTypes.ASSIGN_WORKER,c.args);
    },
    queue:city => city.BuildQueue?.getQueue() ?? [],
    projects(city) { return ['science','culture'].filter(kind => {
      const def = GameInfo.Projects.lookup(`PROJECT_CITY_${kind.toUpperCase()}_PROJECT`);
      return def && Game.CityOperations.canStart(city.id,g.CityOperationTypes.BUILD,{ProjectType:def.$hash},false).Success;
    }); },
    build(city,kind) {
      const def = GameInfo.Projects.lookup(`PROJECT_CITY_${kind.toUpperCase()}_PROJECT`);
      const args = {ProjectType:def.$hash};
      if (Game.CityOperations.canStart(city.id,g.CityOperationTypes.BUILD,args,false).Success) Game.CityOperations.sendRequest(city.id,g.CityOperationTypes.BUILD,args);
    },
    research,
    startResearch(candidate) { if (playerOp(candidate.type,candidate.args)) Game.PlayerOperations.sendRequest(GameContext.localPlayerID,candidate.type,candidate.args); },
    classify(unit) {
      const def = GameInfo.Units.lookup(unit.type);
      if (def?.UnitType.startsWith('UNIT_TREASURE_FLEET')) return 'treasure';
      if (def?.SpreadCharges > 0) return 'religion';
      if (!def?.StaticConstructibleUnit && (unit.isCommanderUnit || ['CORE_CLASS_MILITARY','CORE_CLASS_RECON'].includes(def?.CoreClass))) return 'military';
      return null;
    },
    onMap:unit => unit.location?.x >= 0 && unit.location?.y >= 0,
    cancelOrder(unit,order) {
      if (!same(Units.getQueuedOperationDestination(unit.id),order.destination)) return false;
      if (Game.UnitCommands.canStart(unit.id,'UNITCOMMAND_CANCEL',{},false).Success) {
        Game.UnitCommands.sendRequest(unit.id,'UNITCOMMAND_CANCEL',{});return true;
      }
      return false;
    },
    unitFingerprint:unit => `${Game.turn}:${unit.location.x},${unit.location.y}:${unit.Movement?.movementMovesRemaining}:${unit.getOperationType()}`,
    canMove:unit => !unit.isBusy && (unit.Movement?.movementMovesRemaining > 0 ||
      (GameInfo.Units.lookup(unit.type)?.Domain==='DOMAIN_AIR' && unitOp(unit,'UNITOPERATION_REBASE',{}))),
    routeToCities, routeToReligion, religionCities,
    homeland:city => !player().isDistantLands(city.location),
    at: (unit,route) => same(unit.location,route.location),
    canRedeemTreasure,
    redeemTreasure(unit) {
      if (!canRedeemTreasure(unit)) return false;
      Game.UnitCommands.sendRequest(unit.id,'UNITCOMMAND_DISBAND',{});
      return true;
    },
    move(unit,route) {
      if (same(Units.getQueuedOperationDestination(unit.id),route.location)) return false;
      const operation=route.operation??'UNITOPERATION_MOVE_TO';
      if (route.args && unitOp(unit,operation,route.args)) {Game.UnitOperations.sendRequest(unit.id,operation,route.args);return true;}
      return false;
    },
    sleep(unit) {
      if (unit.activityType === g.UnitActivityTypes?.SLEEP) return;
      if (unitOp(unit,'UNITOPERATION_SLEEP',{})) Game.UnitOperations.sendRequest(unit.id,'UNITOPERATION_SLEEP',{});
    },
    // Use the native spread operation; no direct gameplay mutation.
    spread(unit) {
      const target = {};
      if (unitOp(unit,'UNITOPERATION_SPREAD_RELIGION',target)) { Game.UnitOperations.sendRequest(unit.id,'UNITOPERATION_SPREAD_RELIGION',target); return true; }
      return false;
    },
    unitOp, cityKey
  };
}
