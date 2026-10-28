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

// Route the same map confirmation used by mouse and controller before native
// ChoosePlot commits. Only automatic targeting sessions belong to this hook.
export function installAutoTargetSwitching({interfaceMode, intercept, hover}) {
  const modes = new Set(['INTERFACEMODE_ADD_TO_ARMY','INTERFACEMODE_REMOVE_FROM_ARMY',
    'INTERFACEMODE_RANGE_ATTACK','INTERFACEMODE_NAVAL_ATTACK','INTERFACEMODE_AIR_ATTACK']);
  const cleanups = [], hooked = new WeakSet();
  let active = true;
  function hook(name,handler) {
    if (!modes.has(name) || !handler || hooked.has(handler) || typeof handler.selectPlot !== 'function') return;
    hooked.add(handler);
    const original = handler.selectPlot;
    const replacement = function(plot,...rest) {
      if (active && intercept(name,this,plot)) return false;
      return original.call(this,plot,...rest);
    };
    if(hover && typeof handler.decorateHover==='function') {
      const previousHover=handler.decorateHover;
      const nextHover=function(plot,...rest) {
        if(active&&hover(name,this,plot))return;
        return previousHover.call(this,plot,...rest);
      };
      handler.decorateHover=nextHover;
      cleanups.push(()=>{if(handler.decorateHover===nextHover)handler.decorateHover=previousHover;});
    }
    handler.selectPlot = replacement;
    cleanups.push(()=>{if(handler.selectPlot===replacement) handler.selectPlot=original;});
  }
  const previousAdd = interfaceMode.addHandler;
  const add = function(name,handler,...rest) {
    const result=previousAdd.call(this,name,handler,...rest);
    if(active) hook(name,handler);
    return result;
  };
  interfaceMode.addHandler=add;
  for(const name of modes) hook(name,interfaceMode.getInterfaceModeHandler(name));
  return ()=>{
    active=false;
    for(const cleanup of cleanups.reverse()) cleanup();
    if(interfaceMode.addHandler===add) interfaceMode.addHandler=previousAdd;
  };
}
