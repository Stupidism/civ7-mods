import { compareConfiguration } from './compare-configuration.js';

/**
 * Product flow with injected engine boundaries. No default native adapter is
 * provided until ordinary-save configuration loading has passed real QA.
 */
export function createPlayAgainFlow({ prepare, readCurrent, openEditor, startGame, canUseShell, onChange = () => {} }) {
  for (const fn of [prepare, readCurrent, openEditor, startGame, canUseShell, onChange]) {
    if (typeof fn !== 'function') throw new Error('All flow adapters are required');
  }
  let state = { phase: 'idle' };
  let expected;
  let cancelled = false;
  const publish = next => { state = Object.freeze(next); onChange(state); return state; };
  const requireShell = () => { if (canUseShell() !== true) throw new Error('No idle main-menu session'); };
  const fail = error => publish({ ...state, phase: 'failed', error: String(error?.message ?? error) });
  const blocked = comparison => publish({ ...state, phase: 'blocked', comparison });

  async function continueAs(action) {
    if (state.phase !== 'ready') return false;
    publish({ ...state, phase: 'checking' });
    try {
      requireShell();
      const comparison = compareConfiguration(expected, await readCurrent());
      if (cancelled) { publish({ phase: 'cancelled' }); return false; }
      requireShell();
      if (!comparison.matches) { blocked(comparison); return false; }
      // Claim the operation before invoking the adapter: repeated activation
      // cannot schedule a second game, even when callbacks are synchronous.
      publish({ ...state, phase: action === 'edit' ? 'opening-editor' : 'starting' });
      const accepted = action === 'edit' ? await openEditor() : await startGame();
      if (accepted === false) throw new Error(action === 'edit' ? 'Editor refused to open' : 'Game start was refused');
      publish({ ...state, phase: action === 'edit' ? 'editing' : 'start-requested' });
      return true;
    } catch (error) { fail(error); return false; }
  }

  return {
    get state() { return state; },
    async prepare(save) {
      if (!['idle', 'ready', 'cancelled'].includes(state.phase)) return false;
      cancelled = false;
      expected = undefined;
      // Retain only display identity. Never serialize an engine object or send
      // account metadata to a view or remote service.
      publish({ phase: 'preparing', sourceName: String(save?.displayName ?? '') });
      try {
        requireShell();
        const result = await prepare(save);
        if (cancelled) { publish({ phase: 'cancelled' }); return false; }
        requireShell();
        // Own the oracle; later mutation of an adapter's result cannot turn a
        // changed seed/memento into an allowed change before direct start.
        expected = JSON.parse(JSON.stringify(result.expected));
        const comparison = compareConfiguration(expected, result.loaded);
        if (!comparison.matches) { blocked(comparison); return false; }
        publish({ ...state, phase: 'ready', comparison });
        return true;
      } catch (error) { fail(error); return false; }
    },
    adjust: () => continueAs('edit'),
    start: () => continueAs('start'),
    cancel() {
      if (['starting', 'start-requested', 'opening-editor', 'editing'].includes(state.phase)) return false;
      cancelled = true;
      if (!['preparing', 'checking'].includes(state.phase)) publish({ phase: 'cancelled' });
      return true;
    },
  };
}
