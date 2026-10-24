import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareSaveImport } from '../ui/save-configuration.js';
export { CONFIG_KEYS } from '../ui/save-configuration.js';

// Development host adapter only: conversion and the comparison oracle are
// implemented inside the mod. File IO is still not an available game adapter.
export function exportConfiguration(input, options) {
  const result = prepareSaveImport(input, options);
  return { ...result, bytes: Buffer.from(result.bytes), sourceSha256: createHash('sha256').update(input instanceof ArrayBuffer ? new Uint8Array(input) : input).digest('hex') };
}

export async function exportConfigurationFile(source, output, options) {
  if (resolve(source) === resolve(output)) throw new Error('Output must be a new file');
  if (!/\.Civ7Cfg$/i.test(output)) throw new Error('Output must end with .Civ7Cfg');
  const result = exportConfiguration(await readFile(source), options);
  await writeFile(output, result.bytes, { flag: 'wx', mode: 0o600 });
  return { output: resolve(output), sourceSha256: result.sourceSha256, seeds: result.seeds, changes: result.changes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [source, output] = process.argv.slice(2);
  if (!source || !output) { console.error('Usage: node export-config.mjs SOURCE.Civ7Save NEW.Civ7Cfg'); process.exitCode = 2; }
  else exportConfigurationFile(source, output).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
