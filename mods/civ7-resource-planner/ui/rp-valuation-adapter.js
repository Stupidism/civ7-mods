// Offline-callable adapter for the shared valuation model.
// Not imported by the production UI. New-model calls are explicit opt-in and
// require full context; legacy rp-planner behavior is unchanged.

import {utility as legacyUtility, YIELDS, WEIGHTS} from './rp-planner.js';
import {
  DEFAULT_VALUATION_WEIGHTS,
  effectiveYieldImpact,
  productionValue,
  townProductionConversion,
  evaluateProductionAction,
  getSharedValuationCache,
  settlementPointSnapshot as sharedSettlementPointSnapshot,
  invalidateSettlementPointSnapshot as sharedInvalidateSettlementPointSnapshot,
  INVALIDATION_REASONS
} from './valuation/rp-valuation-index.js';

export const NEW_MODEL_WEIGHTS = DEFAULT_VALUATION_WEIGHTS;
export const INVALIDATIONS = INVALIDATION_REASONS;
export {legacyUtility};

const LEGACY_TO_SHARED = Object.freeze({
  YIELD_FOOD: 'food',
  YIELD_PRODUCTION: 'production',
  YIELD_GOLD: 'gold',
  YIELD_SCIENCE: 'science',
  YIELD_CULTURE: 'culture',
  YIELD_HAPPINESS: 'happiness',
  YIELD_DIPLOMACY: 'diplomacy'
});

// Explicit conversion for callers that want to compare the legacy table with
// the new model. It is not the new default: culture/science assumptions and
// happiness treatment remain separate.
export function sharedWeightsFromLegacy(weights = WEIGHTS) {
  const result = {};
  YIELDS.forEach((key, index) => {
    result[LEGACY_TO_SHARED[key]] = weights[index];
  });
  return Object.freeze(result);
}

export function createSession({playerId, saveId, scope = 'resource-planner'} = {}) {
  return getSharedValuationCache().context({playerId, saveId, scope});
}

// Happiness is a before/after effective-output difference over explicit bases,
// not a fixed negative happiness score.
export function evaluateCityHappiness(input = {}) {
  return effectiveYieldImpact(input);
}

export function evaluateResourceProduction(input = {}) {
  return productionValue(input);
}

export function evaluateTownProduction(input = {}) {
  return evaluateProductionAction({...input, settlementKind: 'town', actionKind: input.actionKind ?? 'unit'});
}

export function evaluateTownConversion(input = {}) {
  return townProductionConversion(input);
}

// Cross-mod empire settlement snapshot; same service key as the other mods.
export function settlementPointSnapshot(input = {}) {
  return sharedSettlementPointSnapshot(input);
}

export function invalidateSettlementPoints(input = {}) {
  return sharedInvalidateSettlementPointSnapshot(input);
}
