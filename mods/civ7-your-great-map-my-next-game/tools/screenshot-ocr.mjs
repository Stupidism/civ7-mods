import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir, access, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const run = promisify(execFile);
const source = fileURLToPath(new URL('./recognize-screenshot.swift', import.meta.url));
let preparing;
export async function prepareOCR() {
  preparing ??= (async () => {
    if (process.platform !== 'darwin') throw new Error('截图识别目前支持 macOS。');
    const digest = createHash('sha256').update(await readFile(source)).digest('hex').slice(0, 16);
    const directory = path.join(homedir(), 'Library/Caches/civ7-play-again');
    const binary = path.join(directory, `recognize-${digest}`);
    try { await access(binary); return binary; } catch {}
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = `${binary}-${randomUUID()}`;
    try { await run('/usr/bin/xcrun', ['swiftc', source, '-O', '-o', temporary], { timeout: 120000, maxBuffer: 1024 * 1024 }); }
    catch { throw new Error('未能准备本机截图识别。需要已安装的 Apple 命令行开发工具；存档和设置文件功能仍可使用。'); }
    await rename(temporary, binary); return binary;
  })();
  try { return await preparing; } catch (error) { preparing = undefined; throw error; }
}
export async function recognizeScreenshot({ file } = {}) {
  const binary = await prepareOCR();
  try {
    const { stdout } = await run(binary, file ? ['--file', file] : ['--clipboard'], { timeout: 50000, maxBuffer: 1024 * 1024 });
    const result = JSON.parse(stdout);
    if (!Array.isArray(result.lines) || !result.lines.length) throw new Error('没有识别到文字，请复制清晰的完整 Esc 配置页截图。');
    return result;
  } catch (error) {
    if (error.killed) throw new Error('截图识别超时，请换一张清晰的游戏截图。');
    throw new Error(error.stderr?.trim() || error.message);
  }
}
