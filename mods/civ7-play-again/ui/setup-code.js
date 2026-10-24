// Interoperable C7L1 rosters, C7S1 common settings and C7S2 typed setup options.
// Text only: no evaluation, file paths opened, network or game API calls.
export const codeSettings = Object.freeze([
  { key: 'AGE', id: 'Age', label: '时代', prefix: 'AGE_' },
  { key: 'MAP', id: 'Map', label: '地图类型' },
  { key: 'SIZE', id: 'MapSize', label: '地图尺寸', prefix: 'MAPSIZE_' },
  { key: 'PLAYERS', id: 'PlayerCount', label: '玩家数量', number: true },
  { key: 'SPEED', id: 'GameSpeeds', label: '游戏速度', prefix: 'GAMESPEED_' },
  { key: 'DIFFICULTY', id: 'Difficulty', label: '难度', prefix: 'DIFFICULTY_' },
  { key: 'GAMESEED', id: 'GameRandomSeed', label: '游戏种子', number: true },
  { key: 'MAPSEED', id: 'MapRandomSeed', label: '地图种子', number: true },
]);
const ages = new Set(['ANTIQUITY', 'EXPLORATION', 'MODERN']);
export const setupCodeLimit = 32000;
export const mementoParameter = id => /^PlayerMemento(?:MajorSlot\d*|MinorSlot\d+)$/.test(id);
export function validateExtraParameter(field) {
  if (!field || typeof field.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_.-]{0,95}$/.test(field.id) ||
      ['__proto__', 'constructor', 'prototype'].includes(field.id)) throw new Error('高级设置编号格式不正确');
  if (field.player != null && (!Number.isInteger(field.player) || field.player < 0 || field.player > 63)) throw new Error('高级设置的玩家序号不正确');
  if (field.player == null ? codeSettings.some(def => def.id === field.id) : ['PlayerLeader', 'PlayerCivilization'].includes(field.id)) throw new Error('高级设置不能重复定义基本设置或玩家阵容');
  const scalar = value => typeof value === 'boolean' || (Number.isInteger(value) && value >= -2147483648 && value <= 4294967295) ||
    (typeof value === 'string' && value.length <= 512 && !/[\u0000-\u001f\u007f]/.test(value));
  if (Array.isArray(field.value) ? field.value.length > 256 || field.value.some(value => !scalar(value)) || new Set(field.value).size !== field.value.length : !scalar(field.value)) throw new Error('高级设置值须为文字、开关、32 位整数或不重复的选项列表');
  return field;
}
const identifier = /^[A-Z][A-Z0-9_]{0,95}$/;
const shortId = (value, prefix) => value.startsWith(prefix) ? value.slice(prefix.length) : value;
function typedId(value, prefix) {
  const token = String(value).trim().toUpperCase();
  if (!identifier.test(token)) throw new Error('复制码中的领袖、文明或设置编号格式不正确');
  return token === 'RANDOM' ? token : prefix + shortId(token, prefix);
}
function settingValue(definition, raw) {
  if (!raw) throw new Error(`${definition.label}不能为空`);
  if (definition.number) {
    if (!/^-?\d{1,10}$/.test(raw)) throw new Error(`${definition.label}必须是整数`);
    const value = Number(raw);
    if (definition.id === 'PlayerCount') {
      if (value < 2 || value > 64) throw new Error('玩家数量须在 2 到 64 之间');
      return value;
    }
    if (value < -2147483648 || value > 4294967295) throw new Error(`${definition.label}超出 32 位种子范围`);
    return value | 0;
  }
  if (definition.id === 'Map') {
    if (raw.length > 240 || !/^[A-Za-z0-9_{}./-]+$/.test(raw)) throw new Error('地图编号格式不正确');
    return raw;
  }
  const value = typedId(raw, definition.prefix);
  if (definition.id === 'Age' && !ages.has(shortId(value, 'AGE_'))) throw new Error('复制码中的时代不受支持');
  return value;
}
function playerEntry(text) {
  const parts = text.split(':').map(part => part.trim());
  const role = parts[0]?.toUpperCase();
  if (parts.length !== 3 || !['H', 'A'].includes(role)) throw new Error('玩家格式应为 H:领袖:文明 或 A:领袖:文明');
  return { role, leader: typedId(parts[1], 'LEADER_'), civilization: typedId(parts[2], 'CIVILIZATION_') };
}
export function isSetupCode(text) { return /^C7[A-Z0-9]*(?:[;；]|\s|$)/i.test(String(text).trim()); }
export function parseSetupCode(text) {
  if (typeof text !== 'string' || text.length > setupCodeLimit) throw new Error('复制码过长，请一次粘贴一组设置');
  const tokens = text.trim().split(';').map(token => token.trim());
  const format = tokens.shift()?.toUpperCase();
  if (!['C7L1', 'C7S1', 'C7S2'].includes(format)) throw new Error('不支持这个复制码版本，目前支持 C7L1、C7S1 和 C7S2');
  // One optional final delimiter is harmless; empty interior fields are not.
  if (tokens.at(-1) === '') tokens.pop();
  if (!tokens.length || tokens.some(token => !token)) throw new Error('复制码缺少内容或含有空字段');
  const settings = {}, players = [], parameters = [], parameterKeys = new Set();
  if (format === 'C7L1') settings.Age = settingValue(codeSettings[0], tokens.shift());
  for (const token of tokens) {
    if (/^[HA]\s*:/i.test(token)) { players.push(playerEntry(token)); continue; }
    if (format === 'C7S2' && /^[GP]:/.test(token)) {
      const match = /^(G|P:(0|[1-9]\d?)):([^=]+)=(.+)$/.exec(token);
      if (!match) throw new Error('高级设置字段格式不正确');
      let value;
      try { value = JSON.parse(decodeURIComponent(match[4])); }
      catch { throw new Error('高级设置值编码损坏，请重新复制完整的一行'); }
      const field = validateExtraParameter({ id: match[3], value, ...(match[1] === 'G' ? {} : { player: Number(match[2]) }) });
      const key = `${field.player ?? 'G'}:${field.id}`;
      if (parameterKeys.has(key)) throw new Error(`高级设置重复出现：${field.id}`);
      parameterKeys.add(key); parameters.push(field);
      if (parameters.length > 512) throw new Error('高级设置数量过多');
      continue;
    }
    if (format === 'C7L1') throw new Error('C7L1 只包含时代和玩家阵容；种子、地图等请使用 C7S1');
    const split = token.indexOf('=');
    if (split < 1) throw new Error(`无法识别复制码字段：${token.slice(0, 48)}`);
    const key = token.slice(0, split).trim().toUpperCase();
    const definition = codeSettings.find(item => item.key === key);
    if (!definition) throw new Error(`不支持的复制码字段：${key}`);
    if (Object.hasOwn(settings, definition.id)) throw new Error(`${definition.label}重复出现，请只粘贴一组配置码`);
    settings[definition.id] = settingValue(definition, token.slice(split + 1).trim());
  }
  if (format === 'C7L1' && !players.length) throw new Error('C7L1 至少需要一名玩家');
  if (players.length > 64) throw new Error('复制码包含过多玩家');
  if (players.length && !players.some(player => player.role === 'H')) throw new Error('玩家阵容中缺少 H（人类玩家）');
  if (players.length && settings.PlayerCount != null && settings.PlayerCount !== players.length) throw new Error('玩家数量与阵容条目数不一致');
  if (parameters.some(field => field.player != null && field.player >= players.length)) throw new Error('玩家高级设置必须引用本行阵容中的玩家');
  if (!players.length && !Object.keys(settings).length && !parameters.length) throw new Error('复制码没有可用设置');
  return { kind: 'setup-code', format, settings, players, ...(format === 'C7S2' ? { parameters } : {}) };
}
export function formatSetupCode(plan, format = plan.format === 'C7S2' || plan.parameters?.length ? 'C7S2' : 'C7S1') {
  const settings = plan.settings ?? {}, players = plan.players ?? [];
  if (format !== 'C7S2' && plan.parameters?.length) throw new Error('纪念物和高级设置需要 C7S2，不能导出为会丢失这些内容的旧格式');
  const parts = [format];
  if (format === 'C7L1') {
    if (!settings.Age || Object.keys(settings).some(id => id !== 'Age' && id !== 'PlayerCount')) throw new Error('C7L1 无法保存种子等额外设置，请使用 C7S1');
    if (settings.PlayerCount != null && settings.PlayerCount !== players.length) throw new Error('玩家数量与阵容不一致');
    parts.push(shortId(settings.Age, 'AGE_'));
  } else {
    for (const definition of codeSettings) {
      if (!Object.hasOwn(settings, definition.id)) continue;
      const raw = settings[definition.id];
      // Validate without coercing invalid numbers through bitwise operators.
      const value = settingValue(definition, String(raw));
      const encoded = definition.id.endsWith('RandomSeed') ? String(value >>> 0)
        : definition.prefix ? shortId(value, definition.prefix) : String(value);
      parts.push(`${definition.key}=${encoded}`);
    }
    for (const id of Object.keys(settings)) if (!codeSettings.some(item => item.id === id)) throw new Error(`不能导出未知设置：${id}`);
  }
  for (const player of players) parts.push(`${player.role}:${shortId(player.leader, 'LEADER_')}:${shortId(player.civilization, 'CIVILIZATION_')}`);
  for (const field of plan.parameters ?? []) {
    validateExtraParameter(field);
    parts.push(`${field.player == null ? 'G' : `P:${field.player}`}:${field.id}=${encodeURIComponent(JSON.stringify(field.value))}`);
  }
  const code = parts.join(';');
  parseSetupCode(code); // The writer and reader use exactly the same contract.
  return code;
}
