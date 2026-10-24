import test from 'node:test';
import assert from 'node:assert/strict';
import { RestSaver, newRestSave } from '../ui/rest-save.js';

function harness() {
  const h = { now: 0, busy: false, canSave: true, accepted: true, writes: [], current: { token: 'a:10' } };
  h.state = newRestSave('idle', 10, 0);
  h.saver = new RestSaver({
    now: () => h.now, busy: () => h.busy, canSave: () => h.canSave,
    save: name => { h.writes.push(name); if (h.throws) throw Error('disk unavailable'); return h.accepted; },
    isPending: result => result?.result === 1,
    succeeded: result => result?.result === 0,
    matches: result => result?.options === 1,
  });
  h.poll = () => h.saver.poll(h.state, h.current);
  h.complete = result => h.saver.onComplete({ options: 1, result });
  return h;
}

test('each new break has a unique, filename-safe name even in the same millisecond', () => {
  const names = ['idle', 'time', 'turn'].flatMap(reason =>
    Array.from({ length: 100 }, () => newRestSave(reason, 33, 1792544400000).fileName));
  assert.equal(new Set(names).size, 300);
  for (const name of names) assert.match(name, /^RestGuard_(Idle|Time|Turn)_T33_\d{8}-\d{6}-\d{3}_[a-z0-9-]+$/);
});

test('acceptance and pending events do not report success; completion does, exactly once', () => {
  const h = harness();
  h.poll(); h.poll();
  assert.equal(h.state.status, 'saving');
  assert.equal(h.writes.length, 1);
  h.saver.onStart(); h.complete(1);
  assert.equal(h.state.status, 'saving');
  assert.equal(h.saver.inFlight, 1);
  h.complete(0);
  assert.equal(h.state.status, 'saved');
  h.poll(); h.complete(0);
  assert.equal(h.writes.length, 1);
});

test('prior native saves and the save-before-turn gate finish before the rest write starts', () => {
  const h = harness();
  h.saver.onStart(); h.busy = true; h.poll();
  assert.equal(h.writes.length, 0);
  h.complete(0); h.poll();
  assert.equal(h.writes.length, 0);
  h.busy = false; h.poll();
  assert.equal(h.writes.length, 1);
  assert.equal(h.state.status, 'saving', 'previous completion cannot confirm our new write');
});

for (const reason of ['rejected', 'throws', 'failed', 'timeout', 'unavailable', 'overlap']) {
  test(`${reason}: one visible failure, no automatic retries or overwritten snapshots`, () => {
    const h = harness();
    if (reason === 'rejected') h.accepted = false;
    if (reason === 'throws') h.throws = true;
    if (reason === 'unavailable') h.canSave = false;
    h.poll();
    if (reason === 'failed') { h.saver.onStart(); h.complete(99); }
    if (reason === 'timeout') { h.now = 60001; h.poll(); }
    if (reason === 'overlap') { h.saver.onStart(); h.saver.onStart(); }
    assert.ok(['failed', 'unconfirmed', 'unavailable'].includes(h.state.status));
    const count = h.writes.length;
    h.complete(0);
    for (let i = 0; i < 10; i++) h.poll();
    assert.equal(h.writes.length, count);
    assert.notEqual(h.state.status, 'saved', 'late callbacks cannot turn a failed job into success');
  });
}

test('autosave/quick-save callbacks and completions without a start cannot confirm success', () => {
  const h = harness();
  h.poll(); h.complete(0);
  assert.equal(h.state.status, 'saving');
  h.saver.onStart();
  for (const options of [2, 4]) h.saver.onComplete({ options, result: 0 });
  assert.equal(h.state.status, 'saving');
  h.complete(0);
  assert.equal(h.state.status, 'saved');
});

test('leaving the break or changing game context cancels waiting work', () => {
  for (const change of ['resume', 'load', 'destroy']) {
    const h = harness();
    h.busy = true; h.poll();
    if (change === 'resume') h.state = null;
    if (change === 'load') h.current = { token: 'b:10' };
    if (change === 'destroy') h.saver.cancel();
    h.busy = false; h.poll();
    assert.equal(h.writes.length, 0);
  }
});

test('same-break saved state is not retried and a new break creates a new request', () => {
  const h = harness();
  h.poll(); h.saver.onStart(); h.complete(0);
  h.saver = new RestSaver(h.saver.env);
  h.poll();
  assert.equal(h.writes.length, 1);
  h.state = newRestSave('time', 10, 0);
  h.poll();
  assert.equal(h.writes.length, 2);
  assert.notEqual(h.writes[0], h.writes[1]);
});
