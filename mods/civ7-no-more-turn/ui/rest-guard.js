import { getRadialMenus, registerRadialMenu, registerRadialMenuItem, NavigationType } from '/core/ui/radial-menu/radial-menu-item-store.js';
import { PanelAction } from '/base-standard/ui/action/panel-action.js';
import { ContextManager } from '/core/ui/context-manager/context-manager.js';
import { FocusManager } from '/core/ui-next/services/focus-manager.js';
import Cursor from '/core/ui/input/cursor.js';
import { DialogBoxManager } from '/core/ui/dialog-box/manager-dialog-box.js';
import { DialogBoxAction } from '/core/ui/dialog-box/model-dialog-box.js';
import { session, checkpoint, installLoadingHooks } from './rest-runtime.js';
import { settingsStore, subscribeSettings, openSettings, isSettingsOpen } from './rest-settings.js';
import { nightWindow } from './rest-model.js';
import { activityActive } from './rest-activity.js';
import { createRestRetention } from './rest-retention.js';
import { RestView } from './rest-view.js';
import { createRestSaver, newRestSave } from './rest-save.js';

const PREFIX = '[Rest Guard]';
let controller = null;
globalThis.__civ7RestGuardActivityV1 = {
  isSuspended: () => activityActive(localStorage, Date.now()),
};
installLoadingHooks();

function nativeDialog() { return document.querySelector('screen-dialog-box'); }

function snapshot() {
  if (!UI.isInGame() || Configuration.getGame().isAnyMultiplayer ||
      !Players.isValid(GameContext.localPlayerID)) return null;
  const player = Players.get(GameContext.localPlayerID);
  if (!player?.isHuman) return null;
  const seed = Configuration.getGame().gameSeed;
  if (seed === undefined || seed === null || !Number.isFinite(Game.turn)) return null;
  const key = `game:${seed}:player:${GameContext.localPlayerID}`;
  return {
    key, turn: Math.max(0, Math.floor(Game.turn)),
    context: `${key}:age:${Game.age}`,
    token: `${key}:age:${Game.age}:turn:${Game.turn}`,
    active: player.isTurnActive,
  };
}

class RestController {
  constructor() {
    this.store = settingsStore;
    this.view = new RestView({
      openSettings: () => this.openSettings(),
      resume: () => this.resume(),
      quit: () => this.requestExit(),
      currentFocus: () => FocusManager.get().currentFocus(),
      setFocus: target => FocusManager.get().setFocus(target),
      hasDialog: nativeDialog,
    });
    this.key = null;
    this.queued = null;
    this.exitRequested = false;
    this.retention = createRestRetention(() => this.store.data.config.saveKeepCount,
      () => session.loading || !snapshot() || !!globalThis.__civ7BeforeEndTurnV1?.busy ||
        !!this.saver?.inFlight || !!document.querySelector('screen-save-load'));
    this.saver = createRestSaver(() => !session.loading && !!snapshot() && ContextManager.canSaveGame(),
      state => this.retention.request(state));
    this.tick = this.tick.bind(this);
    this.unsubscribeSettings = subscribeSettings(this.tick);
    this.timer = setInterval(this.tick, 250);
    this.tick();
    console.warn(`${PREFIX} Ready. Independent turn/time triggers; shared rest reset; single-player only.`);
  }

  sync() {
    const suspended = activityActive(localStorage, Date.now());
    session.setSuspended(suspended, Date.now());
    if (suspended) {
      this.queued = null;
      this.saver.cancel();
      this.retention.cancel();
      this.view.close();
      this.view.setVisible(false);
      return null;
    }
    const current = snapshot();
    if (!current) {
      this.saver.cancel();
      this.retention.cancel();
      this.view.setVisible(false);
      return null;
    }
    this.view.setVisible(true);
    if (this.key !== current.key) {
      if (this.view.mode !== 'rest') this.view.close();
      this.queued = null;
      this.key = current.key;
    }
    return current;
  }

  tick() {
    const current = this.sync();
    if (!current) return;
    // Auto-save Before... owns input while writing. Finish that backup before
    // opening any new break, including a time/idle threshold crossed mid-save.
    if (globalThis.__civ7BeforeEndTurnV1?.busy) return;
    session.tick(current, this.store.data.config, Date.now());
    const pending = session.pending;
    if (session.night) {
      this.queued = null;
      this.view.showNight(session.night, this.store.data.config, Date.now());
    } else if (pending) {
      this.view.showRest(pending);
      this.view.updateRest(session.remaining(Date.now()), pending.durationMs);
    } else if (session.isIdleBreak) {
      this.view.showIdleRest();
      this.view.updateIdleRest(session.idle(Date.now()), session.idleRested);
    } else if (this.view.mode === 'idle' || this.view.mode === 'night') {
      this.view.close();
    }
    if (session.night && !session.loading && !session.night.save) {
      session.night.save = newRestSave('night', current.turn);
    } else if (!session.night && (pending || (session.isIdleBreak && this.store.data.config.idleSaveEnabled)) && !session.loading && !session.restSave) {
      session.restSave = newRestSave(pending?.reason ?? 'idle', current.turn);
    }
    const save = session.night ? session.night.save : session.restSave;
    if (!session.loading) this.saver.poll(save, current);
    else { this.saver.cancel(); this.retention.cancel(); }
    this.retention.poll();
    if (session.night || pending || session.isIdleBreak) this.view.updateSaveStatus(save);
    this.view.updateLauncher(current, this.store.data.config, this.store.error, session, Date.now());
    checkpoint();
  }

  request(submit) {
    const current = this.sync();
    if (!current) return submit();
    if (GameContext.hasSentTurnComplete()) return;
    if (isSettingsOpen()) return;
    if (!current.active && !session.night && !nightWindow(this.store.data.config, Date.now()).active && !session.pending && !session.isIdleBreak) return submit();
    const allowed = session.requestTurn(current, this.store.data.config, Date.now());
    if (allowed) return submit();
    // Automatic end-turn requests during a voluntary break must not submit
    // later when the user merely chooses Continue Game.
    if (session.night) this.queued = null;
    else if (!session.isIdleBreak) this.queued = { token: current.token, submit };
    this.tick();
  }

  resume() {
    if (nativeDialog()) return;
    const current = this.sync();
    if (!current) return;
    session.tick(current, this.store.data.config, Date.now(), false);
    if (session.night) { this.queued = null; this.tick(); return; }
    if (session.resumeIdle(current, Date.now())) {
      this.queued = null;
      this.view.close();
      this.tick();
      return;
    }
    if (!session.complete(current, Date.now())) return;
    const queued = this.queued;
    this.queued = null;
    this.view.close();
    if (queued && current?.token === queued.token && current.active && !GameContext.hasSentTurnComplete()) {
      queued.submit();
    }
    this.tick();
  }

  openSettings() {
    const current = this.sync();
    if (!current || session.pending || session.night) return;
    openSettings();
  }

  requestExit() {
    if (!this.isModal() || this.exitRequested || nativeDialog()) return;
    this.exitRequested = true;
    try {
      // Match the native pause menu's confirmation; only the explicit Confirm
      // action exits. Cancel keeps both the deadline and queued turn intact.
      DialogBoxManager.createDialog_ConfirmCancel({
        body: 'LOC_PAUSE_MENU_CONFIRM_QUIT_TO_DESKTOP',
        title: 'LOC_PAUSE_MENU_QUIT_TO_DESKTOP',
        addToFront: true,
        callback: action => {
          this.exitRequested = false;
          if (action === DialogBoxAction.Confirm) engine.call('exitToDesktop');
        },
      });
    } catch (error) {
      this.exitRequested = false;
      console.warn(`${PREFIX} Exit confirmation unavailable: ${error}`);
    }
  }

  isModal() { return !!this.sync() && !!this.view.mode; }

  activity() {
    if (globalThis.__civ7BeforeEndTurnV1?.busy) return;
    const current = this.sync();
    if (!current) return;
    session.activity(current, this.store.data.config, Date.now());
    this.tick();
  }

  handleInput(event) {
    const d = event.detail;
    if (d?.status === InputActionStatuses.FINISH) {
      if (['keyboard-escape', 'sys-menu', 'cancel'].includes(d.name)) {
        this.requestExit();
      } else if (['mousebutton-left', 'touch-tap'].includes(d.name)) {
        const target = d.isTouch ? document.elementFromPoint(d.x, d.y) : Cursor.target;
        this.view.activate(target);
      } else if (['keyboard-enter', 'accept'].includes(d.name) && this.view.mode) {
        this.view.activateFocused();
      }
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    return false;
  }

  destroy() { clearInterval(this.timer); this.unsubscribeSettings(); this.saver.destroy(); this.retention.destroy(); this.view.destroy(); }
}

function ensureController() {
  if (!controller && document.body && snapshot()) controller = new RestController();
  return controller;
}

// Patch the actual standard-game submit method, before its wait-state/age-transition
// side effects. Mouse, next-action hotkey, force-end-turn and auto-end-turn use it.
const originalEndTurn = PanelAction.prototype.sendEndTurn;
PanelAction.prototype.sendEndTurn = function (...args) {
  const submit = () => originalEndTurn.apply(this, args);
  const active = ensureController();
  return active ? active.request(submit) : submit();
};
// The outer autosave wrapper checks this before starting a write. This does not
// request a break: the actual request runs only after the save succeeds.
PanelAction.prototype.sendEndTurn.c7rCanRequestTurn = () => {
  const active = ensureController();
  if (!active || !active.sync()) return true;
  return !nightWindow(active.store.data.config, Date.now()).active && !session.night && !session.pending && !session.isIdleBreak && !isSettingsOpen() && !GameContext.hasSentTurnComplete();
};

// Optional second guard for other UI components that call the engine directly.
// Some builds expose read-only native methods, so the standard-panel hook above
// is the required path; native patch installation is verified before reporting it.
let directGuardInstalled = false;
try {
  const originalComplete = GameContext.sendTurnComplete;
  const guardedComplete = function (...args) {
    const submit = () => originalComplete.apply(GameContext, args);
    const active = ensureController();
    return active ? active.request(submit) : submit();
  };
  GameContext.sendTurnComplete = guardedComplete;
  directGuardInstalled = GameContext.sendTurnComplete === guardedComplete;
} catch (error) { console.warn(`${PREFIX} Native submit guard unavailable: ${error}`); }
console.warn(`${PREFIX} Standard turn hook installed; native guard: ${directGuardInstalled}`);

// Intercept before the game dispatches input to map, focus target or global hotkeys.
const originalInput = ContextManager.handleInput;
ContextManager.handleInput = function (event) {
  if (nativeDialog()) return originalInput.call(this, event);
  ensureController()?.activity();
  if (controller?.isModal()) return controller.handleInput(event);
  return originalInput.call(this, event);
};
const originalNavigation = ContextManager.handleNavigation;
ContextManager.handleNavigation = function (event) {
  if (nativeDialog()) return originalNavigation.call(this, event);
  ensureController()?.activity();
  if (controller?.isModal()) {
    const direction = event.getDirection?.() ?? event.detail?.navigation;
    const step = [InputNavigationAction.UP, InputNavigationAction.LEFT, InputNavigationAction.PREVIOUS].includes(direction) ? -1 :
      [InputNavigationAction.DOWN, InputNavigationAction.RIGHT, InputNavigationAction.NEXT].includes(direction) ? 1 : 0;
    // One step per press. Never let a held stick leak into the map underneath.
    if (step && event.detail?.status === InputActionStatuses.FINISH) controller.view.navigate(step);
    event.preventDefault();
    event.stopImmediatePropagation?.();
    return false;
  }
  return originalNavigation.call(this, event);
};

// Catch DOM input and direct hotkey dispatches as well as engine-routed input.
const domGuard = event => {
  const dialog = nativeDialog();
  if (dialog && (dialog.contains(event.target) || ['keydown', 'keyup'].includes(event.type))) return;
  ensureController()?.activity();
  if (!controller?.isModal()) return;
  if (event.type === 'keydown') {
    if (event.key === 'Enter' && !event.repeat && controller.view.mode) controller.view.activateFocused();
    else if (event.key === 'Tab') controller.view.navigate(event.shiftKey ? -1 : 1);
  }
  // Allow the overlay's DOM click handlers, but never the underlying map.
  if (['click', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'wheel'].includes(event.type) &&
      controller.view.modal?.contains(event.target)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
};
const guardedEvents = ['keydown', 'keyup', 'click', 'pointerdown', 'pointerup', 'mousedown', 'mouseup',
  'wheel', 'contextmenu', 'hotkey-next-action', 'action-next-action'];
for (const type of guardedEvents) window.addEventListener(type, domGuard, true);
// Mouse motion does not pass through the engine action dispatcher.
let lastMotionAt = 0;
const motion = () => {
  const now = Date.now();
  if (now - lastMotionAt < 200) return;
  lastMotionAt = now;
  ensureController()?.activity();
};
for (const type of ['mousemove', 'pointermove', 'touchmove']) window.addEventListener(type, motion, true);

Controls.loadStyle('fs://game/civ7-rest-guard/ui/rest-guard.css');
Controls.decorate('panel-action', () => ({
  beforeAttach() { ensureController(); },
  afterAttach() { ensureController()?.tick(); },
  beforeDetach() {},
  afterDetach() {},
}));
// UIScripts can be loaded after an existing component has already been attached.
const bootstrapTimer = setInterval(() => {
  if (document.querySelector('panel-action')) ensureController()?.tick();
}, 1000);
window.addEventListener('unload', () => {
  clearInterval(bootstrapTimer);
  controller?.destroy();
  checkpoint();
  for (const type of ['mousemove', 'pointermove', 'touchmove']) window.removeEventListener(type, motion, true);
  for (const type of guardedEvents) window.removeEventListener(type, domGuard, true);
});

// A native radial entry makes the HUD launcher reachable without a mouse.
const modMenu = Symbol.for('civ7-mods-controller-menu');
if (!getRadialMenus().some(menu => menu.symbol === modMenu))
  registerRadialMenu({ symbol: modMenu, title: 'LOC_UI_CONTENT_MGR_SUBTITLE', sortOrder: 90 });
if (!getRadialMenus().find(menu => menu.symbol === modMenu)?.items.some(item => item.title === 'LOC_RG_OPEN_SETTINGS'))
  registerRadialMenuItem(modMenu, { title: 'LOC_RG_OPEN_SETTINGS', icon1: 'RADIAL_ADVISORS', sortOrder: 10,
    navigation: { type: NavigationType.FOCUS, value: () => '.c7r-launcher' } });
