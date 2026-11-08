export function wrapMethod(target, name, around) {
  const previous = target[name];
  if (typeof previous !== 'function') throw new Error(`Missing ${name}`);
  let disposed = false;
  const hook = function (...args) {
    const next = (...values) => previous.apply(this, values.length ? values : args);
    return disposed ? next() : around.call(this, next, ...args);
  };
  target[name] = hook;
  return () => { disposed = true; if (target[name] === hook) target[name] = previous; };
}

export function installDeferredActionHooks(prototype, { choose, render, activate, lookAt }) {
  const undo = [
    wrapMethod(prototype, 'refreshActionButton', function (next, player) {
      const result = next(); const choice = choose(this, player);
      if (choice) render(this, choice); return result;
    }),
    wrapMethod(prototype, 'activateBlockingNotification', function (next) {
      const choice = choose(this); return choice ? activate(this, choice) : next();
    }),
    wrapMethod(prototype, 'updatePlayerFocus', function (next, player) {
      const choice = choose(this, player); return choice ? lookAt(this, choice) : next();
    })
  ];
  return () => undo.reverse().forEach(fn => fn());
}
// Ordinary blockers and units precede card reminders; explicitly deferred
// production follows them all. Null keeps native handling, never permits end-turn.
export function chooseTailAction({ head, items, units, order, isDeferred, kind, tail }) {
  const ordinary = order(items.filter(item => !kind(item)));
  if (head) {
    if (!kind(head) && !isDeferred(head)) return null;
    return ordinary.find(item => !isDeferred(item)) ?? (units ? { units: true } : tail() ?? ordinary[0]) ?? null;
  }
  return units ? null : tail();
}

// v1: only these two capabilities may register. One native writer per UI realm.
// The last lease owns teardown; an old release cannot remove a newer service.
export function createTurnOrderRegistry(createService, onEmpty) {
  const providers = new Map();
  let disposed = false;
  const service = createService(kind => providers.get(kind)?.provider);
  function register(kind, createProvider) {
    if (disposed) throw new Error('Turn-order service disposed');
    if (!['settlement', 'cards'].includes(kind)) throw new Error('Unknown turn-order capability');
    if (providers.has(kind)) throw new Error('Turn-order capability already registered: ' + kind);
    const provider = createProvider(service.context);
    const lease = { provider, dispose() {
      if (providers.get(kind) !== lease) return;
      providers.delete(kind);
      try { provider.dispose?.(); } finally {
        if (!providers.size) dispose(); else service.refresh();
      }
    } };
    providers.set(kind, lease); service.refresh();
    return lease;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    const leases = [...providers.values()]; providers.clear();
    try { for (const lease of leases) lease.provider.dispose?.(); }
    finally { service.dispose(); onEmpty(); }
  }
  return { version: 1, register, dispose };
}

// A facade over the stable v1 `cards` lease: the native writer does not change.
// This also works when an older settlement release created the v1 registry first.
export function createCardDomainRegistry(registry) {
  const providers = new Map();
  const previousRegister = registry.register;
  let context, stopped = false;
  const composite = {
    kind(item) { for (const p of providers.values()) { const value = p.provider.kind(item); if (value) return value; } },
    rank(item) { for (const p of providers.values()) if (p.provider.kind(item)) return p.provider.rank?.(item) ?? 0; return 0; },
    active(fresh) { return [...providers.values()].flatMap(p => p.provider.active(fresh)); },
    tail(items) {
      const resources = providers.get('resources')?.provider;
      const order = resources?.deferred?.() ? ['policies', 'resources'] : ['resources', 'policies'];
      return order.map(key => providers.get(key)?.provider.tail(items)).filter(Boolean)
        .sort((a,b) => (a.deferRank ?? 0) - (b.deferRank ?? 0))[0] ?? null;
    },
    open(choice) { providers.get(choice.card)?.provider.open(choice); },
    dispose() {
      if (stopped) return; stopped = true;
      const leases = [...providers.values()]; providers.clear();
      for (const lease of leases) lease.provider.dispose?.();
      if (registry.register === gate) registry.register = previousRegister;
      if (registry.cardDomains === api) delete registry.cardDomains;
    }
  };
  // Old AO 0.1.0 can load after either new owner. Its entry still gets an
  // idempotent lease, but cannot install a second reminder/input provider.
  function gate(kind, factory) {
    return kind === 'cards' ? { dispose() {} } : previousRegister.call(registry, kind, factory);
  }
  const base = (registry.registerSharedCards ?? previousRegister).call(registry, 'cards', value => { context = value; return composite; });
  registry.register = gate;
  const api = { register(kind, factory) {
    if (stopped) throw new Error('Card domains disposed');
    if (!['resources', 'policies'].includes(kind)) throw new Error('Unknown card domain');
    if (providers.has(kind)) throw new Error('Card domain already registered: ' + kind);
    let provider;
    try { provider = factory(context); }
    catch (error) { if (!providers.size) base.dispose(); throw error; }
    const lease = { provider, dispose() {
      if (providers.get(kind) !== lease) return;
      providers.delete(kind);
      try { provider.dispose?.(); }
      finally { if (!providers.size) base.dispose(); else context.refresh(); }
    } };
    providers.set(kind, lease); context.refresh(); return lease;
  } };
  return api;
}

// The native Close owns the frame, corner and device size. Keep the independent
// skip action beside it, including when Close is hidden for controller input.
export function anchorSkipToClose(control, close) {
  if (!close?.parentElement) return;
  if (control.parentElement !== close.parentElement) close.parentElement.appendChild(control);
  for (const name of ['absolute','top-1','top-5','top-10','right-1','right-4','right-10','size-12','size-16']) {
    const wanted = close.classList.contains(name);
    if (wanted !== control.classList.contains(name)) control.classList.toggle(name, wanted);
  }
}
