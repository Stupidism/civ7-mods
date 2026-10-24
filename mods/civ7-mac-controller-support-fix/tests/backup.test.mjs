import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, symlink, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { backupSaves, inventory, defaultBackupRoot } from '../tools/backup-saves.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'civ7-bridge-test-'));
  t.after(() => rm(root, { recursive: true, force: true })); // Only our temporary fixtures.
  const source = join(root, 'game', 'Saves'), backupRoot = join(root, 'backups');
  for (const path of ['', 'auto', 'auto/prev', 'quick', 'empty']) await mkdir(join(source, path), { recursive: true });
  for (const path of ['campaign.Civ7Save', 'auto/latest.Civ7Save', 'auto/prev/old.Civ7Save', 'quick/quick.Civ7Save']) {
    await writeFile(join(source, path), `test save ${path}`);
  }
  return { source, backupRoot, checkClosed() {} };
}

test('backs up and hashes all save subdirectories, including previous autosaves and empty dirs', async t => {
  const f = await fixture(t);
  const manifest = await backupSaves(f);
  assert.equal(manifest.verified, true);
  assert.equal(manifest.files.length, 4);
  assert.ok(manifest.directories.includes('auto/prev'));
  assert.ok(manifest.directories.includes('empty'));
  for (const file of manifest.files) {
    assert.equal(file.sourcePath, join(f.source, file.path));
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(await readFile(file.sourcePath), await readFile(join(manifest.backup, file.path)));
  }
});

test('each backup has a unique directory and never replaces previous copies', async t => {
  const f = await fixture(t);
  const a = await backupSaves(f);
  const first = await inventory(a.backup);
  await writeFile(join(f.source, 'campaign.Civ7Save'), 'next test session');
  const b = await backupSaves(f);
  assert.notEqual(a.backup, b.backup);
  assert.equal((await readdir(f.backupRoot)).length, 2);
  assert.deepEqual(await inventory(a.backup), first);
  assert.notEqual(a.files[2]?.sha256, b.files[2]?.sha256);
});

test('source changes during copy leave an incomplete receipt, never VERIFIED', async t => {
  const f = await fixture(t);
  await assert.rejects(backupSaves({ ...f, afterCopy: () => writeFile(join(f.source, 'auto/prev/old.Civ7Save'), 'changed') }), /源存档发生变化/);
  const [directory] = await readdir(f.backupRoot);
  assert.deepEqual(await readdir(join(f.backupRoot, directory)), ['INCOMPLETE.txt', 'Saves']);
});

test('a new autosave appearing during copy is detected', async t => {
  const f = await fixture(t);
  await assert.rejects(backupSaves({ ...f, afterCopy: () => writeFile(join(f.source, 'auto/new.Civ7Save'), 'new') }), /发生变化/);
});

test('backup is refused inside game directory or through save symlinks', async t => {
  const f = await fixture(t);
  await assert.rejects(backupSaves({ ...f, backupRoot: join(dirname(f.source), 'backup') }), /目录和仓库以外/);
  await symlink(join(f.source, 'campaign.Civ7Save'), join(f.source, 'link.Civ7Save'));
  await assert.rejects(backupSaves(f), /符号链接/);
});

test('running game check stops backup before any copy', async t => {
  const f = await fixture(t);
  await assert.rejects(backupSaves({ ...f, checkClosed() { throw new Error('game running'); } }), /game running/);
  await assert.rejects(readdir(f.backupRoot), { code: 'ENOENT' });
});

test('a backup-root symlink cannot redirect a backup into the game directory', async t => {
  const f = await fixture(t);
  await symlink(dirname(f.source), f.backupRoot);
  await assert.rejects(backupSaves(f), /目录和仓库以外/);
});

test('default Documents backup destination is outside the repo; stop before reading any saves', async t => {
  const f = await fixture(t);
  await assert.rejects(backupSaves({ ...f, backupRoot: defaultBackupRoot,
    checkClosed() { throw new Error('stop-before-save-read'); } }), /stop-before-save-read/);
});

test('destination inside this repository is refused before creating a backup', async t => {
  const f = await fixture(t);
  const backupRoot = fileURLToPath(new URL('../work/backups', import.meta.url));
  await assert.rejects(backupSaves({ ...f, backupRoot }), /目录和仓库以外/);
});
