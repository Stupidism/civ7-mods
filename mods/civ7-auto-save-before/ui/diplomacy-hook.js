// One user action may issue several native commands (e.g. respond, then declare
// war). Hold the entire synchronous batch and its cleanup behind one save.
export function installDiplomacyHooks({ operations, operationTypes, deals, dealActions,
  manager, dealPrototype, gate, localPlayer, shouldSave, setTimer, clearTimer }) {
  const types = new Set(Object.keys(operationTypes).filter(name =>
    name.endsWith('_DIPLOMATIC_ACTION') || ['DECLARE_WAR', 'MAKE_PEACE', 'FORM_ALLIANCE',
      'CANCEL_ALLIANCE', 'PAY_TO_AVOID_CALL_TO_ARMS', 'RESPOND_DIPLOMATIC_FIRST_MEET'].includes(name)
  ).map(name => operationTypes[name]));
  const responses = new Set(['PROPOSED', 'ADJUSTED', 'ACCEPTED', 'REJECTED'].map(name => dealActions[name]).filter(value => value !== undefined));
  let active = true, replayDepth = 0, collecting = null, timer = null;
  const hooks = [];
  function wrap(owner, name, handler) {
    const previous = owner?.[name];
    if (typeof previous !== 'function') throw new Error(`Missing diplomacy interface: ${name}`);
    const wrapper = function (...args) {
      return active ? handler(previous, this, args) : previous.apply(this, args);
    };
    owner[name] = wrapper;
    if (owner[name] !== wrapper) throw new Error(`Diplomacy interface is read-only: ${name}`);
    hooks.push({ owner, name, previous, wrapper });
  }
  function protect(call) {
    if (replayDepth || !shouldSave()) return call();
    if (collecting) { collecting.push(call); return; }
    if (gate.busy || gate.env.dialogOpen()) return;
    const batch = [call];
    collecting = batch;
    timer = setTimer(() => { collecting = null; timer = null; }, 0);
    return gate.request(() => {
      // The gate can pass through immediately when the game disallows saving
      // (for example during an age transition). End collection before replay so
      // the caller's subsequent commands/cleanup cannot get stranded in it.
      if (collecting === batch) { clearTimer(timer); timer = null; collecting = null; }
      replayDepth++;
      try {
        let result;
        for (const action of batch) result = action();
        return result;
      }
      finally { replayDepth--; }
    }, true, 'diplomacy');
  }
  function afterRequest(call) {
    if (collecting && !replayDepth) { collecting.push(call); return; }
    return call();
  }
  function dispose() {
    active = false; clearTimer(timer); collecting = null;
    for (const { owner, name, previous, wrapper } of hooks.reverse()) if (owner[name] === wrapper) owner[name] = previous;
  }
  try {
    wrap(operations, 'sendRequest', (original, receiver, args) => {
      if (args[0] !== localPlayer() || !types.has(args[1])) return original.apply(receiver, args);
      // Native operation arguments are JSON-shaped IDs, numbers and flags. The
      // UI may clear/reuse its argument object while the async save is pending.
      const captured = [args[0], args[1], args[2] == null ? args[2] : JSON.parse(JSON.stringify(args[2])), ...args.slice(3)];
      return protect(() => original.apply(receiver, captured));
    });
    wrap(deals, 'sendWorkingDeal', (original, receiver, args) =>
      responses.has(args[1]) ? protect(() => original.apply(receiver, args)) : original.apply(receiver, args));
    // Delay the whole deal handler so its session and working deal survive until
    // the native send. Also covers acceptDeal calling proposeCurrentDeal.
    for (const name of ['proposeCurrentDeal', 'acceptDeal', 'rejectDeal']) {
      wrap(dealPrototype, name, (original, receiver, args) => protect(() => original.apply(receiver, args)));
    }
    for (const name of ['closeCurrentDiplomacyDialog', 'closeCurrentDiplomacyDeal', 'closeCurrentDiplomacyProject']) {
      wrap(manager, name, (original, receiver, args) => afterRequest(() => original.apply(receiver, args)));
    }
    wrap(manager, 'startWarFromMap', (original, receiver, args) => {
      const next = args[1];
      if (typeof next === 'function') args[1] = function (...values) {
        return afterRequest(() => next.apply(this, values));
      };
      return original.apply(receiver, args);
    });
  } catch (error) { dispose(); throw error; }
  return { dispose };
}
