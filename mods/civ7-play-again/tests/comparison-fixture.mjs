import { fixture } from './fixtures.mjs';
import { parseNativeSave, plainProperties, KEYS } from '../tools/native-save.mjs';
import { expectedConfiguration } from '../tools/expected-configuration.mjs';

export function comparisonFixture(options) {
  const parsed = parseNativeSave(fixture(options).bytes);
  const expected = expectedConfiguration(parsed);
  const values = plainProperties(parsed.initial);
  const actual = {
    schemaVersion: 1, inShell: true, isGameStarted: false,
    game: values[KEYS.game], map: values[KEYS.map],
    players: expected.players.map(({ id }) => ({ id, values: Object.values(values).find(v => v?.[KEYS.playerId] === id) })),
  };
  return { expected, actual, parsed };
}

