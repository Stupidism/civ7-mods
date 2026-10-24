import { parseNativeSave, extractSetupValues, KEYS, objectProperty, SaveFormatError } from './save-reader.js';

// Shared by the mod and the development file adapter. This module needs only
// typed arrays; it does not read/write files, start a program or call the game.
export const CONFIG_KEYS = Object.freeze({ playState: 1232866921, enabledMods: -1083566479, modId: -449879690, modVersion: 1300745868 });
const SETUP_PLAY_STATE = -901772834;

function join(parts) {
  const bytes = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

function setInteger(bytes, node, value) {
  if (!node || ![8, 9].includes(node.type) || node.descriptor !== 1 || node.width !== 4) throw new SaveFormatError('Unexpected integer field layout');
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(node.start + 16, value >>> 0, true);
}

/** A comparison oracle from the original typed configuration, never list metadata. */
export function configurationFromInitial(parsed) {
  const setup = extractSetupValues(parsed);
  const compact = node => ({
    type: node.type, descriptor: node.descriptor,
    value: node.type === 29 ? compactBag(node.value)
      : node.type === 30 ? node.value.map(compact)
      : Array.isArray(node.value) ? [...node.value]
      : node.value && typeof node.value === 'object' ? { ...node.value } : node.value,
  });
  const compactBag = entries => Object.fromEntries(Object.entries(entries).map(([key, node]) => [key, compact(node)]));
  const players = [], unexposedRootKeys = [];
  for (const [key, node] of Object.entries(parsed.initial.entries)) {
    if ([KEYS.game, KEYS.map, KEYS.configurationType].includes(Number(key))) continue;
    if (node.type === 29 && node.value[KEYS.playerId]) players.push({ id: node.value[KEYS.playerId].value, values: compactBag(node.value) });
    else unexposedRootKeys.push(key);
  }
  return {
    schemaVersion: 1, scope: setup.scope, gameVersion: setup.gameVersion,
    game: compactBag(objectProperty(parsed.initial, KEYS.game).entries),
    map: compactBag(objectProperty(parsed.initial, KEYS.map).entries),
    players: players.sort((a, b) => a.id - b.id), unexposedRootKeys,
  };
}

/** Convert supplied save bytes to a stock setup, retaining untouched variants exactly. */
export function prepareSaveImport(input, { uiModVersions = {} } = {}) {
  const parsed = parseNativeSave(input);
  if (parsed.contentType !== 0) throw new SaveFormatError('Select an ordinary .Civ7Save file');
  const source = configurationFromInitial(parsed); // Rejects later-age campaign snapshots.
  const setup = extractSetupValues(parsed);
  const bytes = new Uint8Array(parsed.bytes);
  const changes = [], replacements = [];
  setInteger(bytes, parsed.header.entries[KEYS.headerContentType], 1);
  const game = parsed.initial.entries[KEYS.game].value;
  if (game[CONFIG_KEYS.playState]) {
    setInteger(bytes, game[CONFIG_KEYS.playState], SETUP_PLAY_STATE);
    changes.push({ field: 'PlayState', reason: 'new-game-setup' });
  }
  // A caller must supply installed metadata proving AffectsSavedGames=0.
  // Never relax versions of a gameplay mod or infer that an unknown mod is UI-only.
  function visit(node) {
    if (node.type === 29) {
      const id = node.value[CONFIG_KEYS.modId]?.value;
      const version = node.value[CONFIG_KEYS.modVersion];
      const installed = typeof id === 'string' && id.length && Object.hasOwn(uiModVersions, id) ? uiModVersions[id] : null;
      if (installed && version && String(version.value) !== String(installed.version)) {
        if (installed.affectsSavedGames !== false || !Number.isInteger(installed.version) || installed.version < 0 || installed.version > 2147483647) throw new SaveFormatError('Only verified UI mod version updates are allowed');
        if (version.type === 2 || version.type === 3) {
          // Versions are decimal ASCII; encode directly to the original native
          // character width, without TextEncoder/Buffer or platform libraries.
          const value = String(installed.version) + '\0';
          const encoded = new Uint8Array(value.length * version.width);
          for (let i = 0; i < value.length; i++) encoded[i * version.width] = value.charCodeAt(i);
          const header = bytes.slice(version.start, version.start + 16);
          new DataView(header.buffer).setUint32(8, 0x60000000 + value.length, true);
          replacements.push({ start: version.start, end: version.end, bytes: join([header, encoded]) });
        } else setInteger(bytes, version, installed.version);
        changes.push({ field: 'uiModVersion', id, from: version.value, to: installed.version });
      }
      Object.values(node.value).forEach(visit);
    } else if (node.type === 30) node.value.forEach(visit);
  }
  Object.values(parsed.header.entries).forEach(visit);
  Object.values(parsed.initial.entries).forEach(visit);
  function section(start, end) {
    const parts = []; let offset = start;
    for (const replacement of replacements.filter(r => r.start >= start && r.end <= end).sort((a, b) => a.start - b.start)) {
      if (replacement.start < offset) throw new SaveFormatError('Overlapping configuration replacements');
      parts.push(bytes.subarray(offset, replacement.start), replacement.bytes); offset = replacement.end;
    }
    parts.push(bytes.subarray(offset, end)); return join(parts);
  }
  const output = join([
    section(0, parsed.current.start),
    section(parsed.initial.start, parsed.initial.end),
    section(parsed.current.end, parsed.initial.start),
    section(parsed.initial.end, parsed.configEnd),
  ]);
  const result = parseNativeSave(output);
  if (result.contentType !== 1 || result.configEnd !== output.length) throw new SaveFormatError('Converted configuration did not validate');
  // The game receives the prepared configuration (including the new-game
  // PlayState). Keep the unmodified source oracle separately for auditing.
  return { bytes: output, source, expected: configurationFromInitial(result), seeds: setup.seeds, changes };
}
