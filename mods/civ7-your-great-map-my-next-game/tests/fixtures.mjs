import { KEYS } from '../tools/native-save.mjs';

export function u32(value) { const b = Buffer.alloc(4); b.writeUInt32LE(value >>> 0); return b; }
const join = parts => Buffer.concat(parts);
export function variant(type, value) {
  const head = descriptor => join([u32(type), u32(0), u32(descriptor)]);
  if (type === 29) return join([head(0x01000000), u32(0), bag(value)]);
  if (type === 30) return join([head(0x02000000), u32(0), u32(value.length), ...value]);
  if (type === 0) return join([head(0), u32(0), u32(0)]);
  if (type === 1) return join([head(1), u32(1), u32(value ? 1 : 0)]);
  if (type === 2 || type === 3) {
    const width = type === 2 ? 1 : 2;
    const data = value === '' ? Buffer.alloc(0) : Buffer.from(value + '\0', type === 2 ? 'utf8' : 'utf16le');
    return join([head(0x60000000 | data.length / width), u32(width), data]);
  }
  if (type === 17 || type === 32) return join([head(0x40000001), u32(value.length), value]);
  const width = [10, 11, 13].includes(type) ? 8 : 4;
  const isArray = Array.isArray(value), values = isArray ? value : [value];
  const data = values.map(v => {
    const b = Buffer.alloc(width);
    if (type === 12) b.writeFloatLE(v);
    else if (type === 13) b.writeDoubleLE(v);
    else if (type === 10) b.writeBigUInt64LE(BigInt(v));
    else if (type === 11) b.writeBigInt64LE(BigInt(v));
    else b.writeUInt32LE(v >>> 0);
    return b;
  });
  return join([head(isArray ? 0x60000000 | values.length : 1), u32(width), ...data]);
}
export function bag(entries) {
  return join([u32(entries.length), ...entries.flatMap(([key, value]) => [u32(key), value])]);
}
const options = () => join([u32(1), u32(0), u32(1), u32(0), bag([])]);

export function fixture({ laterAge = false, configOnly = false, version = '1.5.0 (1311346)', custom = [] } = {}) {
  const game = [
    [KEYS.randomSeed, variant(8, 3768267027)],
    [101, variant(2, laterAge ? 'AGE_EXPLORATION' : 'AGE_ANTIQUITY')],
    [102, variant(11, '-9223372036854775800')],
    ...custom,
  ];
  if (laterAge) game.push([KEYS.previousAges, variant(9, [2077444219])]);
  const makeConfig = (leader, memento) => bag([
    [KEYS.game, variant(29, game)],
    [KEYS.map, variant(29, [[KEYS.randomSeed, variant(9, -526700245)]])],
    [104, variant(29, [
      [KEYS.playerId, variant(8, 0)],
      [105, variant(2, leader)],
      [KEYS.majorMemento, variant(2, memento)],
      [KEYS.minorMemento1, variant(2, 'MEMENTO_FOUNDATION_IMAGO_MUNDI')],
    ])],
    [106, variant(29, [[KEYS.playerId, variant(8, 1)], [105, variant(2, leader === 'RANDOM' ? 'RANDOM' : 'LEADER_AMINA')]])],
  ]);
  const initial = makeConfig('RANDOM', 'MEMENTO_FOUNDATION_TRAVELS_MARCO_POLO');
  const current = makeConfig('LEADER_ISABELLA', 'MEMENTO_CURRENT_AGE');
  return {
    initial,
    bytes: join([
      Buffer.from('CIV7'), u32(1), bag([
        [KEYS.headerContentType, variant(8, configOnly ? 1 : 0)],
        [KEYS.headerVersion, variant(2, version)],
        [107, variant(3, '测试存档')],
      ]),
      u32(42), u32(1), bag([]), u32(1), configOnly ? initial : current,
      options(), ...(configOnly ? [] : [initial]), options(),
      ...(configOnly ? [] : [u32(2), Buffer.from([0x78, 0x9c])]),
    ]),
  };
}
