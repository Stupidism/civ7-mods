const isBag = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const is32Bit = value => Number.isInteger(value) && value >= -2147483648 && value <= 4294967295;

/** Strict comparison: no ignored settings, implicit defaults or allowed diffs. */
export function compareConfiguration(expected, actual) {
  if (expected?.schemaVersion !== 1 || !isBag(expected.game) || !isBag(expected.map) || !Array.isArray(expected.players)) throw new Error('Invalid expected configuration');
  const differences = [];
  let checkedValues = 0;
  const difference = (path, kind) => differences.push({ path, kind });
  if (expected.scope !== 'campaign') difference('scope', 'not-original-campaign');
  for (const key of expected.unexposedRootKeys ?? []) difference(`root.${key}`, 'not-exposed-by-runtime');
  if (actual?.schemaVersion !== 1) difference('schemaVersion', 'unsupported-snapshot');
  if (actual?.inShell !== true || actual?.isGameStarted !== false) difference('context', 'not-idle-shell');

  function scalar(node, value, path) {
    checkedValues++;
    // Native 32-bit integers can be returned signed by the JavaScript bridge.
    if ([8, 9].includes(node.type)) {
      if (!is32Bit(value) || (node.value >>> 0) !== (value >>> 0)) difference(path, 'changed');
    } else if ([10, 11].includes(node.type)) {
      // Never round an unsafe number into a seemingly equal 64-bit integer.
      const observed = typeof value === 'bigint' ? value.toString()
        : Number.isSafeInteger(value) ? String(value) : value;
      if (typeof observed !== 'string' || node.value !== observed) difference(path, 'changed-or-lossy-integer');
    } else if ([17, 32].includes(node.type)) {
      // Opaque native values require a separately verified bridge mapping.
      difference(path, 'opaque-native-value');
    } else if (![0, 1, 2, 3, 12, 13].includes(node.type)) {
      difference(path, 'unsupported-type');
    } else if (!Object.is(node.value, value)) difference(path, 'changed');
  }
  function variant(node, value, path) {
    if (node.type === 29) return bag(node.value, value, path);
    if (node.type === 30) {
      if (!Array.isArray(value)) return difference(path, 'changed-type');
      if (node.value.length !== value.length) difference(path, 'changed-length');
      node.value.forEach((child, index) => variant(child, value[index], `${path}[${index}]`));
    } else if ([8, 9, 10, 11, 12, 13].includes(node.type) && node.descriptor !== 1) {
      if (!Array.isArray(value)) return difference(path, 'changed-type');
      if (node.value.length !== value.length) difference(path, 'changed-length');
      node.value.forEach((item, index) => scalar({ ...node, value: item }, value[index], `${path}[${index}]`));
    } else scalar(node, value, path);
  }
  function bag(wanted, observed, path) {
    if (!isBag(observed)) return difference(path, 'missing-object');
    for (const [key, node] of Object.entries(wanted)) {
      if (!Object.hasOwn(observed, key)) difference(`${path}.${key}`, 'missing');
      else variant(node, observed[key], `${path}.${key}`);
    }
    for (const key of Object.keys(observed)) {
      if (!Object.hasOwn(wanted, key)) difference(`${path}.${key}`, 'extra');
    }
  }
  bag(expected.game, actual?.game, 'game');
  bag(expected.map, actual?.map, 'map');
  const observedPlayers = new Map();
  for (const player of actual?.players ?? []) {
    if (!Number.isInteger(player.id) || player.id < 0 || player.id > 63 || observedPlayers.has(player.id)) {
      difference('players', 'invalid-or-duplicate-slot');
    } else observedPlayers.set(player.id, player.values);
  }
  const expectedIds = new Set();
  for (const player of expected.players) {
    if (!Number.isInteger(player.id) || player.id < 0 || player.id > 63 || expectedIds.has(player.id)) throw new Error('Invalid expected player slot');
    expectedIds.add(player.id);
    bag(player.values, observedPlayers.get(player.id), `players[${player.id}]`);
  }
  for (const id of observedPlayers.keys()) {
    if (!expectedIds.has(id)) difference(`players[${id}]`, 'extra-slot');
  }
  return { matches: differences.length === 0 && checkedValues > 0, checkedValues, differences };
}
