import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readCardNeeds } from '../ui/card-reminders-runtime.js';

const moduleMocks = {
  '/core/ui/components/fxs-activatable.js': 'export {};',
  '/core/ui/components/fxs-nav-help.js': 'export {};',
  '/core/ui/input/action-handler.js': 'export default { onEngineInput() { return 0; } };',
  '/core/ui/input/input-filter.js': 'export default { handleInput() { return 0; } };',
  '/core/ui/input/input-support.js': 'export const InputEngineEvent = class {}; export const InputHandlerState = { Handled: 1 };',
  '/core/ui/context-manager/context-manager.js': 'export const ContextManager = { getCurrentTarget: () => globalThis.__cardReminderContext };',
  '/core/ui/views/view-manager.js': 'export default { isViewInputAllowed: true };',
  '/core/ui-next/services/focus-manager.js': 'export const FocusManager = { get: () => ({ isFocusLocked: () => false, currentFocus: null }) };',
  '/core/ui-next/services/input.js': 'export const IsControllerActive = () => false;',
  '/core/ui/utilities/utilities-component-id.js': 'export const componentCalls = []; export const ComponentID = { toString(id) { componentCalls.push(id); return `component:${id}`; } };',
  '/base-standard/ui/policies/model-government.js': 'export const setActivePolicyTab = () => {};',
  'page-skip-hold': 'export const installPageSkipHold = () => ({ tick() {}, cancel() {}, bindButton() { return () => {}; }, dispose() {} });'
};
const loaderSource = `
const moduleMocks = ${JSON.stringify(moduleMocks)};
export function resolve(specifier, context, nextResolve) {
  if (Object.hasOwn(moduleMocks, specifier)) {
    return { url: 'mock:' + encodeURIComponent(specifier), shortCircuit: true };
  }
  if (specifier === './page-skip-hold.js' && context.parentURL?.includes('/ui/card-reminders.js')) {
    return { url: 'mock:page-skip-hold', shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
export function load(url, context, nextLoad) {
  if (url.startsWith('mock:')) {
    const key = decodeURIComponent(url.slice(5));
    return { format: 'module', source: moduleMocks[key], shortCircuit: true };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);
const { componentCalls } = await import('/core/ui/utilities/utilities-component-id.js');
const { createCardReminders } = await import('../ui/card-reminders.js?integration');

const now = { value: 0 };
const engineEvents = new Map(), windowEvents = new Map();
const operationCalls = [], notificationCalls = [], sentOperations = [];
let localTurn = true, inventory = [], damagedPlots = new Set(), definitions = new Map();
let assigned = [], assignmentLocked = false, resourceCapacity = 1;
const cityID = { owner: 0, id: 1, type: 1 };
const city = {
  id: cityID, owner: 0, isTown: false, location: { x: 0, y: 0 }, originalOwner: 0,
  Resources: { getAssignedResources: () => assigned, getAssignedResourcesCap: () => resourceCapacity }
};
const player = {
  Cities: { getCities: () => [city] },
  Resources: {
    getResources: () => inventory,
    isResourceAssignmentLocked: () => assignmentLocked
  }
};
const notification = { ids: [17], type: 41, blocked: true };
Object.assign(globalThis, {
  performance: { now: () => now.value },
  document: { hidden: false, querySelector: () => null, querySelectorAll: () => [] },
  MutationObserver: class { observe() {} disconnect() {} },
  GameContext: { localPlayerID: 0 },
  Players: { get: () => player },
  GameplayMap: { getLocationFromIndex: value => ({ x: value, y: 0 }) },
  MapConstructibles: { getHiddenFilteredConstructibles: (x, y) => damagedPlots.has(x) ? [x + y + 100] : [] },
  Constructibles: { getByComponentID: id => ({ damaged: damagedPlots.has(id - 100) }) },
  PlayerOperationTypes: { ASSIGN_RESOURCE: 11, CONSIDER_ASSIGN_RESOURCE: 12 },
  CultureSlotTypes: { POLICY_CULTURE_SLOT: 1, TRADITION_CULTURE_SLOT: 2, CRISIS_CULTURE_SLOT: 3 },
  InputActionStatuses: { START: 1, FINISH: 3 },
  Locale: { compose: value => value, stylize: value => value },
  GameInfo: {
    DynamicModifiers: [{ ModifierType: 'seasonal', EffectType: 'EFFECT_CITY_ADJUST_UNIT_PRODUCTION_PER_RESOURCE' }],
    GameModifiers: [{ ModifierId: 'seasonal' }],
    ModifierArguments: [{ ModifierId: 'seasonal', Name: 'ResourceType', Value: 'SALT' }],
    Modifiers: [{ ModifierId: 'seasonal', ModifierType: 'seasonal' }],
    Resources: { lookup: type => definitions.get(type) }
  },
  Game: {
    age: 1,
    PlayerOperations: {
      canStart(_playerID, operation, args) { operationCalls.push({ operation, args }); return { Success: true }; },
      sendRequest(_playerID, operation) { sentOperations.push(operation); }
    },
    Notifications: {
      getIdsForPlayer() { notificationCalls.push('ids'); return notification.ids; },
      getType() { notificationCalls.push('type'); return notification.type; },
      getTypeName() { notificationCalls.push('typeName'); return 'NOTIFICATION_ASSIGN_NEW_RESOURCES'; },
      getBlocksTurnAdvancement() { notificationCalls.push('blocked'); return notification.blocked; }
    }
  },
  engine: {
    on(event, handler) { engineEvents.set(event, handler); },
    off(event) { engineEvents.delete(event); }
  },
  window: {
    addEventListener(event, handler) { windowEvents.set(event, handler); },
    removeEventListener(event) { windowEvents.delete(event); }
  }
});
globalThis.__cardReminderContext = null;

const resource = (value, type = 'R', isOffMap = false) => ({ value, isOffMap, uniqueResource: { resource: type } });
const regularDefinition = { ResourceClassType: 'RESOURCECLASS_CITY', ResourceType: 'R' };
const saltDefinition = { ResourceClassType: 'RESOURCECLASS_CITY', ResourceType: 'SALT', BonusResourceSlots: 0 };
function resetWorld() {
  now.value = 0; localTurn = true; assignmentLocked = false; resourceCapacity = 1;
  inventory = []; damagedPlots = new Set(); definitions = new Map([['R', regularDefinition], ['SALT', saltDefinition]]);
  assigned = []; notification.ids = [17]; notification.type = 41; notification.blocked = true;
  operationCalls.length = 0; notificationCalls.length = 0; sentOperations.length = 0; componentCalls.length = 0;
}
function readNeeds() {
  return readCardNeeds({ player, playerID: 0, info: globalThis.GameInfo,
    operations: globalThis.Game.PlayerOperations, assignType: globalThis.PlayerOperationTypes.ASSIGN_RESOURCE,
    location: globalThis.GameplayMap.getLocationFromIndex, kinds: ['resources'], productionOnly: new Set(['SALT']) });
}
function runFrames() {
  const refreshes = [];
  const reminders = createCardReminders({ scope: () => 'game/player/turn', localTurn: () => localTurn,
    refresh: () => refreshes.push(now.value), nextRank: () => 1 }, { kinds: ['resources'], textPrefix: 'LOC_RP_AO_' });
  const frame = engineEvents.get('BeginFrame');
  now.value = 100; frame();
  now.value = 301; frame();
  reminders.dispose();
  return refreshes;
}

test('资源证据只在全部为可选或已损坏时抑制原生提醒', () => {
  const evidence = (resources, options = {}) => {
    resetWorld(); inventory = resources; assignmentLocked = !!options.locked;
    return readNeeds();
  };
  assert.deepEqual(evidence([]), { resources: false, onlyOptional: false, suppressNativeResourceNotification: false,
    resourceEvidence: { eligible: 0, damaged: 0, optional: 0, regular: 0, unknown: 0 }, policies: false, empty: [] });
  assert.equal(evidence([resource(7)]).resourceEvidence.regular, 1);
  assert.equal(evidence([resource(7)], { locked: true }).suppressNativeResourceNotification, false);
  assert.deepEqual(evidence([resource(6, 'SALT')]).resourceEvidence, { eligible: 1, damaged: 0, optional: 1, regular: 0, unknown: 0 });
  assert.deepEqual(evidence([resource(6, 'SALT'), resource(7)]).resourceEvidence, { eligible: 2, damaged: 0, optional: 1, regular: 1, unknown: 0 });
  assert.equal(evidence([resource(6, 'SALT'), resource(7)]).onlyOptional, false);
  assert.equal(evidence([resource(7, 'R', true)]).suppressNativeResourceNotification, false);
  assert.equal(evidence([resource(6, 'SALT'), resource(7, 'R', true)]).suppressNativeResourceNotification, false);
  // The scanner intentionally stops after the first assignable regular resource.
  assert.equal(evidence([resource(7)]).suppressNativeResourceNotification, false);
});

test('真实 frame 只在全部库存被有意忽略时确认一次原生提醒', () => {
  assert.equal(Object.hasOwn(globalThis, 'ComponentID'), false);
  for (const resources of [
    [resource(6, 'SALT')],
    [resource(7)],
    [resource(6, 'SALT'), resource(7)]
  ]) {
    resetWorld(); inventory = resources;
    if (resources.some(item => item.uniqueResource.resource === 'R')) damagedPlots.add(7);
    const refreshes = runFrames();
    assert.deepEqual(operationCalls.map(call => call.operation),
      [globalThis.PlayerOperationTypes.CONSIDER_ASSIGN_RESOURCE]);
    assert.deepEqual(sentOperations, [globalThis.PlayerOperationTypes.CONSIDER_ASSIGN_RESOURCE]);
    assert.deepEqual(refreshes, [100]);
    assert.deepEqual(componentCalls, [17, 17]);
  }
});

test('健康、未知、空、锁定与非本地库存不吞原生提醒', () => {
  const cases = [
    { resources: [resource(7)], operations: [globalThis.PlayerOperationTypes.ASSIGN_RESOURCE], refreshes: [100] },
    { resources: [resource(6, 'SALT'), resource(7, 'UNKNOWN')], operations: [], refreshes: [100] },
    { resources: [], operations: [], refreshes: [100] },
    { resources: [resource(6, 'SALT'), resource(7)], operations: [], refreshes: [100], locked: true },
    { resources: [resource(6, 'SALT'), resource(7)], operations: [], refreshes: [100], nonlocal: true }
  ];
  for (const item of cases) {
    resetWorld(); inventory = item.resources;
    assignmentLocked = !!item.locked;
    localTurn = !item.nonlocal;
    const refreshes = runFrames();
    assert.deepEqual(operationCalls.map(call => call.operation), item.operations);
    assert.deepEqual(sentOperations, []);
    assert.deepEqual(refreshes, item.refreshes);
    assert.deepEqual(notificationCalls, []);
    assert.deepEqual(componentCalls, []);
  }
});
