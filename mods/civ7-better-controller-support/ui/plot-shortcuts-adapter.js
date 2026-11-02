// Dependencies are injected so offline tests can run the exact game adapter.
export function createPlotShortcutAdapter({ player, units, mapUnits, cities, districts, mapCities,
  gameplayMap, revealedStates, worldInput, view, modes, context, focus, cursor, plotCursor,
  componentID, gameContext, game, isController, document, inputFilter, makeInputEvent, statuses,
  handlerStates, isBusy = () => false }) {
  const samePlot = (a, b) => a && b && a.x === b.x && a.y === b.y;
  const idKey = id => componentID.toString(id);
  const copyID = id => ({ owner: id.owner, id: id.id, type: id.type });
  function snapshot() {
    const mode = modes.getCurrent();
    const plot = plotCursor.plotCursorCoords;
    const selected = player.getHeadSelectedUnit();
    const local = gameContext.localPlayerID;
    const mapMode = mode === 'INTERFACEMODE_DEFAULT' || mode === 'INTERFACEMODE_UNIT_SELECTED';
    const focusOnUnit = mode === 'INTERFACEMODE_UNIT_SELECTED' &&
      !!focus.currentFocus()?.closest?.('unit-actions');
    const eligible = isController() && !cursor.softCursorEnabled && !cursor.hybridCursorEnabled &&
      !document.hidden && !isBusy() && !document.querySelector('.c7r-overlay') &&
      !focus.isFocusLocked() && (focus.isWorldFocused() || focusOnUnit) &&
      !context.getCurrentTarget() && context.canUseInput('world-input', 'action-target') &&
      view.isWorldInputAllowed && view.isViewInputAllowed && view.isWorldSelectingAllowed &&
      mapMode && Number.isInteger(local) && local >= 0 && plot &&
      gameplayMap.isValidLocation(plot) &&
      gameplayMap.getRevealedState(local, plot.x, plot.y) !== revealedStates.HIDDEN;
    return { eligible: !!eligible, plot: plot && { x: plot.x, y: plot.y }, selected, local,
      scope: `${local}:${game.turn}:${mode}:${plot?.x},${plot?.y}:${idKey(selected)}` };
  }
  function plan(key, state) {
    const { plot, local, selected } = state;
    if (key === 'city') {
      if (!worldInput.canCitySelect || !view.isCitySelectingAllowed) return null;
      const id = mapCities.getDistrict(plot.x, plot.y);
      if (!componentID.isValid(id) || !worldInput.isDistrictSelectable(id)) return null;
      // The native city handler decides between city UI and diplomacy, including
      // independent powers and the hasMet restriction. Never select an owned
      // city's remote rural tile as if its settlement were on this hex.
      const district = districts.get(id);
      if (!district || (district.cityId && !cities.get(district.cityId))) return null;
      return { key: `city:${idKey(id)}:${idKey(district.cityId)}:${district.owner}`,
        kind: 'city', plot: { ...plot } };
    }
    if (!worldInput.canUnitSelect || !view.isUnitSelectingAllowed) return null;
    const candidates = [];
    for (const id of mapUnits.getUnits(plot.x, plot.y) ?? []) {
      if (!componentID.isValid(id) || id.owner !== local) continue;
      const unit = units.get(id);
      if (!unit || unit.owner !== local || unit.isOffMap || !samePlot(unit.location, plot)) continue;
      if (!candidates.some(other => componentID.isMatch(other, id))) candidates.push(copyID(id));
    }
    // MapUnits ordering may change when a flag is raised. Stable IDs keep both
    // directions cyclic, including civilians, sleeping and exhausted units.
    candidates.sort((a, b) => a.id - b.id || a.type - b.type);
    if (candidates.length < 2) return null;
    const index = candidates.findIndex(id => componentID.isMatch(id, selected));
    const next = index < 0 ? (key === 'previous' ? candidates.length - 1 : 0) :
      (index + (key === 'previous' ? -1 : 1) + candidates.length) % candidates.length;
    const id = candidates[next];
    return { key: `unit:${idKey(id)}`, kind: 'unit', id };
  }
  return {
    snapshot, plan,
    sourceAllowed(name) {
      // Preserve filters on the original binding as well as the ordinary
      // ContextManager guards on the translated action.
      return [name, 'accept'].every(source =>
        inputFilter.handleInput(makeInputEvent(source, statuses.FINISH)) !== handlerStates.Handled);
    },
    execute(action) {
      if (action.kind === 'city') worldInput.handleSelectedPlotCity(action.plot);
      else player.selectUnit(action.id);
    }
  };
}
