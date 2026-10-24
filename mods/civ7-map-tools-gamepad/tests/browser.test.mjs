// Runs only a detached Chromium fixture; never connects to Civilization VII.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
const playwrightPath = process.env.CIV7_PLAYWRIGHT_MODULE;
const ready = !!playwrightPath;
const modules = process.env.CIV7_MODULES_DIR || join(homedir(), "Library/Application Support/Steam/steamapps/common/Sid Meier's Civilization VII/CivilizationVII.app/Contents/Resources/Base/modules");
const nativePath = join(modules, 'base-standard/ui/mini-map/panel-mini-map.js');
const source = ['navigation', 'radial-icons', 'map-tools-runtime', 'bridge-runtime', 'menu-navigation'].map(name => readFileSync(new URL(`../ui/${name}.js`, import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '')).join('\n');

async function fixture(run) {
  const { chromium } = createRequire(import.meta.url)(playwrightPath);
  const browser = await chromium.launch({ headless: true, ...(process.env.CIV7_CHROMIUM_PATH ? { executablePath: process.env.CIV7_CHROMIUM_PATH } : {}) });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>.hidden{display:none}fxs-activatable{display:block;height:30px} .mini-map__button-row{display:flex} .mini-map__button-row>*{width:60px}</style><div class="harness"><panel-mini-map><div class="mini-map__button-row"></div></panel-mini-map></div>`);
    await page.evaluate(source + '\nwindow.createBridge=createBridge; window.createMenuNavigation=createMenuNavigation; window.installMapTools=installMapTools; window.TOOL_DEFINITIONS=TOOL_DEFINITIONS; window.syncRadialIcons=syncRadialIcons;');
    if (existsSync(nativePath)) {
      const native = readFileSync(nativePath, 'utf8');
      await page.evaluate(`window.Panel=class {}; window.Locale={compose:x=>x}; ${native.slice(native.indexOf('class PanelMiniMap'), native.indexOf('Controls.define("panel-mini-map"'))}; window.NativeMiniMap=PanelMiniMap;`);
    }
    await page.evaluate(() => {
      const S = window.S = { START: 1, UPDATE: 2, FINISH: 3, HOLD: 4 };
      const N = window.N = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, NEXT: 16, PREVIOUS: 32 };
      const state = window.state = { controller: true, locked: false, top: null, focus: document.body,
        mode: 'INTERFACEMODE_DEFAULT', nativeInputs: [], nativeNavigation: [], actions: [], scrolled: [], clock: 0 };
      const context = window.context = { getCurrentTarget: () => state.top,
        handleInput: e => { state.nativeInputs.push(e.detail.name); return true; },
        handleNavigation: e => { state.nativeNavigation.push(e.detail.name); return true; } };
      const focus = window.focusAPI = { currentFocus: () => state.focus, isFocusLocked: () => state.locked,
        setFocus: el => { state.focus = el; el.focus(); }, clearFocus: () => { state.focus = document.body; } };
      const view = window.view = { isWorldInputAllowed: true, isViewInputAllowed: true };
      const modes = { getCurrent: () => state.mode, switchToDefault: () => { state.mode = 'INTERFACEMODE_DEFAULT'; document.querySelector('dmt-map-tack-chooser')?.classList.add('hidden'); } };
      const row = document.querySelector('.mini-map__button-row');
      ['lens', 'city', 'units', 'wonder', 'tacks'].forEach((id, i) => {
        const callback = () => state.actions.push(id);
        const button = window.NativeMiniMap ? NativeMiniMap.prototype.createButton.call({}, id, '', callback) : document.createElement('fxs-activatable');
        if (!window.NativeMiniMap) button.addEventListener('action-activate', callback);
        button.id = id; button.textContent = id;
        button.classList.add(i === 0 ? 'mini-map__lens-button' : i === 4 ? 'mini-map__map-tacks-button' : `bz-${id}-button`);
        row.append(button);
      });
      const args = window.args = { document, window, context, focus, view, modes, statuses: S, navigation: N,
        isController: () => state.controller, now: () => state.clock,
        activate: el => el.dispatchEvent(new CustomEvent('action-activate', { cancelable: true })) };
      window.runtime = installMapTools(args);
      window.send = (name, status = S.FINISH, extra = {}) => {
        const event = new CustomEvent(name.startsWith('nav-') ? 'navigate-input' : 'engine-input',
          { cancelable: true, detail: { name, status, ...extra } });
        const result = name.startsWith('nav-') ? context.handleNavigation(event) : context.handleInput(event);
        return { result, prevented: event.defaultPrevented };
      };
      window.select = id => { focus.setFocus(document.getElementById(id)); runtime.sync(); };
      window.panel = (tag, count = 5) => {
        const root = document.createElement(tag); const scroll = document.createElement('fxs-scrollable');
        scroll.component = { scrollIntoView: el => state.scrolled.push(el.id) };
        for (let i = 0; i < count; i++) {
          const item = document.createElement('fxs-activatable'); item.id = `item-${i}`;
          item.setAttribute('tabindex', '-1'); item.addEventListener('action-activate', () => state.actions.push(item.id)); scroll.append(item);
        }
        root.append(scroll); document.body.append(root); state.top = root;
        root.component = { close: () => { state.top = null; root.remove(); } };
        return root;
      };
    });
    await run(page);
  } finally { await browser.close(); }
}

test('integrated bridge routes toolbar/list navigation once and preserves R3 centering on the map', { skip: !ready }, async () => fixture(async page => {
  const result = await page.evaluate(() => {
    let inputContext = 1;
    const calls = [], stops = [];
    const handler = { onEngineInput(name, status, x, y) {
      const event = new CustomEvent('engine-input', { cancelable: true, detail: { name, status, x, y } });
      context.handleInput(event);
      if (!event.defaultPrevented) calls.push(name);
    } };
    const menuPatch = createMenuNavigation({ actionHandler: handler, statuses: S,
      snapshot: () => ({ menu: !!state.top, controller: true, focused: true }) });
    const bridge = createBridge({ actionHandler: handler, input: {
      getActiveContext: () => inputContext, setActiveContext: value => { inputContext = value; }
    }, contexts: { Shell: 0, World: 1, Unit: 2, INVALID: -1 }, statuses: S,
    snapshot: () => ({ controller: true, viewContext: 1, mode: state.mode, panelPresent: !!state.top,
      worldAllowed: true, viewAllowed: true, worldFocused: state.focus === document.body }),
    stopMotion: name => stops.push(name), now: () => state.clock });
    select('lens');
    handler.onEngineInput('nav-move', S.START, 1, 0);
    handler.onEngineInput('nav-move', S.FINISH, 0, 0);
    const toolbarFocus = state.focus.id;
    handler.onEngineInput('accept', S.START); handler.onEngineInput('accept', S.FINISH);
    const list = panel('bz-wonder-panel', 5); runtime.sync();
    handler.onEngineInput('nav-move', S.HOLD, 0, -1);
    const listFocus = state.focus.id;
    handler.onEngineInput('accept', S.START); handler.onEngineInput('accept', S.FINISH);
    list.remove(); state.top = null; focusAPI.clearFocus(); runtime.sync(); bridge.sync();
    handler.onEngineInput('shell-action-3', S.START); handler.onEngineInput('shell-action-3', S.FINISH);
    bridge.dispose(); menuPatch.dispose();
    return { toolbarFocus, listFocus, actions: state.actions, calls, inputContext };
  });
  assert.equal(result.toolbarFocus, 'city'); assert.equal(result.listFocus, 'item-1');
  assert.deepEqual(result.actions, ['city', 'item-1']);
  assert.deepEqual(result.calls, ['center-plot-cursor']); assert.equal(result.inputContext, 1);
}));

test('native minimap buttons: World and Shell directions, single activation, B releases focus', { skip: !ready }, async () => fixture(async page => {
  assert.deepEqual(await page.evaluate(() => {
    select('lens'); send('toggle-diplo'); send('toggle-chat');
    send('navigate-yields', S.START); send('navigate-yields', S.FINISH);
    send('accept', S.START); send('accept', S.FINISH);
    const afterPress = state.focus.id;
    send('nav-right', S.START, { navigation: N.RIGHT }); send('nav-right', S.FINISH, { navigation: N.RIGHT });
    const afterNav = state.focus.id;
    send('cancel');
    return { afterPress, afterNav, actions: state.actions, world: state.focus === document.body, native: state.nativeInputs };
  }), { afterPress: 'city', afterNav: 'units', actions: ['city'], world: true, native: [] });
}));

test('long wonder list scrolls to focus, skips hidden/disabled rows, and survives rebuilding', { skip: !ready }, async () => fixture(async page => {
  assert.deepEqual(await page.evaluate(() => {
    const root = panel('bz-wonder-panel', 40); runtime.sync();
    document.getElementById('item-1').setAttribute('disabled', 'true');
    document.getElementById('item-2').classList.add('hidden');
    send('nav-down', S.FINISH, { navigation: N.DOWN });
    const second = state.focus.id;
    for (let i = 0; i < 60; i++) send('nav-down', S.FINISH, { navigation: N.DOWN });
    send('accept'); const last = state.focus.id;
    root.querySelector('fxs-scrollable').replaceChildren();
    const fresh = document.createElement('fxs-activatable'); fresh.id = 'new'; root.firstChild.append(fresh);
    send('accept'); // stale focus recovers, must not activate the new row
    return { second, last, actions: state.actions, recovered: state.focus.id, scrolled: state.scrolled.includes('item-39') };
  }), { second: 'item-3', last: 'item-39', actions: ['item-39'], recovered: 'new', scrolled: true });
}));

test('native pause/dialog, focus lock, Rest Guard and mouse get priority over tools', { skip: !ready }, async () => fixture(async page => {
  const results = await page.evaluate(() => {
    select('wonder'); const outcomes = [];
    state.top = document.createElement('screen-pause-menu'); outcomes.push(send('accept').prevented); runtime.sync();
    state.top = null; state.locked = true; outcomes.push(send('accept').prevented);
    state.locked = false; const overlay = document.createElement('div'); overlay.className = 'c7r-overlay'; document.body.append(overlay);
    outcomes.push(send('accept').prevented); overlay.remove();
    state.controller = false; outcomes.push(send('accept').prevented); state.controller = true;
    outcomes.push(send('mousebutton-left', S.FINISH, { isMouse: true }).prevented);
    return { outcomes, actions: state.actions };
  });
  assert.deepEqual(results, { outcomes: [false, false, false, false, false], actions: [] });
}));

test('map-tack chooser intercepts World D-pad, selects icons, and hands placement back to game', { skip: !ready }, async () => fixture(async page => {
  assert.deepEqual(await page.evaluate(() => {
    const root = document.createElement('dmt-map-tack-chooser'); document.body.append(root);
    for (let i = 0; i < 4; i++) { const el = document.createElement('fxs-activatable'); el.className = 'map-tack-icon-wrapper'; el.id = `tack-${i}`;
      el.addEventListener('action-activate', () => { state.actions.push(el.id); state.mode = 'DMT_INTERFACEMODE_PLACE_MAP_TACKS'; root.classList.add('hidden'); }); root.append(el); }
    state.mode = 'DMT_INTERFACEMODE_MAP_TACK_CHOOSER'; runtime.sync(); send('navigate-yields'); send('accept');
    const placement = send('plot-move', S.UPDATE, { x: 1, y: 0 });
    return { actions: state.actions, placement: placement.prevented, native: state.nativeInputs };
  }), { actions: ['tack-1'], placement: false, native: ['plot-move'] });
}));

test('analog hold repeats without an extra release step; no world action leaks', { skip: !ready }, async () => fixture(async page => {
  assert.deepEqual(await page.evaluate(() => {
    select('lens'); send('plot-move', S.START, { x: 1, y: 0 });
    state.clock = 320; send('plot-move', S.UPDATE, { x: 1, y: 0 });
    send('plot-move', S.FINISH, { x: 1, y: 0 }); const worldAnalog = state.focus.id;
    select('lens'); send('nav-move', S.START, { navigation: N.RIGHT });
    send('nav-move', S.UPDATE, { navigation: N.RIGHT }); send('nav-move', S.FINISH, { navigation: N.RIGHT });
    send('next-action'); send('camera-pan', S.UPDATE, { x: 1 });
    return { worldAnalog, shellAnalog: state.focus.id, native: state.nativeInputs };
  }), { worldAnalog: 'units', shellAnalog: 'city', native: [] });
}));

test('cancel uses minimap close API then returns to map; disposal restores input chain', { skip: !ready }, async () => fixture(async page => {
  await page.evaluate(() => {
    select('wonder'); send('accept'); const root = panel('bz-wonder-panel');
    const mini = document.querySelector('panel-mini-map');
    mini.component = { activeSubpanel: { tag: 'bz-wonder-panel' }, toggleSubpanel: (_subpanel, force) => {
      state.actions.push(`close:${force}`); state.top = null; root.remove(); mini.component.activeSubpanel = null;
    } };
    runtime.sync(); send('cancel');
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.deepEqual(await page.evaluate(() => {
    const returned = state.focus === document.body; runtime.dispose(); const result = send('accept');
    return { returned, actions: state.actions, restored: !result.prevented, highlights: document.querySelectorAll('.mtg-focus').length };
  }), { returned: true, actions: ['wonder', 'close:false'], restored: true, highlights: 0 });
}));

test('lens confirmation/navigation remains native; new popup during close is never overridden', { skip: !ready }, async () => fixture(async page => {
  const result = await page.evaluate(async () => {
    select('lens'); send('accept'); const root = panel('lens-panel'); runtime.sync();
    send('accept'); send('nav-down', S.FINISH, { navigation: N.DOWN });
    root.component.close = () => { state.top = document.createElement('screen-dialog-box'); state.focus = state.top; };
    send('cancel'); await new Promise(resolve => requestAnimationFrame(resolve));
    return { native: state.nativeInputs, nav: state.nativeNavigation, focused: state.focus.tagName };
  });
  assert.deepEqual(result, { native: ['accept'], nav: ['nav-down'], focused: 'SCREEN-DIALOG-BOX' });
}));

test('native radial opens the tool with one activation, keeps icons and optional entries, and reloads once', { skip: !ready || !existsSync(join(modules, 'core/ui/radial-menu/panel-radial-menu.js')) }, async () => fixture(async page => {
  const bootstrap = readFileSync(new URL('../ui/map-tools-gamepad.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  const nativeRadial = readFileSync(join(modules, 'core/ui/radial-menu/panel-radial-menu.js'), 'utf8');
  await page.evaluate(() => {
    window.registry = []; window.registerRadialMenu = def => registry.push({ ...def, items: [] });
    window.registerRadialMenuItem = (symbol, item) => registry.find(m => m.symbol === symbol).items.push(item);
    window.getRadialMenus = () => registry;
    window.NavigationType = { FOCUS: 'focus', NONE: '', CONTEXT: 'context', INTERFACE: 'interface', DIPLOMACY: 'diplomacy' };
    window.ContextManager = context; window.FocusManager = { get: () => focusAPI };
    window.ViewManager = view; window.InterfaceMode = args.modes; window.IsControllerActive = args.isController;
    window.InputActionStatuses = S; window.InputNavigationAction = N; window.Input = undefined; window.InputContext = undefined;
    window.ActionActivateEvent = class extends CustomEvent { constructor() { super('action-activate'); } };
    window.UI = { isInShell: () => false }; window.decorators = []; window.Controls = { loadStyle() {}, decorate: (_tag, fn) => decorators.push(fn) }; window.Layout = { pixelsToScreenPixels: value => value };
    window.engine = { whenReady: { then: fn => fn() } };
    window.TutorialManager = {}; window.Panel = class { close() { state.closedRadial = true; } };
    runtime.dispose();
  });
  await page.evaluate(`(() => { ${bootstrap} })()`);
  await page.evaluate(`(() => { ${bootstrap} })()`);
  await page.evaluate(nativeRadial.slice(nativeRadial.indexOf('class PanelRadialMenu'), nativeRadial.indexOf('Controls.define("panel-radial-menu"')) + '\nwindow.NativeRadial=PanelRadialMenu;');
  assert.deepEqual(await page.evaluate(async () => {
    const menu = registry[0], native = new NativeRadial(); native.Root = document.body;
    const items = native.resolveItemsOnClickFunction(native.resolveItemsIsHidden(menu.items));
    TOOL_DEFINITIONS.forEach((tool, i) => {
      const button = document.querySelector(tool.selector);
      let image = button.querySelector(tool.iconSelector);
      if (!image) { image = document.createElement('div'); image.className = tool.iconSelector.slice(1); button.append(image); }
      image.style.backgroundImage = tool.icon;
    });
    native.Root = document.createElement('panel-radial-menu');
    native.menus = [{ title: 'LOC_MTG_TITLE', items }];
    native.Root.innerHTML = native.renderItems(items, 0); document.body.append(native.Root);
    const decoration = decorators[0](native); decoration.afterAttach();
    document.getElementById('wonder').addEventListener('action-activate', () => panel('bz-wonder-panel'));
    items.find(item => item.title === 'LOC_MTG_WONDERS').onClick();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const focused = state.focus.id, opened = state.top?.tagName, actions = [...state.actions];
    const icons = [...native.Root.querySelectorAll('.mtg-radial-tool-icon')];
    const matchingIcons = icons.every((icon, i) => icon.style.backgroundImage ===
      getComputedStyle(document.querySelector(TOOL_DEFINITIONS[i].selector).querySelector(TOOL_DEFINITIONS[i].iconSelector)).backgroundImage);
    const iconCount = icons.length;
    decoration.beforeDetach();
    document.getElementById('tacks').remove(); document.getElementById('city').remove();
    const hidden = native.resolveItemsIsHidden(menu.items).filter(item => item.isHidden).map(item => item.title);
    return { menus: registry.length, count: menu.items.length, focused, opened, actions, closed: state.closedRadial, hidden, matchingIcons, iconCount, decorators: decorators.length };
  }), { menus: 1, count: 5, focused: 'item-0', opened: 'BZ-WONDER-PANEL', actions: ['wonder'], closed: true, hidden: ['LOC_MTG_CITIES', 'LOC_MTG_TACKS'], matchingIcons: true, iconCount: 5, decorators: 1 });
}));

test('Map Trix menu temporarily requests Shell; switching device and disposing restore ownership', { skip: !ready }, async () => fixture(async page => {
  assert.deepEqual(await page.evaluate(() => {
    runtime.dispose(); const history = []; let active = 2;
    const input = { getActiveContext: () => active, setActiveContext: value => { history.push(value); active = value; } };
    runtime = installMapTools({ ...args, input, contexts: { Shell: 0 } });
    const root = panel('bz-units-panel'); root.component.inputContext = 2; runtime.sync();
    const during = root.component.inputContext;
    state.controller = false; runtime.sync(); const afterMouse = root.component.inputContext;
    state.controller = true; runtime.sync();
    state.top = document.createElement('screen-pause-menu'); active = 0; runtime.sync();
    const afterPopup = root.component.inputContext;
    runtime.dispose(); return { during, afterMouse, afterPopup, active, history };
  }), { during: 0, afterMouse: 2, afterPopup: 2, active: 0, history: [0, 2, 0] });
}));

test('direct tool opening respects intervening dialogs, device changes and unavailable buttons', { skip: !ready }, async () => fixture(async page => {
  assert.deepEqual(await page.evaluate(() => {
    const selector = '.bz-wonder-button', opened = [];
    state.top = document.createElement('screen-dialog-box'); opened.push(runtime.openTool(selector));
    state.top = null; state.controller = false; opened.push(runtime.openTool(selector));
    state.controller = true; state.locked = true; opened.push(runtime.openTool(selector));
    state.locked = false; view.isViewInputAllowed = false; opened.push(runtime.openTool(selector));
    view.isViewInputAllowed = true; state.mode = 'DMT_INTERFACEMODE_PLACE_MAP_TACKS'; opened.push(runtime.openTool(selector));
    state.mode = 'INTERFACEMODE_DEFAULT'; document.getElementById('wonder').setAttribute('disabled', 'true'); opened.push(runtime.openTool(selector));
    document.getElementById('wonder').remove(); opened.push(runtime.openTool(selector));
    runtime.dispose(); opened.push(runtime.openTool('.mini-map__lens-button'));
    return { opened, actions: state.actions };
  }), { opened: Array(8).fill(false), actions: [] });
}));
