import { DEFAULTS, normalizeConfig } from './bridge-store.js';

// These are native options: edit a draft, Confirm to apply, Cancel to discard.
// No input or gameplay dependencies, so the same settings work in the shell.
export function installBridgeOptions({ options, optionType, categories, store, reportError = () => {} }) {
  let active = true, saved = store.load(), draft = { ...saved }, entries = [];
  const hooks = [];
  const previousCategory = categories.mods;
  const category = categories.mods ??= {
    title: 'LOC_UI_CONTENT_MGR_SUBTITLE', description: 'LOC_UI_CONTENT_MGR_SUBTITLE_DESCRIPTION'
  };
  function reload() { saved = store.load(); draft = { ...saved }; }
  function persist(reset = false) {
    const changed = Object.keys(DEFAULTS).filter(key => reset || draft[key] !== saved[key]);
    if (!changed.length) return;
    // Preserve settings changed by the debug buttons since options last opened.
    const next = store.load();
    for (const key of changed) next[key] = draft[key];
    try { saved = store.save(next); draft = { ...saved }; }
    catch (error) { reportError(error); throw error; }
  }
  function register() {
    entries = [];
    for (const [key, label] of [['enabled', 'ENABLED'], ['invertLeftY', 'LEFT_INVERT'], ['invertPanY', 'INVERT'], ['showDebug', 'DEBUG']]) {
      const entry = {
        id: `controller-bridge-${key}`, category: 'mods', group: 'controller_bridge', type: optionType.Switch,
        label: `LOC_CB_${label}`, description: `LOC_CB_${label}_DESCRIPTION`,
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
    if (!previousCategory && categories.mods === category &&
        !Array.from(options.data.values()).some(entry => entry.category === 'mods')) delete categories.mods;
  }
  const configuration = args => args[0] == null || args[0] === 'configuration';
  try {
    wrap('init', reload, register);
    wrap('commitOptions', args => { if (configuration(args)) persist(); });
    wrap('restore', args => { if (configuration(args)) reload(); });
    wrap('resetOptionsToDefault', () => { draft = normalizeConfig(); persist(true); });
    if (options.data.size) register();
  } catch (error) { dispose(); throw error; }
  return { dispose };
}
