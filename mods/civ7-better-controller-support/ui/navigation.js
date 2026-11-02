// The engine sends both press/release events and held analog updates.
// Keep one step per press, with a deliberate repeat for held directions.
export function createRepeater(now = () => Date.now()) {
  let held;
  return (owner, direction, status, statuses) => {
    if (!direction) { held = undefined; return false; }
    const same = held?.owner === owner && held?.direction === direction;
    if (status === statuses.FINISH) {
      held = undefined;
      return !same;
    }
    if (status !== statuses.START && status !== statuses.UPDATE && status !== statuses.HOLD) return false;
    const time = now();
    if (!same) { held = { owner, direction, next: time + 320 }; return true; }
    if (time < held.next) return false;
    held.next = time + 130;
    return true;
  };
}

export function nextItem(items, current, direction, spatial = false) {
  if (!items.length) return null;
  const index = items.indexOf(current);
  if (index < 0) return items[0];
  if (spatial && (direction === 'up' || direction === 'down')) {
    const origin = current.getBoundingClientRect();
    const ox = origin.left + origin.width / 2, oy = origin.top + origin.height / 2;
    let best = current, score = Infinity;
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      const dx = Math.abs(rect.left + rect.width / 2 - ox);
      const dy = (rect.top + rect.height / 2 - oy) * (direction === 'up' ? -1 : 1);
      if (dy <= 1) continue;
      const candidate = dy + dx * 4;
      if (candidate < score) { best = item; score = candidate; }
    }
    return best;
  }
  const delta = direction === 'up' || direction === 'left' ? -1 : 1;
  return items[Math.max(0, Math.min(items.length - 1, index + delta))];
}

export const TOOL_DEFINITIONS = [
  { title: 'LOC_MTG_LENSES', selector: 'panel-mini-map .mini-map__button-row > .mini-map__lens-button:first-child', iconSelector: '.mini-map__lens-button__icon', icon: 'url("blp:action_lookout.png")' },
  { title: 'LOC_MTG_CITIES', selector: 'panel-mini-map .bz-city-button', iconSelector: '.mini-map__lens-button__icon', icon: 'url("blp:Yield_Cities")' },
  { title: 'LOC_MTG_UNITS', selector: 'panel-mini-map .bz-units-button', iconSelector: '.mini-map__lens-button__icon', icon: 'url("blp:Action_Promote")' },
  { title: 'LOC_MTG_WONDERS', selector: 'panel-mini-map .bz-wonder-button', iconSelector: '.mini-map__lens-button__icon', icon: 'url("blp:fonticon_wonders")' },
  { title: 'LOC_MTG_TACKS', selector: 'panel-mini-map .mini-map__map-tacks-button', iconSelector: '.mini-map__map-tacks-button__icon', icon: 'url("fs://game/detailed-map-tacks/texture/dmt-map-tack.png")' }
];
