import { ScreenOptionsCategory } from '/core/ui/options/screen-options-category.js';
import { CreateOptionComponent } from '/core/ui/options/options-helpers.js';
import { CATEGORY, GROUP } from './native-options.js';
import { PROFILES, isFeatureApplicable } from './settings-store.js';

// Change only our rows. Native ScreenOptions still initializes each checkbox,
// handles its value-change event and owns Confirm / Cancel / focus routing.
export function installSettingsLayout() {
  const prototype = ScreenOptionsCategory.prototype;
  const previous = prototype.appendOption;
  const layouts = new WeakMap();
  let active = true;
  const element = (tag, className, textKey) => {
    const node = document.createElement(tag);
    node.className = className;
    if (textKey) node.setAttribute('data-l10n-id', textKey);
    return node;
  };
  function appendOption(option, ...args) {
    if (!active || option.category !== CATEGORY || option.group !== GROUP || !option.warControlsFeature) {
      return previous.call(this, option, ...args);
    }
    let layout = layouts.get(this);
    if (!layout || layout.matrix.parentElement !== this.Root) {
      const reference = this.getOptionReferenceNode(GROUP);
      const matrix = element('fxs-vslot', 'war-controls-matrix flex flex-col');
      const header = element('div', 'war-controls-grid-row war-controls-column-headings font-body text-base');
      header.appendChild(element('div', 'war-controls-feature', 'LOC_WC_FEATURE_COLUMN'));
      for (const profile of PROFILES) header.appendChild(element('div', 'war-controls-cell', `LOC_WC_COLUMN_${profile.toUpperCase()}`));
      matrix.appendChild(header);
      this.Root.insertBefore(matrix, reference);
      layout = { matrix, rows: new Map() };
      layouts.set(this, layout);
    }
    const key = option.warControlsFeature;
    let row = layout.rows.get(key);
    if (!row) {
      const root = element('fxs-hslot', 'war-controls-grid-row highlight-row');
      root.setAttribute('data-war-controls-feature', key);
      const label = element('p', 'war-controls-feature font-body text-base', option.label);
      if (option.description) label.setAttribute('data-tooltip-content', Locale.compose(option.description));
      root.appendChild(label);
      const cells = {};
      for (const profile of PROFILES) {
        const cell = element('div', 'war-controls-cell');
        if (!isFeatureApplicable(profile, key)) {
          cell.appendChild(element('span', 'war-controls-not-applicable font-body text-base', 'LOC_WC_NOT_APPLICABLE'));
        }
        cells[profile] = cell;
        root.appendChild(cell);
      }
      layout.matrix.appendChild(root);
      row = { root, cells };
      layout.rows.set(key, row);
    }
    const optionElement = CreateOptionComponent(option);
    if (option.description) {
      optionElement.setAttribute('data-tooltip-content', Locale.compose(option.description));
      optionElement.setAttribute('data-tooltip-anchor', 'left');
    }
    optionElement.setAttribute('aria-label', `${Locale.compose(`LOC_WC_COLUMN_${option.warControlsProfile.toUpperCase()}`)}: ${Locale.compose(option.label)}`);
    row.cells[option.warControlsProfile].appendChild(optionElement);
    return { optionRow: row.root, optionElement };
  }
  prototype.appendOption = appendOption;
  return () => {
    active = false;
    if (prototype.appendOption === appendOption) prototype.appendOption = previous;
  };
}
