import { readdir, lstat, mkdir, copyFile, writeFile, unlink, realpath } from 'node:fs/promises';
import { constants, createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join, relative, resolve, dirname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

export const defaultSaves = join(homedir(), 'Library/Application Support/Civilization VII/Saves');
export const defaultBackupRoot = join(homedir(), 'Documents/Civ7-Save-Backups');
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const inside = (child, parent) => child === parent || child.startsWith(parent + sep);
async function canonicalDestination(path) {
  try { return await realpath(path); }
  catch (error) {
    if (error.code !== 'ENOENT' || dirname(path) === path) throw error;
    return join(await canonicalDestination(dirname(path)), relative(dirname(path), path));
  }
}

export function assertGameClosed() {
  const running = execFileSync('/bin/ps', ['-axo', 'comm='], { encoding: 'utf8' });
  if (running.split('\n').some(line => /\/CivilizationVII(?:_DX12)?$/.test(line.trim()))) {
    throw new Error('请完全退出《文明 VII》，再进行备份或安装。');
  }
}

async function hash(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

export async function inventory(root) {
  const directories = [], files = [];
  async function walk(path) {
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error(`不允许符号链接：${path}`);
    const rel = relative(root, path);
    if (info.isDirectory()) {
      directories.push(rel);
      for (const name of (await readdir(path)).sort()) await walk(join(path, name));
    } else if (info.isFile()) {
      const sha256 = await hash(path);
      const after = await lstat(path);
      if (info.size !== after.size || info.mtimeMs !== after.mtimeMs ||
          info.ctimeMs !== after.ctimeMs || info.ino !== after.ino) {
        throw new Error(`读取时存档发生变化：${path}`);
      }
      files.push({ path: rel, size: info.size, sha256, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs });
    } else {
      throw new Error(`不支持的存档条目：${path}`);
    }
  }
  await walk(root);
  return { directories, files };
}

const contentOnly = inv => ({
  directories: inv.directories,
  files: inv.files.map(({ path, size, sha256 }) => ({ path, size, sha256 }))
});
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function backupSaves({
  source = defaultSaves, backupRoot = defaultBackupRoot, checkClosed = assertGameClosed,
  // Test seam: deliberately mutate a temporary source to verify failure behavior.
  afterCopy = async () => {}
} = {}) {
  source = resolve(source); backupRoot = resolve(backupRoot);
  const realBackupRoot = await canonicalDestination(backupRoot);
  const realSource = await canonicalDestination(source);
  if (inside(realBackupRoot, dirname(realSource)) || inside(realBackupRoot, await realpath(repo))) {
    throw new Error('备份必须放在游戏目录和仓库以外。');
  }
  checkClosed();
  const startedAt = new Date().toISOString();
  const before = await inventory(source);
  await mkdir(backupRoot, { recursive: true });
  const destination = join(backupRoot, `${startedAt.replace(/[:.]/g, '-')}-controller-${randomUUID().slice(0, 8)}`);
  await mkdir(destination);
  await writeFile(join(destination, 'INCOMPLETE.txt'), '校验未完成；请勿开始游戏测试。\n', { flag: 'wx' });
  const target = join(destination, 'Saves');
  for (const path of before.directories) await mkdir(join(target, path));
  for (const file of before.files) {
    await copyFile(join(source, file.path), join(target, file.path), constants.COPYFILE_EXCL);
  }
  await afterCopy();
  const copied = await inventory(target);
  const after = await inventory(source);
  checkClosed();
  if (!same(before, after)) throw new Error(`备份期间源存档发生变化；停止测试。未完成副本：${destination}`);
  if (!same(contentOnly(before), contentOnly(copied))) {
    throw new Error(`文件清单、大小或 SHA-256 不一致；停止测试。未完成副本：${destination}`);
  }
  const manifest = {
    verified: true, startedAt, verifiedAt: new Date().toISOString(),
    source, backup: target, directories: before.directories,
    files: before.files.map(file => ({ ...file, sourcePath: join(source, file.path) }))
  };
  await writeFile(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  // Keep a clear final receipt; do not remove or overwrite any save or earlier backup.
  await writeFile(join(destination, 'VERIFIED.txt'),
    `完整备份校验通过：${manifest.verifiedAt}\n共 ${before.files.length} 个文件。\nmanifest.json 为完整校验清单。\n`,
    { flag: 'wx' });
  await unlink(join(destination, 'INCOMPLETE.txt'));
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await backupSaves();
    console.log(`完整存档备份已校验通过（${result.files.length} 个文件）：\n${dirname(result.backup)}\n本工具不会启动游戏。每次重新开始测试前请重新运行。`);
  } catch (error) {
    console.error(`备份失败，请勿开始测试：${error.message}`);
    process.exitCode = 1;
  }
}
