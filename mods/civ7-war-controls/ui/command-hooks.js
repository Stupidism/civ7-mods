// Preserve native receivers, arguments, returns and exceptions. Only redirect
// requests made inside the native right-click handler, after mode cancellation.
export function installCommandHooks({ worldInput, handlers, tryJoin, tryReinforce }) {
  const previousRight = worldInput.actionMouseRightButton;
  const previousMove = worldInput.requestMoveOperation;
  const previousAction = handlers.switchToActionInterfaceMode;
  let active = true;
  let rightDepth = 0;
  function right(...args) {
    rightDepth++;
    try { return previousRight.apply(this, args); }
    finally { rightDepth--; }
  }
  function move(...args) {
    if (active && rightDepth > 0 && tryJoin(args[0], args[1])) return true;
    return previousMove.apply(this, args);
  }
  function action(...args) {
    if (active && args[0] === 'UNITOPERATION_REINFORCE_ARMY' && tryReinforce(args[1])) return;
    return previousAction.apply(this, args);
  }
  function dispose() {
    active = false;
    if (worldInput.actionMouseRightButton === right) worldInput.actionMouseRightButton = previousRight;
    if (worldInput.requestMoveOperation === move) worldInput.requestMoveOperation = previousMove;
    if (handlers.switchToActionInterfaceMode === action) handlers.switchToActionInterfaceMode = previousAction;
  }
  try {
    worldInput.actionMouseRightButton = right;
    worldInput.requestMoveOperation = move;
    handlers.switchToActionInterfaceMode = action;
    if (worldInput.actionMouseRightButton !== right || worldInput.requestMoveOperation !== move || handlers.switchToActionInterfaceMode !== action) throw new Error('Native command hooks are not writable');
  } catch (error) {
    dispose();
    throw error;
  }
  return dispose;
}

// UnitActions queues realizeFocus after its 150 ms entrance animation and on
// later operation refreshes. Auto targeting has already handed focus to the
// map by then. Suppress only that panel's automatic refocus for our live target;
// normal controller navigation and manually chosen actions keep native routing.
export function installAutoTargetFocus({ panelPrototype, preserveWorldFocus }) {
  const previous = panelPrototype?.realizeFocus;
  if (typeof previous !== 'function') throw new Error('Native UnitActions.realizeFocus is unavailable');
  let active = true;
  function realizeFocus(...args) {
    if (active && preserveWorldFocus(this.unitId)) return;
    return previous.apply(this, args);
  }
  panelPrototype.realizeFocus = realizeFocus;
  return () => {
    active = false;
    if (panelPrototype.realizeFocus === realizeFocus) panelPrototype.realizeFocus = previous;
  };
}
