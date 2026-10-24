// Parse only the pause menu's visible fields. Never treat arbitrary OCR text
// as executable code, configuration IDs, dependencies, or an entire save.
export const screenshotFields = [
  ['Age', '时代'], ['GameSpeeds', '游戏速度'], ['Difficulty', '难度'],
  ['Map', '地图类型'], ['MapSize', '地图尺寸'],
  ['PlayerCount', '玩家数量'],
  ['PlayerLeader', '领袖', true], ['PlayerCivilization', '文明', true],
  ['GameRandomSeed', '游戏种子'], ['MapRandomSeed', '地图种子'],
];
const normalize = text => String(text ?? '').normalize('NFKC').toLowerCase().replace(/[\s·•:：,，]/g, '');
const cleanLabel = text => String(text ?? '').replace(/\[[^\]]*\]/g, '').trim();
export function screenshotCatalog(setup, locale, playerId, configuration, slotStatus) {
  return screenshotFields.map(([id, label, player]) => {
    if (id === 'PlayerCount') {
      if (!configuration || !slotStatus) return { id, label, readOnly: true, choices: [] };
      const slots = setupSlots(configuration, slotStatus);
      return { id, label, current: slots.filter(s => s.active).length, choices: Array.from({ length: Math.max(0, slots.length - 1) }, (_, index) => ({ value: index + 2, label: String(index + 2) })) };
    }
    const parameter = player ? setup.findPlayerParameter(playerId, id) : setup.findGameParameter(id);
    return { id, label, player: !!player, playerId, current: parameter?.value?.value,
      readOnly: !parameter || parameter.readOnly,
      choices: (parameter?.domain?.possibleValues ?? []).map(value => ({
        value: value.value, label: cleanLabel(locale.compose(setup.resolveString(value.name) ?? '')),
        invalid: !!value.invalidReason, reason: value.invalidReason ? locale.compose(setup.resolveString(value.invalidReason) ?? '') : '',
      })) };
  });
}
function setupSlots(configuration, status) {
  const maximum = configuration.getMap().maxMajorPlayers;
  if (!Number.isInteger(maximum) || maximum < 2 || maximum > 64) throw new Error('无法确认玩家数量范围');
  return Array.from({ length: maximum }, (_, id) => {
    const value = configuration.getPlayer(id).slotStatus;
    return { id, value, active: value !== status.SS_CLOSED && value !== status.SS_OPEN };
  });
}
export function setScreenshotPlayerCount(count, { Configuration: configuration, GameSetup: setup, SlotStatus: status, playerId }) {
  const slots = setupSlots(configuration, status);
  if (!Number.isInteger(count) || count < 2 || count > slots.length) throw new Error('截图中的玩家数量超出当前地图限制');
  const active = slots.filter(s => s.active);
  const delta = count - active.length;
  const targets = delta < 0 ? active.filter(s => s.id !== playerId && s.value === status.SS_COMPUTER).reverse().slice(0, -delta) : slots.filter(s => !s.active).slice(0, delta);
  if (targets.length !== Math.abs(delta)) throw new Error('无法调整玩家数量，请在高级选项中检查玩家席位');
  for (const slot of targets) {
    // The screenshot has no AI identities. New/closed slots use the same
    // random leader and civilization values as the stock setup editor.
    setup.setPlayerParameterValue(slot.id, 'PlayerLeader', 'RANDOM');
    setup.setPlayerParameterValue(slot.id, 'PlayerCivilization', 'RANDOM');
    const edit = configuration.editPlayer(slot.id);
    if (!edit) throw new Error('无法调整玩家席位');
    edit.setSlotStatus(delta < 0 ? status.SS_CLOSED : status.SS_COMPUTER);
    edit.setAsMajorCiv();
  }
}
function groupedRows(lines) {
  const rows = [];
  for (const line of [...lines].sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0))) {
    if (!Number.isFinite(line.y)) { rows.push({ lines: [line], text: line.text }); continue; }
    const center = line.y + line.height / 2;
    const row = rows.find(row => row.center != null && Math.abs(center - row.center) <= Math.max(line.height, row.height) * .6);
    if (row) { row.lines.push(line); row.lines.sort((a, b) => a.x - b.x); row.text = row.lines.map(l => l.text).join(' | '); }
    else rows.push({ center, height: line.height, lines: [line], text: line.text });
  }
  return rows;
}
const seedPattern = /(游戏(?:随机)?种子|遊戲(?:隨機)?種子|地图(?:随机)?种子|地圖(?:隨機)?種子|game\s*(?:random\s*)?seed|map\s*(?:random\s*)?seed)/gi;
function readSeedRows(lines) {
  const entries = [];
  for (const row of groupedRows(lines)) {
    const matches = [...row.text.matchAll(seedPattern)];
    // The game's native textbox is single-line. Pasting two numbered lines
    // may remove the newline; keep the second row number out of the first
    // seed's map notes. Unnumbered inline seeds must not become row numbers.
    const labels = matches.map((match, index) => {
      const before = row.text.slice(0, match.index);
      const prefix = /(?:^|[^\d])(\d{1,3})\s*$/.exec(before);
      const firstNumbered = /(?:^|[^\d])(\d{1,3})\s*$/.test(row.text.slice(0, matches[0].index));
      let group = index === 0 || firstNumbered ? prefix?.[1] : undefined;
      let start = group == null ? match.index : before.length - group.length - (/\s*$/.exec(before)?.[0].length ?? 0);
      if (index > 0 && group != null) {
        const previous = matches[index - 1];
        const valueStart = previous.index + previous[0].length;
        const previousSeed = /^[\s:：|丨]*-?\d+/.exec(row.text.slice(valueStart, match.index));
        if (previousSeed && start < valueStart + previousSeed[0].length) { group = undefined; start = match.index; }
      }
      return { match, group, start };
    });
    for (let index = 0; index < matches.length; index++) {
      const { match, group } = labels[index];
      const end = labels[index + 1]?.start ?? row.text.length;
      const tail = row.text.slice(match.index + match[0].length, end).replace(/^[\s:：|丨]+/, '').replace(/[−–]/g, '-');
      const token = /^-?\d{1,10}(?!\d)/.exec(tail)?.[0];
      const rest = token ? tail.slice(token.length).replace(/^[\s|丨]+/, '').trim() : '';
      const numberLine = token && row.lines.find(line => line.text.replace(/[−–]/g, '-').includes(token));
      entries.push({ id: /地图|地圖|^map/i.test(match[0]) ? 'MapRandomSeed' : 'GameRandomSeed', group,
        token, rest, confidence: numberLine?.confidence ?? 1, lines: row.lines, text: row.text });
    }
  }
  return entries;
}
function mapMetadata(text, catalog) {
  let remaining = normalize(text);
  const fields = [];
  // Longest names first: 盘古大陆和岛屿 contains 大陆和岛屿.
  for (const id of ['Map', 'MapSize']) {
    const matches = [];
    for (const choice of catalog.find(p => p.id === id)?.choices ?? []) {
      const names = [normalize(choice.label)];
      // Exact historical names used in seed posts, not fuzzy OCR correction.
      if (/\{base-standard\}maps\/[^/]+\.js$/.test(choice.value) && /[（(]经典[）)]$/.test(choice.label)) names.push(normalize(choice.label.replace(/[（(]经典[）)]$/, '')));
      for (const name of names) if (name && remaining.includes(name)) matches.push({ choice, name });
    }
    matches.sort((a, b) => b.name.length - a.name.length);
    const longest = matches.filter(m => m.name.length === matches[0]?.name.length);
    if (longest.length && new Set(longest.map(m => m.choice.value)).size === 1) {
      const { choice, name } = longest[0];
      fields.push({ id, value: choice.value, display: choice.label });
      remaining = remaining.replace(name, '');
    }
  }
  return { fields, remaining };
}
function validSeed(entry, catalog) {
  if (!entry.token || entry.confidence < .5) return false;
  const number = Number(entry.token);
  if (!Number.isInteger(number) || number < -2147483648 || number > 4294967295) return false;
  const { remaining } = mapMetadata(entry.rest, catalog);
  // Permit readable Chinese map notes, but never a second numeric fragment,
  // an O/0 correction, or an unsupported trailing English numeric token.
  return !remaining || /^[\u3400-\u9fff（）()、。；;!！]+$/.test(remaining);
}
export function parseSingleImport(result, catalog) {
  const lines = inputLines(result);
  const entries = readSeedRows(lines);
  const numbers = new Set(entries.map(entry => entry.group).filter(group => group != null));
  if (numbers.size > 1 || ['GameRandomSeed', 'MapRandomSeed'].some(id => entries.filter(entry => entry.id === id).length > 1)) {
    throw new Error('一次只处理一组配置。请只截取或复制同一组的游戏种子、地图种子及其设置。');
  }
  return parseScreenshot({ ...result, lines }, catalog);
}
function inputLines(result) {
  const supplied = typeof result?.text === 'string' && !result.lines ? result.text.slice(0, 32000).split(/\r?\n/).map(text => ({ text, confidence: 1 })) : result?.lines ?? [];
  return supplied.filter(line => typeof line.text === 'string' && line.text.length < 4096).map(line => ({ ...line, text: line.text.normalize('NFKC') }));
}
export function parseScreenshot(result, catalog) {
  const lines = inputLines(result);
  const reliable = lines.filter(line => (line.confidence ?? 1) >= .5);
  const rows = groupedRows(reliable);
  const seeds = readSeedRows(lines);
  const fields = [], warnings = [];
  function add(id, value, display) {
    const parameter = catalog.find(p => p.id === id);
    if (!parameter || parameter.readOnly) { warnings.push(`${parameter?.label ?? id}：当前不可调整`); return; }
    fields.push({ id, label: parameter.label, value, display, player: parameter.player, playerId: parameter.playerId });
  }
  // Seeds must have an explicit label. Do not repair O/0 or guess a missing
  // sign: an attractive but wrong map is worse than leaving a field empty.
  for (const id of ['GameRandomSeed', 'MapRandomSeed']) {
    const candidates = seeds.filter(e => e.id === id && validSeed(e, catalog)).map(e => Number(e.token));
    const values = [...new Set(candidates)];
    if (values.length === 1 && Number.isInteger(values[0]) && values[0] >= -2147483648 && values[0] <= 4294967295) {
      add(id, values[0] > 2147483647 ? values[0] - 4294967296 : values[0], String(values[0]));
    } else warnings.push(`${id === 'GameRandomSeed' ? '游戏' : '地图'}种子：${values.length > 1 ? '识别到冲突数字' : '未能可靠识别'}，请手动填写`);
  }
  // Sharing text has map and size beside a labelled seed, rather than the
  // seven-part Esc summary. '标准' here is map size, never game speed.
  const metadata = seeds.filter(e => validSeed(e, catalog)).flatMap(e => mapMetadata(e.rest, catalog).fields);
  for (const id of ['Map', 'MapSize']) {
    const choices = metadata.filter(f => f.id === id);
    if (choices.length && new Set(choices.map(f => f.value)).size === 1) add(id, choices[0].value, choices[0].display);
  }
  // Native pause menu: turn | start age | speed | difficulty | players |
  // map script | map size. Prefer that row; matching 'Standard' globally
  // could otherwise confuse game speed, map size and mod descriptions.
  const summaryRows = [...reliable, ...rows].filter(row => /回合|turn\b/i.test(row.text) && /[|丨｜]/.test(row.text));
  for (const [id, position] of [['Age', 1], ['GameSpeeds', 2], ['Difficulty', 3], ['Map', 5], ['MapSize', 6]]) {
    const parameter = catalog.find(p => p.id === id);
    const matches = [];
    for (const row of summaryRows) {
      const parts = row.text.split(/[|丨｜]/).map(s => s.trim()).filter(Boolean);
      if (parts.length !== 7) continue;
      matches.push(...(parameter?.choices ?? []).filter(choice => normalize(choice.label) === normalize(parts[position])));
    }
    const unique = [...new Map(matches.map(m => [m.value, m])).values()];
    if (unique.length === 1 && !fields.some(f => f.id === id)) add(id, unique[0].value, unique[0].label);
  }
  const counts = [];
  for (const row of summaryRows) {
    const parts = row.text.split(/[|丨｜]/).map(s => s.trim()).filter(Boolean);
    if (parts.length !== 7) continue;
    const part = parts[4].normalize('NFKC');
    const match = /^(?:玩家数量|玩家數量|players?)\s*:?\s*(\d{1,2})$/i.exec(part) ?? /^(\d{1,2})\s*(?:位玩家|名玩家|players?)$/i.exec(part);
    if (match) counts.push(Number(match[1]));
  }
  if (new Set(counts).size === 1 && counts[0] >= 2 && counts[0] <= 64) add('PlayerCount', counts[0], String(counts[0]));
  // Names on the left must occupy their own OCR line, not merely occur in
  // a DLC title, menu caption, or explanatory paragraph.
  for (const id of ['PlayerLeader', 'PlayerCivilization']) {
    const parameter = catalog.find(p => p.id === id);
    const matches = (parameter?.choices ?? []).filter(choice => choice.value !== 'RANDOM' && reliable.some(line => normalize(line.text) === normalize(choice.label)));
    if (matches.length === 1) add(id, matches[0].value, matches[0].label);
  }
  const missing = screenshotFields.filter(([id]) => !fields.some(f => f.id === id)).map(([, label]) => label);
  return { fields, missing, warnings, note: '仅填入以上项目。纪念物、AI 名单和其他高级选项需自行核对；更换时代或领袖可能重置相关选项。截图不能完整核对 DLC / MOD，也不能保证复刻原地图。' };
}

export async function applyScreenshot(plan, { getCatalog, setValue, assertReady, settle = async () => {} }) {
  const applied = [], skipped = [];
  // Apply dependency-changing parameters first and seeds last, since changing
  // map/age can cause the engine to regenerate defaults.
  const order = ['Age', 'Map', 'MapSize', 'PlayerCount', 'GameSpeeds', 'Difficulty', 'PlayerLeader', 'PlayerCivilization', 'GameRandomSeed', 'MapRandomSeed'];
  for (const id of order) {
    const field = plan.fields.find(f => f.id === id); if (!field) continue;
    assertReady();
    const parameter = getCatalog().find(p => p.id === id);
    const choice = parameter?.choices.find(c => c.value === field.value);
    const seed = id.endsWith('RandomSeed');
    if (!parameter || parameter.readOnly || (!seed && (!choice || choice.invalid))) {
      skipped.push(`${field.label}：${choice?.reason || '当前不可用，请核对时代、DLC 和 MOD'}`); continue;
    }
    if (seed && (!Number.isInteger(field.value) || field.value < -2147483648 || field.value > 2147483647)) {
      skipped.push(`${field.label}：数字无效`); continue;
    }
    setValue(field); await settle(); assertReady();
    applied.push(field);
  }
  const current = getCatalog();
  const verified = applied.filter(field => current.find(p => p.id === field.id)?.current === field.value);
  for (const field of applied) if (!verified.includes(field)) skipped.push(`${field.label}：游戏未保留该值，请手动调整`);
  return { applied: verified, skipped };
}
