import { compareConfiguration } from './compare-configuration.js';

const K = { guidHi: 835848809, guidLo: -1126340008, subscription: -794177489, team: -1691486498, networkName: 653353248, password: -974059220 };

/** Explicit bridge equivalences observed in 1.5.0's stock config loader.
 * No gameplay options, seeds, mementos, mod IDs or mod versions are ignored.
 */
export function compareImportedConfiguration(expected, actual) {
  const adjusted = JSON.parse(JSON.stringify(actual));
  const normalizations = [];
  const undefinedValue = value => value?.$runtimeValue === 'undefined' && Object.keys(value).length === 1;
  function fixBag(wanted, observed, path) {
    if (!observed || typeof observed !== 'object') return;
    for (const [key, node] of Object.entries(wanted)) {
      const value = observed[key];
      if (node.type === 29) fixBag(node.value, value, `${path}.${key}`);
      else if (node.type === 30 && Array.isArray(value)) node.value.forEach((child, i) => {
        if (child.type === 29) fixBag(child.value, value[i], `${path}.${key}[${i}]`);
      });
      const emptyModId = Number(key) === K.subscription && /^game\.(-1083566479|-1259988885)\[\d+\]$/.test(path);
      const emptyPlayerMetadata = [K.networkName, K.password].includes(Number(key)) && /^players\[\d+\]$/.test(path);
      if (node.value === '' && undefinedValue(value) && (emptyModId || emptyPlayerMetadata)) {
        observed[key] = ''; normalizations.push({ path: `${path}.${key}`, reason: 'empty-string-bridge' });
      }
    }
  }
  fixBag(expected.game, adjusted.game, 'game');
  for (const key of [K.guidHi, K.guidLo]) {
    const node = expected.game[key], value = adjusted.game?.[key];
    // Stock configuration loading generates a NEW campaign identity. It is
    // not a map/game seed. Require a valid native 64-bit value, then exclude
    // only these two identity fields from setup equivalence.
    if (node && [10, 11].includes(node.type) && typeof value === 'string' && /^-?\d+$/.test(value)) {
      const number = BigInt(value);
      const valid = node.type === 10 ? number >= 0n && number <= 18446744073709551615n : number >= -9223372036854775808n && number <= 9223372036854775807n;
      if (valid) { adjusted.game[key] = node.value; normalizations.push({ path: `game.${key}`, reason: 'new-campaign-identity' }); }
    }
  }
  for (const player of expected.players) {
    const values = adjusted.players?.find(p => p.id === player.id)?.values;
    fixBag(player.values, values, `players[${player.id}]`);
    const team = player.values[K.team];
    if (team && [8, 9].includes(team.type) && (team.value >>> 0) === 0xffffffff && values?.[K.team] === player.id) {
      values[K.team] = team.value; normalizations.push({ path: `players[${player.id}].${K.team}`, reason: 'unassigned-free-for-all-team' });
    }
  }
  return { ...compareConfiguration(expected, adjusted), normalizations };
}
