// Pure normalization plus injected read-only access. No game globals at import.
export function captureConfiguration(runtime) {
  const names = Object.create(null);
  let nodes = 0;
  function normalize(value, depth = 0) {
    if (++nodes > 200000 || depth > 24) throw new Error('Snapshot exceeds complexity limit');
    // The live bridge exposes unset fields (e.g. local mod subscription IDs)
    // as undefined. Preserve their presence across JSON without treating them
    // as null, missing, or a known native value. Strict comparison still fails.
    if (value === undefined) return { $runtimeValue: 'undefined' };
    if (typeof value === 'bigint') return value.toString();
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return value.map(item => normalize(item, depth + 1));
    if (!value || typeof value !== 'object') throw new Error('Unsupported runtime configuration value');
    const result = Object.create(null);
    for (const [name, item] of Object.entries(value)) {
      const numeric = /^-?\d+$/.test(name) ? Number(name) : runtime.Database.makeHash(name);
      if (!Number.isInteger(numeric) || numeric < -2147483648 || numeric > 4294967295) throw new Error('Invalid configuration key');
      const key = String(numeric | 0);
      if (Object.hasOwn(result, key)) throw new Error(`Duplicate configuration key ${key}`);
      if (!/^-?\d+$/.test(name)) names[key] = name;
      result[key] = normalize(item, depth + 1);
    }
    return result;
  }
  return {
    schemaVersion: 1,
    inShell: runtime.UI.isInShell(),
    isGameStarted: runtime.Configuration.getGame().isGameStarted,
    game: normalize(runtime.Configuration.getGame().getValues()),
    map: normalize(runtime.Configuration.getMap().getValues()),
    players: Array.from({ length: 64 }, (_, id) => ({ id, values: normalize(runtime.Configuration.getPlayer(id).getValues()) })),
    keyNames: names,
  };
}
