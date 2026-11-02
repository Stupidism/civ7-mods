import { FEATURE_KEYS, PROFILES, isFeatureApplicable, normalizeConfig } from './settings-store.js';

export const CATEGORY = 'mods';
export const GROUP = 'war_controls';
export const optionID = (profile, key) => `war-controls-${profile}-${key}`;

// Native options own the transaction: edit a draft, Confirm to persist, Cancel
// to restore. This module has no gameplay dependencies and also runs in shell.
export function installNativeOptions({ options, optionType, categories, store, applied, reportError }) {
  let active = true;
  let saved = normalizeConfig();
  let draft = normalizeConfig();
  let entries = [];
  const previousCategory = categories[CATEGORY];
  const category = previousCategory ?? { title: 'LOC_UI_CONTENT_MGR_SUBTITLE', description: 'LOC_UI_CONTENT_MGR_SUBTITLE_DESCRIPTION' };
  categories[CATEGORY] = category;
  const previous = {};
  const wrappers = {};
  const includesConfiguration = args => args[0] == null || args[0] === 'configuration';
  const differs = () => PROFILES.some(profile => FEATURE_KEYS.some(key => saved[profile][key] !== draft[profile][key]));

  function reload() {
    const result = store.load();
    saved = normalizeConfig(result.config);
    draft = normalizeConfig(saved);
    if (result.error) reportError(result.error, false);
  }
  function persist(force = false) {
    if (!force && !differs()) return;
    try { saved = store.save(draft); }
    catch (error) { reportError(error, true); throw error; }
    applied(normalizeConfig(saved));
  }
  function register() {
    entries = [];
    for (const key of FEATURE_KEYS) {
      for (const profile of PROFILES) {
        if (!isFeatureApplicable(profile, key)) continue;
        const entry = {
          category: CATEGORY,
          group: GROUP,
          type: optionType.Checkbox,
          id: optionID(profile, key),
          warControlsProfile: profile,
          warControlsFeature: key,
          label: `LOC_WC_${key.toUpperCase()}`,
          description: `LOC_WC_${key.toUpperCase()}_DESCRIPTION`,
          initListener(info) { info.currentValue = draft[profile][key]; },
          updateListener(info, value) {
            if (!active || typeof value !== 'boolean') return;
            draft[profile][key] = value;
            info.currentValue = value;
          }
        };
        options.addOption(entry);
        entries.push(entry);
      }
    }
    const reset = {
      category: CATEGORY,
      group: GROUP,
      type: optionType.Editor,
      id: 'war-controls-reset-page',
      label: 'LOC_WC_DEFAULTS_LABEL',
      description: 'LOC_WC_DEFAULTS_DESCRIPTION',
      caption: 'LOC_WC_DEFAULTS_BUTTON',
      activateListener() {
        if (!active) return true;
        draft = normalizeConfig();
        for (const entry of entries) {
          entry.initListener?.(entry);
          entry.forceRender?.();
        }
        return true;
      }
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
    if (previousCategory === undefined && categories[CATEGORY] === category &&
        !Array.from(options.data.values()).some(entry => entry.category === CATEGORY)) {
      delete categories[CATEGORY];
    }
  }
  try {
    reload();
    // Run after native initialization, including engine reinitialization.
    // Avoid modifying private native callback arrays.
    wrap('init', reload, register);
    wrap('commitOptions', args => { if (includesConfiguration(args)) persist(); });
    wrap('restore', args => { if (includesConfiguration(args)) reload(); });
    wrap('resetOptionsToDefault', () => { draft = normalizeConfig(); persist(true); });
    if (options.data.size > 0) register();
  } catch (error) { dispose(); throw error; }
  return { dispose };
}
