import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// Installation only stages files; it never reloads or controls the running game.
// The shared queue still owns the entire installation transaction.
const lockScript = fileURLToPath(new URL('../../../scripts/game-lock.py', import.meta.url));
if (process.env.CIV7_GAME_LOCK_GUARDED !== '1') {
  const guarded = spawnSync('/usr/bin/python3', [lockScript, 'run', '--', process.execPath, ...process.argv.slice(1)], { stdio: 'inherit', env: process.env });
  process.exit(guarded.status ?? 1);
}
const checked = spawnSync('/usr/bin/python3', [lockScript, 'assert'], { encoding: 'utf8' });
if (checked.status !== 0) { console.error(checked.stderr || checked.error?.message); process.exit(2); }
const source = fileURLToPath(new URL('../', import.meta.url));
const destination = join(homedir(), 'Library/Application Support/Civilization VII/Mods/civ7-controller-bridge');
const files = ['controller-bridge.modinfo', 'ui/controller-bridge.js', 'ui/bridge-runtime.js',
  'ui/bridge-store.js', 'ui/bridge-options.js', 'ui/bridge-settings.js', 'ui/menu-navigation.js',
  'ui/menu-navigation-adapter.js', 'text/settings.xml', 'README.md', 'README-en.md'];
const hash = data => createHash('sha256').update(data).digest('hex');
const contents = await Promise.all(files.map(file => readFile(resolve(source, file))));
let existing = false;
try { await access(destination); existing = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (existing) {
  for (let i = 0; i < files.length; i++) {
    if (hash(await readFile(join(destination, files[i]))) !== hash(contents[i])) {
      throw new Error(`已有不同版本，请先保留旧副本，再安装：${destination}`);
    }
  }
  console.log(`已安装同一版本，文件 SHA-256 一致：${destination}`);
} else {
  for (const file of files) await mkdir(dirname(join(destination, file)), { recursive: true });
  // Manifest goes last so a partial installation cannot be loaded as a mod.
  for (const i of [...files.keys()].slice(1).concat(0)) await writeFile(join(destination, files[i]), contents[i], { flag: 'wx' });
  for (let i = 0; i < files.length; i++) {
    if (hash(await readFile(join(destination, files[i]))) !== hash(contents[i])) throw new Error('安装校验失败');
  }
  console.log(`已安装并校验 ${files.length} 个文件：${destination}\n没有启动游戏或修改存档。`);
}
