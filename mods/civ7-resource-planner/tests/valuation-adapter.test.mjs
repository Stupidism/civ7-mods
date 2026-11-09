import test from 'node:test';
import assert from 'node:assert/strict';
import {utility} from '../ui/rp-planner.js';
import {
  legacyUtility, NEW_MODEL_WEIGHTS, sharedWeightsFromLegacy, evaluateCityHappiness,
  evaluateResourceProduction, evaluateTownProduction, evaluateTownConversion, createSession,
  settlementPointSnapshot
} from '../ui/rp-valuation-adapter.js';

test('旧资源规划评分行为不变，仍按原数组权重与偏好因子', () => {
  assert.equal(utility([1, 1, 1, 1, 1, -1, 0]), 7);
  assert.equal(legacyUtility([2, 3, 4, 5, 6, -3, 7]), 40);
  assert.equal(legacyUtility([2, 3, 4, 5, 6, -3, 7], {YIELD_FOOD: 2, YIELD_SCIENCE: 2, YIELD_CULTURE: 0}), 40);
});

test('旧权重可显式映射到新模型，但不冒充新默认值', () => {
  const mapped = sharedWeightsFromLegacy([2, 4, 1, 4, 4, 8, 0]);
  assert.deepEqual(mapped, {food: 2, production: 4, gold: 1, science: 4, culture: 4, happiness: 8, diplomacy: 0});
  assert.equal(NEW_MODEL_WEIGHTS.production, 2);
  assert.equal(NEW_MODEL_WEIGHTS.happiness, 0);
});

test('幸福入口只按显式 affectedYields 计算前后有效产出差', () => {
  const missing = evaluateCityHappiness({happinessBefore: -2, happinessAfter: 0, basis: 'raw', affectedYields: []});
  assert.equal(missing.status, 'not-estimated');
  const raw = evaluateCityHappiness({happinessBefore: -2, happinessAfter: 0, basis: 'raw', affectedYields: {food: [8, 10], production: [4, 5]}, penalty: {slope: 0.05, cap: 0.5}, weights: NEW_MODEL_WEIGHTS});
  assert.equal(raw.status, 'estimated');
  assert.deepEqual(Object.keys(raw.contributions), ['food', 'production']);
  assert.ok(raw.benefit > 0);
  const net = evaluateCityHappiness({happinessBefore: -2, happinessAfter: 0, basis: 'net', affectedYields: {food: [8, 10]}, penalty: {slope: 0.05, cap: 0.5}, weights: NEW_MODEL_WEIGHTS});
  assert.equal(net.benefit, 4);
  assert.equal(net.penaltyApplied, false);
});

test('资源产能与城镇转换入口要求完整时间/转换上下文', () => {
  const missing = evaluateResourceProduction({productionCost: 100, perTurnYields: {gold: 2}});
  assert.equal(missing.status, 'invalid');
  const valued = evaluateResourceProduction({productionCost: 100, perTurnYields: {gold: 2}, currentTurn: 100, endTurn: 110, firstReceiptTurn: 101});
  assert.equal(valued.status, 'estimated');
  assert.equal(valued.costScore, 200);
  const conversion = evaluateTownConversion({productionPerTurn: 5, goldPerProduction: 2, snapshotGoldPerTurn: 4});
  assert.equal(conversion.totalGoldPerTurn, 14);
  const noRate = evaluateTownConversion({productionPerTurn: 5, snapshotGoldPerTurn: 4});
  assert.equal(noRate.status, 'not-estimated');
  const unsupported = evaluateTownProduction({actionKind: 'building', productionCost: 10, perTurnYields: {production: 5}, townConversion: {goldPerProduction: 2}, currentTurn: 100, endTurn: 110});
  assert.equal(unsupported.status, 'unsupported');
});

test('资源规划适配器缓存与共享服务同源且隔离存档', () => {
  const session = createSession({playerId: 'adapter-rp', saveId: 'a'});
  session.set('score', 7);
  assert.equal(createSession({playerId: 'adapter-rp', saveId: 'a'}).get('score'), 7);
  assert.equal(createSession({playerId: 'adapter-rp', saveId: 'b'}).get('score'), undefined);
});


test('资源规划适配器也走统一 settlementPointSnapshot 入口', () => {
  const snapshot = settlementPointSnapshot({
    playerId: 'adapter-rp', saveId: 'points',
    count: 5, cap: 5,
    towns: [{id: 't', kind: 'city', happiness: -2, baseYields: {food: 10}, affectedYields: ['food']}],
    penalty: {slope: 0.1, cap: 0.8},
    happinessPenaltyPerExcessPoint: 1,
    currentTurn: 100, endTurn: 120, firstReceiptTurn: 101,
    stateValuation: () => 0, empireStateValuation: () => 0
  });
  assert.equal(snapshot.count, 5);
  assert.ok(snapshot.perTurn.cost > 0);
});
