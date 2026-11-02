import { normalizeConfig } from './save-store.js';

export const OPTIONS_CATEGORY = 'mods';
export const OPTIONS_GROUP = 'save_before_action';
export const FIRST_OPTION = 'save-before-turn-enabled';

export function installSaveOptions({ options, optionType, categories, store,
  canCommit = () => true, reportError = () => {} }) {
  let active = true;
  let saved = normalizeConfig(store.data.config), draft = normalizeConfig(saved);
  let entries = [];
  const hooks = [];
  categories[OPTIONS_CATEGORY] ??= {
    title: 'LOC_UI_CONTENT_MGR_SUBTITLE', description: 'LOC_UI_CONTENT_MGR_SUBTITLE_DESCRIPTION'
  };
  function reload() {
    store.load(); saved = normalizeConfig(store.data.config); draft = normalizeConfig(saved);
  }
  function persist() {
    if (JSON.stringify(saved) === JSON.stringify(draft)) return;
    if (!canCommit()) throw new Error('Wait for the current save before changing settings.');
    const previous = store.data.config;
    store.data.config = normalizeConfig(draft);
    if (!store.save()) {
      store.data.config = previous;
      const error = new Error('Could not save automatic-save settings.');
      reportError(error); throw error;
    }
    saved = normalizeConfig(draft);
  }
  function register() {
    entries = [];
    for (const [key, id, label] of [
      ['turnEnabled', FIRST_OPTION, 'TURN'],
      ['diplomacyEnabled', 'save-before-diplomacy-enabled', 'DIPLOMACY']
    ]) {
      const entry = {
        id, category: OPTIONS_CATEGORY, group: OPTIONS_GROUP, type: optionType.Switch,
        label: `LOC_SBE_${label}_ENABLED`, description: `LOC_SBE_${label}_DESCRIPTION`,
        initListener(info) { info.currentValue = draft[key]; },
        updateListener(info, value) {
          if (!active || typeof value !== 'boolean') return;
          draft[key] = value; info.currentValue = value;
        }
      };
      options.addOption(entry); entries.push(entry);
    }
  }
  function wrap(name, before, after) {
    const previous = options[name];
    const wrapper = function (...args) {
      if (active) before?.(args);
      const result = previous.apply(this, args);
      if (active) after?.(args);
      return result;
    };
    options[name] = wrapper;
    if (options[name] !== wrapper) throw new Error(`Options.${name} cannot be extended`);
    hooks.push({ name, previous, wrapper });
  }
  function dispose() {
    active = false;
    for (const { name, previous, wrapper } of hooks) if (options[name] === wrapper) options[name] = previous;
    for (const entry of entries) if (options.data.get(entry.id) === entry) options.data.delete(entry.id);
  }
  const configuration = args => args[0] == null || args[0] === 'configuration';
  try {
    wrap('init', reload, register);
    wrap('commitOptions', args => { if (configuration(args)) persist(); });
    wrap('restore', args => { if (configuration(args)) reload(); });
    wrap('resetOptionsToDefault', () => { draft = normalizeConfig(); persist(); });
    if (options.data.size > 0) register();
  } catch (error) { dispose(); throw error; }
  return { dispose };
}

export function openSaveOptions({ context, document, afterLayout, focus }) {
  if (!document.querySelector('screen-options')) context.push('screen-options', { singleton: true, createMouseGuard: true });
  afterLayout(() => {
    const root = document.querySelector('screen-options'), screen = root?.component;
    if (!root?.isConnected || !screen) return;
    const index = screen.tabData.findIndex(tab => tab.category === OPTIONS_CATEGORY);
    if (index < 0) return;
    screen.tabControl.setAttribute('selected-tab-index', String(index));
    screen.slotGroup.setAttribute('selected-slot', screen.panels[index].id);
    afterLayout(() => {
      if (!root.isConnected) return;
      const first = root.querySelector(`fxs-switch[optionID="${FIRST_OPTION}"]`);
      if (first) focus(first);
      const header = root.querySelector(`[data-group="${OPTIONS_GROUP}"]`), scroll = screen.scrollable?.component;
      if (header && scroll) {
        scroll.resizeScrollThumb();
        const distance = header.getBoundingClientRect().top - screen.scrollable.getBoundingClientRect().top;
        if (scroll.scrollableContentSize > 0) scroll.scrollToPercentage(scroll.scrollPosition + distance / scroll.scrollableContentSize);
      }
    });
  });
}
