import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { platformDefaults, standaloneBridgeEnabled } from '../ui/controller-policy.js';
import { BridgeSettingsStore, STORE } from '../ui/bridge-store.js';
import { installBridgeOptions } from '../ui/bridge-options.js';

test('new installs default to native input on Windows/unknown hosts and compatibility on Mac', () => {
  for (const [build, nav, enabled] of [
    [{ target: 'Windows' }, { platform: 'MacIntel' }, false],
    [{ target: 'MacOS' }, {}, true], [{ graphics: 'Metal' }, {}, true],
    [{}, { platform: 'MacIntel' }, true], [{}, {}, false]
  ]) {
    const store = new BridgeSettingsStore({ getItem: () => null }, undefined, platformDefaults(build, nav));
    assert.equal(store.load().enabled, enabled);
    assert.equal(store.load().showDebug, false);
  }
});

test('existing standalone settings survive migration without writes on either platform', () => {
  const existing = { enabled: false, invertLeftY: true, invertPanY: false, showDebug: true };
  for (const target of ['MacOS', 'Windows']) {
    const store = new BridgeSettingsStore({
      getItem(key) { assert.equal(key, STORE); return JSON.stringify(existing); },
      setItem() { assert.fail('Initialization must not overwrite old settings'); }
    }, undefined, platformDefaults({ target }));
    assert.deepEqual(store.load(), existing);
  }
});

test('Reset uses host defaults while Cancel preserves a Windows compatibility preference', () => {
  let stored = JSON.stringify({ enabled: true });
  const store = new BridgeSettingsStore({ getItem: () => stored, setItem: (_, s) => { stored = s; } },
    undefined, platformDefaults({ target: 'Windows' }));
  const options = { data: new Map(), init() { this.data.clear(); }, addOption(o) { this.data.set(o.id, o); o.initListener(o); },
    restore() {}, commitOptions() {}, resetOptionsToDefault() {} };
  const integration = installBridgeOptions({ options, optionType: { Switch: 1 }, categories: {}, store });
  options.init();
  const enabled = options.data.get('controller-bridge-enabled');
  enabled.updateListener(enabled, false); options.restore('configuration'); options.commitOptions();
  assert.equal(store.load().enabled, true);
  options.resetOptionsToDefault(); assert.equal(store.load().enabled, false);
  integration.dispose();
});

test('standalone coexistence depends on enabled/excluded state, never mere installation or load order', () => {
  const api = (enabled, excluded = []) => ({
    getInstalledMods: () => [{ id: 'civ7-controller-bridge', enabled }], getModulesToExclude: () => excluded
  });
  assert.equal(standaloneBridgeEnabled(api(true)), true);
  assert.equal(standaloneBridgeEnabled(api(false)), false);
  assert.equal(standaloneBridgeEnabled(api(true, ['civ7-controller-bridge'])), false);
  assert.equal(standaloneBridgeEnabled(undefined, { __civ7ControllerBridge: {} }), true);
  assert.equal(standaloneBridgeEnabled(undefined, {}), false);
});

test('actual settings entry skips every input and options hook when standalone is enabled', async () => {
  const source = readFileSync(new URL('../ui/bridge-settings.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  for (const enabled of [false, true]) {
    let options = 0, menu = 0;
    const sandbox = vm.createContext({ BridgeSettingsStore, platformDefaults, standaloneBridgeEnabled,
      BuildInfo: { target: 'MacOS' }, Modding: { getInstalledMods: () => [{ id: 'civ7-controller-bridge', enabled }] },
      localStorage: { getItem: () => null }, Options: {}, OptionType: {}, CategoryData: {}, DialogBoxManager: {},
      installBridgeOptions() { options++; return { dispose() {} }; }, installMenuNavigation() { menu++; },
      window: { addEventListener() {} }, engine: { whenReady: Promise.resolve() }, console: { log() {}, warn() {} }
    });
    vm.runInContext(source, sandbox); await Promise.resolve();
    assert.equal(options, enabled ? 0 : 1); assert.equal(menu, enabled ? 0 : 1);
  }
});

test('actual map entry leaves standalone bridge and its hooks untouched', async () => {
  const source = readFileSync(new URL('../ui/controller-bridge.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '');
  const existing = { dispose() { assert.fail('Must not dispose standalone bridge'); } };
  const sandbox = vm.createContext({ useStandaloneBridge: true, __civ7ControllerBridge: existing,
    UI: { isInShell: () => false }, engine: { whenReady: Promise.resolve() } });
  vm.runInContext(source, sandbox); await Promise.resolve();
  assert.equal(sandbox.__civ7ControllerBridge, existing);
});
