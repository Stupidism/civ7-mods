import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture, variant, u32 } from './fixtures.mjs';
import { parseNativeSave, extractSetup, plainProperties, property, KEYS } from '../tools/native-save.mjs';
import { inspectFile } from '../tools/inspect-save.mjs';

test('extracts original selections, not the realized leader and current memento', () => {
  const { bytes, initial } = fixture();
  const parsed = parseNativeSave(bytes), result = extractSetup(parsed);
  assert.equal(result.players[0].values['105'], 'RANDOM');
  assert.equal(result.players[1].values['105'], 'RANDOM');
  assert.equal(result.players[0].values[String(KEYS.majorMemento)], 'MEMENTO_FOUNDATION_TRAVELS_MARCO_POLO');
  assert.equal(result.players[0].values[String(KEYS.minorMemento1)], 'MEMENTO_FOUNDATION_IMAGO_MUNDI');
  assert.deepEqual(result.seeds, { game: 3768267027, map: 3768267051 });
  assert.deepEqual(Buffer.from(result.nativeConfiguration.data, 'base64'), initial);
  assert.equal(result.nativeConfiguration.sha256, createHash('sha256').update(initial).digest('hex'));
});

test('keeps integer precision and unknown mod properties', () => {
  const custom = [
    [200, variant(30, [variant(2, ''), variant(29, [[201, variant(1, true)]])])],
    [202, variant(9, [-1, 2, -3])], [203, variant(12, 0.5)],
    [204, variant(17, Buffer.alloc(8, 7))], [205, variant(32, Buffer.alloc(16, 8))],
    [206, variant(0, null)], [207, variant(3, '纪念物')],
  ];
  const setup = extractSetup(parseNativeSave(fixture({ custom }).bytes));
  assert.equal(setup.game['102'], '-9223372036854775800');
  assert.deepEqual(setup.game['200'], ['', { 201: true }]);
  assert.deepEqual(setup.game['202'], [-1, 2, -3]);
  assert.equal(setup.game['203'], 0.5);
  assert.deepEqual(setup.game['204'], { nativeBytes: '0707070707070707' });
  assert.equal(setup.game['206'], null);
  assert.equal(setup.game['207'], '纪念物');
});

test('refuses to mislabel a later age as the original campaign', () => {
  const parsed = parseNativeSave(fixture({ laterAge: true }).bytes);
  assert.throws(() => extractSetup(parsed), /current age setup/);
  const result = extractSetup(parsed, { scope: 'age' });
  assert.equal(result.originalCampaignAvailable, false);
  assert.equal(result.scope, 'age');
  assert.deepEqual(result.previousAges, [2077444219]);
});

test('reads native configuration files without a gameplay payload', () => {
  const parsed = parseNativeSave(fixture({ configOnly: true }).bytes);
  assert.equal(parsed.contentType, 1);
  assert.equal(parsed.current, parsed.initial);
  assert.equal(extractSetup(parsed).players.length, 2);
  assert.equal(property(parsed.header, KEYS.headerVersion), '1.5.0 (1311346)');
  assert.equal(plainProperties(parsed.header)['107'], '测试存档');
});

test('rejects unknown game versions before interpreting their layout', () => {
  assert.throws(() => parseNativeSave(fixture({ version: '1.6.0' }).bytes), /Only Civilization VII 1.5.0/);
});

test('rejects an unsupported serializer version', () => {
  const { bytes } = fixture();
  const parsed = parseNativeSave(bytes);
  bytes.writeUInt32LE(43, parsed.header.end);
  assert.throws(() => parseNativeSave(bytes), /serializer version/);
});

test('rejects truncated structures at every byte of a representative file', () => {
  const { bytes } = fixture();
  for (let length = 0; length < bytes.length; length++) {
    assert.throws(() => parseNativeSave(bytes.subarray(0, length)), `prefix ${length}`);
  }
});

test('rejects duplicate fields instead of accepting overwritten values', () => {
  const bytes = fixture({ custom: [[101, variant(2, 'duplicate')]] }).bytes;
  assert.throws(() => parseNativeSave(bytes), /Duplicate property/);
});

test('rejects duplicate player IDs and out-of-range slots in distinct root objects', () => {
  for (const id of [0, 64, 0xffffffff]) {
    const { bytes } = fixture();
    const parsed = parseNativeSave(bytes);
    bytes.writeUInt32LE(id, parsed.initial.entries[106].value[KEYS.playerId].start + 16);
    assert.throws(() => extractSetup(parseNativeSave(bytes)), /Invalid or duplicate player slot/);
  }
});

test('rejects unfamiliar native variants instead of silently losing settings', () => {
  const unsupported = Buffer.concat([u32(999), u32(0), u32(1), u32(4), u32(0)]);
  assert.throws(() => parseNativeSave(fixture({ custom: [[201, unsupported]] }).bytes), /Unsupported variant/);
});

test('rejects oversized collections and invalid strings', () => {
  const { bytes } = fixture();
  bytes.writeUInt32LE(0xffffffff, 8);
  assert.throws(() => parseNativeSave(bytes), /Collection exceeds/);
  const string = variant(2, 'broken');
  string[string.length - 1] = 65;
  assert.throws(() => parseNativeSave(fixture({ custom: [[201, string]] }).bytes), /Unterminated/);
});

test('rejects invalid Boolean and non-finite numeric values', () => {
  const bool = variant(1, true);
  bool.writeUInt32LE(2, 16);
  assert.throws(() => parseNativeSave(fixture({ custom: [[201, bool]] }).bytes), /Invalid Boolean/);
  assert.throws(() => parseNativeSave(fixture({ custom: [[201, variant(12, NaN)]] }).bytes), /Non-finite/);
});

test('numeric arrays retain their shape and invalid scalar counts fail closed', () => {
  const array = variant(9, [42]);
  for (const flag of [0x40000001, 0x60000001]) {
    array.writeUInt32LE(flag, 8);
    const result = extractSetup(parseNativeSave(fixture({ custom: [[201, array]] }).bytes));
    assert.deepEqual(result.game['201'], [42]);
  }
  array.writeUInt32LE(0, 8);
  assert.throws(() => parseNativeSave(fixture({ custom: [[201, array]] }).bytes), /numeric layout/);
});

test('rejects invalid file signatures and trailing data on a config', () => {
  const { bytes } = fixture(); bytes[0] = 0;
  assert.throws(() => parseNativeSave(bytes), /Not a Civilization/);
  assert.throws(() => parseNativeSave(Buffer.concat([fixture({ configOnly: true }).bytes, u32(1)])), /trailing/);
});

test('inspection cannot overwrite any existing output, including the source or a symlink', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'civ7-setup-test-'));
  try {
    const source = join(dir, 'source.Civ7Save'), output = join(dir, 'setup.json'), alias = join(dir, 'alias.json');
    const { bytes } = fixture();
    await writeFile(source, bytes);
    const result = await inspectFile(source, { output });
    assert.equal(result.originalCampaignAvailable, true);
    assert.equal(JSON.parse(await readFile(output, 'utf8')).players.length, 2);
    await assert.rejects(inspectFile(source, { output: source }), /cannot replace/);
    await assert.rejects(inspectFile(source, { output }), /EEXIST/);
    await symlink(source, alias);
    await assert.rejects(inspectFile(source, { output: alias }), /EEXIST/);
    assert.deepEqual(await readFile(source), bytes);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('later-age inspection fails without creating an output file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'civ7-setup-test-'));
  try {
    const source = join(dir, 'late.Civ7Save'), output = join(dir, 'setup.json');
    await writeFile(source, fixture({ laterAge: true }).bytes);
    await assert.rejects(inspectFile(source, { output }), /current age setup/);
    await assert.rejects(readFile(output), /ENOENT/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
