import ActionHandler from '/core/ui/input/action-handler.js';
import { ContextManager } from '/core/ui/context-manager/context-manager.js';
import ViewManager from '/core/ui/views/view-manager.js';
import Cursor from '/core/ui/input/cursor.js';
import { PlotCursor } from '/core/ui/input/plot-cursor.js';
import CameraController from '/core/ui/camera/camera-controller.js';
import { InputEngineEvent } from '/core/ui/input/input-support.js';
import { InterfaceMode } from '/core/ui/interface-modes/interface-modes.js';
import { FocusManager } from '/core/ui-next/services/focus-manager.js';
import { IsControllerActive } from '/core/ui-next/services/input.js';
import { createBridge } from './bridge-runtime.js';
import { settingsStore, reportSettingsError, useStandaloneBridge } from './bridge-settings.js';

const KEY = '__civ7ControllerBridge';
const PREFIX = '[ControllerBridge]';
const t = (key, ...args) => Locale.compose(`LOC_BCS_CB_${key}`, ...args);

function install() {
  if (UI.isInShell() || useStandaloneBridge) return;
  globalThis[KEY]?.dispose();
  let config = settingsStore.load();
  let bridge, panel, refreshTimer, unsubscribe, removed = false;
  const engineListeners = [], windowListeners = [];
  const save = patch => {
    try { settingsStore.save({ ...settingsStore.load(), ...patch }); }
    catch (error) { reportSettingsError(error); }
  };
  const log = (event, data) => console.log(`${PREFIX} ${event} ${JSON.stringify(data)}`);

  function snapshot() {
    const focus = FocusManager.get();
    return {
      controller: IsControllerActive(),
      softCursor: Cursor.softCursorEnabled || Cursor.hybridCursorEnabled,
      viewContext: ViewManager.current.getInputContext(),
      mode: InterfaceMode.getCurrent(),
      panelPresent: !ContextManager.isEmpty,
      worldAllowed: ViewManager.isWorldInputAllowed,
      viewAllowed: ViewManager.isViewInputAllowed,
      worldFocused: focus.isWorldFocused(),
      blocked: focus.isFocusLocked() || !!globalThis.__civ7BeforeEndTurnV1?.busy ||
        !!document.querySelector('.c7r-overlay') || document.hidden === true
    };
  }

  function stopMotion(name) {
    if (name === 'camera-pan') {
      CameraController.onGamepadCameraPan(InputActionStatuses.FINISH, { x: 0, y: 0 });
    } else if (name === 'plot-move') {
      if (PlotCursor.isMoving || PlotCursor.controllerCursor) {
        PlotCursor.onMovePlotCursor(new InputEngineEvent(name, InputActionStatuses.FINISH, 0, 0, false, false));
      }
    }
  }

  const dispose = () => {
    if (removed) return;
    removed = true;
    unsubscribe?.();
    bridge?.dispose();
    for (const [name, fn] of engineListeners) engine.off(name, fn);
    for (const [name, fn] of windowListeners) window.removeEventListener(name, fn);
    clearInterval(refreshTimer);
    panel?.remove();
    if (globalThis[KEY]?.dispose === dispose) delete globalThis[KEY];
  };

  try {
    bridge = createBridge({
      actionHandler: ActionHandler, input: Input, contexts: InputContext,
      statuses: InputActionStatuses, snapshot, stopMotion, report: log, ...config
    });
    const listenEngine = (name, fn) => { engine.on(name, fn); engineListeners.push([name, fn]); };
    const listenWindow = (name, fn) => { window.addEventListener(name, fn); windowListeners.push([name, fn]); };
    listenEngine('BeginFrame', bridge.tick);
    listenEngine('InputContextChanged', bridge.sync);
    listenEngine('BeforeUnload', dispose);
    listenWindow('view-changed', bridge.sync);
    listenWindow('interface-mode-changed', bridge.sync);
    listenWindow('active-device-type-changed', bridge.sync);
    listenWindow('blur', () => bridge.setWindowFocused(false));
    listenWindow('focus', () => bridge.setWindowFocused(true));

    // Plain mouse controls, excluded from the controller focus tree. No
    // simulated mouse click or forced world focus is necessary.
    panel = document.createElement('div');
    panel.id = 'civ7-controller-bridge-panel';
    panel.className = 'font-body';
    panel.style.cssText = 'position:fixed;top:6px;left:40%;z-index:1000;padding:5px 9px;background:#142332ee;color:#fff;font-size:13px;border:1px solid #8094aa;border-radius:5px;pointer-events:auto;';
    const toggle = document.createElement('button');
    const invert = document.createElement('button');
    const invertLeft = document.createElement('button');
    const counter = document.createElement('span');
    for (const button of [toggle, invert, invertLeft]) {
      button.tabIndex = -1;
      // Native button defaults do not inherit the game's CJK font stack.
      button.className = 'font-body';
      button.style.cssText = 'font-family:inherit;font-size:13px;color:#fff;background:#263d50;border:1px solid #8496a5;padding:3px 6px;margin-right:6px;';
      // Stop a mouse click on the controls from leaking through to the map.
      button.addEventListener('engine-input', event => { event.preventDefault(); event.stopPropagation(); });
      panel.appendChild(button);
    }
    panel.appendChild(counter);
    const refresh = () => {
      const s = bridge.getStatus();
      toggle.textContent = t(s.enabled ? 'TOGGLE_ON' : 'TOGGLE_OFF');
      toggle.title = t('ENABLED_DESCRIPTION');
      invert.textContent = t('INVERT');
      invert.title = t(s.invertPanY ? 'INVERT_ON' : 'INVERT_OFF');
      invertLeft.textContent = t(s.invertLeftY ? 'LEFT_INVERT_ON' : 'LEFT_INVERT_OFF');
      invertLeft.title = t('LEFT_INVERT_DESCRIPTION');
      counter.textContent = s.fault ? t('FAULT') :
        `v0.2.0 · ${t(s.active ? 'ACTIVE' : s.enabled ? 'WAITING' : 'NATIVE')} · ${t('COUNTS', s.counts.left, s.counts.right, s.counts.dpad)}`;
    };
    toggle.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      save({ enabled: !bridge.getStatus().enabled });
    });
    invert.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      save({ invertPanY: !bridge.getStatus().invertPanY });
    });
    invertLeft.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      save({ invertLeftY: !bridge.getStatus().invertLeftY });
    });
    const applyConfig = next => {
      config = next;
      bridge.setEnabled(config.enabled);
      bridge.setInvertPanY(config.invertPanY);
      bridge.setInvertLeftY(config.invertLeftY);
      if (config.showDebug) {
        if (refreshTimer === undefined) {
          document.body.appendChild(panel);
          refreshTimer = setInterval(refresh, 500);
        }
        refresh();
      } else {
        panel.remove();
        clearInterval(refreshTimer); refreshTimer = undefined;
      }
    };
    unsubscribe = settingsStore.subscribe(applyConfig);
    applyConfig(config);
    globalThis[KEY] = { dispose, getStatus: bridge.getStatus };
    log('installed', { version: '0.2.0', debugVisible: config.showDebug });
  } catch (error) {
    dispose();
    console.error(`${PREFIX} Installation failed: ${error}`);
  }
}

engine.whenReady.then(install);
