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
    matches: result => result?.options === 4,
  });
  h.poll = () => h.saver.poll(h.state, h.current);
  h.complete = result => h.saver.onComplete({ options: 4, result });
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

test('manual/quick-save callbacks and completions without a start cannot confirm success', () => {
  const h = harness();
  h.poll(); h.complete(0);
  assert.equal(h.state.status, 'saving');
  h.saver.onStart();
  for (const options of [1, 2]) h.saver.onComplete({ options, result: 0 });
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

for (const timing of ['deferred', 'sync-start', 'sync-complete']) {
  for (const missing of ['system', 'own']) {
    test(`standalone rest recovers lost ${missing} completion (${timing})`, () => {
      const h = harness();
      if (missing === 'system') h.saver.onStart();
      h.poll();
      if (missing === 'own') h.saver.onStart();
      const oldName = h.state.fileName;
      h.saver.env.save = name => {
        h.writes.push(name);
        if (timing !== 'deferred') h.saver.onStart();
        if (timing === 'sync-complete') h.complete(0);
        return true;
      };
      h.now = 4999; h.poll();
      assert.equal(h.writes.length, missing === 'own' ? 1 : 0);
      h.now = 5000; h.poll();
      assert.notEqual(h.state.fileName, oldName, 'recovery must not overwrite an already-written checkpoint');
      if (timing === 'deferred') {
        h.complete(0); // Completion without fresh start is not proof.
        assert.equal(h.state.status, 'saving');
        h.saver.onStart();
      }
      if (timing !== 'sync-complete') {
        assert.equal(h.state.status, 'saving');
        h.complete(1); assert.equal(h.state.status, 'saving');
        h.complete(0);
      }
      assert.equal(h.state.status, 'saved');
      assert.equal(h.saver.inFlight, 0);
      h.state = newRestSave('time', 10, 2); h.poll();
      if (timing === 'deferred') h.saver.onStart();
      if (timing !== 'sync-complete') h.complete(0);
      assert.equal(h.state.status, 'saved', 'later break also works');
    });
  }
}

test('standalone recovery retries busy rejection, never clears it on rejection or exception', () => {
  const h = harness(); h.saver.onStart(); h.poll();
  const name = h.state.fileName;
  h.accepted = false; h.now = 5000; h.poll();
  assert.equal(h.saver.inFlight, 1); assert.equal(h.state.fileName, name);
  h.throws = true; h.now = 10000; h.poll();
  assert.equal(h.saver.inFlight, 1); assert.equal(h.state.status, 'waiting');
  h.throws = false; h.accepted = true; h.now = 15000; h.poll();
  assert.equal(h.state.status, 'saving');
  h.saver.onStart(); h.complete(0); assert.equal(h.state.status, 'saved');
});

test('recovery is bounded, missing or failed completion never becomes saved', () => {
  for (const failure of ['lost', 'failed', 'overlap']) {
    const h = harness(); h.saver.onStart(); h.poll(); h.now = 5000; h.poll();
    h.saver.onStart();
    if (failure === 'failed') h.complete(99);
    if (failure === 'overlap') h.saver.onStart();
    h.now = 10000; h.poll(); h.now = 60001; h.poll();
    assert.equal(h.writes.length, 1, 'no endless accepted recovery writes');
    assert.notEqual(h.state.status, 'saved');
    h.complete(0); assert.notEqual(h.state.status, 'saved');
  }
});

test('cancel/context change before recovery never issues a new write', () => {
  for (const mode of ['resume', 'context']) {
    const h = harness(); h.saver.onStart(); h.poll(); h.now = 5000;
    if (mode === 'resume') h.state = null; else h.current = { token: 'other' };
    h.poll(); assert.equal(h.writes.length, 0);
  }
});
