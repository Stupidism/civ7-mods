// Real browser scrollbar behavior plus the installed native navigation-tray model.
// Glyph artwork is a placeholder; tray assertions cover model integration, not browser layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  createNavigationTrayAdapter,
  createNativeNavigationTray,
  hasNativeNavigationTrayModel,
  menuNavigationAdapterSource,
  nativeNavigationTrayModelSource
} from './helpers/native-navigation-tray.mjs';

const code = ['scroll-navigation', 'instruction-hints']
  .map(name => readFileSync(new URL(`../ui/${name}.js`, import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, ''))
  .join('\n');
const playwright = process.env.CIV7_PLAYWRIGHT_MODULE;

test('native tray adapter synchronization is idempotent and preserves foreign entries', {
  skip: !hasNativeNavigationTrayModel()
}, () => {
  const tray = createNativeNavigationTray();
  const adapter = createNavigationTrayAdapter(tray);
  const persistent = () => Array.from(tray.persistentActionStacks)
    .map(stack => ({ action: stack.action, locKeys: Array.from(stack.locKeys) }));
  const entries = () => Array.from(tray.entries)
    .map(entry => ({ action: entry.action, description: entry.description }));
  const wanted = [
    { action: 'shell-action-3', locKey: 'LOC_MTG_SCROLL_CENTER' },
    { action: 'scroll-pan', locKey: 'LOC_MTG_SCROLL_SWITCH' }
  ];

  adapter.set(wanted);
  const synchronized = persistent();
  adapter.set(wanted);
  assert.deepEqual(persistent(), synchronized);
  assert.deepEqual(entries().map(entry => `${entry.action}:${entry.description}`), [
    'shell-action-3:LOC_MTG_SCROLL_CENTER',
    'scroll-pan:LOC_MTG_SCROLL_SWITCH'
  ]);

  tray.addPersistentEntry('LOC_MTG_FOREIGN_SAME', 'shell-action-3');
  tray.addPersistentEntry('LOC_MTG_FOREIGN_OTHER', 'toggle-lens-panel');
  adapter.set([]);
  const withdrawn = persistent();
  adapter.dispose();
  assert.deepEqual(withdrawn, [
    { action: 'shell-action-3', locKeys: ['LOC_MTG_FOREIGN_SAME'] },
    { action: 'toggle-lens-panel', locKeys: ['LOC_MTG_FOREIGN_OTHER'] }
  ]);
  assert.deepEqual(persistent(), withdrawn);
  assert.equal(entries().find(entry => entry.action === 'shell-action-3')?.description,
    'LOC_MTG_FOREIGN_SAME');
});

async function browserFixture(fn, { nativeTray = false } = {}) {
  const { chromium } = createRequire(import.meta.url)(playwright);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent(`<style>html{font-size:16px}body{margin:0;background:#172230;color:#ddd;font-family:Arial}main{display:flex;margin:40px;gap:60px}section,fxs-scrollable{display:block;position:relative;width:45%;height:460px}.viewport,.fxs-scrollable-content-container{height:460px;overflow:auto}.scroll-area_track,.fxs-scrollbar__track--vertical{position:absolute;right:-12px;top:0;width:6px;height:460px;background:#788}.scroll-area_thumb,.fxs-scrollbar__thumb--vertical{position:absolute;top:120px;height:90px;width:6px;background:#ddd}fxs-nav-help,[data-name=NavHelp]{display:block;width:32px;height:32px;flex-shrink:0;background:#333;border-radius:50%;text-align:center;line-height:32px}fxs-nav-help::before,[data-name=NavHelp]::before{content:'RS'}button{display:block;height:65px;width:90%;background:#253447;color:#ddd}</style><main><fxs-scrollable><div class=fxs-scrollable-content-container></div><div class=fxs-scrollbar__track--vertical><div class=fxs-scrollbar__thumb--vertical></div></div></fxs-scrollable><section data-name=ScrollArea><div class=viewport><div style="height:1400px">Details</div></div><div class=scroll-area_track><div class=scroll-area_thumb><div data-name=NavHelp></div></div></div></section></main>`);
    if (nativeTray) {
      await page.evaluate(() => {
        globalThis.ActiveDeviceTypeChangedEventName = 'ActiveDeviceTypeChanged';
        globalThis.Icon = { getIconFromActionName: action => `native-icon:${action}` };
        globalThis.UpdateGate = class {
          constructor(update) { this.update = update; }
          call() { this.update(); }
        };
        globalThis.IsControllerActive = () => true;
        globalThis.Locale = {
          compose: value => value,
          compare: (left, right) => (left < right ? -1 : left > right ? 1 : 0)
        };
        globalThis.InputContext = { World: 1 };
        globalThis.InputDeviceType = { Controller: 2 };
        globalThis.engine = { whenReady: { then() {} }, on() {}, off() {} };
        globalThis.__withNativeNavigationTray = true;
      });
    }
    const model = nativeTray ? `${nativeNavigationTrayModelSource()}\n` : '';
    const adapter = nativeTray ? `${menuNavigationAdapterSource()}\n` : '';
    await page.evaluate(`${model}${code}\n${adapter}` +
      '\nwindow.make=createScrollNavigation;window.instruction=setInstruction;' +
      '\nif (globalThis.__withNativeNavigationTray) {' +
      '\n  const navTray = new NavigationTrayModel();' +
      '\n  globalThis.testNavTray = navTray;' +
      '\n  globalThis.testNavigationTray = createNavigationTrayAdapter(navTray);' +
      '\n}');
    await page.evaluate(() => {
      const strings = { LOC_MTG_SCROLL_CENTER: '按下：焦点移至可见区域中央', LOC_MTG_SCROLL_SWITCH: '← → 切换滚动区域' };
      window.Locale = { ...window.Locale, compose: key => strings[key] ?? key, stylize: key => strings[key] ?? key };
      globalThis.testRoot = document.querySelector('main');
      const left = document.querySelector('fxs-scrollable');
      left.component = { setScrollThumbPosition() {} };
      for (let i = 0; i < 20; i++) {
        const button = document.createElement('button');
        button.tabIndex = 0;
        button.textContent = `存档 ${i}`;
        left.firstElementChild.append(button);
      }
      window.runtime = window.make({
        document, window, focus: {
          currentFocus: () => left.querySelector('button'),
          setFocus: () => {}
        }, statuses: { START: 1, UPDATE: 2, FINISH: 3, HOLD: 4 },
        root: () => globalThis.testRoot, instruction: window.instruction,
        ...(globalThis.testNavigationTray ? { navigationTray: globalThis.testNavigationTray } : {})
      });
      if (!globalThis.__withNativeNavigationTray) window.runtime.sync(true);
    });
    await fn(page);
  } finally {
    await browser.close();
  }
}

test('only the active scrollbar displays the right-stick marker, switching and suspension restore originals', { skip: !playwright }, async () => browserFixture(async page => {
  const state = await page.evaluate(() => {
    const glyphs = () => [...document.querySelectorAll('main fxs-nav-help,main [data-name=NavHelp]')]
      .filter(element => getComputedStyle(element).display !== 'none')
      .map(element => element.closest('fxs-scrollable') ? 'left' : 'right');
    const initial = glyphs();
    runtime.route('scroll-pan', 1, 1, 0, true);
    const right = glyphs();
    runtime.route('scroll-pan', 3, 0, 0, true);
    runtime.route('scroll-pan', 1, -1, 0, true);
    const back = glyphs();
    runtime.suspend();
    const restored = glyphs();
    runtime.dispose();
    return { initial, right, back, restored };
  });
  assert.deepEqual(state, { initial: ['left'], right: ['right'], back: ['left'], restored: ['right'] });
  if (process.env.CIV7_SCROLL_PREVIEW) {
    mkdirSync(process.env.CIV7_SCROLL_PREVIEW, { recursive: true });
    await page.screenshot({ path: `${process.env.CIV7_SCROLL_PREVIEW}/scrollbar-glyph.png` });
  }
}));

test('browser scroll runtime uses the installed native tray model idempotently and withdraws only its own entries', {
  skip: !playwright || !hasNativeNavigationTrayModel()
}, async () => browserFixture(async page => {
  const state = await page.evaluate(() => {
    const persistent = () => testNavTray.persistentActionStacks
      .map(stack => ({ action: stack.action, locKeys: [...stack.locKeys] }));
    const initial = { persistent: persistent(), entries: testNavTray.entries.map(entry => entry.action) };
    runtime.sync(true);
    const synchronized = { persistent: persistent(), entries: testNavTray.entries.map(entry => entry.action) };
    runtime.sync(true);
    const repeated = persistent();
    const detailsPane = document.querySelector('[data-name=ScrollArea]');
    detailsPane.style.display = 'none';
    runtime.sync(true);
    const singleWithoutForeign = persistent();
    detailsPane.style.display = '';
    runtime.sync(true);

    runtime.suspend();
    const suspended = { persistent: persistent(), entries: testNavTray.entries.map(entry => entry.action) };
    runtime.sync(true);
    testNavTray.addPersistentEntry('LOC_MTG_FOREIGN_OTHER', 'toggle-lens-panel');
    testNavTray.addPersistentEntry('LOC_MTG_FOREIGN_SAME', 'shell-action-3');
    runtime.sync(true);
    const foreign = {
      persistent: persistent(),
      shellDescription: testNavTray.entries.find(entry => entry.action === 'shell-action-3')?.description
    };

    const nextPanel = document.createElement('div');
    nextPanel.style.cssText = 'width:600px;height:460px';
    document.body.append(nextPanel);
    nextPanel.append(detailsPane);
    globalThis.testRoot = nextPanel;
    runtime.sync(true);
    const singlePane = persistent();
    runtime.suspend();
    runtime.dispose();
    return {
      initial,
      synchronized,
      repeated,
      singleWithoutForeign,
      suspended,
      foreign,
      singlePane,
      afterDispose: persistent(),
      footerNodes: document.querySelectorAll('mtg-scroll-hints,.mtg-scroll-hints').length,
      styles: [...document.querySelectorAll('style')].filter(style => style.textContent.includes('.mtg-active-scroll{')).length
    };
  });

  assert.deepEqual(state.initial, { persistent: [], entries: [] });
  assert.deepEqual(state.synchronized, {
    persistent: [
      { action: 'shell-action-3', locKeys: ['LOC_MTG_SCROLL_CENTER'] },
      { action: 'scroll-pan', locKeys: ['LOC_MTG_SCROLL_SWITCH'] }
    ],
    entries: ['shell-action-3', 'scroll-pan']
  });
  assert.deepEqual(state.repeated, state.synchronized.persistent,
    'repeated synchronization must not stack duplicate native entries');
  assert.deepEqual(state.singleWithoutForeign, [{ action: 'shell-action-3', locKeys: ['LOC_MTG_SCROLL_CENTER'] }],
    'a single scroll area retains centering but removes switching');
  assert.deepEqual(state.suspended, { persistent: [], entries: [] },
    'suspension must withdraw both scroll entries');

  assert.deepEqual(state.foreign.persistent, [
    { action: 'shell-action-3', locKeys: ['LOC_MTG_SCROLL_CENTER', 'LOC_MTG_FOREIGN_SAME'] },
    { action: 'scroll-pan', locKeys: ['LOC_MTG_SCROLL_SWITCH'] },
    { action: 'toggle-lens-panel', locKeys: ['LOC_MTG_FOREIGN_OTHER'] }
  ], 'foreign entries, including one above our same action, must remain');
  assert.equal(state.foreign.shellDescription, 'LOC_MTG_FOREIGN_SAME',
    'native model displays the top foreign loc key');

  assert.deepEqual(state.singlePane, [
    { action: 'shell-action-3', locKeys: ['LOC_MTG_FOREIGN_SAME'] },
    { action: 'toggle-lens-panel', locKeys: ['LOC_MTG_FOREIGN_OTHER'] }
  ], 'a one-area scope must drop switch and our center entry without touching foreign entries');
  assert.deepEqual(state.afterDispose, state.singlePane,
    'dispose must remain idempotent after suspension');
  assert.equal(state.footerNodes, 0,
    'native model integration must not resurrect a custom footer DOM tree');
  assert.equal(state.styles, 0);
}, { nativeTray: true }));
