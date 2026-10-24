import { captureConfiguration } from '../ui/configuration-snapshot.js';

const inFlight = new WeakSet();
const unresolved = new WeakSet();

/**
 * Manual development experiment, not an installed mod or an automatic probe.
 * Tests whether the STOCK configuration-load operation accepts a selected
 * ordinary save. It changes frontend configuration and needs a disposable
 * main-menu session. Importing this file performs no game operations.
 */
export async function probeConfigurationLoad(runtime, save, { allowNativeLoad = false, timeoutMs = 10000 } = {}) {
  const { UI, Configuration, Network, SaveLocations, SaveTypes, SaveFileTypes, ServerType, SerializerResult, engine } = runtime;
  if (!allowNativeLoad) throw new Error('This experiment requires an explicitly approved main-menu test');
  if (UI.isInShell() !== true || Configuration.getGame().isGameStarted !== false) throw new Error('Refusing to probe during a game');
  if (save?.location !== SaveLocations.LOCAL_STORAGE || save.type !== SaveTypes.SINGLE_PLAYER ||
      ![SaveFileTypes.GAME_STATE, SaveFileTypes.GAME_CONFIGURATION].includes(save.contentType) ||
      typeof save.fileName !== 'string' || !save.fileName || save.isDirectory || save.isCurrentGame) {
    throw new Error('Select an existing local single-player save or configuration from the native list');
  }
  if (save.missingMods?.length || save.unownedMods?.length) throw new Error('Required content is unavailable');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new Error('Invalid timeout');
  if (inFlight.has(Network) || unresolved.has(Network)) throw new Error('Previous native load is pending or unresolved; do not retry');
  const snapshot = () => captureConfiguration(runtime);
  const before = snapshot();
  const request = {
    Location: save.location, LocationCategories: save.locationCategories,
    Type: save.type, ContentType: SaveFileTypes.GAME_CONFIGURATION,
    FileName: save.fileName, DisplayName: save.displayName,
    Slot: save.slot, AdditionalInfo: save.additionalInfo,
  };
  return new Promise((resolve, reject) => {
    let timer;
    let settled = false;
    let listening = false;
    let nativeInvoked = false;
    const cleanup = () => {
      clearTimeout(timer);
      if (listening) { engine.off('LoadComplete', onLoadComplete); listening = false; }
      inFlight.delete(Network);
    };
    const finish = (status, result) => {
      if (settled) return;
      settled = true;
      if (status === 'indeterminate-timeout') unresolved.add(Network);
      cleanup();
      try {
        if (UI.isInShell() !== true || Configuration.getGame().isGameStarted !== false) {
          unresolved.add(Network);
          resolve({ status: 'unexpected-context', result, request, before, after: null });
        } else resolve({ status, result, request, before, after: snapshot() });
      }
      catch (error) { reject(error); }
    };
    const onLoadComplete = ({ result }) => {
      if (result === SerializerResult.RESULT_PENDING) return;
      finish(result === SerializerResult.RESULT_OK ? 'loaded-needs-comparison' : 'rejected', result);
    };
    try {
      if (UI.isInShell() !== true || Configuration.getGame().isGameStarted !== false) throw new Error('Refusing to probe during a game');
      inFlight.add(Network);
      engine.on('LoadComplete', onLoadComplete);
      listening = true;
      timer = setTimeout(() => finish('indeterminate-timeout'), timeoutMs);
      // Deliberately no GAME_STATE load, hostGame, restartGame, file URL, retry,
      // save, or exit call. A successful event alone does NOT prove equivalence.
      nativeInvoked = true;
      if (!Network.loadGame(request, ServerType.SERVER_TYPE_NONE)) finish('not-accepted');
    } catch (error) {
      if (!settled) {
        settled = true;
        if (nativeInvoked) unresolved.add(Network);
        cleanup(); reject(error);
      }
    }
  });
}
