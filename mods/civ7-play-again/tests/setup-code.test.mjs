import test from 'node:test';
import assert from 'node:assert/strict';
import { isSetupCode, parseSetupCode, formatSetupCode } from '../ui/setup-code.js';
import { createSetupCodeAdapter } from '../ui/setup-code-game.js';

const example = 'C7L1;ANTIQUITY;H:HIMIKO_ALT:NORMAN;A:FRIEDRICH:GREECE;A:SAYYIDA_AL_HURRA:ICELAND;A:ISABELLA:DAI_VIET;A:IBN_BATTUTA:PRUSSIA;A:AUGUSTUS:MONGOLIA;A:CATHERINE:MING';
const seedCode = 'C7S1;MAP={base-standard}maps/pangaea-plus.js;SIZE=HUGE;GAMESEED=1467319409;MAPSEED=1467319429';

test('the supplied C7L1 example preserves all seven rows and can be re-encoded unchanged', () => {
  const plan = parseSetupCode(example);
  assert.equal(plan.settings.Age, 'AGE_ANTIQUITY');
  assert.equal(plan.players.length, 7);
  assert.deepEqual(plan.players[0], { role: 'H', leader: 'LEADER_HIMIKO_ALT', civilization: 'CIVILIZATION_NORMAN' });
  assert.deepEqual(plan.players.at(-1), { role: 'A', leader: 'LEADER_CATHERINE', civilization: 'CIVILIZATION_MING' });
  assert.equal(formatSetupCode(plan, 'C7L1'), example);
  assert.deepEqual(parseSetupCode(formatSetupCode(plan)).players, plan.players);
});

test('C7S1 round-trips seed-only settings and optional full roster without inventing fields', () => {
  const plan = parseSetupCode(seedCode);
  assert.deepEqual(plan.settings, { Map: '{base-standard}maps/pangaea-plus.js', MapSize: 'MAPSIZE_HUGE', GameRandomSeed: 1467319409, MapRandomSeed: 1467319429 });
  assert.deepEqual(plan.players, []);
  assert.equal(formatSetupCode(plan), seedCode);
  const withPlayers = parseSetupCode(seedCode + ';AGE=ANTIQUITY;H:RANDOM:RANDOM;A:ISABELLA:ROME');
  assert.deepEqual(parseSetupCode(formatSetupCode(withPlayers)), withPlayers);
  assert.equal(withPlayers.players[0].leader, 'RANDOM');
  assert.throws(() => formatSetupCode(plan, 'C7L1'), /额外设置/);
});

test('seed sign, canonical numbering, case and separator whitespace follow one format', () => {
  const plan = parseSetupCode(' c7s1 ; age=antiquity ; GAMESEED=-1; MAPSEED=4294967295; ');
  assert.equal(plan.settings.GameRandomSeed, -1);
  assert.equal(formatSetupCode(plan), 'C7S1;AGE=ANTIQUITY;GAMESEED=4294967295;MAPSEED=4294967295');
  assert(isSetupCode(' C7L1;ANTIQUITY;H:RANDOM:RANDOM'));
  assert(isSetupCode('C7S2;GAMESEED=1'));
  assert(!isSetupCode('游戏种子：123'));
});

test('malformed, unknown, multiple and conflicting codes fail without silently dropping tokens', () => {
  for (const text of [
    '', 'C7S3;GAMESEED=1', 'C7L1;FUTURE;H:A:B', 'C7L1;ANTIQUITY;A:A:B',
    'C7L1;ANTIQUITY;H:A:B;MAPSEED=1', 'C7S1;GAMESEED=1;GAMESEED=2',
    'C7S1;GAMESEED=1;;MAPSEED=2', 'C7S1;GAMESEED=123x', 'C7S1;GAMESEED=4294967296',
    'C7S1;GAMESEED=-2147483649', 'C7S1;WHAT=1', 'C7S1;PLAYERS=7;H:A:B;A:C:D',
    'C7S1;MAP=<script>', 'C7L1;ANTIQUITY;H:A:B:C', example + ';' + example,
    'C7S1;GAMESEED=1' + ' '.repeat(32000),
  ]) assert.throws(() => parseSetupCode(text), undefined, text.slice(0, 80));
  assert.throws(() => formatSetupCode({ settings: { GameRandomSeed: NaN } }), /整数/);
  assert.throws(() => formatSetupCode({ settings: { unknown: 1 } }), /未知/);
});

function game({ maximum = 8, allowAllCivilizations = true, interned = false } = {}) {
  const source = parseSetupCode(example);
  const state = {
    ready: true, writes: [], maximum, localId: 2,
    settings: { Age: 'AGE_ANTIQUITY', Map: '{base-standard}maps/continents-voronoi.js', MapSize: 'MAPSIZE_HUGE',
      GameSpeeds: 'GAMESPEED_STANDARD', Difficulty: 'DIFFICULTY_DEITY', GameRandomSeed: 11, MapRandomSeed: -22 },
    players: Array.from({ length: 8 }, (_, id) => ({ status: id === 2 ? 2 : id === 0 ? 1 : 0, leader: 'RANDOM', civilization: 'RANDOM' })),
    invalidLeaders: new Set(), invalidCivs: new Set(),
  };
  const handles = new Map(), strings = new Map();
  const native = value => {
    if (!interned || typeof value !== 'string') return value;
    if (!handles.has(value)) { const id = handles.size + 10000; handles.set(value, id); strings.set(id, value); }
    return handles.get(value);
  };
  const parameter = (value, choices) => ({ value: { value: native(value) }, domain: { possibleValues: choices.map(choice => {
    const item = typeof choice === 'string' ? { value: choice } : choice;
    return { invalidReason: 0, ...item, value: native(item.value), name: native(item.value) };
  }) } });
  const choices = {
    Age: ['AGE_ANTIQUITY', 'AGE_EXPLORATION', 'AGE_MODERN'],
    Map: ['{base-standard}maps/continents-voronoi.js', '{base-standard}maps/pangaea-plus.js'],
    MapSize: ['MAPSIZE_HUGE', 'MAPSIZE_STANDARD'], GameSpeeds: ['GAMESPEED_STANDARD'], Difficulty: ['DIFFICULTY_DEITY'],
  };
  const setup = {
    resolveString: value => strings.get(value) ?? value,
    findGameParameter: id => Object.hasOwn(state.settings, id) ? parameter(state.settings[id], choices[id] ?? []) : undefined,
    findPlayerParameter(id, key) {
      const player = state.players[id];
      if (key === 'PlayerLeader') return parameter(player.leader, ['RANDOM', ...source.players.map(row => row.leader)].map(value => ({ value, invalidReason: state.invalidLeaders.has(value) ? '未拥有领袖' : 0 })));
      const civs = ['RANDOM', 'CIVILIZATION_ROME', ...source.players.map(row => row.civilization)];
      return parameter(player.civilization, civs.map(value => ({ value, invalidReason: state.invalidCivs.has(value) ? '未安装文明'
        : !allowAllCivilizations && value === 'CIVILIZATION_NORMAN' && (state.settings.Age !== 'AGE_EXPLORATION' || player.leader !== 'LEADER_HIMIKO_ALT') ? '当前时代或领袖不可选' : 0 })));
    },
    setGameParameterValue(id, value) {
      state.writes.push([id, value]); state.settings[id] = value;
      if (['Age', 'Map', 'MapSize'].includes(id)) { state.settings.GameRandomSeed = 0; state.settings.MapRandomSeed = 0; }
    },
    setPlayerParameterValue(id, key, value) { state.writes.push([id, key, value]); state.players[id][key === 'PlayerLeader' ? 'leader' : 'civilization'] = value; },
  };
  const configuration = {
    getMap: () => ({ maxMajorPlayers: state.maximum }), getPlayer: id => ({ slotStatus: state.players[id].status }),
    editPlayer: id => ({ setSlotStatus(value) { state.players[id].status = value; }, setAsMajorCiv() {} }),
  };
  const assertReady = () => { if (!state.ready) throw new Error('不在新建游戏'); };
  const api = createSetupCodeAdapter({ GameSetup: setup, Configuration: configuration, SlotStatus: { SS_CLOSED: 0, SS_COMPUTER: 1, SS_TAKEN: 2, SS_OPEN: 3 },
    GameContext: { localPlayerID: state.localId }, Locale: { compose: value => value }, assertReady,
    settle: async () => { state.onSettle?.(); } });
  return { api, state, setup };
}

test('C7L1 routes H to the actual local slot and all six A entries to exact available AI slots', async () => {
  const { api, state } = game();
  const plan = parseSetupCode(example);
  const result = await api.apply(plan);
  assert.deepEqual(result.skipped, []);
  assert.equal(state.players.filter(row => row.status !== 0).length, 7);
  assert.equal(state.players[2].leader, 'LEADER_HIMIKO_ALT');
  assert.equal(state.players[2].civilization, 'CIVILIZATION_NORMAN');
  const ai = state.players.filter(row => row.status === 1);
  assert.deepEqual(ai.map(row => row.leader), plan.players.filter(row => row.role === 'A').map(row => row.leader));
  assert.deepEqual(ai.map(row => row.civilization), plan.players.filter(row => row.role === 'A').map(row => row.civilization));
  assert.equal(state.settings.GameRandomSeed, 11); assert.equal(state.settings.MapRandomSeed, -22);
});

test('domains refresh after age and leader changes; omitted seeds survive the change', async () => {
  const { api, state } = game({ allowAllCivilizations: false });
  const plan = parseSetupCode('C7L1;EXPLORATION;H:HIMIKO_ALT:NORMAN;A:ISABELLA:ROME');
  const result = await api.apply(plan);
  assert.deepEqual(result.skipped, []);
  assert.equal(state.settings.Age, 'AGE_EXPLORATION');
  assert.equal(state.players[2].civilization, 'CIVILIZATION_NORMAN');
  assert.equal(state.settings.GameRandomSeed, 11); assert.equal(state.settings.MapRandomSeed, -22);
});

test('unavailable civilization stops with explicit partial results and is not substituted with RANDOM', async () => {
  const { api, state } = game({ allowAllCivilizations: false });
  const result = await api.apply(parseSetupCode(example));
  assert(result.skipped.some(message => message.includes('NORMAN') && message.includes('当前时代')));
  assert(result.skipped.some(message => message.includes('已停止')));
  assert(!state.writes.some(row => row[0] === 2 && row[1] === 'PlayerCivilization'));
  assert(!state.writes.some(row => row[2] === 'LEADER_FRIEDRICH'));
});

test('no room for the roster is reported without dropping AI rows or changing their identities', async () => {
  const { api, state } = game({ maximum: 4 });
  const result = await api.apply(parseSetupCode(example));
  assert(result.skipped.some(message => message.includes('没有截断')));
  assert.deepEqual(state.writes, []);
});

test('multiple humans and active gameplay reject before any mutation', async () => {
  const { api, state } = game();
  await assert.rejects(api.apply(parseSetupCode('C7L1;ANTIQUITY;H:RANDOM:RANDOM;H:ISABELLA:ROME')), /一个 H/);
  state.ready = false;
  await assert.rejects(api.apply(parseSetupCode(seedCode)), /不在/);
  assert.throws(() => api.capture(), /不在/);
  assert.deepEqual(state.writes, []);
});

test('a game starting while the async update settles stops all subsequent writes', async () => {
  const { api, state } = game();
  state.onSettle = () => { state.ready = false; };
  await assert.rejects(api.apply(parseSetupCode(seedCode)), /不在/);
  assert.equal(state.writes.length, 1);
});

test('C7S1 seeds apply last and both raw strings and interned engine IDs work', async () => {
  for (const interned of [false, true]) {
    const { api, state } = game({ interned });
    const preview = api.preview(parseSetupCode(seedCode));
    assert.equal(preview.fields.length, 4);
    const result = await api.apply(preview);
    assert.deepEqual(result.skipped, []);
    assert.equal(state.settings.GameRandomSeed, 1467319409); assert.equal(state.settings.MapRandomSeed, 1467319429);
    assert.deepEqual(state.writes.slice(-2).map(row => row[0]), ['GameRandomSeed', 'MapRandomSeed']);
  }
});

test('capture emits one reusable C7S2 line and round-trip restores every supported field and roster', async () => {
  const original = game(); await original.api.apply(parseSetupCode(example));
  const code = original.api.capture();
  assert(code.startsWith('C7S2;AGE=ANTIQUITY;')); assert(!code.includes('\n'));
  const target = game({ interned: true });
  target.state.settings.Age = 'AGE_MODERN'; target.state.settings.GameRandomSeed = 999;
  const result = await target.api.apply(parseSetupCode(code));
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(target.state.settings, original.state.settings);
  assert.deepEqual(target.state.players, original.state.players);
  assert.equal(target.api.capture(), code);
});

test('missing seed values cannot be misreported as verified zeroes', async () => {
  const { api, state, setup } = game();
  setup.setGameParameterValue = (id, value) => { state.writes.push([id, value]); };
  state.settings.GameRandomSeed = undefined;
  const result = await api.apply(parseSetupCode('C7S1;GAMESEED=0'));
  assert(result.skipped.some(message => message.includes('没有采用')));
  assert.equal(result.applied.length, 0);
});
