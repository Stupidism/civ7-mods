// Each real selection gets at most one automatic mode change. A UI refresh or
// cancellation is not a new selection. All commands remain in the native UI.
export function createSelectionAssist(api) {
  let selectedKey = null;
  let pendingKey = null;
  let frame = null;
  let generation = 0;
  let disposed = false;

  function cancelPending() {
    generation++;
    pendingKey = null;
    if (frame !== null) api.cancelFrame(frame);
    frame = null;
  }

  function selectionChanged(id, selected) {
    if (disposed) return;
    const key = api.key(id);
    if (!selected) {
      if (key === selectedKey) {
        cancelPending();
        selectedKey = null;
      }
      return;
    }
    if (key === selectedKey) return;
    cancelPending();
    selectedKey = key;
    pendingKey = key;
  }

  function raised(id) {
    if (disposed || !pendingKey || pendingKey !== api.key(id) || frame !== null) return;
    const ticket = generation;
    frame = api.nextFrame(() => {
      frame = null;
      if (disposed || ticket !== generation || pendingKey !== api.key(id)) return;
      pendingKey = null; // Consume before changing mode, including failure paths.
      if (api.key(api.headSelected()) !== selectedKey || !api.canUseWorld()) return;
      if (api.mode() !== "INTERFACEMODE_UNIT_SELECTED") return;
      try {
        const action = api.actionFor(id);
        if (action) api.enterAction(id, action);
      } catch (error) {
        api.reportError(error);
      }
    });
  }

  return {
    selectionChanged,
    raised,
    cancelPending,
    dispose() {
      cancelPending();
      selectedKey = null;
      disposed = true;
    }
  };
}
