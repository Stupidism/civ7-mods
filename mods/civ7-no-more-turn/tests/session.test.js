import test from 'node:test';
import assert from 'node:assert/strict';
import { RestSession, IDLE_HINT_MS, IDLE_REST_MS } from '../ui/rest-session.js';
import { normalizeConfig } from '../ui/rest-model.js';

const c = normalizeConfig({ nightEnabled: false });
const at = (turn, context = 'game:age') => ({ turn, context, token: `${context}:${turn}` });
const minute = 60000;
const play = (s, current, config, from, minutes) => {
  s.tick(current, config, from);
  for (let i = 1; i <= minutes; i++) s.activity(current, config, from + i * minute);
};

// Only end-turn requests add to the counter; visiting a game turn never does.
const endTurns = (s, turns, config = c, now = 0) => {
  for (const turn of turns) s.requestTurn(at(turn), config, now);
};

test('four combinations of independent switches govern their own triggers', () => {
  for (const turnEnabled of [false, true]) for (const timeEnabled of [false, true]) {
    const config = normalizeConfig({ turnEnabled, timeEnabled, nightEnabled: false });
    const byTurn = new RestSession();
    endTurns(byTurn, [1, 2, 3, 4], config);
    assert.equal(byTurn.requestTurn(at(5), config, 0), !turnEnabled);
    const byTime = new RestSession();
    play(byTime, at(4), config, 0, 25);
    assert.equal(!!byTime.pending, timeEnabled);
  }
});

test('25 minutes causes exactly one time break; a turn trigger cannot stack it', () => {
  const s = new RestSession();
  play(s, at(5), c, 0, 24);
  s.tick(at(5), c, 25 * minute - 1);
  assert.equal(s.pending, null);
  s.activity(at(5), c, 25 * minute);
  const deadline = s.pending.deadline;
  assert.equal(s.pending.reason, 'time');
  assert.equal(s.requestTurn(at(5), c, 25 * minute + 5), false);
  assert.equal(s.pending.deadline, deadline);
});

test('time break resets both counters and exempts the current turn', () => {
  const s = new RestSession();
  endTurns(s, [1, 2, 3]);
  play(s, at(4), c, 0, 25);
  assert.equal(s.complete(at(4), 30 * minute - 1), false);
  assert.equal(s.complete(at(4), 30 * minute), true);
  assert.equal(s.elapsed(30 * minute), 0);
  assert.equal(s.turnsRemaining(at(4), c), 5);
  assert.equal(s.requestTurn(at(5), c, 30 * minute), true);
  endTurns(s, [6, 7, 8], c, 30 * minute);
  assert.equal(s.requestTurn(at(9), c, 30 * minute), false);
});

test('turn break at minute 24 clears the imminent time break', () => {
  const s = new RestSession();
  endTurns(s, [1, 2, 3, 4]);
  play(s, at(4), c, 0, 24);
  assert.equal(s.requestTurn(at(5), c, 24 * minute), false);
  assert.equal(s.complete(at(5), 29 * minute), true);
  s.activity(at(6), c, 30 * minute);
  assert.equal(s.pending, null);
  assert.equal(s.elapsed(30 * minute), minute);
});

test('one minute idle reveals duration, five minutes grants rest, waiting stays at zero', () => {
  const s = new RestSession();
  play(s, at(4), c, 0, 20);
  s.tick(at(4), c, 21 * minute);
  assert.equal(s.idle(21 * minute), IDLE_HINT_MS);
  assert.equal(s.idleRested, false);
  s.tick(at(4), c, 25 * minute);
  assert.equal(s.pending, null);
  assert.equal(s.idleRested, true);
  assert.equal(s.elapsed(25 * minute), 0);
  s.tick(at(4), c, 60 * minute);
  assert.equal(s.pending, null);
  s.resumeIdle(at(4), 65 * minute);
  assert.equal(s.elapsed(65 * minute), 0);
  assert.equal(s.turnsRemaining(at(4), c), 5);
});

test('returning from idle is credited before its input overwrites the timestamp', () => {
  const s = new RestSession();
  s.tick(at(4), c, 0);
  s.activity(at(4), c, IDLE_REST_MS);
  assert.equal(s.elapsed(IDLE_REST_MS), 0);
  assert.equal(s.idleRested, false);
  assert.equal(s.turnsRemaining(at(4), c), 5);
});

test('less than five idle minutes does not reset play or turn cadence', () => {
  const s = new RestSession();
  s.tick(at(4), c, 0);
  s.activity(at(4), c, IDLE_REST_MS - 1);
  assert.equal(s.elapsed(IDLE_REST_MS - 1), IDLE_REST_MS - 1);
  assert.equal(s.turnsRemaining(at(4), c), 5);
});

test('idle detection is disabled along with the time feature', () => {
  const s = new RestSession();
  const config = normalizeConfig({ timeEnabled: false, nightEnabled: false });
  s.tick(at(4), config, 0);
  s.tick(at(4), config, 20 * minute);
  assert.equal(s.idleRested, false);
  assert.equal(s.turnsRemaining(at(4), config), 5);
});

test('loading saves retains 24 minutes plus a 6-minute load, without granting idle rest', () => {
  const s = new RestSession();
  play(s, at(4), c, 0, 24);
  s.beginLoading(24 * minute);
  const loaded = new RestSession(JSON.parse(JSON.stringify(s.export())));
  loaded.tick(null, c, 30 * minute);
  assert.equal(loaded.idleRested, false);
  loaded.finishLoading(30 * minute);
  loaded.tick(at(30, 'other:age'), c, 30 * minute);
  assert.equal(loaded.pending.reason, 'time');
  assert.equal(loaded.elapsed(30 * minute), 30 * minute);
});

test('first load time counts, while a fresh game process has no previous session', () => {
  const s = new RestSession();
  s.beginLoading(0);
  s.finishLoading(2 * minute);
  s.tick(at(1), c, 2 * minute);
  assert.equal(s.elapsed(2 * minute), 2 * minute);
  assert.equal(new RestSession().elapsed(2 * minute), 0);
});

test('observing age reset or rewind does not advance counters; time survives', () => {
  const s = new RestSession();
  s.reset(at(60), 0);
  s.activity(at(3, 'game:newAge'), c, minute);
  assert.equal(s.turnsRemaining(at(3, 'game:newAge'), c), 5);
  assert.equal(s.elapsed(minute), minute);
  s.reset(at(15), 2 * minute);
  assert.equal(s.turnsRemaining(at(4), c), 5);
});

test('stage changes select a new interval without discarding accumulated turns', () => {
  const s = new RestSession();
  endTurns(s, [18, 19, 20]);
  assert.equal(s.turnCount, 3);
  assert.equal(s.turnsRemaining(at(21), c), 1);
  assert.equal(s.requestTurn(at(21), c, 1), false);
  assert.equal(s.turnCount, 4);
});

test('idle time before a forced overlay counts toward the same full idle break', () => {
  const s = new RestSession();
  endTurns(s, [1, 2, 3, 4]);
  play(s, at(4), c, 0, 24);
  s.requestTurn(at(5), c, 24.5 * minute);
  s.tick(at(5), c, 29 * minute);
  assert.equal(s.remaining(29 * minute), 0);
  assert.equal(s.complete(at(5), 29 * minute), true);
});

test('idle panel begins after one minute, pauses play time, and can resume early without resetting turns', () => {
  const s = new RestSession();
  play(s, at(4), c, 0, 24);
  s.tick(at(4), c, 25 * minute - 1);
  assert.equal(s.isIdleBreak, false);
  s.tick(at(4), c, 25 * minute);
  assert.equal(s.isIdleBreak, true);
  assert.equal(s.pending, null);
  s.tick(at(4), c, 28 * minute);
  assert.equal(s.elapsed(28 * minute), 24 * minute);
  assert.equal(s.resumeIdle(at(4), 28 * minute), true);
  assert.equal(s.turnsRemaining(at(4), c), 5);
  assert.equal(s.lastInputAt, 28 * minute);
  s.tick(at(4), c, 28 * minute);
  assert.equal(s.pending, null);
  s.activity(at(4), c, 28.5 * minute);
  s.tick(at(4), c, 29 * minute);
  assert.equal(s.pending.reason, 'time');
});

test('motion and keyboard input keep the idle panel and its rest credit until explicit continue', () => {
  const s = new RestSession();
  s.tick(at(4), c, 0);
  s.tick(at(4), c, minute);
  s.activity(at(4), c, 2 * minute);
  assert.equal(s.lastInputAt, 0);
  assert.equal(s.isIdleBreak, true);
  assert.equal(s.idle(2 * minute), 2 * minute);
  assert.equal(s.resumeIdle(at(4), 5 * minute), true);
  assert.equal(s.isIdleBreak, false);
  assert.equal(s.elapsed(5 * minute), 0);
  assert.equal(s.turnsRemaining(at(4), c), 5);
  assert.equal(s.resumeIdle(at(4), 5 * minute), false);
});

test('idle rest persists across a UI transfer but loading resumes the play clock', () => {
  const s = new RestSession();
  play(s, at(4), c, 0, 10);
  s.tick(at(4), c, 11 * minute);
  const restored = new RestSession(JSON.parse(JSON.stringify(s.export())));
  assert.equal(restored.isIdleBreak, true);
  assert.equal(restored.idle(12 * minute), 2 * minute);
  assert.equal(restored.elapsed(12 * minute), 10 * minute);
  restored.beginLoading(12 * minute);
  restored.tick(null, c, 18 * minute);
  restored.finishLoading(18 * minute);
  assert.equal(restored.isIdleBreak, false);
  assert.equal(restored.idleRested, false);
  assert.equal(restored.elapsed(18 * minute), 16 * minute);
});

test('forced breaks never become skippable idle breaks', () => {
  const s = new RestSession();
  endTurns(s, [1, 2, 3, 4]);
  s.requestTurn(at(5), c, 0);
  s.tick(at(5), c, minute);
  assert.equal(s.isIdleBreak, false);
  assert.equal(s.resumeIdle(at(5), minute), false);
  assert.equal(s.complete(at(5), minute), false);
});


test('starting from turn 10 counts five actual ends, not multiples of the game turn', () => {
  const s = new RestSession();
  s.tick(at(10), c, 0);
  assert.equal(s.turnCount, 0);
  for (const turn of [10, 11, 12, 13]) {
    assert.equal(s.requestTurn(at(turn), c, 1), true);
    assert.equal(s.requestTurn(at(turn), c, 1), true, 'duplicate hooks do not add a turn');
  }
  assert.equal(s.turnCount, 4);
  assert.equal(s.requestTurn(at(14), c, 1), false);
  assert.equal(s.turnCount, 5);
  s.requestTurn(at(14), c, 2);
  assert.equal(s.turnCount, 5);
  s.complete(at(14), 300001);
  assert.equal(s.turnCount, 0);
  assert.equal(s.requestTurn(at(14), c, 300001), true);
  assert.equal(s.turnCount, 0, 'queued submission belongs to the completed rest');
});

test('loading forward, backward, another game or the same turn never counts or resets progress', () => {
  for (const destination of [at(99), at(2), at(5, 'other:age'), at(11)]) {
    let s = new RestSession();
    endTurns(s, [10, 11]);
    s.beginLoading(10);
    s = new RestSession(JSON.parse(JSON.stringify(s.export())));
    s.tick(destination, c, 20);
    assert.equal(s.requestTurn(destination, c, 20), false, 'loading cannot submit or count');
    assert.equal(s.turnCount, 2);
    s.finishLoading(30);
    for (let i = 0; i < 10; i++) s.tick(destination, c, 31 + i);
    assert.equal(s.turnCount, 2);
    assert.equal(s.pending, null, 'loading a late game does not force rest immediately');
    s.requestTurn(destination, c, 50);
    assert.equal(s.turnCount, 3, 'playing a loaded turn counts once, even when replaying the same turn');
  }
});

test('failed load preserves duplicate protection; fresh process starts from zero', () => {
  const s = new RestSession();
  endTurns(s, [10, 11]);
  s.beginLoading(10);
  s.finishLoading(20, false);
  s.requestTurn(at(11), c, 21);
  assert.equal(s.turnCount, 2);
  const fresh = new RestSession();
  fresh.tick(at(80), c, 30);
  assert.equal(fresh.turnCount, 0);
  assert.equal(fresh.requestTurn(at(80), c, 30), true);
});

test('idle completion resets turn count; early continue and disabled turn mode preserve it', () => {
  const s = new RestSession();
  endTurns(s, [10, 11]);
  s.tick(at(12), c, minute);
  s.resumeIdle(at(12), 2 * minute);
  assert.equal(s.turnCount, 2);
  s.requestTurn(at(12), { ...c, turnEnabled: false }, 2 * minute);
  assert.equal(s.turnCount, 2);
  s.tick(at(13), c, 7 * minute);
  assert.equal(s.turnCount, 0);
});

test('invalid transfer counters are ignored and old transfer timers remain compatible', () => {
  for (const turnCount of [-1, NaN, Infinity, 1.2, '4']) {
    assert.equal(new RestSession({ version: 2, turnCount }).turnCount, 0);
  }
  const s = new RestSession({ version: 1, startedAt: 10, anchor: { context: 'a', turn: 80 } });
  assert.equal(s.turnCount, 0);
  assert.equal(s.startedAt, 10);
});


test('an interval longer than a stage still counts real actions across boundaries', () => {
  const s = new RestSession();
  const config = normalizeConfig({ intervals: [100, 100, 100, 100, 100], timeEnabled: false, nightEnabled: false });
  for (let i = 0; i < 99; i++) assert.equal(s.requestTurn(at(7 + i), config, i), true);
  assert.equal(s.turnCount, 99);
  assert.equal(s.requestTurn(at(106), config, 100), false);
});
