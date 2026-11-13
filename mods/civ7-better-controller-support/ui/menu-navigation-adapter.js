import ActionHandler from '/core/ui/input/action-handler.js';
import Cursor from '/core/ui/input/cursor.js';
import { ContextManager } from '/core/ui/context-manager/context-manager.js';
import ViewManager from '/core/ui/views/view-manager.js';
import { FocusManager } from '/core/ui-next/services/focus-manager.js';
import NavTray from '/core/ui/navigation-tray/model-navigation-tray.js';
import { createMenuNavigation } from './menu-navigation.js';

import { createScrollNavigation } from './scroll-navigation.js';

const KEY = '__civ7ControllerMenuNavigation';

// NavigationTray's persistent API is a stack without owner tokens. Remember the
// exact stack/array identities and insertion slot so withdrawal can remove only
// this scope's key, even when another caller (including one using the same key)
// has pushed an entry above it.
export function createNavigationTrayAdapter(navTray = NavTray) {
  if (!navTray || typeof navTray.addPersistentEntry !== 'function' ||
      typeof navTray.removePersistentEntry !== 'function' ||
      typeof navTray.getPersistentActionStack !== 'function') return null;
  const owned = new Map(); // action -> { stack, locKeys, slot, locKey }

  function stackFor(action) {
    try {
      return navTray.getPersistentActionStack(action)?.actionStack;
    } catch (_) {
      return undefined;
    }
  }

  function stillOwns(registration) {
    const stack = stackFor(registration.action);
    return stack === registration.stack &&
      stack?.locKeys === registration.locKeys &&
      Array.isArray(registration.locKeys) &&
      registration.slot >= 0 && registration.slot < registration.locKeys.length &&
      registration.locKeys[registration.slot] === registration.locKey;
  }

  function withdraw(action) {
    const registration = owned.get(action);
    if (!registration) return;
    if (!stillOwns(registration)) {
      // The stack/array was replaced, or our slot was already removed. There is
      // no definite native entry left to withdraw; never pop a replacement.
      owned.delete(action);
      return;
    }

    const { locKeys, slot } = registration;
    if (slot === locKeys.length - 1) {
      navTray.removePersistentEntry(action);
    } else {
      // The public model exposes actionStack.locKeys. Native remove only pops
      // the top, so remove this exact non-top slot and run the native gate.
      locKeys.splice(slot, 1);
      if (!locKeys.length) {
        const stacks = navTray.persistentActionStacks;
        const index = Array.isArray(stacks) ? stacks.indexOf(registration.stack) : -1;
        if (index >= 0) stacks.splice(index, 1);
      }
      navTray.updateGate?.call('removePersistentEntry');
    }
    owned.delete(action);
  }

  return {
    set(entries = []) {
      const wanted = new Map();
      for (const entry of entries) {
        if (!entry?.action || !entry.locKey) continue;
        wanted.set(entry.action, entry.locKey);
      }

      for (const [action, registration] of [...owned]) {
        if (wanted.get(action) !== registration.locKey) withdraw(action);
      }

      for (const [action, locKey] of wanted) {
        const registration = owned.get(action);
        if (registration?.locKey === locKey && stillOwns(registration)) continue;
        if (registration) withdraw(action);
        // Register only an empty persistent stack. An existing caller has
        // priority and its entries remain untouched.
        const current = stackFor(action);
        if (current?.locKeys?.length) continue;
        navTray.addPersistentEntry(locKey, action);
        const stack = stackFor(action);
        const locKeys = stack?.locKeys;
        const slot = Array.isArray(locKeys) ? locKeys.lastIndexOf(locKey) : -1;
        if (!stack || !Array.isArray(locKeys) || slot < 0 || locKeys[slot] !== locKey) continue;
        owned.set(action, { action, stack, locKeys, slot, locKey });
      }
    },
    dispose() { this.set([]); }
  };
}

// Called by settings initialization in both shell and game documents. The map
// bridge is game-only; this lightweight hook also covers the main menu.
export function installMenuNavigation(settingsStore) {
  globalThis[KEY]?.dispose();
  let focused = true, patch, unsubscribe, removed = false;
  const sync = () => patch?.sync();
  const blur = () => { focused = false; patch?.suspend(); sync(); };
  const focus = () => { focused = true; sync(); };
  const dispose = () => {
    if (removed) return;
    removed = true;
    unsubscribe?.(); patch?.dispose();
    window.removeEventListener('blur', blur);
    window.removeEventListener('focus', focus);
    window.removeEventListener('unload', dispose);
    engine.off('BeforeUnload', dispose);
    engine.off('BeginFrame', sync);
    engine.off('InputContextChanged', sync);
    if (globalThis[KEY]?.dispose === dispose) delete globalThis[KEY];
  };
  try {
    patch = createMenuNavigation({
      scrollControls: createScrollNavigation({ document, window, focus: FocusManager.get(), statuses: InputActionStatuses,
        root: () => ContextManager.getCurrentTarget() || document,
        navigationTray: createNavigationTrayAdapter() }),
      actionHandler: ActionHandler, statuses: InputActionStatuses, input: Input, contexts: InputContext,
      snapshot: () => {
        const target = ContextManager.getCurrentTarget();
        // A settler legend accompanies map selection. Only the map bridge may
        // calibrate its sticks; two hook orders must never swap them twice.
        const mapOverlay = target?.tagName === 'PANEL-SETTLER-LEGEND';
        const smallNarrative = target?.tagName === 'SMALL-NARRATIVE-EVENT';
        const inShell = UI.isInShell();
        const view = ViewManager.current;
        return {
          // Diplomacy and other harness views host panels outside the popup stack.
          // Use the view's declared context, not the sometimes-stale Mac device context.
          menu: inShell || (!ContextManager.isEmpty && !mapOverlay) || view?.getInputContext() === InputContext.Shell,
          // Calibrate the reported pause and small-event cases. The merchant
          // chooser was reported working on the left; preserve other panels.
          swapRoles: inShell || view?.getName() === 'PauseMenu' || smallNarrative,
          nativeMenuContext: smallNarrative ? InputContext.Dual : undefined,
          panelPresent: !ContextManager.isEmpty,
          viewContext: view?.getInputContext(),
          scope: inShell ? 'shell' : target?.tagName || view?.getName() || 'game-panel',
          inputContext: Input.getActiveContext(),
          controller: Input.getActiveDeviceType() === InputDeviceType.Controller,
          softCursor: Cursor.softCursorEnabled || Cursor.hybridCursorEnabled,
          focused,
          blocked: FocusManager.get().isFocusLocked() || document.hidden === true || !!document.querySelector('.c7r-overlay') ||
            !!globalThis.__civ7BeforeEndTurnV1?.busy
        };
      },
      report: sample => console.warn(`[ControllerBridge:MenuInput] v0.2.0 ${JSON.stringify(sample)}`)
    });
    patch.setConfig(settingsStore.load());
    unsubscribe = settingsStore.subscribe(patch.setConfig);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    window.addEventListener('unload', dispose);
    engine.on('BeforeUnload', dispose);
    engine.on('BeginFrame', sync);
    engine.on('InputContextChanged', sync);
    globalThis[KEY] = { dispose };
  } catch (error) {
    dispose();
    console.error(`[ControllerBridge] Menu input compatibility unavailable: ${error}`);
  }
  return dispose;
}
