import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveSettingsStore, normalizeConfig } from '../ui/save-store.js';
import { installSaveOptions, openSaveOptions } from '../ui/save-options.js';

function harness() {
  let raw = JSON.stringify({ 'civ7-rest-guard': { config: { timeEnabled: false } } });
  const calls = { writes: 0, errors: 0 };
  const storage = { getItem: () => raw, setItem(_key, value) { raw = value; calls.writes++; } };
  const store = new SaveSettingsStore(storage, () => {});
  const options = { data: new Map(), init() {}, addOption(info) { this.data.set(info.id, info); info.initListener(info); },
    commitOptions() { return 'native'; }, restore() { for (const info of this.data.values()) info.initListener(info); }, resetOptionsToDefault() {} };
  const categories = { mods: { title: 'Shared category' } };
  const integration = installSaveOptions({ options, optionType: { Switch: 5 }, categories, store, reportError: () => calls.errors++ });
  options.init();
  const change = (key, value) => { const info = options.data.get(`save-before-${key}-enabled`); info.updateListener(info, value); };
  return { store, storage, options, integration, calls, change, categories, raw: () => JSON.parse(raw), replace: value => { raw = value; } };
}

test('both defaults enabled and two independent native switches in a shared category', () => {
  const h = harness(); assert.deepEqual(h.store.data.config, { turnEnabled: true, diplomacyEnabled: true });
  assert.equal(h.options.data.size, 2); assert.equal(h.categories.mods.title, 'Shared category');
  for (const entry of h.options.data.values()) { assert.equal(entry.category, 'mods'); assert.equal(entry.group, 'save_before_action'); }
  h.change('diplomacy', false); assert.equal(h.store.data.config.diplomacyEnabled, true);
  assert.equal(h.options.commitOptions(), 'native');
  assert.deepEqual(h.store.data.config, { turnEnabled: true, diplomacyEnabled: false });
  assert.deepEqual(h.raw()['civ7-rest-guard'], { config: { timeEnabled: false } });
});

test('cancel discards the draft without writes and repeated open does not duplicate options', () => {
  const h = harness(); h.change('turn', false); h.options.restore(); h.options.init();
  assert.equal(h.options.data.get('save-before-turn-enabled').currentValue, true);
  assert.equal(h.options.data.size, 2); assert.equal(h.calls.writes, 0);
});

test('configuration confirm persists across store reload; unrelated commit does not', () => {
  const h = harness(); h.change('turn', false); h.options.commitOptions('audio');
  assert.equal(h.calls.writes, 0); h.options.commitOptions('configuration');
  assert.deepEqual(new SaveSettingsStore(h.storage).data.config, { turnEnabled: false, diplomacyEnabled: true });
  h.options.resetOptionsToDefault(); assert.deepEqual(h.store.data.config, normalizeConfig());
});

test('latest other-mod changes are merged, malformed shared settings are never overwritten', () => {
  const h = harness(); h.replace(JSON.stringify({ anotherMod: { updated: 9 } }));
  h.change('turn', false); h.options.commitOptions(); assert.deepEqual(h.raw().anotherMod, { updated: 9 });
  h.replace('broken JSON'); h.change('diplomacy', false);
  assert.throws(() => h.options.commitOptions(), /Could not save/);
  assert.equal(h.store.data.config.diplomacyEnabled, true); assert.equal(h.calls.errors, 1);
});

test('write failure leaves the previous active settings in place', () => {
  const h = harness(); h.storage.setItem = () => { throw new Error('disk full'); };
  h.change('turn', false); assert.throws(() => h.options.commitOptions(), /Could not save/);
  assert.equal(h.store.data.config.turnEnabled, true);
});

test('option cleanup preserves wrappers installed afterwards', () => {
  const h = harness(), previous = h.options.commitOptions;
  h.options.commitOptions = function (...args) { return previous.apply(this, args); };
  const wrapper = h.options.commitOptions; h.integration.dispose();
  assert.equal(h.options.commitOptions, wrapper); assert.equal(h.options.commitOptions(), 'native');
  assert.equal(h.options.data.size, 0);
});

test('shortcut reuses the existing options screen and resolves Add-ons by category', () => {
  const calls = [], frames = [], first = {};
  const screen = { tabData: [{ category: 'audio' }, { category: 'mods' }], panels: [{ id: 'audio' }, { id: 'mods-panel' }],
    tabControl: { setAttribute: (...args) => calls.push(args) }, slotGroup: { setAttribute: (...args) => calls.push(args) } };
  const root = { isConnected: true, component: screen, querySelector: selector => selector.startsWith('fxs-switch') ? first : null };
  openSaveOptions({ context: { push: () => calls.push('push') }, document: { querySelector: () => root },
    afterLayout: fn => frames.push(fn), focus: element => calls.push(element) });
  frames.shift()(); frames.shift()();
  assert.deepEqual(calls, [['selected-tab-index', '1'], ['selected-slot', 'mods-panel'], first]);
});
