// Portable save parser: no Node, filesystem, network, or game API access.
// Callers supply bytes; reading a selected save is a separate integration.

// Keys observed in the native 1.5.0 configuration and checked against the
// game's read-only Configuration.getValues() / Database.makeHash() results.
export const KEYS = Object.freeze({
  game: 2095472973, map: 1411322788, configurationType: 1400171952,
  playerId: -1090494134, randomSeed: 233116467, previousAges: 1108943277,
  majorMemento: -729902373, minorMemento1: -153194360,
  majorMementoValue: 1220780555, minorMemento1Value: 902596067,
  headerContentType: -1391474896, headerVersion: 973424090,
});

const MAX_BYTES = 128 * 1024 * 1024;
const MAX_COLLECTION = 16384;
const MAX_DEPTH = 24;
const signedKey = value => String(value | 0);

export class SaveFormatError extends Error {
  constructor(message, offset) {
    super(`${message}${offset == null ? '' : ` (0x${offset.toString(16)})`}`);
    this.name = 'SaveFormatError';
    this.offset = offset;
  }
}

// Cohtml is not a full browser. Decode strictly without requiring TextDecoder.
function decodeNativeString(bytes, width) {
  const text = [];
  const invalid = () => { throw new SaveFormatError('Invalid string encoding'); };
  for (let i = 0; i < bytes.length;) {
    let value;
    if (width === 2) {
      if (i + 1 >= bytes.length) invalid();
      value = bytes[i] | bytes[i + 1] << 8; i += 2;
      if (value >= 0xd800 && value <= 0xdbff) {
        if (i + 1 >= bytes.length) invalid();
        const low = bytes[i] | bytes[i + 1] << 8; i += 2;
        if (low < 0xdc00 || low > 0xdfff) invalid();
        value = 0x10000 + ((value - 0xd800) << 10) + low - 0xdc00;
      } else if (value >= 0xdc00 && value <= 0xdfff) invalid();
    } else {
      const first = bytes[i++];
      if (first < 0x80) value = first;
      else {
        const count = first >= 0xc2 && first <= 0xdf ? 1 : first >= 0xe0 && first <= 0xef ? 2 : first >= 0xf0 && first <= 0xf4 ? 3 : 0;
        if (!count || i + count > bytes.length) invalid();
        value = first & (0x7f >> count + 1);
        for (let n = 0; n < count; n++) {
          const next = bytes[i++];
          if ((next & 0xc0) !== 0x80) invalid();
          value = value << 6 | next & 0x3f;
        }
        if (value < [0, 0x80, 0x800, 0x10000][count] || value > 0x10ffff || value >= 0xd800 && value <= 0xdfff) invalid();
      }
    }
    text.push(String.fromCodePoint(value));
  }
  return text.join('').replace(/^\uFEFF/, '');
}

class Reader {
  constructor(bytes) {
    this.bytes = bytes;
    this.offset = 0;
    this.nodes = 0;
  }
  fail(message) { throw new SaveFormatError(message, this.offset); }
  take(size) {
    if (!Number.isSafeInteger(size) || size < 0 || size > this.bytes.length - this.offset) this.fail('Truncated data');
    const result = this.bytes.subarray(this.offset, this.offset + size);
    this.offset += size;
    return result;
  }
  u32() { const bytes = this.take(4); return new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true); }
  collectionSize() {
    const count = this.u32();
    if (count > MAX_COLLECTION) this.fail('Collection exceeds limit');
    return count;
  }
  properties(depth = 0) {
    const start = this.offset;
    const count = this.collectionSize();
    const entries = Object.create(null);
    for (let i = 0; i < count; i++) {
      const key = signedKey(this.u32());
      if (Object.hasOwn(entries, key)) this.fail('Duplicate property');
      entries[key] = this.variant(depth + 1);
    }
    return { entries, start, end: this.offset };
  }
  variant(depth) {
    if (depth > MAX_DEPTH || ++this.nodes > 200000) this.fail('Configuration complexity exceeds limit');
    const start = this.offset;
    const type = this.u32(), reserved = this.u32(), descriptor = this.u32(), width = this.u32();
    if (reserved !== 0) this.fail('Unsupported variant flags');
    const count = descriptor & 0xffffff;
    let value;
    if (type === 29 || type === 30) {
      if (width !== 0 || descriptor !== (type === 29 ? 0x01000000 : 0x02000000)) this.fail('Invalid container descriptor');
      value = type === 29 ? this.properties(depth).entries
        : Array.from({ length: this.collectionSize() }, () => this.variant(depth + 1));
    } else if (type === 0) {
      if (descriptor !== 0 || width !== 0 || this.u32() !== 0) this.fail('Invalid empty variant');
      value = null;
    } else if (type === 1) {
      if (descriptor !== 1 || width !== 1) this.fail('Unsupported Boolean layout');
      const boolean = this.u32();
      if (boolean > 1) this.fail('Invalid Boolean');
      value = Boolean(boolean);
    } else if (type === 2 || type === 3) {
      if ((descriptor >>> 24) !== 0x60 || width !== (type === 2 ? 1 : 2)) this.fail('Invalid string layout');
      const data = this.take(count * width);
      if (count && data.subarray(data.length - width).some(v => v !== 0)) this.fail('Unterminated string');
      value = count ? decodeNativeString(data.subarray(0, -width), width) : '';
    } else if ([8, 9, 10, 11, 12, 13].includes(type)) {
      const expectedWidth = [10, 11, 13].includes(type) ? 8 : 4;
      const isArray = [0x40, 0x60].includes(descriptor >>> 24);
      if (width !== expectedWidth || count > MAX_COLLECTION || (!isArray && descriptor !== 1)) this.fail('Unsupported numeric layout');
      const readNumber = () => {
        const bytes = this.take(width);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        if (type === 12 || type === 13) {
          const number = type === 12 ? view.getFloat32(0, true) : view.getFloat64(0, true);
          if (!Number.isFinite(number)) this.fail('Non-finite setting');
          return number;
        }
        if (width === 8) return (type === 11 ? view.getBigInt64(0, true) : view.getBigUint64(0, true)).toString();
        return type === 9 ? view.getInt32(0, true) : view.getUint32(0, true);
      };
      const values = Array.from({ length: count }, readNumber);
      value = descriptor === 1 ? values[0] : values;
    } else if ([17, 32].includes(type)) {
      // Coordinates and GUIDs are retained losslessly, never guessed as numbers.
      if (descriptor !== 0x40000001 || width !== (type === 17 ? 8 : 16)) this.fail('Unsupported native value');
      value = { nativeBytes: Array.from(this.take(width), byte => byte.toString(16).padStart(2, '0')).join('') };
    } else {
      this.fail(`Unsupported variant type ${type}`);
    }
    return { type, descriptor, width, value, start, end: this.offset };
  }
  expect(value, name) { if (this.u32() !== value) this.fail(`Unsupported ${name}`); }
  options() {
    for (const value of [1, 0, 1, 0]) this.expect(value, 'options preamble');
    return this.properties();
  }
}

export function property(bag, key) { return bag.entries[signedKey(key)]?.value; }
export function objectProperty(bag, key) {
  const node = bag.entries[signedKey(key)];
  if (node?.type !== 29) throw new SaveFormatError(`Missing configuration object ${key}`);
  return { entries: node.value, start: node.start, end: node.end };
}

/** Read only the native header/configuration section. Never inflate gameplay. */
export function parseNativeSave(input) {
  if (!(input instanceof Uint8Array) && !(input instanceof ArrayBuffer)) throw new SaveFormatError('Expected save bytes');
  if (input.byteLength > MAX_BYTES) throw new SaveFormatError('Save exceeds size limit');
  const bytes = new Uint8Array(input instanceof ArrayBuffer ? input.slice(0) : input);
  const reader = new Reader(bytes);
  if (String.fromCharCode(...reader.take(4)) !== 'CIV7') throw new SaveFormatError('Not a Civilization VII file', 0);
  reader.expect(1, 'file version');
  const header = reader.properties();
  const version = property(header, KEYS.headerVersion);
  if (typeof version !== 'string' || !/^1\.5\.0(?:\s|$)/.test(version)) reader.fail('Only Civilization VII 1.5.0 is verified');
  const contentType = property(header, KEYS.headerContentType);
  if (![0, 1].includes(contentType)) reader.fail('Only normal saves and setup configurations are supported');
  reader.expect(42, 'configuration serializer version');
  reader.expect(1, 'user configuration version');
  const userOptions = reader.properties();
  reader.expect(1, 'configuration root version');
  const current = reader.properties();
  const gameplayOptions = reader.options();
  const initial = contentType === 0 ? reader.properties() : current;
  const networkOptions = reader.options();
  const configEnd = reader.offset;
  objectProperty(initial, KEYS.game);
  objectProperty(initial, KEYS.map);
  if (contentType === 1 && configEnd !== bytes.length) reader.fail('Unexpected trailing configuration data');
  if (contentType === 0) {
    // The native chunked zlib payload starts here. It must exist, but is never
    // decompressed or executed. Truncated/corrupt headers cannot be exported.
    const chunkLength = reader.u32();
    if (chunkLength < 2 || chunkLength > 65536 || chunkLength > bytes.length - reader.offset) reader.fail('Missing gameplay payload');
    const zlib = reader.take(2);
    if (zlib[0] !== 0x78 || ((zlib[0] << 8) + zlib[1]) % 31 !== 0) reader.fail('Invalid gameplay payload marker');
  }
  return { bytes, version, contentType, header, userOptions, current, initial, gameplayOptions, networkOptions, configEnd };
}

function plainValue(node) {
  if (node.type === 29) return plainProperties({ entries: node.value });
  if (node.type === 30) return node.value.map(plainValue);
  return node.value;
}
export function plainProperties(bag) {
  return Object.fromEntries(Object.entries(bag.entries).map(([key, node]) => [key, plainValue(node)]));
}

/** Preserve the typed snapshot as well as readable values. No source is edited. */
export function extractSetupValues(parsed, { scope = 'campaign' } = {}) {
  if (!['campaign', 'age'].includes(scope)) throw new Error('Scope must be campaign or age');
  const game = objectProperty(parsed.initial, KEYS.game);
  const map = objectProperty(parsed.initial, KEYS.map);
  const previousAges = property(game, KEYS.previousAges) ?? [];
  if (!Array.isArray(previousAges)) throw new SaveFormatError('Invalid previous-age history');
  if (scope === 'campaign' && previousAges.length) {
    throw new SaveFormatError('This save retains the current age setup, not the original campaign setup. Select a save from the starting age; --scope age is inspection only.');
  }
  const players = Object.values(parsed.initial.entries)
    .filter(node => node.type === 29 && node.value[signedKey(KEYS.playerId)])
    .map(node => ({
      id: node.value[signedKey(KEYS.playerId)].value,
      values: plainProperties({ entries: node.value }),
    })).sort((a, b) => a.id - b.id);
  if (!players.length) throw new SaveFormatError('No player setup found');
  const playerIds = new Set();
  for (const { id } of players) {
    if (!Number.isInteger(id) || id < 0 || id > 63 || playerIds.has(id)) throw new SaveFormatError('Invalid or duplicate player slot');
    playerIds.add(id);
  }
  const seed = bag => {
    const number = property(bag, KEYS.randomSeed);
    if (!Number.isInteger(number) || number < -2147483648 || number > 4294967295) throw new SaveFormatError('Missing or invalid seed');
    return number >>> 0;
  };
  return {
    schemaVersion: 1,
    gameVersion: parsed.version,
    scope: previousAges.length ? 'age' : 'campaign',
    originalCampaignAvailable: previousAges.length === 0,
    previousAges,
    seeds: { game: seed(game), map: seed(map) },
    game: plainProperties(game), map: plainProperties(map), players,
  };
}
