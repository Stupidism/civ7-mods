import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { checkContent, requirementsFromConfiguration, contentIssueText } from '../ui/content-requirements.js';

export async function installedMods(roots) {
  const mods = Object.create(null);
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.modinfo')) {
        const xml = await readFile(full, 'utf8');
        const tag = xml.match(/<Mod\s[^>]*>/)?.[0] ?? '';
        const id = tag.match(/\bid="([^"]+)"/)?.[1];
        // The 1.5.0 native manifest loader stores the leading integer even
        // for community manifests using e.g. version="4.2.0" (native "4").
        const version = tag.match(/\bversion="(\d+)(?:\.\d+)*"/)?.[1];
        if (!id || version === undefined) continue;
        const affectsSavedGames = !/<AffectsSavedGames>\s*0\s*<\/AffectsSavedGames>/.test(xml);
        const previous = mods[id];
        const properties = xml.match(/<Properties>([\s\S]*?)<\/Properties>/)?.[1] ?? '';
        const packageName = properties.match(/<Package>\s*([^<]+)\s*<\/Package>/)?.[1]?.trim();
        const name = properties.match(/<Name>\s*([^<]+)\s*<\/Name>/)?.[1]?.trim();
        const official = full.includes(`${path.sep}Contents${path.sep}Resources${path.sep}`);
        const kind = official ? (packageName === 'BaseGame' || full.includes(`${path.sep}Base${path.sep}`) ? '游戏本体' : 'DLC') : 'MOD';
        mods[id] = { version: Number(version), affectsSavedGames, name, kind,
          ambiguous: Boolean(previous && (previous.ambiguous || previous.version !== Number(version) || previous.affectsSavedGames !== affectsSavedGames)) };
      }
    }
  }
  for (const root of roots) await visit(root);
  return mods;
}

export const uiVersions = mods => Object.fromEntries(Object.entries(mods).filter(([, mod]) => !mod.ambiguous && !mod.affectsSavedGames));

// A native "load OK" can still accompany a mod-version rollback. Check the
// converted setup against installed manifests before asking the engine to load.
export function verifyRequiredMods(expected, installed) {
  const requirements = requirementsFromConfiguration(expected);
  const report = checkContent(requirements, installed);
  if (report.required.length) {
    const error = new Error(`缺少必需内容或版本不符，未导入设置：\n${report.required.map(contentIssueText).join('\n')}`);
    error.content = { requirements, installed, report }; throw error;
  }
  return { requirements, installed, report };
}
