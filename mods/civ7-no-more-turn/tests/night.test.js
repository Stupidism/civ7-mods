import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { normalizeConfig, nightWindow, clockTime } from '../ui/rest-model.js';
import { RestSession } from '../ui/rest-session.js';

const date = (hour, minute = 0, day = 22) => new Date(2026, 9, day, hour, minute).getTime();
const at = { context: 'a', token: 'a:10', turn: 10 };
const c = normalizeConfig();

test('defaults migrate existing settings to 10 saves and independent 22:00–07:00 restriction', () => {
  const config = normalizeConfig({ turnEnabled: false, timeEnabled: false });
  assert.equal(config.saveKeepCount, 10); assert.equal(config.nightEnabled, true);
  assert.equal(clockTime(config.nightStart), '22:00'); assert.equal(clockTime(config.nightEnd), '07:00');
  assert.equal(normalizeConfig({ saveKeepCount: 0 }).saveKeepCount, 1);
  assert.equal(normalizeConfig({ saveKeepCount: 1000 }).saveKeepCount, 100);
});

test('night start is inclusive, end exclusive, with a consistent overnight end time', () => {
  for (const [hour, minute, active] of [[21, 59, false], [22, 0, true], [23, 59, true], [0, 0, true], [6, 59, true], [7, 0, false], [12, 0, false]]) {
    assert.equal(nightWindow(c, date(hour, minute)).active, active, `${hour}:${minute}`);
  }
  assert.equal(nightWindow(c, date(22)).endsAt, date(7, 0, 23));
  assert.equal(nightWindow(c, date(6)).endsAt, date(7));
});

test('independent disable, custom daytime window, minute precision and equal times', () => {
  assert.equal(nightWindow({ ...c, nightEnabled: false }, date(23)).active, false);
  const custom = { ...c, nightStart: 12 * 60 + 15, nightEnd: 14 * 60 + 30 };
  assert.equal(nightWindow(custom, date(12, 14)).active, false);
  assert.equal(nightWindow(custom, date(12, 15)).active, true);
  assert.equal(nightWindow(custom, date(14, 30)).active, false);
  assert.equal(nightWindow({ ...custom, nightEnd: custom.nightStart }, date(12, 15)).active, false);
});

test('local calendar end handles daylight-saving nights rather than adding a fixed nine hours', () => {
  const url = new URL('../ui/rest-model.js', import.meta.url).href;
  const code = `import {normalizeConfig, nightWindow} from ${JSON.stringify(url)};
    const config=normalizeConfig();
    const dates=[new Date(2026,2,7,22),new Date(2026,9,31,22)];
    console.log(JSON.stringify(dates.map(d=>(nightWindow(config,d.getTime()).endsAt-d.getTime())/3600000)));`;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TZ: 'America/New_York' }, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output), [8, 10]);
});

test('night alone blocks turns, pauses play, survives load, and resets after a full night', () => {
  const config = { ...c, turnEnabled: false, timeEnabled: false };
  let s = new RestSession();
  s.tick(at, config, date(21, 59));
  s.tick(at, config, date(22));
  assert.ok(s.night); assert.equal(s.requestTurn(at, config, date(23)), false);
  assert.equal(s.complete(at, date(23)), false);
  s.night.save = { status: 'saved', fileName: 'RestGuard_Night_example' };
  s.beginLoading(date(23)); s = new RestSession(s.export()); s.finishLoading(date(23, 1));
  s.tick(at, config, date(23, 1));
  assert.equal(s.night.save.status, 'saved');
  s.tick(at, config, date(7, 0, 23));
  assert.equal(s.night, null); assert.equal(s.elapsed(date(7, 0, 23)), 0);
  assert.equal(s.pending, null); assert.equal(s.turnCount, 0);
});

test('night overrides a normal break; disabling early preserves its original deadline', () => {
  const s = new RestSession();
  s.gate.begin(at.token, at.turn, 'time', c, date(21, 59));
  const deadline = s.pending.deadline;
  s.tick(at, c, date(22));
  assert.ok(s.night);
  s.tick(at, { ...c, nightEnabled: false }, date(22, 1));
  assert.equal(s.night, null); assert.equal(s.pending.deadline, deadline);
});
