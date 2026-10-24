import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installedMods, uiVersions, verifyRequiredMods } from '../tools/mod-inventory.mjs';

test('only unambiguous UI-only manifests allow a version update', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'play-again-mods-'));
  try {
    const xml = (id, version, properties = '') => `<Mod id="${id}" version="${version}" xmlns="ModInfo"><Properties>${properties}</Properties></Mod>`;
    await writeFile(join(dir, 'ui.modinfo'), xml('ui', '2.3.4', '<AffectsSavedGames>0</AffectsSavedGames>'));
    await writeFile(join(dir, 'gameplay.modinfo'), xml('gameplay', 1));
    await writeFile(join(dir, 'duplicate.modinfo'), xml('duplicate', 1, '<AffectsSavedGames>0</AffectsSavedGames>'));
    await writeFile(join(dir, 'duplicate2.modinfo'), xml('duplicate', 2, '<AffectsSavedGames>0</AffectsSavedGames>'));
    const mods = await installedMods([dir]);
    assert.deepEqual(Object.keys(uiVersions(mods)), ['ui']);
    const setup = version => ({ game: { '-1083566479': { type: 30, value: [{ type: 29, value: { '-449879690': { value: 'gameplay' }, '1300745868': { value: version } } }] } } });
    assert.doesNotThrow(() => verifyRequiredMods(setup('1'), mods));
    assert.throws(() => verifyRequiredMods(setup('2'), mods), /gameplay/);
    assert.throws(() => verifyRequiredMods(setup('1'), {}), /gameplay/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
