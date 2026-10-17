import test from 'node:test';
import assert from 'node:assert/strict';
import { installRestOptions, openRestOptions } from '../ui/rest-options.js';
import { RestStore } from '../ui/rest-store.js';
import { normalizeConfig } from '../ui/rest-model.js';

function harness(config = {}, extra = {}) {
  let shared = JSON.stringify({ otherMod: { enabled: true }, 'civ7-rest-guard': { version: 3, config: normalizeConfig(config) } });
  const calls = { writes: 0, commits: 0, applies: 0, errors: 0 };
  const storage = { getItem: () => shared, setItem: (_k, v) => { calls.writes++; shared = v; } };
  const store = new RestStore(storage, () => {});
  const options = {
    data: new Map([['other-option', { id: 'other-option', category: 'mods', group: 'other' }]]),
    init() {}, addOption(info) { this.data.set(info.id, info); info.initListener?.(info); },
    commitOptions() { calls.commits++; return 'native result'; },
    restore() { for (const info of this.data.values()) info.initListener?.(info); },
    resetOptionsToDefault() {},
  };
  const existingCategory = { title: 'Other mods category' };
  const categories = { mods: existingCategory };
  const integration = installRestOptions({ options, optionType: { Switch: 5, Dropdown: 2, Editor: 0 },
    categories, store, applied() { calls.applies++; }, reportError() { calls.errors++; }, ...extra });
  options.init();
  const entry = name => options.data.get(`rest-guard-${name}`);
  const change = (name, value) => {
    const e = entry(name);
    e.updateListener(e, e.dropdownItems ? e.dropdownItems.findIndex(item => item.label === String(value)) : value);
  };
  return { options, store, storage, categories, existingCategory, calls, integration, entry, change,
    saved: () => JSON.parse(shared) };
}

test('all settings share the Add-ons category and preserve other mods', () => {
  const h = harness();
  assert.equal(h.categories.mods, h.existingCategory);
  assert.equal(h.options.data.size, 11);
  assert.equal(h.entry('interval-4').category, 'mods');
  assert.equal(h.entry('interval-4').group, 'rest_guard');
  assert.equal(h.entry('rest-minutes').dropdownItems[h.entry('rest-minutes').selectedItemIndex].label, '5');
  h.change('interval-4', 7); h.change('turn-enabled', false);
  assert.equal(h.store.data.config.turnEnabled, true);
  assert.equal(h.calls.writes, 0);
  assert.equal(h.options.commitOptions(), 'native result');
  assert.equal(h.store.data.config.turnEnabled, false);
  assert.equal(h.store.data.config.intervals[4], 7);
  assert.deepEqual(h.saved().otherMod, { enabled: true });
  assert.equal(h.calls.applies, 1);
});

test('cancel and reopening restore saved values without writes or timer resets', () => {
  const h = harness();
  h.change('time-enabled', false); h.change('play-minutes', 40);
  h.options.restore();
  assert.equal(h.entry('time-enabled').currentValue, true);
  assert.equal(h.entry('play-minutes').dropdownItems[h.entry('play-minutes').selectedItemIndex].label, '25');
  h.options.init();
  assert.equal(h.options.data.size, 11);
  assert.equal(h.calls.writes, 0); assert.equal(h.calls.applies, 0);
});

test('module reset is a cancelable draft; native global reset applies defaults', () => {
  const h = harness({ playMinutes: 40, restMinutes: 2 });
  h.entry('reset').activateListener();
  assert.equal(h.calls.writes, 0);
  h.options.restore();
  assert.equal(h.store.data.config.playMinutes, 40);
  h.entry('reset').activateListener(); h.options.commitOptions();
  assert.deepEqual(h.store.data.config, normalizeConfig());
  h.change('rest-minutes', 2); h.options.commitOptions();
  h.options.resetOptionsToDefault();
  assert.deepEqual(h.store.data.config, normalizeConfig());
});

test('audio-only commit cannot save a mod draft; legacy fractional settings survive', () => {
  const h = harness({ playMinutes: 1.3, restMinutes: 0.3 });
  for (const name of ['play-minutes', 'rest-minutes']) assert.ok(h.entry(name).selectedItemIndex >= 0);
  h.change('time-enabled', false); h.options.commitOptions('audio');
  assert.equal(h.calls.writes, 0);
  h.options.commitOptions('configuration');
  assert.equal(h.store.data.config.playMinutes, 1.3); assert.equal(h.store.data.config.restMinutes, 0.3);
});

test('save failure keeps the applied config and blocks native confirm closing', () => {
  const h = harness();
  h.change('turn-enabled', false);
  h.storage.setItem = () => { throw new Error('disk full'); };
  assert.throws(() => h.options.commitOptions(), /could not be saved/);
  assert.equal(h.store.data.config.turnEnabled, true);
  assert.equal(h.calls.commits, 0); assert.equal(h.calls.applies, 0); assert.equal(h.calls.errors, 1);
});

test('pending rest cannot be bypassed by native settings or reset', () => {
  const h = harness({ restMinutes: 2 }, { canCommit: () => false });
  h.change('time-enabled', false);
  assert.throws(() => h.options.commitOptions(), /finish the current rest/);
  assert.throws(() => h.options.resetOptionsToDefault(), /finish the current rest/);
  assert.equal(h.calls.writes, 0);
});

test('reinitialization and disposal preserve subsequent native option wrappers', () => {
  const h = harness();
  h.options.data.clear(); h.options.init();
  assert.equal(h.options.data.size, 10);
  const previous = h.options.commitOptions;
  const outer = function (...args) { return previous.apply(this, args); };
  h.options.commitOptions = outer;
  h.integration.dispose();
  assert.equal(h.options.commitOptions, outer);
  assert.equal(h.options.commitOptions(), 'native result');
  assert.equal(h.options.data.size, 0);
  assert.equal(h.categories.mods, h.existingCategory);
});

test('HUD shortcut selects Add-ons by category, focuses its section and reuses open drafts', () => {
  for (const alreadyOpen of [false, true]) {
    let root;
    let pushes = 0;
    const tasks = [], attributes = {}, first = {}, positions = [];
    const screen = { tabData: [{ category: 'game' }, { category: 'other' }, { category: 'mods' }],
      panels: [{ id: 'game' }, { id: 'other' }, { id: 'mods' }],
      tabControl: { setAttribute(k, v) { attributes[k] = v; } },
      slotGroup: { setAttribute(k, v) { attributes[k] = v; } },
      scrollable: { getBoundingClientRect: () => ({ top: 100 }), component: {
        resizeScrollThumb() {}, scrollableContentSize: 1000, scrollPosition: 0,
        scrollToPercentage(v) { positions.push(v); },
      } },
    };
    const panel = { isConnected: true, component: screen,
      querySelector: selector => selector.startsWith('fxs-switch') ? first : { getBoundingClientRect: () => ({ top: 600 }) } };
    if (alreadyOpen) root = panel;
    let focused;
    openRestOptions({ context: { push() { pushes++; root = panel; } },
      document: { querySelector: () => root }, afterLayout: fn => tasks.push(fn), focus: el => { focused = el; } });
    while (tasks.length) tasks.shift()();
    assert.equal(pushes, alreadyOpen ? 0 : 1);
    assert.equal(attributes['selected-tab-index'], '2');
    assert.equal(attributes['selected-slot'], 'mods');
    assert.equal(focused, first); assert.deepEqual(positions, [0.5]);
  }
});
