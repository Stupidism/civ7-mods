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
    const glyphs = () => [...document.querySelectorAll('main .mtg-scroll-marker')]
      .filter(element => getComputedStyle(element).display !== 'none')
      .map(element => element.closest('fxs-scrollable') ? 'left' : 'right');
    const native = () => [...document.querySelectorAll('main [data-name=NavHelp]')]
      .filter(element => getComputedStyle(element).display !== 'none').length;
    const initial = glyphs();
    runtime.route('scroll-pan', 1, 1, 0, true);
    const right = glyphs();
    runtime.route('scroll-pan', 3, 0, 0, true);
    runtime.route('scroll-pan', 1, -1, 0, true);
    const back = glyphs();
    runtime.suspend();
    const restored = glyphs();
    runtime.dispose();
    return { initial, right, back, restored, native: native() };
  });
  assert.deepEqual(state, { initial: ['left'], right: ['right'], back: ['left'], restored: [], native: 1 });
  if (process.env.CIV7_SCROLL_PREVIEW) {
    mkdirSync(process.env.CIV7_SCROLL_PREVIEW, { recursive: true });
    await page.screenshot({ path: `${process.env.CIV7_SCROLL_PREVIEW}/scrollbar-glyph.png` });
  }
}));

test('save/load suppresses only its native right-details RS hint through scope changes', { skip: !playwright }, async () => {
  const { chromium } = createRequire(import.meta.url)(playwright);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 760 } });
    await page.setContent(`<style>
      body{margin:0;background:#172230;color:#eee;font-family:Arial}screen-save-load,other-page,.panes,.page-content{display:block}.page-content{height:600px}.panes{display:flex;gap:40px;height:500px}
      fxs-scrollable{display:block;position:relative;width:45%;height:460px}.fxs-scrollable-content-container{height:460px;overflow:auto}
      .fxs-scrollbar__track--vertical,.scroll-area_track{position:absolute;right:-12px;top:0;width:8px;height:460px;background:#788}
      .fxs-scrollbar__thumb--vertical,.scroll-area_thumb{position:absolute;top:30px;height:90px;width:8px;background:#dde}
      fxs-nav-help{display:block;width:30px;height:30px;background:#333;border-radius:50%;text-align:center;line-height:30px}
      button{display:block;width:90%;height:65px;background:#253447;color:#eee}footer{display:flex;gap:16px;padding:12px}.hidden{display:none}
    </style>
    <screen-save-load><div class=page-content><div class=panes>
      <fxs-scrollable class=screen-save__list__scrollable handle-gamepad-pan=false><div class=fxs-scrollable-content-container></div><div class=fxs-scrollbar__track--vertical><div class=fxs-scrollbar__thumb--vertical></div></div></fxs-scrollable>
      <fxs-scrollable class=screen-save__description__scrollable handle-gamepad-pan=true><div class=fxs-scrollable-content-container><article style=height:1500px>Details</article></div><div class=fxs-scrollbar__track--vertical><div class=fxs-scrollbar__thumb--vertical><fxs-nav-help action-key=inline-scroll-pan style="display:block">RS</fxs-nav-help></div></div></fxs-scrollable>
    </div><footer><button action-key=shell-action-1>B 返回</button><button action-key=shell-action-2>A 读取</button><fxs-nav-help action-key=shell-action-1>B</fxs-nav-help></footer></div></screen-save-load>
    <other-page><fxs-nav-help action-key=inline-scroll-pan style="display:block">RS</fxs-nav-help></other-page>
	    <div id=outside-modal><button>Covering modal</button></div>
    <screen-save-load class=hidden aria-hidden=true><fxs-scrollable class=screen-save__description__scrollable handle-gamepad-pan=true><div class=fxs-scrollable-content-container><article style=height:1500px>Covered</article></div><div class=fxs-scrollbar__track--vertical><div class=fxs-scrollbar__thumb--vertical><fxs-nav-help action-key=inline-scroll-pan style="display:block">RS</fxs-nav-help></div></div></fxs-scrollable></screen-save-load>`);
    await page.evaluate(`${code}\nwindow.make=createScrollNavigation;`);
    const state = await page.evaluate(() => {
      const page = document.querySelector('screen-save-load');
      const left = page.querySelector('.screen-save__list__scrollable');
      const right = page.querySelector('.screen-save__description__scrollable');
      const unrelated = document.querySelector('other-page fxs-nav-help');
      const hidden = document.querySelector('screen-save-load.hidden fxs-nav-help');
      const footer = page.querySelector('footer');
      for (const area of [left, right]) area.component = { setScrollThumbPosition() {} };
      for (let i = 0; i < 20; i++) {
        const button = document.createElement('button');
        button.tabIndex = 0;
        button.textContent = `存档 ${i}`;
        left.firstElementChild.append(button);
      }
      globalThis.testRoot = page;
	      globalThis.testFocus = left.querySelector('button');
      let clock = 0;
      const runtime = window.make({
        document, window, statuses: { START: 1, UPDATE: 2, FINISH: 3, HOLD: 4 },
	        focus: { currentFocus: () => globalThis.testFocus, setFocus() {} },
        root: () => globalThis.testRoot, navigationTray: { set() {} }, now: () => clock
      });
      const visibleCount = selector => [...document.querySelectorAll(selector)]
        .filter(element => getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden').length;
      const identity = element => ({ action: element.getAttribute('action-key'), style: element.getAttribute('style'), className: element.className, text: element.textContent });
      const footerIdentity = identity(footer.querySelector('fxs-nav-help'));
      const unrelatedIdentity = identity(unrelated);
      const hiddenIdentity = identity(hidden);
      const nativeHelp = () => right.querySelector('.fxs-scrollbar__thumb--vertical > fxs-nav-help[action-key="inline-scroll-pan"]');

      runtime.sync(true);
      let help = nativeHelp();
      const leftState = {
        markers: visibleCount('.mtg-scroll-marker'),
        markerSide: document.querySelector('.mtg-scroll-marker')?.closest('fxs-scrollable') === left ? 'left' : 'right',
        nativeHidden: help?.classList.contains('mtg-suppressed-native-scroll-help') && getComputedStyle(help).display === 'none',
        inlineDisplayUntouched: help?.getAttribute('style') === 'display:block'
      };
      runtime.route('scroll-pan', 1, 1, 0, true); clock += 20; runtime.sync(true);
      help = nativeHelp();
      const rightState = {
        markers: visibleCount('.mtg-scroll-marker'),
        markerSide: document.querySelector('.mtg-scroll-marker')?.closest('fxs-scrollable') === right ? 'right' : 'left',
        nativeHidden: help?.classList.contains('mtg-suppressed-native-scroll-help') && getComputedStyle(help).display === 'none'
      };

      right.querySelector('article').style.height = '100px';
      runtime.route('scroll-pan', 3, 0, 0, true); runtime.sync(true);
      const noOverflowState = {
        markers: visibleCount('.mtg-scroll-marker'),
        nativeHidden: nativeHelp()?.classList.contains('mtg-suppressed-native-scroll-help')
      };

      help?.remove();
      const recreated = document.createElement('fxs-nav-help');
      recreated.setAttribute('action-key', 'inline-scroll-pan');
      recreated.setAttribute('style', 'display:block');
      recreated.textContent = 'RS';
      right.querySelector('.fxs-scrollbar__thumb--vertical').append(recreated);
      runtime.sync(true);
      recreated.style.display = 'block';
      const recreatedState = recreated.classList.contains('mtg-suppressed-native-scroll-help') && getComputedStyle(recreated).display === 'none';
      const removedOldHintCleaned = !help?.classList.contains('mtg-suppressed-native-scroll-help');

      globalThis.testRoot = page.querySelector('.page-content'); runtime.sync(true);
      const descendantState = nativeHelp()?.classList.contains('mtg-suppressed-native-scroll-help');
      globalThis.testRoot = document.querySelector('other-page'); runtime.sync(true);
      const unrelatedRootState = {
        restored: !nativeHelp()?.classList.contains('mtg-suppressed-native-scroll-help'),
        markerRemoved: document.querySelectorAll('.mtg-scroll-marker').length === 0,
        unrelatedVisible: getComputedStyle(unrelated).display !== 'none'
      };
      globalThis.testRoot = document; runtime.sync(true);
	      globalThis.testFocus = document.querySelector('#outside-modal button');
	      runtime.sync(true);
	      const documentFocusOutside = {
	        restored: !nativeHelp()?.classList.contains('mtg-suppressed-native-scroll-help'),
	        visible: getComputedStyle(nativeHelp()).display !== 'none',
	        pageVisible: getComputedStyle(page).display !== 'none',
	        unrelatedVisible: getComputedStyle(unrelated).display !== 'none'
	      };
	      globalThis.testFocus = left.querySelector('button');
	      runtime.sync(true);
	      const documentFocusInside = nativeHelp()?.classList.contains('mtg-suppressed-native-scroll-help');

	      runtime.dispose();
	      const disposedState = {
        restored: !nativeHelp()?.classList.contains('mtg-suppressed-native-scroll-help'),
        visibleNative: getComputedStyle(nativeHelp()).display !== 'none',
        ownedClasses: page.querySelectorAll('.mtg-owned-scroll-track,.mtg-active-scroll,.mtg-suppressed-native-scroll-help').length,
	        rebuiltHelpOwned: recreated.classList.contains('mtg-suppressed-native-scroll-help'),
        footer: identity(footer.querySelector('fxs-nav-help')),
        unrelated: identity(unrelated),
        hidden: identity(hidden)
      };
	      globalThis.testRoot = page;
	      globalThis.testFocus = left.querySelector('button');
	      const activeRuntime = window.make({
	        document, window, statuses: { START: 1, UPDATE: 2, FINISH: 3, HOLD: 4 },
	        focus: { currentFocus: () => globalThis.testFocus, setFocus() {} },
	        root: () => globalThis.testRoot, navigationTray: { set() {} }, now: () => clock
	      });
	      activeRuntime.sync(true);
	      const activeDisposeSuppressed = nativeHelp()?.classList.contains('mtg-suppressed-native-scroll-help') === true;
	      activeRuntime.dispose();
	      const activeDispose = {
	        restored: !nativeHelp()?.classList.contains('mtg-suppressed-native-scroll-help'),
	        visibleNative: getComputedStyle(nativeHelp()).display !== 'none',
	        styleRemoved: ![...document.querySelectorAll('style')].some(style => style.textContent.includes('.mtg-suppressed-native-scroll-help'))
	      };
      return {
        leftState, rightState, noOverflowState, recreatedState, descendantState, unrelatedRootState,
	        documentFocusOutside, documentFocusInside, disposedState, footerIdentity, unrelatedIdentity, hiddenIdentity,
	        removedOldHintCleaned, activeDisposeSuppressed, activeDispose,
        styleRemoved: ![...document.querySelectorAll('style')].some(style => style.textContent.includes('.mtg-suppressed-native-scroll-help')),
        footerButtons: [...footer.querySelectorAll('button')].map(button => ({ text: button.textContent, action: button.getAttribute('action-key'), visible: getComputedStyle(button).display !== 'none' }))
      };
    });

    assert.deepEqual(state.leftState, { markers: 1, markerSide: 'left', nativeHidden: true, inlineDisplayUntouched: true });
    assert.deepEqual(state.rightState, { markers: 1, markerSide: 'right', nativeHidden: true });
    assert.deepEqual(state.noOverflowState, { markers: 1, nativeHidden: true });
    assert.equal(state.recreatedState, true, 'a native-created replacement hint must be suppressed without reparenting');
    assert.equal(state.removedOldHintCleaned, true,
      'recreating the native hint must clean the removed hint during the same sync');
    assert.equal(state.descendantState, true, 'a ContextManager descendant must resolve through closest(screen-save-load)');
    assert.deepEqual(state.unrelatedRootState, { restored: true, markerRemoved: true, unrelatedVisible: true });
	    assert.deepEqual(state.documentFocusOutside, { restored: true, visible: true, pageVisible: true, unrelatedVisible: true },
	      'document fallback also requires focus inside the sole visible save/load page');
	    assert.equal(state.documentFocusInside, true, 'focus inside the save/load page restores document fallback suppression');
	    assert.equal(state.disposedState.restored, true);
	    assert.equal(state.disposedState.visibleNative, true);
	    assert.equal(state.disposedState.ownedClasses, 0);
	    assert.equal(state.disposedState.rebuiltHelpOwned, false,
	      'dispose must clean a rebuilt native help while suppression is active');
	    assert.deepEqual(state.disposedState.footer, state.footerIdentity);
	    assert.deepEqual(state.disposedState.unrelated, state.unrelatedIdentity);
	    assert.deepEqual(state.disposedState.hidden, state.hiddenIdentity);
	    assert.equal(state.activeDisposeSuppressed, true);
	    assert.deepEqual(state.activeDispose, { restored: true, visibleNative: true, styleRemoved: true },
	      'an active runtime can be disposed directly without an intervening suspend');
    assert.equal(state.styleRemoved, true);
    assert.deepEqual(state.footerButtons, [
      { text: 'B 返回', action: 'shell-action-1', visible: true },
      { text: 'A 读取', action: 'shell-action-2', visible: true }
    ]);
  } finally {
    await browser.close();
  }
});

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
