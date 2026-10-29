import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture, variant } from './fixtures.mjs';
import { parseNativeSave, extractSetup, plainProperties, KEYS } from '../tools/native-save.mjs';
import { exportConfiguration, exportConfigurationFile, CONFIG_KEYS } from '../tools/export-config.mjs';

test('exports initial setup as a native configuration, preserving unknown variants byte for byte', () => {
  const source = fixture({ custom: [[200, variant(32, Buffer.alloc(16, 7))]] });
  const original = Buffer.from(source.bytes);
  const result = exportConfiguration(source.bytes);
  const parsed = parseNativeSave(result.bytes);
  assert.equal(parsed.contentType, 1);
  assert.deepEqual(result.bytes.subarray(parsed.initial.start, parsed.initial.end), source.initial);
  assert.deepEqual(extractSetup(parsed).seeds, { game: 3768267027, map: 3768267051 });
  assert.deepEqual(source.bytes, original);
  assert.equal(result.bytes.length, parsed.configEnd);
});

test('normalizes only play state and explicitly verified UI mod versions', () => {
  const mod = variant(29, [[CONFIG_KEYS.modId, variant(2, 'ui-example')], [CONFIG_KEYS.modVersion, variant(9, 2)]]);
  const source = fixture({ custom: [[CONFIG_KEYS.playState, variant(9, -818482450)], [CONFIG_KEYS.enabledMods, variant(30, [mod])]] });
  const result = exportConfiguration(source.bytes, { uiModVersions: { 'ui-example': { version: 3, affectsSavedGames: false } } });
  const game = plainProperties(parseNativeSave(result.bytes).initial)[KEYS.game];
  assert.equal(game[CONFIG_KEYS.playState], -901772834);
  assert.equal(game[CONFIG_KEYS.enabledMods][0][CONFIG_KEYS.modVersion], 3);
  assert.throws(() => exportConfiguration(source.bytes, { uiModVersions: { 'ui-example': { version: 3, affectsSavedGames: true } } }), /verified UI/);
});

test('refuses later-age, config input and any output overwrite', async () => {
  assert.throws(() => exportConfiguration(fixture({ laterAge: true }).bytes), /current age setup/);
  assert.throws(() => exportConfiguration(fixture({ configOnly: true }).bytes), /ordinary/);
  const dir = await mkdtemp(join(tmpdir(), 'play-again-export-'));
  try {
    const source = join(dir, 'source.Civ7Save'), output = join(dir, 'new.Civ7Cfg');
    await writeFile(source, fixture().bytes);
    await exportConfigurationFile(source, output);
    const before = await readFile(output);
    await assert.rejects(exportConfigurationFile(source, output), /EEXIST/);
    assert.deepEqual(await readFile(output), before);
    await assert.rejects(exportConfigurationFile(source, source), /new file/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('updates the native string mod version even when its encoded length changes', () => {
  const mod = variant(29, [[CONFIG_KEYS.modId, variant(2, 'ui-example')], [CONFIG_KEYS.modVersion, variant(2, '99')]]);
  const source = fixture({ custom: [[CONFIG_KEYS.enabledMods, variant(30, [mod])]] });
  const result = exportConfiguration(source.bytes, { uiModVersions: { 'ui-example': { version: 100, affectsSavedGames: false } } });
  const parsed = parseNativeSave(result.bytes);
  assert.equal(plainProperties(parsed.initial)[KEYS.game][CONFIG_KEYS.enabledMods][0][CONFIG_KEYS.modVersion], '100');
  assert.deepEqual(extractSetup(parsed).seeds, extractSetup(parseNativeSave(source.bytes)).seeds);
});
