import http from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, readdir, mkdir, stat, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportConfiguration } from './export-config.mjs';
import { parseNativeSave } from './native-save.mjs';
import { expectedConfiguration } from './expected-configuration.mjs';
import { startGameBridge } from './game-bridge.mjs';
import { installedMods, uiVersions, verifyRequiredMods } from './mod-inventory.mjs';
import { requirementsFromConfiguration, checkContent } from '../ui/content-requirements.js';
import { recognizeScreenshot, prepareOCR } from './screenshot-ocr.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SAVES = path.join(homedir(), 'Library/Application Support/Civilization VII/Saves');
export const DEFAULT_MOD = path.join(homedir(), 'Library/Application Support/Civilization VII/Mods/civ7-play-again');

async function walk(root, suffix) {
  const found = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(suffix)) found.push(full);
    }
  }
  await visit(root); return found;
}

export async function installedUiVersions(roots) { return uiVersions(await installedMods(roots)); }

export async function createLocalService({ savesRoot = DEFAULT_SAVES, token, uiModVersions = {}, modInventory, getModInventory, ocr = recognizeScreenshot, port = 32847 } = {}) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new Error('A local 256-bit access token is required');
  const root = await realpath(savesRoot);
  const single = await realpath(path.join(root, 'Single'));
  if (!single.startsWith(root + path.sep)) throw new Error('Save directory must not escape its root');
  let converting = false;
  let recognizing = false;
  async function recognizeClipboard() {
    if (recognizing) throw new Error('正在识别截图，请稍候');
    recognizing = true;
    try { return await ocr(); } finally { recognizing = false; }
  }
  async function listSaves(suffix = '.civ7save') {
    return (await Promise.all((await walk(single, suffix)).map(async full => ({
      id: path.relative(root, full), name: path.basename(full, path.extname(full)), modified: (await stat(full)).mtimeMs,
    })))).sort((a, b) => b.modified - a.modified);
  }
  async function readSelected(request, allowConfig = false) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('请选择一个存档');
    const config = allowConfig && (request.contentType === 1 || /\.Civ7Cfg$/i.test(request.id ?? request.fileName ?? ''));
    const list = await listSaves(config ? '.civ7cfg' : '.civ7save');
    let entry;
    if (typeof request.id === 'string') entry = list.find(row => row.id === request.id);
    else if (typeof request.fileName === 'string') {
      const matches = list.filter(row => path.basename(row.id) === request.fileName);
      const category = request.locationCategories ?? 0;
      const candidates = matches.filter(row => category & 8 ? /\/prev\//.test(row.id) : category & 4 ? /\/auto\//.test(row.id) && !/\/prev\//.test(row.id) : category & 2 ? /\/quick\//.test(row.id) : path.dirname(row.id) === 'Single');
      if (candidates.length === 1) entry = candidates[0];
    }
    if (!entry) throw new Error('未找到唯一的本地存档；请在转换窗口中重新选择');
    const source = await realpath(path.join(root, entry.id));
    if (!source.startsWith(single + path.sep)) throw new Error('Invalid save path');
    const before = await stat(source);
    if (before.size > 128 * 1024 * 1024) throw new Error('存档过大');
    const bytes = await readFile(source); const after = await stat(source);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || before.ino !== after.ino) throw new Error('存档正在写入，请稍后再试');
    return { bytes, entry };
  }
  const inventoryNow = async () => getModInventory ? getModInventory() : modInventory;
  async function diagnose(request) {
    const { bytes } = await readSelected(request, true);
    const requirements = requirementsFromConfiguration(expectedConfiguration(parseNativeSave(bytes)));
    const installed = await inventoryNow();
    return { requirements, installed: installed ?? {}, report: installed ? checkContent(requirements, installed) : { checked: false, required: [], recommended: [] } };
  }
  async function convert(request) {
    if (converting) throw new Error('正在转换，请稍候');
    converting = true;
    try {
      const { bytes, entry } = await readSelected(request);
      const inventory = await inventoryNow();
      const result = exportConfiguration(bytes, { uiModVersions: inventory ? uiVersions(inventory) : uiModVersions });
      const expected = result.expected;
      const content = inventory ? verifyRequiredMods(expected, inventory) : undefined;
      const safeName = entry.name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 32);
      const fileName = `重开-${safeName}-${randomUUID().slice(0, 8)}.Civ7Cfg`;
      await writeFile(path.join(single, fileName), result.bytes, { flag: 'wx', mode: 0o600 });
      return { fileName, displayName: fileName.slice(0, -8), sourceName: entry.name, sourceSha256: result.sourceSha256, seeds: result.seeds, changes: result.changes, expected, content };
    } catch (error) {
      if (/current age setup/.test(error.message)) throw new Error('这个存档已跨时代，无法保证还原整场游戏的开局。请选择最初时代的存档。');
      throw error;
    } finally { converting = false; }
  }
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const localOrigin = `http://127.0.0.1:${server.address()?.port}`;
    if (req.headers.host !== `127.0.0.1:${server.address()?.port}` || (origin && !['fs://game', 'null', localOrigin].includes(origin))) { res.writeHead(403).end(); return; }
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Play-Again-Token'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST'); res.writeHead(204).end(); return; }
    if (req.method === 'GET' && req.url === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await readFile(path.join(here, 'converter.html'))); return;
    }
    if (req.method === 'GET' && req.url === '/content-requirements.js') {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); res.end(await readFile(path.join(here, '../ui/content-requirements.js'))); return;
    }
    const supplied = String(req.headers['x-play-again-token'] ?? '');
    if (!/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      if (req.method === 'GET' && req.url === '/health') { res.end(JSON.stringify({ ok: true, version: 1 })); return; }
      if (req.method === 'GET' && req.url === '/saves') { res.end(JSON.stringify(await listSaves())); return; }
      if (req.method === 'POST' && ['/convert', '/diagnose', '/ocr/clipboard'].includes(req.url)) {
        let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 8192) throw new Error('Request too large'); }
        const handler = { '/convert': convert, '/diagnose': diagnose, '/ocr/clipboard': recognizeClipboard }[req.url];
        res.end(JSON.stringify(await handler(JSON.parse(body)))); return;
      }
      res.writeHead(404).end();
    } catch (error) { res.writeHead(400).end(JSON.stringify({ error: error.message, content: error.content })); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, url: `http://127.0.0.1:${server.address().port}`, convert, diagnose, recognizeClipboard };
}

async function main() {
  // Compile once before game requests, so the first paste cannot hit the UI
  // timeout. Failure leaves the pre-existing save/file features available.
  await prepareOCR().catch(error => console.error(error.message));
  await mkdir(path.join(DEFAULT_MOD, 'ui'), { recursive: true });
  const configFile = path.join(DEFAULT_MOD, 'ui/local-connection.js');
  let token;
  try { token = (await readFile(configFile, 'utf8')).match(/[a-f0-9]{64}/)?.[0]; } catch {}
  token ??= randomBytes(32).toString('hex');
  await writeFile(configFile, `export const connection = ${JSON.stringify({ url: 'http://127.0.0.1:32847', token })};\n`, { mode: 0o600 });
  const getModInventory = () => installedMods([
    path.join(homedir(), 'Library/Application Support/Civilization VII/Mods'),
    path.join(homedir(), 'Library/Application Support/Steam/steamapps/workshop/content/1295660'),
    path.join(homedir(), "Library/Application Support/Steam/steamapps/common/Sid Meier's Civilization VII/CivilizationVII.app/Contents/Resources"),
  ]);
  const service = await createLocalService({ token, getModInventory });
  const stopBridge = startGameBridge(service, token);
  console.log('文明 VII 存档设置工具已启动。请保留此窗口，在游戏读档界面选择存档。');
  console.log(`也可在浏览器打开：${service.url}/#${token}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopBridge(); service.server.close(() => process.exit(0)); });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.code === 'EADDRINUSE' ? '工具已在运行，或端口 32847 被占用。' : error.message); process.exitCode = 1; });
