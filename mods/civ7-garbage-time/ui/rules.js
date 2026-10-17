export const YIELDS = ['gold', 'food', 'science', 'culture', 'production', 'happiness'];
export const DEFAULT_WEIGHTS = Object.freeze({ gold: 1, food: 2, science: 4, culture: 4, production: 4, happiness: 8 });
export const PRESETS = Object.freeze({
  science: { ...DEFAULT_WEIGHTS, science: 8 },
  culture: { ...DEFAULT_WEIGHTS, culture: 8 },
  gold: { ...DEFAULT_WEIGHTS, gold: 4 }
});
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const number = (v, fallback, min, max) => typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
export const weights = value => Object.fromEntries(YIELDS.map(k => [k, number(value?.[k], DEFAULT_WEIGHTS[k], 0, 100)]));
export function normalizeConfig(value = {}) {
  return {
    weights: weights(value?.weights),
    minHappiness: number(value?.minHappiness, 0, -100, 100),
    militaryMode: value?.militaryMode === 'rally' ? 'rally' : 'nearest',
    resourceOptions: {camels:value?.resourceOptions?.camels===true,assigned:value?.resourceOptions?.assigned===true},
    religionTargets: {
      own: typeof value?.religionTargets?.own === 'boolean' ? value.religionTargets.own : true,
      cityStates: value?.religionTargets?.cityStates === true,
      foreign: value?.religionTargets?.foreign === true
    }
  };
}
export function normalizeCity(value = {}) {
  return { enabled: value?.enabled === true, override: value?.override === true,
    weights: weights(value?.weights), minHappiness: number(value?.minHappiness, 0, -100, 100) };
}
export function normalizeSession(value = {}) {
  return {
    military: value?.military === true, treasure: value?.treasure === true,
    religion: value?.religion === true, technology: value?.technology === true, culture: value?.culture === true,
    resources:value?.resources===true,
    resourceTurn:Number.isInteger(value?.resourceTurn)?value.resourceTurn:-1,
    rallyCity: typeof value?.rallyCity === 'string' ? value.rallyCity : '',
    cities: Object.fromEntries(Object.entries(record(value?.cities) ? value.cities : {}).map(([k,v]) => [k, normalizeCity(v)])),
    projects: record(value?.projects) ? value.projects : {},
    orders: record(value?.orders) ? value.orders : {}
  };
}
export const cityKey = city => `${city.id.owner}:${city.id.id}:${city.location.x},${city.location.y}`;
export function citySettings(config, session, city) {
  const own = normalizeCity(session.cities[cityKey(city)]);
  return { ...own, weights: own.override ? own.weights : config.weights, minHappiness: own.override ? own.minHappiness : config.minHappiness };
}
export const happinessWeight = (ratio, happiness) => happiness < 0 ? (ratio.happiness ?? DEFAULT_WEIGHTS.happiness) : 0;
export const score = (delta, ratio, happiness) => YIELDS.reduce((sum, k) =>
  sum + (delta[k] ?? 0) * (k === 'happiness' ? happinessWeight(ratio, happiness) : ratio[k]), 0);
export function chooseGrowth(candidates, ratio, happiness, threshold) {
  if (!Number.isFinite(happiness) || happiness <= threshold) return null;
  return candidates.filter(c => c.legal && Number.isFinite(c.delta.happiness) && happiness + c.delta.happiness > threshold)
    .sort((a,b) => score(b.delta, ratio, happiness) - score(a.delta, ratio, happiness) || a.plot - b.plot)[0] ?? null;
}
// Always choose the highest scoring available project; Science wins a tie.
export function chooseProject(available, ratio) {
  return available.filter(k => ratio[k] > 0).sort((a,b) =>
    ratio[b] - ratio[a] ||
    (a === 'science' ? -1 : 1))[0] ?? null;
}
export function targetAllowed(owner, local, isMinor, config) {
  return owner === local ? config.own : isMinor ? config.cityStates : config.foreign;
}
export function rankRoutes(routes) {
  return routes.filter(r => Number.isFinite(r.cost)).sort((a,b) => a.cost - b.cost || a.plot - b.plot);
}
// One request per observed state. Native sendRequest is asynchronous: don't
// send again until the actual state changes, even if multiple events arrive.
export function createRequestGate() {
  const sent = new Map();
  return {
    run(key, fingerprint, fn) {
      if (sent.get(key) === fingerprint) return false;
      sent.set(key, fingerprint);
      try { fn(); } catch (e) { sent.delete(key); throw e; }
      return true;
    },
    forget(key) { sent.delete(key); },
    clear() { sent.clear(); }
  };
}
