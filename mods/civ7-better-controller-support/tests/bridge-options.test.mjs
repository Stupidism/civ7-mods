import test from 'node:test';
import assert from 'node:assert/strict';
import { BridgeSettingsStore, STORE, normalizeConfig } from '../ui/bridge-store.js';
import { installBridgeOptions } from '../ui/bridge-options.js';

function fixture(initial = {}, initialized = false) {
  const data = new Map([[STORE, JSON.stringify(initial)], ['other-mod', 'untouched']]);
  const writes = [], applied = [], errors = [];
  const storage = { getItem: key => data.get(key), setItem(key, value) { writes.push(key); data.set(key, value); } };
  const store = new BridgeSettingsStore(storage);
  store.subscribe(config => applied.push(config));
  const options = {
    data: new Map(initialized ? [['native', { id: 'native', category: 'game' }]] : []),
    init() { this.data.clear(); },
    addOption(info) { this.data.set(info.id, info); info.initListener(info); },
    commitOptions() { return 'native'; },
    restore() { for (const info of this.data.values()) info.initListener?.(info); },
    resetOptionsToDefault() {}
  };
  const categories = { mods: { title: 'Shared category' } };
  const originalCommit = options.commitOptions;
  const install = () => installBridgeOptions({ options, optionType: { Switch: 5 }, categories, store,
    reportError: error => errors.push(error) });
  const integration = install();
  if (!initialized) options.init();
  const change = (key, value) => {
    const entry = options.data.get('controller-bridge-' + key);
    entry.updateListener(entry, value);
  };
  return { options, categories, data, writes, applied, errors, storage, store, integration, install, change, originalCommit };
}

test('existing settings migrate without a write, retaining right-stick preferences, defaulting left inversion and debug off', () => {
  const f = fixture({ enabled: false, invertPanY: false });
  assert.deepEqual(f.store.load(), { enabled: false, invertLeftY: false, invertPanY: false, showDebug: false });
  assert.equal(f.writes.length, 0);
  assert.equal(f.options.data.size, 4);
  assert.equal(f.categories.mods.title, 'Shared category');
  for (const entry of f.options.data.values()) {
    assert.equal(entry.category, 'mods'); assert.equal(entry.group, 'better_controller_support');
  }
});

test('Confirm persists and notifies; Cancel and unrelated commits do not apply the draft', () => {
  const f = fixture();
  f.change('showDebug', true);
  f.options.commitOptions('sound');
  assert.equal(f.store.load().showDebug, false);
  assert.equal(f.applied.length, 0);
  f.options.restore('configuration');
  assert.equal(f.options.data.get('controller-bridge-showDebug').currentValue, false);
  f.change('showDebug', true);
  assert.equal(f.options.commitOptions('configuration'), 'native');
  assert.equal(new BridgeSettingsStore(f.storage).load().showDebug, true);
  assert.equal(f.applied.length, 1);
  assert.equal(f.data.get('other-mod'), 'untouched');
});

test('registration handles early and late initialization without duplicates', () => {
  for (const initialized of [false, true]) {
    const f = fixture({}, initialized);
    assert.ok(f.options.data.has('controller-bridge-showDebug'));
    f.options.init(); f.options.init();
    assert.equal(f.options.data.size, 4);
    f.integration.dispose();
    assert.equal(f.options.data.size, 0);
    assert.equal(f.options.commitOptions, f.originalCommit);
  }
});

test('debug button changes are preserved when committing a different option draft', () => {
  const f = fixture();
  f.change('showDebug', true);
  f.store.save({ ...f.store.load(), enabled: false });
  f.options.commitOptions();
  assert.deepEqual(f.store.load(), { enabled: false, invertLeftY: false, invertPanY: true, showDebug: true });
});

test('failed persistence reports the error and does not notify or change stored settings', () => {
  const f = fixture();
  f.storage.setItem = () => { throw new Error('full'); };
  f.change('showDebug', true);
  assert.throws(() => f.options.commitOptions(), /full/);
  assert.equal(f.errors.length, 1);
  assert.equal(f.applied.length, 0);
  assert.equal(f.store.load().showDebug, false);
});

test('native reset restores defaults, including hiding debug, and cleanup preserves another mod wrapper', () => {
  const f = fixture({ enabled: false, invertPanY: false, showDebug: true });
  f.options.resetOptionsToDefault();
  assert.deepEqual(f.store.load(), normalizeConfig());
  const previous = f.options.commitOptions;
  const outer = f.options.commitOptions = function (...args) { return previous.apply(this, args); };
  f.integration.dispose();
  assert.equal(f.options.commitOptions, outer);
  assert.equal(f.options.commitOptions(), 'native');
  assert.equal(f.categories.mods.title, 'Shared category');
});


test('left direction draft supports Cancel, Confirm and reload without changing right preference', () => {
  const f = fixture({ invertPanY: false });
  f.change('invertLeftY', true);
  assert.equal(f.store.load().invertLeftY, false);
  f.options.restore('configuration');
  assert.equal(f.options.data.get('controller-bridge-invertLeftY').currentValue, false);
  f.change('invertLeftY', true);
  f.options.commitOptions('configuration');
  const loaded = new BridgeSettingsStore(f.storage).load();
  assert.equal(loaded.invertLeftY, true);
  assert.equal(loaded.invertPanY, false);
});
