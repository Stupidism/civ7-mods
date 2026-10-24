import { readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseNativeSave, extractSetup } from './native-save.mjs';

export async function inspectFile(input, { output, scope = 'campaign' } = {}) {
  const source = await realpath(input);
  const bytes = await readFile(source);
  const parsed = parseNativeSave(bytes);
  const setup = extractSetup(parsed, { scope });
  if (output) {
    if (resolve(output) === source || resolve(output) === resolve(input)) throw new Error('Output cannot replace the source');
    // Exclusive create also rejects existing symlinks and hard links.
    await writeFile(output, JSON.stringify(setup, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
  return {
    version: setup.gameVersion, scope: setup.scope,
    originalCampaignAvailable: setup.originalCampaignAvailable,
    seeds: setup.seeds, playerSlots: setup.players.length,
    gameProperties: Object.keys(setup.game).length, mapProperties: Object.keys(setup.map).length,
    originalConfigurationBytes: parsed.initial.end - parsed.initial.start,
    sourceSha256: setup.sourceSha256,
    ...(output ? { output: resolve(output) } : {}),
  };
}

async function main(args) {
  const input = args.shift();
  if (!input || input === '--help') {
    console.log('Usage: node tools/inspect-save.mjs SAVE [--output NEW.json] [--scope campaign|age]');
    return;
  }
  const options = {};
  while (args.length) {
    const key = args.shift(), value = args.shift();
    if (!['--output', '--scope'].includes(key) || !value) throw new Error('Unknown or incomplete option');
    options[key.slice(2)] = value;
  }
  console.log(JSON.stringify(await inspectFile(input, options), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
