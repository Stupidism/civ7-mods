import { ContextManager } from '/core/ui/context-manager/context-manager.js';
import { FocusManager } from '/core/ui-next/services/focus-manager.js';
import { IsControllerActive } from '/core/ui-next/services/input.js';
import { InterfaceMode } from '/core/ui/interface-modes/interface-modes.js';
import ViewManager from '/core/ui/views/view-manager.js';
import { ActionActivateEvent } from '/core/ui/components/fxs-activatable.js';
import { getRadialMenus, registerRadialMenu, registerRadialMenuItem } from '/core/ui/radial-menu/radial-menu-item-store.js';
import { installMapTools } from './map-tools-runtime.js';
import { TOOL_DEFINITIONS } from './navigation.js';
import { syncRadialIcons } from './radial-icons.js';

const KEY = '__civ7MapToolsGamepad';
const menu = Symbol.for('civ7-map-tools-gamepad-menu');
function install() {
  if (UI.isInShell()) return;
  globalThis[KEY]?.dispose();
  const runtime = installMapTools({ document, window, context: ContextManager,
    focus: FocusManager.get(), view: ViewManager, modes: InterfaceMode,
    statuses: InputActionStatuses, navigation: InputNavigationAction,
    isController: IsControllerActive, input: Input, contexts: InputContext,
    activate: element => element.dispatchEvent(new ActionActivateEvent(0, 0)) });
  globalThis[KEY] = runtime;
  if (!getRadialMenus().some(item => item.symbol === menu)) {
    registerRadialMenu({ symbol: menu, title: 'LOC_MTG_TITLE', sortOrder: 85 });
    TOOL_DEFINITIONS.forEach((tool, index) => registerRadialMenuItem(menu, {
      title: tool.title, icon1: '', sortOrder: index,
      get isHidden() { return !globalThis[KEY]?.enabled(document.querySelector(tool.selector)); },
      mapToolsSelector: tool.selector
    }));
  }
  console.log('[MapToolsGamepad] 0.2.1 loaded');
}
// Register once even if the entry script is re-evaluated during development.
if (!globalThis.__civ7MapToolsRadialIconsRegistered) {
  Controls.decorate('panel-radial-menu', component => {
    let frame;
    const sync = () => {
      if (component.Root.isConnected) syncRadialIcons(component.Root, component.menus, document, window);
    };
    return {
      beforeAttach() {},
      afterAttach() {
        // Native initialization has already resolved navigation callbacks. Replace only
        // our five entries; unrelated radial actions keep their original handlers.
        for (const menu of component.menus) for (const item of menu.items) {
          if (!TOOL_DEFINITIONS.some(tool => tool.selector === item.mapToolsSelector)) continue;
          item.onClick = () => {
            const runtime = globalThis[KEY];
            component.close();
            // Do not cancel this frame on detach: closing the radial is intentional.
            window.requestAnimationFrame(() => runtime?.openTool(item.mapToolsSelector));
          };
        }
        sync(); frame = window.requestAnimationFrame(sync);
      },
      beforeDetach() { window.cancelAnimationFrame(frame); },
      afterDetach() {}
    };
  });
  globalThis.__civ7MapToolsRadialIconsRegistered = true;
}
Controls.loadStyle('fs://game/civ7-map-tools-gamepad/ui/map-tools-gamepad.css');
engine.whenReady.then(install);
