import { normalizeConfig, clockTime } from './rest-model.js';

export const REST_OPTIONS_CATEGORY = 'mods';
export const REST_OPTIONS_GROUP = 'rest_guard';
export const REST_OPTIONS_FIRST_ID = 'rest-guard-turn-enabled';

// Native Confirm owns persistence. Cancel never writes settings or resets timers.
export function installRestOptions({ options, optionType, categories, store, applied,
  canCommit = () => true, reportError = () => {} }) {
  let active = true;
  let saved = normalizeConfig(store.data.config);
  let draft = normalizeConfig(saved);
  let entries = [];
  const previous = {};
  const wrappers = {};
  categories[REST_OPTIONS_CATEGORY] ??= {
    title: 'LOC_UI_CONTENT_MGR_SUBTITLE',
    description: 'LOC_UI_CONTENT_MGR_SUBTITLE_DESCRIPTION',
  };
  const includesConfiguration = args => args[0] == null || args[0] === 'configuration';
  const differs = () => JSON.stringify(saved) !== JSON.stringify(draft);
  function reload() {
    store.load();
    saved = normalizeConfig(store.data.config);
    draft = normalizeConfig(saved);
  }
  function persist() {
    if (!differs()) return;
    if (!canCommit()) throw new Error('Rest Guard: finish the current rest before changing settings.');
    const before = normalizeConfig(store.data.config);
    store.data.config = normalizeConfig(draft);
    if (!store.save()) {
      store.data.config = before;
      const error = new Error('Rest Guard settings could not be saved.');
      reportError(error);
      throw error;
    }
    saved = normalizeConfig(draft);
    applied?.(normalizeConfig(saved), before);
  }
  function register() {
    entries = [];
    function add(id, label, description, read, write, values, labelValue = String, enabledBy = null) {
      const choices = values ? [...new Set([...values, read(draft)])].sort((a, b) => a - b) : null;
      const entry = {
        id: `rest-guard-${id}`, category: REST_OPTIONS_CATEGORY, group: REST_OPTIONS_GROUP,
        type: choices ? optionType.Dropdown : optionType.Switch,
        label: `LOC_RG_${label}`, description: `LOC_RG_${description}`,
        ...(choices ? { dropdownItems: choices.map(value => ({ label: labelValue(value) })) } : {}),
        initListener(info) {
          info.isHidden = enabledBy !== null && !draft[enabledBy];
          if (choices) info.selectedItemIndex = choices.indexOf(read(draft));
          else info.currentValue = read(draft);
        },
        updateListener(info, value) {
          if (!active || (enabledBy !== null && !draft[enabledBy])) return;
          if (choices) {
            if (!Number.isInteger(value) || value < 0 || value >= choices.length) return;
            write(draft, choices[value]);
          } else {
            if (typeof value !== 'boolean') return;
            write(draft, value);
          }
          entry.initListener(info);
          if (!choices) {
            // Native forceRender hides the complete row, preserving the value
            // and letting the native scroll area observe the changed height.
            for (const dependent of entries) {
              const wasHidden = dependent.isHidden;
              dependent.initListener?.(dependent);
              if (dependent.isHidden !== wasHidden) dependent.forceRender?.();
            }
          }
        },
      };
      options.addOption(entry);
      entries.push(entry);
    }
    // Keep each switch immediately before its own controls. Duration and save
    // retention are shared by multiple triggers, so they form a final section.
    add('turn-enabled', 'TURN_ENABLED', 'TURN_DESCRIPTION', c => c.turnEnabled, (c, v) => { c.turnEnabled = v; });
    for (let i = 0; i < 5; i++) {
      add(`interval-${i}`, `STAGE_${i}`, 'TURN_DESCRIPTION', c => c.intervals[i], (c, v) => { c.intervals[i] = v; },
        Array.from({ length: 100 }, (_, index) => index + 1), String, 'turnEnabled');
    }
    add('time-enabled', 'TIME_ENABLED', 'TIME_DESCRIPTION', c => c.timeEnabled, (c, v) => { c.timeEnabled = v; });
    add('play-minutes', 'PLAY_MINUTES', 'TIME_DESCRIPTION', c => c.playMinutes, (c, v) => { c.playMinutes = v; },
      Array.from({ length: 240 }, (_, i) => i + 1), String, 'timeEnabled');
    add('night-enabled', 'NIGHT_ENABLED', 'NIGHT_DESCRIPTION', c => c.nightEnabled, (c, v) => { c.nightEnabled = v; });
    const times = Array.from({ length: 96 }, (_, i) => i * 15);
    add('night-start', 'NIGHT_START', 'NIGHT_DESCRIPTION', c => c.nightStart, (c, v) => { c.nightStart = v; }, times, clockTime, 'nightEnabled');
    add('night-end', 'NIGHT_END', 'NIGHT_DESCRIPTION', c => c.nightEnd, (c, v) => { c.nightEnd = v; }, times, clockTime, 'nightEnabled');
    add('rest-minutes', 'REST_MINUTES', 'REST_DESCRIPTION', c => c.restMinutes, (c, v) => { c.restMinutes = v; },
      [0.1, ...Array.from({ length: 240 }, (_, i) => (i + 1) / 2)]);
    add('save-keep-count', 'SAVE_KEEP_COUNT', 'SAVE_KEEP_DESCRIPTION', c => c.saveKeepCount, (c, v) => { c.saveKeepCount = v; },
      Array.from({ length: 100 }, (_, i) => i + 1));
    const reset = {
      id: 'rest-guard-reset', category: REST_OPTIONS_CATEGORY, group: REST_OPTIONS_GROUP,
      type: optionType.Editor, label: 'LOC_RG_RESET_LABEL', description: 'LOC_RG_RESET_DESCRIPTION',
      caption: 'LOC_RG_RESET_BUTTON',
      activateListener() {
        if (!active) return true;
        draft = normalizeConfig();
        for (const entry of entries) { entry.initListener?.(entry); entry.forceRender?.(); }
        return true;
      },
    };
    options.addOption(reset);
    entries.push(reset);
  }
  function wrap(name, before, after) {
    previous[name] = options[name];
    const wrapper = function (...args) {
      if (active) before?.(args);
      const result = previous[name].apply(this, args);
      if (active) after?.(args);
      return result;
    };
    wrappers[name] = wrapper;
    options[name] = wrapper;
    if (options[name] !== wrapper) throw new Error(`Options.${name} cannot be extended`);
  }
  function dispose() {
    active = false;
    for (const name of Object.keys(wrappers)) if (options[name] === wrappers[name]) options[name] = previous[name];
    for (const entry of entries) if (options.data.get(entry.id) === entry) options.data.delete(entry.id);
    // Other mods share this category; do not remove it on unload.
  }
  try {
    wrap('init', reload, register);
    wrap('commitOptions', args => { if (includesConfiguration(args)) persist(); });
    wrap('restore', args => { if (includesConfiguration(args)) reload(); });
    // The game's global Reset is already confirmed and saves immediately.
    wrap('resetOptionsToDefault', () => { draft = normalizeConfig(); persist(); });
    if (options.data.size > 0) register();
  } catch (error) { dispose(); throw error; }
  return { dispose };
}

// Resolve the tab dynamically. Reuse an open screen so other drafts survive.
export function openRestOptions({ context, document, afterLayout, focus }) {
  if (!document.querySelector('screen-options')) {
    context.push('screen-options', { singleton: true, createMouseGuard: true });
  }
  afterLayout(() => {
    const root = document.querySelector('screen-options');
    const screen = root?.component;
    if (!root?.isConnected || !screen) return;
    const index = screen.tabData.findIndex(tab => tab.category === REST_OPTIONS_CATEGORY);
    if (index < 0) return;
    screen.tabControl.setAttribute('selected-tab-index', String(index));
    screen.slotGroup.setAttribute('selected-slot', screen.panels[index].id);
    afterLayout(() => {
      if (!root.isConnected) return;
      const first = root.querySelector(`fxs-switch[optionID="${REST_OPTIONS_FIRST_ID}"]`);
      const header = root.querySelector(`[data-group="${REST_OPTIONS_GROUP}"]`);
      if (first) focus(first);
      const scroll = screen.scrollable?.component;
      if (header && scroll) {
        scroll.resizeScrollThumb();
        const distance = header.getBoundingClientRect().top - screen.scrollable.getBoundingClientRect().top;
        if (scroll.scrollableContentSize > 0) {
          scroll.scrollToPercentage(scroll.scrollPosition + distance / scroll.scrollableContentSize);
        }
      }
    });
  });
}

// Keep the single native mod heading. Decorative, unfocusable rules separate
// sections without introducing extra native groups or ornamental headers.
export function installRestOptionDividers(categoryPrototype, document) {
  const starts = new Set(['rest-guard-time-enabled', 'rest-guard-night-enabled',
    'rest-guard-rest-minutes', 'rest-guard-reset']);
  const previous = categoryPrototype.appendOption;
  let active = true;
  function appendOption(option, ...args) {
    const result = previous.call(this, option, ...args);
    if (active && option.category === REST_OPTIONS_CATEGORY && option.group === REST_OPTIONS_GROUP && starts.has(option.id)) {
      const rule = document.createElement('div');
      rule.setAttribute('data-c7r-options-divider', option.id);
      rule.setAttribute('aria-hidden', 'true');
      rule.style.cssText = 'height:1px;min-height:1px;flex-shrink:0;background-color:rgba(189,165,118,0.28);margin:0.75rem 0 0.65rem;pointer-events:none;';
      result.optionRow.parentElement.insertBefore(rule, result.optionRow);
    }
    return result;
  }
  categoryPrototype.appendOption = appendOption;
  return () => {
    active = false;
    if (categoryPrototype.appendOption === appendOption) categoryPrototype.appendOption = previous;
    document.querySelectorAll('[data-c7r-options-divider]').forEach(rule => rule.remove());
  };
}
