import { cityKey, citySettings, chooseGrowth, chooseProject, createRequestGate } from './rules.js';
export function createAutomation(api, { getConfig, getSession, saveSession, report, blocked = () => false }) {
  const gate = createRequestGate();
  const routes = new Map();
  let context = null;
  let running = false;
  let disposed = false;
  let lastTurn = -1;
  const status = { alerts:[], notes:[], actions:0 };
  function guarded(label,fn) {
    try { fn(); } catch (error) { status.notes.push(`${label}暂未执行`); report(label,error); }
  }
  function tick() {
    if (disposed || running || blocked() || !api.canRun()) return status;
    running = true;
    try {
      const current = api.context();
      if (context !== current || api.turn() !== lastTurn) { gate.clear(); routes.clear(); context = current; lastTurn = api.turn(); }
      const config = getConfig();
      const state = getSession();
      status.alerts = []; status.notes = [];
      const ownCities = api.cities();
      let ordersChanged=false;
      for (const city of ownCities) guarded('定居点',() => {
        const settings = citySettings(config,state,city);
        if (!settings.enabled) return;
        const key = cityKey(city);
        const happiness = api.happiness(city);
        if (!Number.isFinite(happiness) || happiness <= settings.minHappiness) status.alerts.push({ city, happiness, threshold:settings.minHappiness });
        if (api.growthReady(city)) {
          const choice = chooseGrowth(api.growthCandidates(city),settings.weights,happiness,settings.minHappiness);
          if (choice) {
            if (gate.run(`growth:${key}`,api.growthFingerprint(city),() => api.assign(city,choice))) status.actions++;
          } else if (happiness > settings.minHappiness) status.notes.push(`${city.name}：没有符合快乐度要求的人口落点`);
        } else gate.forget(`growth:${key}`);
        if (city.isTown) return;
        if (api.queue(city).length) { gate.forget(`project:${key}`); return; }
        const project = chooseProject(api.projects(city),settings.weights);
        if (project && gate.run(`project:${key}`,`${api.turn()}`,() => api.build(city,project))) {
          status.actions++;
        }
      });
      for (const kind of ['technology','culture']) if (state[kind]) guarded(kind,() => {
        const research = api.research(kind);
        if (research.active) { gate.forget(kind); return; }
        const next = research.candidates[0];
        if (next && gate.run(kind,`${api.turn()}:${next.nodeType}:${next.depthUnlocked}:${next.repeatedDepth}`,() => api.startResearch(next))) status.actions++;
      });
      const reservations = new Set();
      let planned = 0;
      const religious = state.religion ? api.religionCities(config.religionTargets) : [];
      for (const unit of api.units()) guarded('单位',() => {
        const kind = api.classify(unit);
        const key = `${unit.id?.owner}:${unit.id?.id}`;
        const order=state.orders?.[key];
        if(order && (!state[order.kind] || (order.kind==='military' && config.militaryMode==='rally' && !ownCities.some(c=>cityKey(c)===state.rallyCity)))){
          api.cancelOrder?.(unit,order);
          delete state.orders[key];ordersChanged=true;routes.delete(key);
        }
        if (!kind || !state[kind] || !api.onMap(unit)) return;
        // Native unload is legal anywhere inside the homeland settlement's
        // borders; don't require another move to its center or remaining moves.
        if (kind === 'treasure' && api.canRedeemTreasure(unit)) {
          gate.run(`redeem:${key}`,`${api.turn()}`,() => { if (api.redeemTreasure(unit)) status.actions++; });
          if(state.orders?.[key]){delete state.orders[key];ordersChanged=true;}
          return;
        }
        let choices;
        if (kind === 'military') {
          choices = config.militaryMode === 'rally' ? ownCities.filter(c => cityKey(c) === state.rallyCity) : ownCities;
          if (!choices.length) { status.notes.push('请为军事垃圾时间选择一个仍属于你的集结城市'); return; }
        } else if (kind === 'treasure') choices = ownCities.filter(api.homeland);
        else choices = religious;
        const signature = `${kind}:${config.militaryMode}:${choices.map(c=>cityKey(c)+(kind==='religion'?`:${c.Religion?.urbanReligion}:${c.Religion?.ruralReligion}`:'')).join('|')}`;
        let cached=routes.get(key);
        if(!cached || cached.signature!==signature){
          if(planned>=4)return;
          planned++;
          cached={signature,route:kind==='religion' && api.routeToReligion ? api.routeToReligion(unit,choices) : api.routeToCities(unit,choices,kind === 'military',kind === 'military' ? reservations : new Set())};
          routes.set(key,cached);
        }
        const route=cached.route;
        if (!route) return;
        if (kind === 'military') reservations.add(route.plot);
        if (api.at(unit,route)) {
          if(state.orders?.[key]){delete state.orders[key];ordersChanged=true;}
          if (kind === 'military') gate.run(`sleep:${key}`,api.unitFingerprint(unit),() => api.sleep(unit));
          else if (kind === 'religion') gate.run(`spread:${key}`,`${api.turn()}:${route.plot}`,() => api.spread(unit,route.city));
        } else if (api.canMove(unit)) {
          if (gate.run(`move:${key}`,`${api.turn()}`,() => {
            if(api.move(unit,route)) {state.orders ??= {};state.orders[key]={kind,destination:route.location};ordersChanged=true;}
          })) status.actions++;
        }
      });
      if(ordersChanged){const latest=getSession();latest.orders=state.orders;saveSession(latest);}
      return status;
    } finally { running = false; }
  }
  return { tick, status, reset:() => {gate.clear();routes.clear();}, dispose() { disposed = true; gate.clear();routes.clear(); } };
}
