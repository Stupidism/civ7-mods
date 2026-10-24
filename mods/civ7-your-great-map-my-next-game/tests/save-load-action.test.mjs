import test from 'node:test';
import assert from 'node:assert/strict';
import { attachSaveLoadAction } from '../ui/save-load-action.js';

function harness() {
  const attributes = new Map(), listeners = new Map(), classes = new Set();
  const button = {
    classList: { add: name => classes.add(name), toggle: (name, on) => on ? classes.add(name) : classes.delete(name) },
    setAttribute: (key, value) => attributes.set(key, value),
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name), remove: () => attributes.set('removed', true),
  };
  let selected = { ID: 1, fileName: 'test.Civ7Save', displayName: 'Test', location: 1, type: 2 };
  let mode = 'load', choices;
  const calls = [];
  const control = {
    currentPanelOperation: 0,
    Root: { getAttribute: () => mode },
    actionButtonsContainer: { appendChild: value => assert.equal(value, button) },
    getSelectedSaveGameInfo: () => selected,
    updateLoadButton() { calls.push('native-update'); return 42; },
  };
  const flow = {
    state: { phase: 'idle' },
    async prepare(save) { calls.push('prepare'); flow.state = { phase: 'ready', sourceName: save.displayName }; return true; },
    async start() { calls.push('start'); flow.state = { phase: 'start-requested' }; return true; },
    async adjust() { calls.push('adjust'); flow.state = { phase: 'editing' }; return true; },
    cancel() { calls.push('cancel'); flow.state = { phase: 'cancelled' }; return true; },
  };
  const binding = attachSaveLoadAction(control, {
    document: { createElement: tag => { assert.equal(tag, 'fxs-button'); return button; } }, flow,
    isEligible: save => save.ID > 0,
    showChoices: value => { choices = value; }, showFailure: () => calls.push('failure'),
  });
  return {
    control, flow, binding, attributes, listeners, calls, classes,
    choices: () => choices,
    select: value => { selected = value; }, mode: value => { mode = value; },
    activate: () => listeners.get('action-activate')({ preventDefault() {}, stopPropagation() {} }),
  };
}

test('adds an independent action, retains native update behavior, and opens the chosen route', async () => {
  for (const action of ['adjust', 'start']) {
    const h = harness();
    assert.equal(h.control.updateLoadButton(), 42);
    assert.equal(h.attributes.get('disabled'), 'false');
    await h.activate();
    assert.equal(h.choices().sourceName, 'Test');
    await h.choices()[action]();
    assert.deepEqual(h.calls, ['native-update', 'prepare', action]);
    assert.equal(h.attributes.get('disabled'), 'true');
  }
});

test('non-load modes, missing selections and busy native screens cannot prepare', async () => {
  const h = harness();
  h.mode('load_config'); h.binding.refresh(); await h.activate();
  assert.equal(h.classes.has('hidden'), true);
  h.mode('load'); h.control.currentPanelOperation = 4; h.binding.refresh(); await h.activate();
  h.control.currentPanelOperation = 0; h.select({ ID: -1 }); h.binding.refresh(); await h.activate();
  assert.equal(h.attributes.get('disabled'), 'true');
  assert.deepEqual(h.calls, []);
});

test('a stale dialog or detached screen cannot start another selected save', async () => {
  const h = harness(); await h.activate();
  h.select({ ID: 2, fileName: 'another.Civ7Save' });
  await h.choices().start();
  assert.deepEqual(h.calls, ['prepare', 'cancel']);
  const detached = harness(); await detached.activate(); detached.binding.dispose();
  await detached.choices().start();
  assert.equal(detached.calls.includes('start'), false);
  assert.equal(detached.attributes.get('removed'), true);
  assert.equal(detached.listeners.size, 0);
});

test('disposal restores native behavior without overwriting a later mod decorator', () => {
  const h = harness(); h.binding.dispose();
  assert.equal(h.control.updateLoadButton(), 42);
  const next = harness(), prior = next.control.updateLoadButton;
  const later = function () { return prior.call(this); };
  next.control.updateLoadButton = later; next.binding.dispose();
  assert.equal(next.control.updateLoadButton, later);
  assert.equal(next.control.updateLoadButton(), 42);
});
