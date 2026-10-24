import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(path.join(root, 'shared'), { recursive: true });
// Keep the tested parser as the single source of truth. No game assets, saves,
// connection tokens or debug configuration are included in the application.
for (const name of ['save-reader.js', 'save-configuration.js', 'screenshot-settings.js']) {
  await copyFile(path.join(root, '../../mods/civ7-play-again/ui', name), path.join(root, 'shared', name));
}
