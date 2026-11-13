import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const modulesDir = process.env.CIV7_MODULES_DIR || join(homedir(),
  "Library/Application Support/Steam/steamapps/common/Sid Meier's Civilization VII/CivilizationVII.app/Contents/Resources/Base/modules");
const nativeModelFile = join(modulesDir,
  'core/ui/navigation-tray/model-navigation-tray.js');
const adapterFile = join(fileURLToPath(new URL('../../ui/menu-navigation-adapter.js', import.meta.url)));

function removeModuleImportsAndExports(source) {
  return source
    .replace(/^import[^;\n]*(?:;|\n)/gm, '')
    .replace(/(^|\n)\s*export\s+(?=(?:async\s+)?function\b|class\b|const\b|let\b|var\b)/g, '$1');
}

export function menuNavigationAdapterSource() {
  return removeModuleImportsAndExports(readFileSync(adapterFile, 'utf8'));
}

export function hasNativeNavigationTrayModel() {
  return existsSync(nativeModelFile);
}

// Keep the complete model preamble: its class plus the top-level icon and
// action-position tables used by update(). The singleton and engine model
// registration remain outside the test harness.
export function nativeNavigationTrayModelSource() {
  const source = readFileSync(nativeModelFile, 'utf8');
  const start = source.indexOf('var NavigationTrayOrientation');
  const end = source.indexOf('\nconst NavTray = new NavigationTrayModel();', start);
  assert.ok(start >= 0 && end > start, 'installed NavigationTrayModel source was not found');
  return removeModuleImportsAndExports(source.slice(start, end));
}

export function exportedFunctionNames(source) {
  return [...source.matchAll(/^export\s+(?:async\s+)?function\s+([_$A-Za-z][_$\w]*)/gm)]
    .map(match => match[1]);
}

// Execute the installed NavigationTrayModel class itself. Only its imported
// browser/engine dependencies are mocked; no tray behavior is reimplemented here.
export function NativeNavigationTrayModel() {
  const sandbox = vm.createContext({
    ActiveDeviceTypeChangedEventName: 'ActiveDeviceTypeChanged',
    Icon: { getIconFromActionName: action => `native-icon:${action}` },
    UpdateGate: class { constructor(update) { this.update = update; } call() { this.update(); } },
    IsControllerActive: () => true,
    Locale: {
      compose: value => value,
      compare: (left, right) => left.localeCompare(right)
    },
    InputContext: { World: 1 },
    InputDeviceType: { Controller: 2 },
    engine: { whenReady: { then() {} }, on() {} },
    window: { addEventListener() {}, removeEventListener() {} },
    console
  });
  vm.runInContext(`${nativeNavigationTrayModelSource()}\nglobalThis.NativeNavigationTrayModel = NavigationTrayModel;`, sandbox, {
    filename: nativeModelFile
  });
  return sandbox.NativeNavigationTrayModel;
}

export function createNativeNavigationTray() {
  return new (NativeNavigationTrayModel())();
}

export function createNavigationTrayAdapter(navTray) {
  const sandbox = vm.createContext({ NavTray: navTray });
  vm.runInContext(menuNavigationAdapterSource(), sandbox, { filename: adapterFile });
  return sandbox.createNavigationTrayAdapter(navTray);
}
