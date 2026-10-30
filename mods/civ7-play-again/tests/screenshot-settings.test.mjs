import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScreenshot, applyScreenshot, setScreenshotPlayerCount } from '../ui/screenshot-settings.js';

const catalog = [
  ['Age', '时代', ['古典', '探索']], ['GameSpeeds', '游戏速度', ['标准', '快速']],
  ['Difficulty', '难度', ['神祇', '总督']], ['Map', '地图类型', ['大陆和岛屿', '群岛']],
  ['MapSize', '地图尺寸', ['小型', '标准']], ['PlayerLeader', '领袖', ['伊莎贝拉', '拿破仑·皇帝']],
  ['PlayerCivilization', '文明', ['冰岛', '埃及']], ['GameRandomSeed', '游戏种子', []], ['MapRandomSeed', '地图种子', []],
].map(([id, label, labels]) => ({ id, label, player: id.startsWith('Player'), playerId: 0, current: 0, choices: labels.map((label, value) => ({ label, value: `${id}-${value}` })) }));
catalog.push({ id: 'PlayerCount', label: '玩家数量', current: 8, choices: [{ value: 6, label: '6' }] });
const screenshot = text => ({ lines: text.split('\n').map(text => ({ text, confidence: .99 })) });
const esc = '伊莎贝拉\n冰岛\n第 6 回合 | 古典 | 标准 | 神祇 | 6 位玩家 | 大陆和岛屿 | 小型\n游戏种子：3768267027\n地图种子：3768267051';

test('Chinese Esc summary maps Standard to speed, and signed seeds retain all 32 bits', () => {
  const plan = parseScreenshot(screenshot(esc), catalog);
  assert.equal(plan.fields.length, 10); assert.equal(plan.missing.length, 0);
  assert.equal(plan.fields.find(f => f.id === 'GameRandomSeed').value, -526700269);
  assert.equal(plan.fields.find(f => f.id === 'MapRandomSeed').value, -526700245);
  assert.equal(plan.fields.find(f => f.id === 'GameSpeeds').value, 'GameSpeeds-0');
  assert.equal(plan.fields.find(f => f.id === 'MapSize').value, 'MapSize-0');
  assert.equal(parseScreenshot(screenshot(esc.replace('6 位玩家', '玩家数量：6')), catalog).fields.find(f => f.id === 'PlayerCount').value, 6);
});
test('separated seed labels and digits on one baseline can be paired', () => {
  const result = { lines: [
    { text: '游戏种子', confidence: .3, x: .1, y: .8, width: .1, height: .02 }, { text: '123', confidence: .99, x: .21, y: .801, width: .1, height: .02 },
    { text: '地图种子', x: .1, y: .84, width: .1, height: .02 }, { text: '-456', x: .21, y: .841, width: .1, height: .02 },
  ] };
  const plan = parseScreenshot(result, catalog);
  assert.deepEqual(plan.fields.map(f => f.value), [123, -456]);
});
test('ambiguous, low-confidence, cropped and corrupt seeds are not guessed', () => {
  for (const text of ['游戏种子 123O45', '游戏种子 123 456', '游戏种子 123 | 456', '游戏种子 123\n游戏种子 456', '游戏种子 4294967296', '游戏种子 -2147483649', '123456789']) {
    assert.equal(parseScreenshot(screenshot(text), catalog).fields.length, 0, text);
  }
  assert.equal(parseScreenshot({ lines: [{ text: 'Game Seed 123456', confidence: .2 }] }, catalog).fields.length, 0);
  for (const value of ['0', '-2147483648', '4294967295']) assert.equal(parseScreenshot(screenshot(`Game Seed ${value}`), catalog).fields.length, 1);
});
test('mod descriptions and unlabelled Standard never masquerade as game options', () => {
  const plan = parseScreenshot(screenshot('标准\n新增伊莎贝拉文明MOD\n小型界面\n第 123 回合'), catalog);
  assert.equal(plan.fields.length, 0);
});
test('dependencies are applied first, unavailable DLC is skipped, and rejected values are reported', async () => {
  const current = structuredClone(catalog); const writes = [];
  current.find(p => p.id === 'PlayerCivilization').choices[0].invalid = true;
  current.find(p => p.id === 'PlayerCivilization').choices[0].reason = '未拥有内容';
  const result = await applyScreenshot(parseScreenshot(screenshot(esc), catalog), {
    getCatalog: () => current, assertReady() {}, setValue(field) {
      writes.push(field.id);
      if (field.id !== 'MapSize') current.find(p => p.id === field.id).current = field.value;
    },
  });
  assert.equal(writes[0], 'Age'); assert.deepEqual(writes.slice(-2), ['GameRandomSeed', 'MapRandomSeed']);
  assert(!writes.includes('PlayerCivilization'));
  assert(result.skipped.some(s => s.includes('未拥有内容')));
  assert(result.skipped.some(s => s.includes('地图尺寸')));
  assert.equal(result.applied.length, 8);
});

test('player count uses current map capacity and never closes the local player or another human', () => {
  const statuses = [2, 1, 1, 1, 0, 0]; const assignments = [];
  const env = { playerId: 0, SlotStatus: { SS_CLOSED: 0, SS_COMPUTER: 1, SS_TAKEN: 2, SS_OPEN: 3 },
    Configuration: { getMap: () => ({ maxMajorPlayers: statuses.length }), getPlayer: id => ({ slotStatus: statuses[id] }),
      editPlayer: id => ({ setSlotStatus: value => { statuses[id] = value; }, setAsMajorCiv() {} }) },
    GameSetup: { setPlayerParameterValue: (...args) => assignments.push(args) },
  };
  setScreenshotPlayerCount(2, env); assert.deepEqual(statuses, [2, 1, 0, 0, 0, 0]);
  setScreenshotPlayerCount(6, env); assert.deepEqual(statuses, [2, 1, 1, 1, 1, 1]);
  assert(assignments.every(([id, , value]) => id !== 0 && value === 'RANDOM'));
  assert.throws(() => setScreenshotPlayerCount(7, env), /地图限制/);
  statuses.fill(2); assert.throws(() => setScreenshotPlayerCount(2, env), /玩家席位/);
});
test('active gameplay interrupts pending imports before any further write', async () => {
  let writes = 0;
  await assert.rejects(applyScreenshot(parseScreenshot(screenshot(esc), catalog), {
    getCatalog: () => catalog, assertReady() { if (writes) throw new Error('active game'); }, setValue() { writes++; },
  }), /active game/);
  assert.equal(writes, 1);
});
