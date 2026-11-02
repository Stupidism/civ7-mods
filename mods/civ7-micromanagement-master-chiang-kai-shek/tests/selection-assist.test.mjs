import test from 'node:test';
import assert from 'node:assert/strict';
import { createSelectionAssist } from '../ui/selection-assist.js';

function fixture() {
  let next = 0;
  const frames = new Map();
  const state = { head: 'archer', mode: 'INTERFACEMODE_UNIT_SELECTED', allowed: true, removable: true, entered: [], errors: [] };
  const assist = createSelectionAssist({
    key: id => id,
    headSelected: () => state.head,
    nextFrame: f => { frames.set(++next, f); return next; },
    cancelFrame: id => frames.delete(id),
    canUseWorld: () => state.allowed,
    mode: () => state.mode,
    actionFor: () => state.removable ? 'REMOVE' : null,
    enterAction: id => { state.entered.push(id); state.mode = 'INTERFACEMODE_REMOVE_FROM_ARMY'; },
    reportError: e => state.errors.push(e)
  });
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(f => f()); };
  const select = (id = 'archer') => { state.head = id; assist.selectionChanged(id, true); assist.raised(id); };
  return { state, assist, flush, select };
}

test('selection waits for native selection readiness and one animation frame', () => {
  const f = fixture();
  f.assist.selectionChanged('archer', true);
  f.flush();
  assert.deepEqual(f.state.entered, []);
  f.assist.raised('archer');
  assert.deepEqual(f.state.entered, []);
  f.flush();
  assert.deepEqual(f.state.entered, ['archer']);
});
test('cancelled mode stays cancelled across panel refreshes and duplicate selection notifications', () => {
  const f = fixture(); f.select(); f.flush();
  f.state.mode = 'INTERFACEMODE_UNIT_SELECTED';
  f.assist.cancelPending(); f.select(); f.assist.raised('archer'); f.flush();
  assert.deepEqual(f.state.entered, ['archer']);
});
test('cancel before frame cannot open a mode afterwards', () => {
  const f = fixture(); f.select(); f.assist.cancelPending(); f.flush();
  assert.deepEqual(f.state.entered, []);
});
test('fast A to B selection only affects B; late A deselect cannot cancel B', () => {
  const f = fixture(); f.select('A'); f.select('B');
  f.assist.selectionChanged('A', false); f.flush();
  assert.deepEqual(f.state.entered, ['B']);
});
test('deselect then reselect permits a new attempt', () => {
  const f = fixture(); f.select(); f.flush();
  f.assist.selectionChanged('archer', false);
  f.state.mode = 'INTERFACEMODE_UNIT_SELECTED'; f.select(); f.flush();
  assert.equal(f.state.entered.length, 2);
});
for (const [name, change] of [
  ['ineligible unit or no legal exit tile', s => s.removable = false],
  ['modal blocking world input', s => s.allowed = false],
  ['user already chose a different action', s => s.mode = 'INTERFACEMODE_RANGE_ATTACK'],
  ['head selection changed without a corresponding raise', s => s.head = 'other']
]) test(name, () => {
  const f = fixture(); f.select(); change(f.state); f.flush();
  assert.deepEqual(f.state.entered, []);
});
test('unload cancels queued callbacks and rejects subsequent events', () => {
  const f = fixture(); f.select(); f.assist.dispose(); f.flush();
  f.select('B'); f.flush(); assert.deepEqual(f.state.entered, []);
});

