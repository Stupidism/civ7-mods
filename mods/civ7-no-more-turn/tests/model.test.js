import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, scheduleAt, RestGate, formatTime } from '../ui/rest-model.js';
import { RestStore } from '../ui/rest-store.js';

const config = normalizeConfig();
const memoryStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

test('game turns select fixed stages, not a rest deadline', () => {
  assert.deepEqual([0, 20, 21, 40, 41, 60, 61, 80, 81, 1000].map(t => scheduleAt(t, config).interval),
    [5, 5, 4, 4, 3, 3, 2, 2, 1, 1]);
  assert.equal('due' in scheduleAt(5, config), false);
});
test('20-turn boundaries are fixed and legacy cumulative settings are discarded', () => {
  const c = normalizeConfig({ stageLength: 99, cumulativeAges: true });
  assert.deepEqual(Object.keys(c), ['turnEnabled', 'timeEnabled', 'saveKeepCount', 'nightEnabled', 'nightStart', 'nightEnd', 'playMinutes', 'restMinutes', 'intervals']);
  assert.equal(scheduleAt(20, c).stage, 0);
  assert.equal(scheduleAt(21, c).stage, 1);
});
test('custom intervals are used in each stage, including after turn 80', () => {
  const c = normalizeConfig({ intervals: [3, 5, 2, 4, 100] });
  assert.deepEqual([1, 21, 41, 61, 81, 1001].map(t => scheduleAt(t, c).interval), [3, 5, 2, 4, 100, 100]);
});
test('invalid settings cannot create zero intervals or unbounded locks', () => {
  const c = normalizeConfig({ restMinutes: NaN, intervals: [0, -3, Infinity, '3', 900] });
  assert.deepEqual(c.intervals, [1, 1, 3, 2, 100]);
  assert.equal(c.restMinutes, 5);
  assert.equal(normalizeConfig({ restMinutes: 0 }).restMinutes, 0.1);
  assert.equal(normalizeConfig({ restMinutes: 900 }).restMinutes, 120);
});
test('repeated begin calls do not extend a break; early completion is rejected', () => {
  const gate = new RestGate();
  gate.begin('a:5', 5, 'turn', config, 1000);
  gate.begin('a:5', 5, 'turn', config, 2000);
  assert.equal(gate.state.pending.deadline, 301000);
  assert.equal(gate.complete(300999), false);
  assert.equal(gate.complete(301000), true);
  assert.equal(gate.state.paidToken, 'a:5');
  assert.equal(gate.complete(301001), false);
});
test('background time counts without timer drift, but no timer is saved across sessions', () => {
  const gate = new RestGate();
  gate.begin('t5', 5, 'turn', config, 10000);
  assert.equal(gate.remaining(130000), 180000);
  assert.equal(gate.remaining(900000), 0);
  assert.equal(gate.complete(900000), true);
  const reloaded = new RestGate();
  assert.equal(reloaded.state.pending, null);
  assert.equal(reloaded.remaining(900000), 0);
});
test('an active break cannot be cancelled by a shorter setting', () => {
  const gate = new RestGate();
  gate.begin('t5', 5, 'turn', config, 0);
  gate.begin('t5', 5, 'turn', normalizeConfig({ restMinutes: 0.1 }), 100);
  assert.equal(gate.state.pending.durationMs, 300000);
});
test('clock rollback cannot extend a break beyond its original duration', () => {
  const gate = new RestGate();
  gate.begin('t5', 5, 'turn', config, 1000000);
  assert.equal(gate.remaining(0), 300000);
});
test('saving preserves changes from other mods and writes settings only', () => {
  const storage = memoryStorage();
  const store = new RestStore(storage);
  storage.setItem('modSettings', JSON.stringify({ other: { volume: 9 } }));
  store.data.pending = { turn: 123 };
  store.save();
  const shared = JSON.parse(storage.getItem('modSettings'));
  assert.deepEqual(shared.other, { volume: 9 });
  assert.deepEqual(shared['civ7-rest-guard'], { version: 3, config });
});
test('upgrading removes previous turn and age records while retaining user settings', () => {
  const storage = memoryStorage({ modSettings: JSON.stringify({
    other: { value: 7 },
    'civ7-rest-guard': { version: 1,
      config: { restMinutes: 3, stageLength: 20, cumulativeAges: true, intervals: [5, 4, 3, 2, 1] },
      campaigns: { old: { ages: { a: { offset: 80, maxTurn: 20 } }, pending: { deadline: 99999 } } },
    },
  }) });
  const store = new RestStore(storage);
  const shared = JSON.parse(storage.getItem('modSettings'));
  assert.deepEqual(shared['civ7-rest-guard'], { version: 3, config: { ...config, restMinutes: 3 } });
  assert.deepEqual(shared.other, { value: 7 });
  assert.equal(store.error, false);
});
test('corrupt shared storage is never cleared or overwritten', () => {
  const storage = memoryStorage({ modSettings: 'broken json' });
  const store = new RestStore(storage, () => {});
  assert.equal(store.error, true);
  assert.equal(store.save(), false);
  assert.equal(storage.getItem('modSettings'), 'broken json');
});
test('clock display never shows zero before the break expires', () => {
  assert.equal(formatTime(300000), '05:00');
  assert.equal(formatTime(1), '00:01');
  assert.equal(formatTime(0), '00:00');
});
