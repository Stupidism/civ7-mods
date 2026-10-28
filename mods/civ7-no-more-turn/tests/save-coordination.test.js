import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveGate } from '../../civ7-auto-save-before/ui/save-gate.js';
import { RestSaver, newRestSave } from '../ui/rest-save.js';

// Both actual coordinators observe the same mocked native event stream.
function harness({ reverse = false, recoveryMode = 'start', accepted = true } = {}) {
  let now = 0, sequence = 0, gateWrites = 0, submitted = 0;
  const timers = new Map(), restWrites = [];
  const gate = new SaveGate({
    context: () => ({ token: 'game:turn13', active: true, sent: false, canSave: true }),
    dialogOpen: () => false,
    setTimer: (fn, ms) => { timers.set(++sequence, { fn, ms }); return sequence; },
    clearTimer: id => timers.delete(id), showBusy() {},
    save() {
      gateWrites++;
      if (gateWrites > 1 && !accepted) return false;
      if (gateWrites === 1 || recoveryMode !== 'deferred') emit('start');
      if (gateWrites > 1 && recoveryMode === 'complete') complete('normal');
      return true;
    },
    isPending: r => r.result === 'pending', matches: r => r.category === 'normal',
    succeeded: r => r.result === 'ok', saved() {}, notice() {}, error() {}
  });
  const rest = new RestSaver({
    now: () => now, busy: () => gate.busy, saveTracking: () => gate.saveTracking,
    canSave: () => true,
    save(name) { restWrites.push(name); emit('start'); return true; },
    isPending: r => r.result === 'pending', succeeded: r => r.result === 'ok',
    matches: (r, name) => r.category === 'auto' && r.fileName === name
  });
  function emit(event, data) {
    const listeners = event === 'start'
      ? [() => gate.onSaveStart(), () => rest.onStart()]
      : [() => gate.onSaveComplete(data), () => rest.onComplete(data)];
    for (const fn of reverse ? listeners.reverse() : listeners) fn();
  }
  function complete(category, fileName, result = 'ok') { emit('complete', { category, fileName, result }); }
  return {
    gate, rest, restWrites, emit, complete,
    get gateWrites() { return gateWrites; }, get submitted() { return submitted; },
    request: () => gate.request(() => submitted++),
    flush(ms) { for (const [id, t] of [...timers]) if (t.ms === ms) { timers.delete(id); t.fn(); } },
    poll: state => rest.poll(state, { token: 'turn13' }),
    expire() { now = 60001; }
  };
}

for (const reverse of [false, true]) for (const recoveryMode of ['start', 'deferred', 'complete']) {
  test(`successful recovery unblocks this and later rest checkpoints (${reverse}, ${recoveryMode})`, () => {
    const h = harness({ reverse, recoveryMode });
    h.request(); // Native Start, but its completion is lost.
    assert.equal(h.rest.inFlight, 1);
    assert.equal(h.gate.saveTracking.recovery, null);
    h.flush(5000);
    assert.equal(h.gateWrites, 2);
    assert.equal(h.gate.saveTracking.recovery.source, 'civ7-before-end-turn');
    const state = newRestSave('turn', 13, 0);
    h.poll(state);
    assert.equal(h.restWrites.length, 0, 'acceptance is not completion');
    if (recoveryMode === 'deferred') h.emit('start');
    if (recoveryMode !== 'complete') h.complete('normal');
    h.flush(0);
    assert.equal(h.submitted, 1);
    h.poll(state);
    assert.equal(h.restWrites.length, 1);
    assert.equal(state.status, 'saving', 'the other mod cannot confirm our checkpoint');
    h.complete('auto', state.fileName, 'pending');
    assert.equal(state.status, 'saving');
    h.complete('auto', state.fileName);
    assert.equal(state.status, 'saved');
    const next = newRestSave('time', 13, 1);
    h.poll(next);
    assert.equal(h.restWrites.length, 2);
    h.complete('auto', next.fileName);
    assert.equal(next.status, 'saved');
  });
}

test('rejected recovery does not clear an active native save', () => {
  const h = harness({ accepted: false });
  h.request(); h.flush(5000);
  assert.equal(h.gate.saveTracking.recovery, null);
  h.flush(60000); // Auto-save Before stops waiting; the native save still lacks completion.
  const state = newRestSave('turn', 13, 0);
  h.poll(state);
  assert.equal(h.rest.inFlight, 1);
  assert.equal(h.restWrites.length, 0);
  h.expire(); h.poll(state);
  assert.equal(state.status, 'unconfirmed');
});

test('accepted recovery without completion never unlocks or claims a rest save', () => {
  const h = harness(); h.request(); h.flush(5000);
  h.flush(60000);
  const state = newRestSave('turn', 13, 0);
  h.poll(state);
  assert.equal(h.rest.inFlight, 1);
  assert.equal(h.restWrites.length, 0);
  h.expire(); h.poll(state);
  assert.equal(state.status, 'unconfirmed');
});

test('reconciliation retains a newer native save instead of blindly clearing all counts', () => {
  const h = harness(); h.request(); h.flush(5000); h.complete('normal'); h.flush(0);
  h.emit('start'); // A subsequent system/manual save is genuinely still active.
  const state = newRestSave('turn', 13, 0);
  h.poll(state);
  assert.equal(h.rest.inFlight, 1);
  assert.equal(h.restWrites.length, 0);
  h.complete('quick'); h.poll(state);
  assert.equal(h.restWrites.length, 1);
  assert.equal(state.status, 'saving');
});
