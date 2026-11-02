import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveGate } from '../ui/save-gate.js';
import { installDiplomacyHooks } from '../ui/diplomacy-hook.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

function harness() {
  const calls = [], timers = new Map(); let id = 0, enabled = true, token = 'game:turn44', retry;
  const setTimer = (fn, ms) => { timers.set(++id, { fn, ms }); return id; };
  const clearTimer = id => timers.delete(id);
  const operations = { sendRequest(...args) { calls.push(['operation', ...args]); return 'native-result'; } };
  const deals = { sendWorkingDeal(...args) { calls.push(['deal', ...args]); return 'deal-result'; } };
  const manager = {
    closeCurrentDiplomacyDialog: () => calls.push(['close-dialog']),
    closeCurrentDiplomacyDeal: () => calls.push(['close-deal']),
    closeCurrentDiplomacyProject: () => calls.push(['close-project']),
    startWarFromMap(target, next) { this.confirm = () => { operations.sendRequest(0, 1, { Player2: target }); next(); }; return true; }
  };
  const dealPrototype = {
    proposeCurrentDeal() { deals.sendWorkingDeal(7, 1); manager.closeCurrentDiplomacyDeal(); },
    acceptDeal() { if (this.edited) return this.proposeCurrentDeal(); deals.sendWorkingDeal(7, 2); manager.closeCurrentDiplomacyDeal(); },
    rejectDeal() { deals.sendWorkingDeal(7, 3); manager.closeCurrentDiplomacyDeal(); }
  };
  const gate = new SaveGate({
    context: () => ({ token, active: true, sent: false, canSave: true }), dialogOpen: () => false,
    setTimer, clearTimer, showBusy() {}, notice() {}, saved() {},
    save(kind) { calls.push(['save', kind]); gate.onSaveStart(); return true; },
    isPending: r => r.result === 1, matches: r => r.options === 65, succeeded: r => r.result === 0,
    error(message, again) { calls.push(['error', message]); retry = again; }
  });
  const original = operations.sendRequest;
  const integration = installDiplomacyHooks({ operations, operationTypes: { DECLARE_WAR: 1, RESPOND_DIPLOMATIC_ACTION: 2, BUILD: 3 },
    deals, dealActions: { PROPOSED: 1, ACCEPTED: 2, REJECTED: 3, ADJUSTED: 4, INSPECT: 5 },
    manager, dealPrototype, gate, localPlayer: () => 0, shouldSave: () => enabled, setTimer, clearTimer });
  const flush = (ms = 0) => { for (const [key, t] of [...timers]) if (t.ms === ms) { timers.delete(key); t.fn(); } };
  return { operations, deals, manager, dealPrototype, gate, integration, calls, flush, original,
    setEnabled: value => { enabled = value; }, changeContext: () => { token = 'new-game'; }, retry: () => retry(),
    complete: (result = 0) => { gate.onSaveComplete({ result, options: 65 }); flush(); } };
}

test('one save protects a multi-command response and preserves copied arguments/order', () => {
  const h = harness(), args = { Player2: 9, nested: { amount: 1 } };
  h.operations.sendRequest(0, 2, args);
  h.operations.sendRequest(0, 1, { Player2: 9 });
  h.manager.closeCurrentDiplomacyDialog(); args.nested.amount = 99;
  assert.deepEqual(h.calls, [['save', 'diplomacy']]);
  h.complete();
  assert.deepEqual(h.calls, [['save', 'diplomacy'], ['operation', 0, 2, { Player2: 9, nested: { amount: 1 } }],
    ['operation', 0, 1, { Player2: 9 }], ['close-dialog']]);
});

test('another click during an asynchronous save is blocked', () => {
  const h = harness(); h.operations.sendRequest(0, 1, {}); h.flush();
  h.operations.sendRequest(0, 1, {}); h.complete();
  assert.equal(h.calls.filter(c => c[0] === 'operation').length, 1);
});

test('map declaration keeps its post-war movement after the saved declaration', () => {
  const h = harness();
  assert.equal(h.manager.startWarFromMap(9, () => h.calls.push(['move'])), true);
  assert.deepEqual(h.calls, []); // Merely opening a confirmation is not an action.
  h.manager.confirm(); assert.deepEqual(h.calls, [['save', 'diplomacy']]);
  h.complete(); assert.deepEqual(h.calls.map(c => c[0]), ['save', 'operation', 'move']);
});

for (const name of ['proposeCurrentDeal', 'acceptDeal', 'rejectDeal']) test(`${name} preserves the working deal until the saved send`, () => {
  const h = harness(); h.dealPrototype[name]();
  assert.deepEqual(h.calls, [['save', 'diplomacy']]);
  h.complete(); assert.deepEqual(h.calls.map(c => c[0]), ['save', 'deal', 'close-deal']);
});

test('accepting an edited deal invokes nested proposal without another save', () => {
  const h = harness(); h.dealPrototype.edited = true; h.dealPrototype.acceptDeal(); h.complete();
  assert.deepEqual(h.calls.map(c => c[0]), ['save', 'deal', 'close-deal']);
});

test('information-only deal inspection, other players and non-diplomatic operations bypass', () => {
  const h = harness();
  assert.equal(h.deals.sendWorkingDeal(7, 5), 'deal-result');
  assert.equal(h.operations.sendRequest(1, 1, {}), 'native-result');
  assert.equal(h.operations.sendRequest(0, 3, {}), 'native-result');
  assert.equal(h.calls.some(c => c[0] === 'save'), false);
});

test('disabled diplomacy keeps native return values and receiver', () => {
  const h = harness(); h.setEnabled(false);
  assert.equal(h.operations.sendRequest(0, 1, {}), 'native-result');
  assert.equal(h.calls.some(c => c[0] === 'save'), false);
});

test('an unsaveable phase passes through the whole native sequence and cleanup', () => {
  const h = harness();
  h.gate.env.context = () => ({ token: 'age-ended', active: true, sent: false, canSave: false });
  assert.equal(h.operations.sendRequest(0, 2, {}), 'native-result');
  assert.equal(h.operations.sendRequest(0, 1, {}), 'native-result');
  h.manager.closeCurrentDiplomacyDialog();
  assert.deepEqual(h.calls.map(c => c[0]), ['operation', 'operation', 'close-dialog']);
  h.flush();
  assert.equal(h.calls.length, 3);
});

test('failed save retains the exact batch for explicit retry, without executing it early', () => {
  const h = harness(); h.operations.sendRequest(0, 1, { Player2: 9 }); h.complete(4);
  assert.equal(h.calls.some(c => c[0] === 'operation'), false);
  h.retry(); h.complete();
  assert.equal(h.calls.filter(c => c[0] === 'save').length, 2);
  assert.equal(h.calls.filter(c => c[0] === 'operation').length, 1);
});

test('context changes discard the pending diplomatic action', () => {
  const h = harness(); h.operations.sendRequest(0, 1, {}); h.changeContext(); h.complete();
  assert.equal(h.calls.some(c => c[0] === 'operation'), false);
});

test('dispose restores native entry points and does not clobber later wrappers', () => {
  const h = harness(); const previous = h.deals.sendWorkingDeal;
  const outer = (...args) => previous.apply(h.deals, args); h.deals.sendWorkingDeal = outer;
  h.integration.dispose(); assert.equal(h.operations.sendRequest, h.original);
  assert.equal(h.deals.sendWorkingDeal, outer);
  h.deals.sendWorkingDeal(7, 1); assert.equal(h.calls[0][0], 'deal');
});

const gameUI = join(process.env.CIV7_GAME_DIR || "D:/Program Files (x86)/Steam/steamapps/common/Sid Meier's Civilization VII", 'Base/modules/base-standard/ui');
const peacePath = join(gameUI, 'diplomacy-peace-deal/panel-diplomacy-peace-deal.js');
for (const method of ['proposeCurrentDeal', 'acceptDeal', 'rejectDeal']) test(`shipped game ${method}: real handler keeps send and session close after saving`, { skip: !existsSync(peacePath) }, () => {
  const h = harness(); let definition;
  const sandbox = vm.createContext({ DiplomacyInputPanel: class {}, styles: '', content: '', Controls: { define(_name, value) { definition = value; } },
    Game: { DiplomacyDeals: h.deals }, DiplomacyDealProposalActions: { PROPOSED: 1, ACCEPTED: 2, REJECTED: 3, ADJUSTED: 4 },
    Configuration: { getXR: () => false }, DiplomacyManager: h.manager, Audio: { playSound() {} },
    InterfaceMode: { switchTo() {} }, console });
  vm.runInContext(readFileSync(peacePath, 'utf8').replace(/^import .*;\r?$/gm, ''), sandbox);
  const real = Object.create(definition.createInstance.prototype);
  Object.assign(real, { currentWorkingDealID: 7, isNewDeal: true, isAI: false, pendingDealAdditions: [], pendingDealRemovals: [] });
  h.integration.dispose();
  const integration = installDiplomacyHooks({ operations: h.operations, operationTypes: {}, deals: h.deals,
    dealActions: { PROPOSED: 1, ACCEPTED: 2, REJECTED: 3, ADJUSTED: 4 }, manager: h.manager,
    dealPrototype: definition.createInstance.prototype, gate: h.gate, localPlayer: () => 0,
    shouldSave: () => true, setTimer: h.gate.env.setTimer, clearTimer: h.gate.env.clearTimer });
  real[method]();
  assert.deepEqual(h.calls, [['save', 'diplomacy']]);
  h.complete();
  assert.deepEqual(h.calls.map(c => c[0]), ['save', 'deal', 'close-deal']);
  integration.dispose();
});

const managerPath = join(gameUI, 'diplomacy/diplomacy-manager.js');
test('shipped map-war confirmation does not execute the follow-up movement before saving', { skip: !existsSync(managerPath) }, () => {
  const h = harness(), source = readFileSync(managerPath, 'utf8');
  const start = source.indexOf('  startWarFromMap(');
  const tail = source.slice(start);
  const next = tail.slice(1).search(/^  (?:get |set )?[\w]+\([^\n]*\) \{/m) + 1;
  assert.ok(start >= 0 && next > 1);
  let confirm;
  const sandbox = vm.createContext({ Game: { PlayerOperations: h.operations }, GameContext: { localPlayerID: 0 },
    PlayerOperationTypes: { DECLARE_WAR: 1 }, DiplomacyActionTypes: { DIPLOMACY_ACTION_DECLARE_WAR: 10 },
    Players: { get: id => id === 0 ? { Diplomacy: { canDeclareWarOn: () => ({ Success: true }) } } : { isIndependent: true, civilizationFullName: 'Test IP' } },
    DialogBoxAction: { Confirm: 1 }, DialogBoxManager: { createDialog_ConfirmCancel: value => { confirm = value.callback; } },
    Locale: { compose: value => value }, Audio: { playSound() {} }, console });
  const actual = vm.runInContext(`({${tail.slice(0, next)}}).startWarFromMap`, sandbox);
  h.integration.dispose(); h.manager.startWarFromMap = actual;
  const integration = installDiplomacyHooks({ operations: h.operations, operationTypes: { DECLARE_WAR: 1 },
    deals: h.deals, dealActions: {}, manager: h.manager, dealPrototype: h.dealPrototype, gate: h.gate,
    localPlayer: () => 0, shouldSave: () => true, setTimer: (fn, ms) => h.gate.env.setTimer(fn, ms), clearTimer: h.gate.env.clearTimer });
  h.manager.startWarFromMap({ player: 9 }, () => h.calls.push(['move']));
  assert.deepEqual(h.calls, []); confirm(1);
  assert.deepEqual(h.calls, [['save', 'diplomacy']]); h.complete();
  assert.deepEqual(h.calls.map(c => c[0]), ['save', 'operation', 'move']); integration.dispose();
});
