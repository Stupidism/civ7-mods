import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridge } from '../ui/bridge-runtime.js';

const contexts = { INVALID: -1, Shell: 0, World: 1, Unit: 2, Dual: 3 };
const statuses = { START: 1, UPDATE: 2, FINISH: 3, HOLD: 4 };
function fixture(options = {}) {
  const events = [], stops = [], contextWrites = [], reports = [];
  let clock = 0, current = contexts.World;
  const state = {
    controller: true, softCursor: false, viewContext: contexts.World,
    mode: 'DEFAULT', panelPresent: false, worldAllowed: true,
    viewAllowed: true, worldFocused: true, blocked: false
  };
  const original = function (...args) { events.push(args); return 'native-result'; };
  const actionHandler = { onEngineInput: original };
  const input = {
    getActiveContext: () => current,
    setActiveContext(value) { current = value; contextWrites.push(value); }
  };
  const bridge = createBridge({
    actionHandler, input, contexts, statuses, snapshot: () => ({ ...state }),
    stopMotion: name => stops.push(name), now: () => clock,
    report: (...args) => reports.push(args), ...options
  });
  const action = (name, status = statuses.START, x = 0, y = 0) =>
    actionHandler.onEngineInput(name, status, x, y);
  return { bridge, actionHandler, original, input, state, events, stops, contextWrites, reports, action,
    advance(ms) { clock += ms; bridge.tick(); } };
}

test('acquires Shell once; translates both sticks with full analog values', () => {
  const f = fixture();
  for (let i = 0; i < 100; i++) f.bridge.tick();
  assert.deepEqual(f.contextWrites, [contexts.Shell]);
  f.action('nav-move', statuses.UPDATE, 0.8, 0.6);
  f.action('scroll-pan', statuses.UPDATE, -0.6, 0.8);
  assert.deepEqual(f.events, [['plot-move', statuses.UPDATE, 0.8, 0.6],
    ['camera-pan', statuses.UPDATE, -0.6, -0.8]]);
});

test('left stick defaults preserve vertical coordinates in both map views and menus', () => {
  for (const viewContext of [contexts.World, contexts.Unit]) {
    const f = fixture();
    f.state.viewContext = viewContext;
    for (const status of [statuses.START, statuses.UPDATE, statuses.HOLD]) {
      for (const [x, y] of [[0, 1], [0, -1], [0.6, 0.8], [-0.6, -0.8], [1, 0]]) {
        f.action('nav-move', status, x, y);
        assert.deepEqual(f.events.at(-1), ['plot-move', status === statuses.HOLD ? statuses.UPDATE : status, x, y]);
      }
    }
    f.action('nav-move', statuses.FINISH, 0, 0);
    assert.deepEqual(f.events.at(-1), ['plot-move', statuses.FINISH, 0, 0]);
    f.state.panelPresent = true;
    f.action('nav-move', statuses.UPDATE, 0.6, 0.8);
    assert.deepEqual(f.events.at(-1), ['nav-move', statuses.UPDATE, 0.6, 0.8]);
    f.state.panelPresent = false;
    f.action('plot-move', statuses.UPDATE, 0.6, 0.8);
    assert.deepEqual(f.events.at(-1), ['plot-move', statuses.UPDATE, 0.6, 0.8]);
  }
});

test('zero, deadzone and release terminate movement without NaN or endless drift', () => {
  const f = fixture();
  f.action('nav-move', statuses.START, 1, 0);
  f.action('nav-move', statuses.UPDATE, 0, 0);
  f.action('nav-move', statuses.UPDATE, 0.1, 0.1);
  f.action('scroll-pan', statuses.START, 0, 1);
  f.action('scroll-pan', statuses.FINISH, 0, 0);
  assert.equal(f.events.length, 4);
  assert.deepEqual(f.events[1], ['plot-move', statuses.FINISH, 0, 0]);
  assert.deepEqual(f.events[3], ['camera-pan', statuses.FINISH, 0, 0]);
});

test('non-finite samples stop owned motion, never reach native cursor math', () => {
  const f = fixture();
  f.action('nav-move', statuses.START, 1, 0);
  f.action('nav-move', statuses.UPDATE, NaN, Infinity);
  assert.equal(f.events.length, 1);
  assert.deepEqual(f.stops, ['plot-move']);
});

test('missing Bluetooth releases expire movement after the input lease', () => {
  const f = fixture();
  f.action('scroll-pan', statuses.START, 1, 0);
  f.advance(751);
  assert.deepEqual(f.stops, ['camera-pan']);
  f.advance(1000);
  assert.equal(f.stops.length, 1);
});

test('D-pad moves the map and supports a normalized diagonal', () => {
  const f = fixture();
  f.action('nav-up');
  f.action('nav-right');
  f.advance(16);
  const sample = f.events.at(-1);
  assert.equal(sample[0], 'plot-move');
  assert.ok(Math.abs(Math.hypot(sample[2], sample[3]) - 1) < 1e-9);
  f.action('nav-up', statuses.FINISH);
  f.action('nav-right', statuses.FINISH);
  assert.deepEqual(f.events.at(-1), ['plot-move', statuses.FINISH, 0, 0]);
});

test('D-pad with no release or HOLD cannot move the map forever', () => {
  const f = fixture();
  f.action('nav-up');
  f.advance(300);
  f.advance(500);
  const count = f.events.length;
  f.advance(1000);
  assert.equal(f.events.length, count);
  assert.ok(f.stops.includes('plot-move'));
});

test('Unit D-pad and focused HUD navigation pass through unmodified', () => {
  const f = fixture();
  f.state.viewContext = contexts.Unit;
  f.action('nav-up');
  assert.deepEqual(f.events.at(-1), ['nav-up', statuses.START, 0, 0]);
  f.state.viewContext = contexts.World;
  f.state.worldFocused = false;
  f.action('nav-left');
  assert.deepEqual(f.events.at(-1), ['nav-left', statuses.START, 0, 0]);
});

for (const [name, mutate] of [
  ['pause/menu', s => { s.panelPresent = true; s.worldAllowed = false; }],
  ['tutorial/input lock', s => { s.viewAllowed = false; }],
  ['save/rest guard', s => { s.blocked = true; }],
  ['mouse device', s => { s.controller = false; }],
  ['native soft cursor', s => { s.softCursor = true; }],
  ['city Dual view', s => { s.viewContext = contexts.Dual; }]
]) test(`${name}: stop previous camera motion and preserve menu input`, () => {
  const f = fixture();
  f.action('scroll-pan', statuses.START, 1, 0);
  mutate(f.state);
  f.bridge.tick();
  assert.deepEqual(f.stops, ['camera-pan']);
  assert.equal(f.bridge.getStatus().active, false);
  f.action('nav-move', statuses.UPDATE, 1, 0);
  assert.deepEqual(f.events.at(-1), ['nav-move', statuses.UPDATE, 1, 0]);
  assert.equal(f.input.getActiveContext(), f.state.panelPresent ? contexts.Shell : f.state.viewContext);
});

test('pause/resume and a native Unit context request re-enter Shell without looping', () => {
  const f = fixture();
  f.state.panelPresent = true;
  f.bridge.sync();
  assert.deepEqual(f.contextWrites, [contexts.Shell]);
  f.state.panelPresent = false;
  f.state.viewContext = contexts.Unit;
  f.input.setActiveContext(contexts.Unit);
  f.input.setActiveContext = value => {
    f.contextWrites.push(value);
    f.input.getActiveContext = () => value;
    f.bridge.sync(); // Synchronous native InputContextChanged.
  };
  f.bridge.sync();
  assert.equal(f.input.getActiveContext(), contexts.Shell);
  assert.equal(f.contextWrites.length, 3);
});

test('release after panel transition cannot trigger a turn or zoom', () => {
  const f = fixture();
  f.action('shell-action-2');
  f.action('nav-shell-next');
  f.state.panelPresent = true; f.bridge.sync();
  f.state.panelPresent = false; f.bridge.sync();
  f.action('shell-action-2', statuses.FINISH);
  f.action('nav-shell-next', statuses.FINISH);
  assert.equal(f.events.length, 0);
});

test('buttons dispatch once on release; A/B/menu and mouse remain native', () => {
  const f = fixture();
  for (const [source, target, x] of [
    ['nav-shell-next', 'camera-zoom-in', 1],
    ['nav-shell-previous', 'camera-zoom-out', 1],
    ['shell-action-1', 'toggle-radial-menu', 0],
    ['shell-action-2', 'next-action', 0],
    ['shell-action-3', 'center-plot-cursor', 0]
  ]) {
    f.action(source); f.action(source, statuses.HOLD); f.action(source, statuses.FINISH);
    assert.deepEqual(f.events.at(-1), [target, statuses.FINISH, x, 0]);
  }
  assert.equal(f.events.length, 5);
  for (const name of ['accept', 'cancel', 'sys-menu', 'mousebutton-left', 'keyboard-escape']) {
    assert.equal(f.action(name, statuses.FINISH), 'native-result');
    assert.equal(f.events.at(-1)[0], name);
  }
});

test('unit X requests the normal movement targeting UI', () => {
  const f = fixture();
  f.state.viewContext = contexts.Unit;
  f.action('shell-action-1'); f.action('shell-action-1', statuses.FINISH);
  assert.deepEqual(f.events, [['unit-move', statuses.FINISH, 0, 0]]);
});

test('native map actions are not translated or dispatched twice', () => {
  const f = fixture();
  f.action('plot-move', statuses.UPDATE, 0.8, 0.2);
  assert.deepEqual(f.events, [['plot-move', statuses.UPDATE, 0.8, 0.2]]);
});

test('mixed native and fallback streams prefer the native axis while it is active', () => {
  const f = fixture();
  f.action('plot-move', statuses.UPDATE, 0.8, 0.2);
  f.action('nav-move', statuses.UPDATE, 0.8, 0.2);
  f.action('nav-up');
  f.advance(16);
  assert.equal(f.events.length, 1);
  f.advance(800);
  f.action('nav-move', statuses.UPDATE, 0.8, 0.2);
  assert.equal(f.events.length, 2);
});

test('a swallowed release still directly neutralizes only bridge-owned motion', () => {
  let blocked = false, pan = 0;
  const handler = { onEngineInput(name, status, x) {
    if (!blocked && name === 'camera-pan') pan = status === statuses.FINISH ? 0 : x;
  } };
  const f = fixture({ actionHandler: handler, stopMotion: name => { if (name === 'camera-pan') pan = 0; } });
  handler.onEngineInput('scroll-pan', statuses.START, 1, 0);
  assert.equal(pan, 1);
  blocked = true;
  handler.onEngineInput('scroll-pan', statuses.FINISH, 0, 0);
  assert.equal(pan, 0);
  assert.equal(f.bridge.getStatus().active, true);
});

test('window blur releases motion and focus regain reacquires only an eligible map', () => {
  const f = fixture();
  f.action('nav-move', statuses.START, 1, 0);
  f.bridge.setWindowFocused(false);
  assert.deepEqual(f.stops, ['plot-move']);
  assert.equal(f.input.getActiveContext(), contexts.World);
  f.bridge.setWindowFocused(true);
  assert.equal(f.input.getActiveContext(), contexts.Shell);
});

test('disable restores input, leaves no motion, and re-enable needs a fresh button press', () => {
  const f = fixture();
  f.action('shell-action-2'); f.action('scroll-pan', statuses.START, 1, 0);
  f.bridge.setEnabled(false);
  assert.equal(f.input.getActiveContext(), contexts.World);
  assert.deepEqual(f.stops, ['camera-pan']);
  f.bridge.setEnabled(true);
  f.action('shell-action-2', statuses.FINISH);
  assert.equal(f.events.filter(e => e[0] === 'next-action').length, 0);
});

test('disposal does not overwrite a later mod wrapper', () => {
  const f = fixture();
  const hook = f.actionHandler.onEngineInput;
  const outer = (...args) => hook(...args);
  f.actionHandler.onEngineInput = outer;
  f.bridge.dispose(); f.bridge.dispose();
  assert.equal(f.actionHandler.onEngineInput, outer);
  f.action('nav-move', statuses.UPDATE, 1, 0);
  assert.deepEqual(f.events.at(-1), ['nav-move', statuses.UPDATE, 1, 0]);
});

test('failed context selection disables bridge without rewriting input actions', () => {
  const input = { getActiveContext: () => contexts.World, setActiveContext() {} };
  const f = fixture({ input });
  assert.match(f.bridge.getStatus().fault, /did not accept/);
  f.action('nav-move', statuses.UPDATE, 1, 0);
  assert.equal(f.events.at(-1)[0], 'nav-move');
});

test('a failing delegate is never retried, preventing duplicate game actions', () => {
  let calls = 0;
  const handler = { onEngineInput() { calls++; throw new Error('native failure'); } };
  const f = fixture({ actionHandler: handler });
  handler.onEngineInput('accept', statuses.FINISH, 0, 0);
  assert.equal(calls, 1);
  assert.equal(f.bridge.getStatus().enabled, false);
});

test('user can invert camera Y without modifying Steam bindings', () => {
  const f = fixture();
  f.bridge.setInvertPanY(false);
  f.action('scroll-pan', statuses.UPDATE, 0, 1);
  assert.deepEqual(f.events.at(-1), ['camera-pan', statuses.UPDATE, 0, 1]);
});


test('left direction is independent of right stick, D-pad and menu input', () => {
  for (const viewContext of [contexts.World, contexts.Unit]) {
    const f = fixture({ invertLeftY: true, invertPanY: false });
    f.state.viewContext = viewContext;
    f.action('nav-move', statuses.UPDATE, 0.6, 0.8);
    assert.deepEqual(f.events.at(-1), ['plot-move', statuses.UPDATE, 0.6, -0.8]);
    f.action('scroll-pan', statuses.UPDATE, 0.6, 0.8);
    assert.deepEqual(f.events.at(-1), ['camera-pan', statuses.UPDATE, 0.6, 0.8]);
    f.action('nav-up');
    assert.deepEqual(f.events.at(-1), viewContext === contexts.World ?
      ['plot-move', statuses.START, 0, 1] : ['nav-up', statuses.START, 0, 0]);
    f.state.panelPresent = true;
    f.action('nav-move', statuses.UPDATE, 0.6, 0.8);
    assert.deepEqual(f.events.at(-1), ['nav-move', statuses.UPDATE, 0.6, 0.8]);
    f.state.panelPresent = false;
    f.action('plot-move', statuses.UPDATE, 0.6, 0.8);
    assert.deepEqual(f.events.at(-1), ['plot-move', statuses.UPDATE, 0.6, -0.8]);
    f.action('plot-move', statuses.FINISH, 0, 0);
    assert.deepEqual(f.events.at(-1), ['plot-move', statuses.FINISH, 0, 0]);
    f.bridge.setEnabled(false);
    f.action('plot-move', statuses.UPDATE, 0.6, 0.8);
    assert.deepEqual(f.events.at(-1), ['plot-move', statuses.UPDATE, 0.6, 0.8]);
  }
});

test('changing left direction stops only left motion; applying same value is a no-op', () => {
  const f = fixture();
  f.action('nav-move', statuses.UPDATE, 0, 1);
  f.action('scroll-pan', statuses.UPDATE, 1, 0);
  f.bridge.setInvertLeftY(true);
  assert.deepEqual(f.stops, ['plot-move']);
  f.bridge.setInvertLeftY(true);
  assert.deepEqual(f.stops, ['plot-move']);
  f.action('nav-move', statuses.UPDATE, 0, 1);
  assert.deepEqual(f.events.at(-1), ['plot-move', statuses.UPDATE, 0, -1]);
  f.bridge.setInvertLeftY(false);
  f.action('nav-move', statuses.UPDATE, 0, 1);
  assert.deepEqual(f.events.at(-1), ['plot-move', statuses.UPDATE, 0, 1]);
});
