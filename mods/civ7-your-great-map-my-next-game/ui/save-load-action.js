/** Attach to an existing screen-save-load instance; preserve its native button. */
export function attachSaveLoadAction(control, { document, flow, isEligible, showChoices, showFailure }) {
  if (!control.actionButtonsContainer || typeof control.updateLoadButton !== 'function') throw new Error('Save screen is not initialized');
  const button = document.createElement('fxs-button');
  button.classList.add('play-again-button');
  button.setAttribute('caption', 'LOC_PLAY_AGAIN_START_FROM_SAVE');
  const originalUpdate = control.updateLoadButton;
  let disposed = false;
  const sameSave = (left, right) => left?.ID === right?.ID && left?.fileName === right?.fileName &&
    left?.location === right?.location && left?.type === right?.type;
  const available = () => (control.Root.getAttribute('menu-type') ?? 'load') === 'load' &&
    control.currentPanelOperation === 0 && isEligible(control.getSelectedSaveGameInfo());
  const refresh = () => {
    if (disposed) return;
    const normalLoadScreen = (control.Root.getAttribute('menu-type') ?? 'load') === 'load';
    button.classList.toggle('hidden', !normalLoadScreen);
    button.setAttribute('disabled', !available() || !['idle', 'ready', 'cancelled'].includes(flow.state.phase) ? 'true' : 'false');
  };
  const updated = function (...args) {
    const result = originalUpdate.apply(this, args);
    refresh();
    return result;
  };
  control.updateLoadButton = updated;
  const activate = async event => {
    event.preventDefault(); event.stopPropagation();
    if (disposed || !available() || !['idle', 'ready', 'cancelled'].includes(flow.state.phase)) return;
    const selected = { ...control.getSelectedSaveGameInfo() };
    const preparing = flow.prepare(selected);
    refresh();
    const ready = await preparing;
    if (disposed || !sameSave(selected, control.getSelectedSaveGameInfo())) { flow.cancel(); refresh(); return; }
    refresh();
    if (!ready) { showFailure(flow.state); return; }
    // Callback guards also protect against a stale dialog after selecting a
    // different save or closing the original screen.
    const choose = async action => {
      if (disposed || !sameSave(selected, control.getSelectedSaveGameInfo()) || !available()) { flow.cancel(); return; }
      const pending = action(); refresh();
      const ok = await pending; refresh();
      if (!ok && !disposed) showFailure(flow.state);
    };
    showChoices({
      sourceName: flow.state.sourceName,
      adjust: () => choose(() => flow.adjust()),
      start: () => choose(() => flow.start()),
      cancel: () => { flow.cancel(); refresh(); },
    });
  };
  button.addEventListener('action-activate', activate);
  control.actionButtonsContainer.appendChild(button);
  refresh();
  return {
    button, refresh,
    dispose() {
      disposed = true;
      flow.cancel();
      button.removeEventListener('action-activate', activate);
      button.remove();
      // Do not overwrite a later decorator installed by a different mod.
      if (control.updateLoadButton === updated) control.updateLoadButton = originalUpdate;
    },
  };
}
