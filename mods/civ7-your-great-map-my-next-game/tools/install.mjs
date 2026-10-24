import { mkdir, copyFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MOD } from './local-service.mjs';
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(path.join(DEFAULT_MOD, 'ui'), { recursive: true });
for (const file of ['play-again.modinfo', 'ui/play-again.js', 'ui/configuration-snapshot.js', 'ui/compare-configuration.js', 'ui/compare-imported.js', 'ui/content-requirements.js', 'ui/screenshot-settings.js', 'ui/setup-code.js', 'ui/setup-code-game.js', 'ui/setup-code-parameters.js', 'ui/save-reader.js', 'ui/save-configuration.js']) await copyFile(path.join(source, file), path.join(DEFAULT_MOD, file));
try { await access(path.join(DEFAULT_MOD, 'ui/local-connection.js')); } catch { await copyFile(path.join(source, 'ui/local-connection.js'), path.join(DEFAULT_MOD, 'ui/local-connection.js')); }
console.log('已安装“你的神图很好，现在是我的了”。下次启动游戏后可使用种子文字和复制码；这两项不需要辅助程序。旧存档转换仍为开发功能。');
