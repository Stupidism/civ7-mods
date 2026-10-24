import { Options } from '/core/ui/options/model-options.js';

const optionId = 'option-autosavekeepcount';
const maximum = 150;
const installed = Symbol.for('civ7-autosave-limit.installed');

function extendSlider() {
  const option = Options.data.get(optionId);
  if (!option) return;
  option.min = 1;
  option.max = maximum;
  option.steps = maximum - 1;
}

if (!Options[installed]) {
  // Apply after every initialization, including rebuilds of the cached options.
  const originalInit = Options.init;
  Options.init = function (...args) {
    const result = originalInit.apply(this, args);
    extendSlider();
    return result;
  };
  Options[installed] = true;
  extendSlider();
}
