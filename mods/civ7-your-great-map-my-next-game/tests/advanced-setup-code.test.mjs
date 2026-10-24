import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSetupCode, parseSetupCode } from '../ui/setup-code.js';
import { createSetupCodeAdapter } from '../ui/setup-code-game.js';

const types = { Select: 10, Boolean: 11, Integer: 12, UnsignedInteger: 13, Text: 14 };
const major = 'PlayerMementoMajorSlot', minor = 'PlayerMementoMinorSlot1';
const travel = 'MEMENTO_FOUNDATION_TRAVELS_MARCO_POLO', globe = 'MEMENTO_FOUNDATION_IMAGO_MUNDI';
const map = '{base-standard}maps/pangaea-voronoi.js';
const choose = (...choices) => ({ type: types.Select, choices });
const gameDefs = {
  Ruleset: choose('RULESET_STANDARD', 'RULESET_ALT'),
  Age: choose('AGE_ANTIQUITY', 'AGE_EXPLORATION'), Map: choose(map, '{base-standard}maps/continents-voronoi.js'),
  MapSize: choose('MAPSIZE_HUGE', 'MAPSIZE_SMALL'), GameSpeeds: choose('GAMESPEED_STANDARD', 'GAMESPEED_QUICK'),
  Difficulty: choose('DIFFICULTY_CUSTOM', 'DIFFICULTY_PRINCE'),
  GameRandomSeed: { type: types.Integer }, MapRandomSeed: { type: types.Integer },
  GameStartCivSelectionMode: choose('ANACHRONISTIC', 'HISTORICAL'),
  AgeLength: choose('AGE_LENGTH_LONG', 'AGE_LENGTH_STANDARD'),
  AgeCountdownTimer: choose('AGE_COUNTDOWN_LENGTH_STANDARD', 'AGE_COUNTDOWN_LENGTH_SHORT'),
  AgeTransitionSetting: choose('AGE_TRANSITION_SETTING_KEEP_MORE', 'AGE_TRANSITION_SETTING_RESHUFFLE'),
  IndependentHostility: choose('INDEPENDENT_HOSTILITY_DEFAULT', 'INDEPENDENT_HOSTILITY_HIGH'),
  NoCivUnlocks: { type: types.Boolean }, StartPosition: choose('START_POSITION_STANDARD', 'START_POSITION_BALANCED'),
  MapSeaLevel: choose('SEA_LEVEL_STANDARD', 'SEA_LEVEL_HIGH'),
  TurnLimit: choose('TURNLIMIT_NONE', 'TURNLIMIT_CUSTOM'),
  DisasterIntensity: choose('REALISM_SETTING_LIGHT', 'REALISM_SETTING_HEAVY'),
  EnableScoreVictory: { type: types.Boolean },
  // A dependent option deliberately precedes its switch in enumeration.
  ModTurnCap: { type: types.Integer }, ModUseTurnCap: { type: types.Boolean },
  ModUnsigned: { type: types.UnsignedInteger },
  DifficultyCombat: choose('DIFFICULTY_PRINCE', 'DIFFICULTY_DEITY'),
  Victories: { ...choose('VICTORY_SCIENCE', 'VICTORY_CULTURE'), array: true, inverted: true },
  Crises: { ...choose('CRISIS_PLAGUE', 'CRISIS_WAR'), array: true, inverted: true },
  LegacyPaths: { ...choose('LEGACY_PATH_SCIENCE', 'LEGACY_PATH_CULTURE'), array: true, inverted: true },
};
const playerDefs = {
  PlayerLeader: choose('RANDOM', 'LEADER_ISABELLA', 'LEADER_HIMIKO_ALT'),
  PlayerCivilization: choose('RANDOM', 'CIVILIZATION_ROME', 'CIVILIZATION_NORMAN'),
  PlayerTeam: { type: types.Integer }, PlayerDifficulty: choose('DIFFICULTY_PRINCE', 'DIFFICULTY_DEITY'),
  [major]: choose('NONE', travel, globe), [minor]: choose('NONE', travel, globe),
};
function fixture({ original = false, internOffset = 10000 } = {}) {
  const initial = Object.fromEntries(Object.entries(gameDefs).map(([id, def]) => [id, def.array ? [] : def.choices?.[0] ?? (def.type === types.Boolean ? false : 0)]));
  const state = {
    ready: true, settings: { ...initial }, writes: [], slots: [1, 0, 2, 0], locked: new Set(), lockedSlots: new Set(),
    players: Array.from({ length: 4 }, (_, id) => ({ PlayerLeader: 'RANDOM', PlayerCivilization: 'RANDOM', PlayerTeam: id, PlayerDifficulty: 'DIFFICULTY_PRINCE', [major]: 'NONE', [minor]: 'NONE' })),
    omitted: new Set(), fixed: new Set(),
  };
  if (original) {
    Object.assign(state.settings, {
      Ruleset: 'RULESET_ALT', Age: 'AGE_EXPLORATION', GameSpeeds: 'GAMESPEED_QUICK',
      AgeLength: 'AGE_LENGTH_LONG', AgeTransitionSetting: 'AGE_TRANSITION_SETTING_RESHUFFLE',
      IndependentHostility: 'INDEPENDENT_HOSTILITY_HIGH', StartPosition: 'START_POSITION_BALANCED',
      MapSeaLevel: 'SEA_LEVEL_HIGH', TurnLimit: 'TURNLIMIT_CUSTOM', DisasterIntensity: 'REALISM_SETTING_HEAVY',
      GameRandomSeed: -1935912889, MapRandomSeed: -1935912888,
      ModUseTurnCap: true, ModTurnCap: 0, ModUnsigned: 4294967295, DifficultyCombat: 'DIFFICULTY_DEITY',
      Victories: ['VICTORY_SCIENCE'], LegacyPaths: ['LEGACY_PATH_CULTURE', 'LEGACY_PATH_SCIENCE'],
    });
    Object.assign(state.players[2], { PlayerLeader: 'LEADER_HIMIKO_ALT', PlayerCivilization: 'CIVILIZATION_NORMAN', PlayerTeam: 1, PlayerDifficulty: 'DIFFICULTY_DEITY', [major]: travel, [minor]: globe });
    Object.assign(state.players[0], { PlayerLeader: 'LEADER_ISABELLA', PlayerCivilization: 'CIVILIZATION_ROME', PlayerTeam: 1 });
  } else {
    Object.assign(state.settings, { Age: 'AGE_ANTIQUITY', MapSize: 'MAPSIZE_SMALL', GameStartCivSelectionMode: 'HISTORICAL', Difficulty: 'DIFFICULTY_PRINCE', NoCivUnlocks: true, EnableScoreVictory: true, ModTurnCap: 120, ModUnsigned: 50, GameRandomSeed: 123, MapRandomSeed: 456, Victories: ['VICTORY_CULTURE'], Crises: ['CRISIS_PLAGUE'], LegacyPaths: ['LEGACY_PATH_SCIENCE'] });
  }
  const ids = new Map(), strings = new Map();
  function native(value) {
    if (typeof value !== 'string') return value;
    if (!ids.has(value)) { const handle = internOffset + ids.size; ids.set(value, handle); strings.set(handle, value); }
    return ids.get(value);
  }
  function get(id, player) {
    const def = player == null ? gameDefs[id] : playerDefs[id];
    if (!def || state.omitted.has(id)) return undefined;
    const val = player == null ? state.settings[id] : state.players[player][id];
    const extra = {};
    if (id === 'ModTurnCap' && !state.settings.ModUseTurnCap) return undefined;
    if (id === 'DifficultyCombat' && state.settings.Difficulty !== 'DIFFICULTY_CUSTOM') extra.hidden = true;
    if (id === 'MapSeaLevel' && state.settings.Map !== map) return undefined;
    if ([major, minor].includes(id) && player !== 2) extra.hidden = true;
    return {
      ID: native(id), name: native(id), group: native('GameOptions'), array: Boolean(def.array),
      readOnly: state.fixed.has(id), invalidReason: 0, ...extra,
      uxHint: def.inverted ? native('InvertSelection') : undefined,
      value: { value: native(val) }, ...(def.array ? { values: val.map(value => ({ value: native(value) })) } : {}),
      domain: { type: def.type, possibleValues: def.choices?.map(value => ({ value: native(value), name: native(value), invalidReason:
        id === 'PlayerCivilization' && value === 'CIVILIZATION_NORMAN' && (state.settings.GameStartCivSelectionMode !== 'ANACHRONISTIC' || state.players[player].PlayerLeader !== 'LEADER_HIMIKO_ALT') ? '文明选择规则不允许' : 0 })) },
    };
  }
  const setup = {
    resolveString: value => strings.get(value),
    findGameParameter: id => get(id), findPlayerParameter: (player, id) => get(id, player),
    getGameParameters: () => Object.keys(gameDefs).map(id => get(id)).filter(Boolean),
    getPlayerParameters: player => Object.keys(playerDefs).map(id => get(id, player)).filter(Boolean),
    setGameParameterValue(id, value) {
      state.writes.push({ id, value });
      if (state.ignore === id) return;
      state.settings[id] = Array.isArray(value) ? value.slice().reverse() : value;
      if (id === 'Ruleset') state.settings.Age = 'AGE_ANTIQUITY';
      if (['Ruleset', 'Age', 'Map', 'MapSize'].includes(id)) {
        state.settings.GameRandomSeed = state.settings.MapRandomSeed = 0;
        for (const player of state.players) player[major] = player[minor] = 'NONE';
      }
      state.afterWrite?.(id);
    },
    setPlayerParameterValue(player, id, value) {
      if ([major, minor].includes(id) && value !== 'NONE') assert.notEqual(state.players[player][id === major ? minor : major], value, 'clear the old slot before swapping');
      state.writes.push({ id, player, value }); state.players[player][id] = value;
      if (id === 'PlayerLeader') state.players[player][major] = state.players[player][minor] = 'NONE';
      state.afterWrite?.(id);
    },
  };
  const config = { getMap: () => ({ maxMajorPlayers: 4 }), getPlayer: id => ({ slotStatus: state.slots[id] }),
    editPlayer: id => ({ setSlotStatus(value) { state.slots[id] = value; }, setAsMajorCiv() {} }) };
  const availability = () => state.noMetadata ? null : ({ lockedType: 9,
    slots: [major, minor].map(mementoTypeId => ({ mementoTypeId, displayType: state.lockedSlots.has(mementoTypeId) ? 9 : 0 })),
    items: [travel, globe].map(mementoTypeId => ({ mementoTypeId, displayType: state.locked.has(mementoTypeId) ? 9 : 0 })) });
  const api = createSetupCodeAdapter({ GameSetup: setup, Configuration: config, SlotStatus: { SS_CLOSED: 0, SS_COMPUTER: 1, SS_TAKEN: 2, SS_OPEN: 3 },
    GameContext: { localPlayerID: 2 }, Locale: { compose: value => value }, GameSetupDomainType: types, GameSetupParameterInvalidReason: { Valid: 0 },
    mementoAvailability: availability, assertReady: () => { if (!state.ready) throw new Error('正在对局'); }, settle: async () => state.onSettle?.() });
  return { state, api, setup, native };
}
function mementoPlan(first, second) {
  return { settings: {}, players: [{ role: 'H', leader: 'RANDOM', civilization: 'RANDOM' }, { role: 'A', leader: 'RANDOM', civilization: 'RANDOM' }],
    parameters: [{ player: 0, id: major, value: first }, { player: 0, id: minor, value: second }] };
}

test('C7S2 typed values survive separators, Unicode, zero, false and empty multi-selections', () => {
  const plan = { settings: {}, players: [], parameters: [
    { id: 'ModChoice', value: 'a;b=c%:中文' }, { id: 'ModToggle', value: false }, { id: 'ModNumber', value: 0 },
    { id: 'ModList', value: ['A', 'B;C'] }, { id: 'ModEmpty', value: [] },
  ] };
  const code = formatSetupCode(plan);
  assert(code.startsWith('C7S2;')); assert(!code.includes('\n'));
  assert.deepEqual(parseSetupCode(code).parameters, plan.parameters);
  assert.throws(() => formatSetupCode(plan, 'C7S1'), /丢失/);
  assert.throws(() => formatSetupCode(plan, 'C7L1'), /丢失/);
});

test('C7S2 refuses unsafe shapes, duplicate fields, wrong player references and core overrides', () => {
  for (const suffix of ['G:Age=%22AGE_ANTIQUITY%22', 'G:constructor=1', 'G:X=null', 'G:X=%7B%22value%22%3A1%7D', 'G:X=1.5',
    'G:X=4294967296', 'G:X=%5B1%2C1%5D', 'G:X=%ZZ', 'G:X=true;G:X=false', 'P:0:PlayerTeam=1', 'P:01:PlayerTeam=1', 'G:X=%22a%0Ab%22']) {
    assert.throws(() => parseSetupCode('C7S2;' + suffix), undefined, suffix);
  }
  assert.throws(() => parseSetupCode('C7S2;H:RANDOM:RANDOM;P:0:PlayerLeader=%22RANDOM%22'), /重复定义/);
});

test('complete exported settings round-trip across independent native string handles', async () => {
  const original = fixture({ original: true }), target = fixture({ internOffset: 20000 });
  const report = original.api.captureDetailed(), plan = parseSetupCode(report.code);
  assert(plan.parameters.length >= 25);
  assert.deepEqual(plan.parameters.find(f => f.id === major), { id: major, value: travel, player: 0 });
  assert.equal(plan.parameters.find(f => f.id === 'NoCivUnlocks').value, false);
  assert.deepEqual(plan.parameters.find(f => f.id === 'Crises').value, []);
  assert.equal(plan.parameters.find(f => f.id === 'ModTurnCap').value, 0);
  assert(report.omitted.some(line => line.includes('玩家 2') && line.includes('隐藏')));
  const result = await target.api.apply(plan);
  assert.deepEqual(result.skipped, []);
  for (const [id, value] of Object.entries(original.state.settings)) {
    if (Array.isArray(value)) assert.deepEqual(new Set(target.state.settings[id]), new Set(value), id);
    else assert.equal(target.state.settings[id], value, id);
  }
  assert.deepEqual(target.state.players, original.state.players);
  assert.deepEqual(target.state.writes.slice(-2).map(row => row.id), ['GameRandomSeed', 'MapRandomSeed']);
  assert(target.state.writes.findIndex(row => row.id === 'Ruleset') < target.state.writes.findIndex(row => row.id === 'Age'));
  assert(target.state.writes.findIndex(row => row.id === 'GameStartCivSelectionMode') < target.state.writes.findIndex(row => row.id === 'PlayerCivilization'));
});

test('two mementos can swap slots without duplicate equipment, and NONE removes one', async () => {
  const { api, state } = fixture();
  state.players[2][major] = travel; state.players[2][minor] = globe;
  let result = await api.apply(mementoPlan(globe, travel));
  assert.deepEqual(result.skipped, []);
  assert.equal(state.players[2][major], globe); assert.equal(state.players[2][minor], travel);
  const writes = state.writes.filter(row => [major, minor].includes(row.id));
  assert.deepEqual(writes.map(row => row.value), ['NONE', 'NONE', globe, travel]);
  assert.equal(result.applied.filter(row => [major, minor].includes(row.id)).length, 2);
  result = await api.apply(mementoPlan('NONE', travel));
  assert.deepEqual(result.skipped, []); assert.equal(state.players[2][major], 'NONE');
});

test('locked memento or slot fails before clearing the existing equipment', async () => {
  for (const problem of ['item', 'slot', 'metadata']) {
    const { api, state } = fixture(); state.players[2][major] = travel;
    if (problem === 'item') state.locked.add(globe);
    if (problem === 'slot') state.lockedSlots.add(minor);
    if (problem === 'metadata') state.noMetadata = true;
    const result = await api.apply(mementoPlan('NONE', globe));
    assert(result.skipped.some(line => /解锁/.test(line)), problem);
    assert.equal(state.players[2][major], travel);
    assert(!state.writes.some(row => [major, minor].includes(row.id)));
  }
});

test('duplicate requested mementos do not partially replace the old pair', async () => {
  const { api, state } = fixture(); state.players[2][major] = travel;
  const result = await api.apply(mementoPlan(globe, globe));
  assert(result.skipped.some(line => line.includes('重复')));
  assert.equal(state.players[2][major], travel);
});

test('a partial memento code cannot duplicate an unchanged slot', async () => {
  const { api, state } = fixture(); state.players[2][minor] = globe;
  const plan = mementoPlan(globe, 'NONE'); plan.parameters.pop();
  const result = await api.apply(plan);
  assert(result.skipped.some(line => line.includes('重复')));
  assert.equal(state.players[2][minor], globe); assert.equal(state.players[2][major], 'NONE');
});

test('native setter exceptions report which setting failed and retain previous changes', async () => {
  const { api, state, setup } = fixture();
  const original = setup.setGameParameterValue;
  setup.setGameParameterValue = (id, value) => { if (id === 'EnableScoreVictory') throw new Error('engine rejected'); original(id, value); };
  const result = await api.apply({ parameters: [{ id: 'NoCivUnlocks', value: false }, { id: 'EnableScoreVictory', value: false }] });
  assert(result.skipped.some(line => line.includes('EnableScoreVictory') && line.includes('游戏拒绝')));
  assert.equal(state.settings.NoCivUnlocks, false);
  assert.equal(result.applied.length, 1);
});

test('excluded-list previews describe disabled choices and all-enabled empty lists correctly', () => {
  const { api } = fixture({ original: true });
  const preview = api.preview(parseSetupCode(api.capture()));
  assert.equal(preview.fields.find(f => f.id === 'Victories').display, '关闭：VICTORY_SCIENCE');
  assert.equal(preview.fields.find(f => f.id === 'Crises').display, '全部启用');
  assert.equal(preview.fields.find(f => f.id === 'NoCivUnlocks').display, '关闭');
});

test('unavailable advanced fields report individually and stop roster changes under different rules', async () => {
  const { api, state } = fixture();
  const plan = parseSetupCode(fixture({ original: true }).api.capture());
  state.omitted.add('AgeTransitionSetting'); state.omitted.add('IndependentHostility');
  const result = await api.apply(plan);
  assert(result.skipped.some(line => line.includes('AgeTransitionSetting')));
  assert(result.skipped.some(line => line.includes('IndependentHostility')));
  assert(result.skipped.some(line => line.includes('已停止')));
  assert(!state.writes.some(row => row.id === 'PlayerLeader'));
});

test('wrong types and out-of-domain enum choices cannot reach native setters', async () => {
  const { api, state } = fixture();
  const result = await api.apply({ parameters: [
    { id: 'NoCivUnlocks', value: 0 }, { id: 'ModUnsigned', value: -1 },
    { id: 'AgeLength', value: 'MISSING_DLC_VALUE' }, { id: 'Crises', value: 'CRISIS_WAR' },
  ] });
  assert.equal(result.applied.length, 0); assert(result.skipped.length >= 4);
  assert.deepEqual(state.writes, []);
});

test('read-only matching options verify without writes, differing values fail', async () => {
  const { api, state } = fixture(); state.fixed.add('NoCivUnlocks');
  const same = await api.apply({ parameters: [{ id: 'NoCivUnlocks', value: true }] });
  assert.deepEqual(same.skipped, []); assert.equal(same.applied.length, 1);
  const other = await api.apply({ parameters: [{ id: 'NoCivUnlocks', value: false }] });
  assert(other.skipped.some(line => line.includes('只读'))); assert.deepEqual(state.writes, []);
});

test('native rejection and later dependency resets never appear as successful restoration', async () => {
  const rejected = fixture(); rejected.state.ignore = 'AgeLength';
  let result = await rejected.api.apply({ parameters: [{ id: 'AgeLength', value: 'AGE_LENGTH_STANDARD' }] });
  assert(result.skipped.some(line => line.includes('没有采用')));
  const reset = fixture(); reset.state.afterWrite = id => { if (id === 'NoCivUnlocks') reset.state.settings.AgeLength = 'AGE_LENGTH_LONG'; };
  result = await reset.api.apply({ parameters: [{ id: 'AgeLength', value: 'AGE_LENGTH_STANDARD' }, { id: 'NoCivUnlocks', value: false }] });
  assert(result.skipped.some(line => line.includes('之后的设置变更')));
  assert(!result.applied.some(field => field.id === 'AgeLength'));
});

test('unsupported, hidden and unresolved values are listed as omitted, not silently exported', () => {
  const { api, setup, native } = fixture({ original: true });
  const original = setup.getGameParameters;
  setup.getGameParameters = () => original().concat([
    { ID: native('UserText'), name: native('UserText'), value: { value: 'private' }, domain: { type: types.Text } },
    { ID: native('OpaqueChoice'), name: native('OpaqueChoice'), value: { value: 999999 }, domain: { type: types.Select, possibleValues: [{ value: 999999 }] } },
  ]);
  const report = api.captureDetailed();
  assert(report.omitted.some(line => line.includes('UserText')));
  assert(report.omitted.some(line => line.includes('OpaqueChoice')));
  assert(!report.code.includes('private')); assert(!report.code.includes('999999'));
});

test('an advanced field disappearing after another change is reported instead of crashing verification', async () => {
  const { api, state } = fixture();
  state.settings.ModUseTurnCap = true;
  const result = await api.apply({ parameters: [{ id: 'ModTurnCap', value: 0 }, { id: 'ModUseTurnCap', value: false }] });
  assert(result.skipped.some(line => line.includes('ModTurnCap') && line.includes('之后的设置变更')));
  assert(!result.applied.some(field => field.id === 'ModTurnCap'));
});

test('active game and a game starting during advanced import forbid further access', async () => {
  const { api, state } = fixture(); state.ready = false;
  assert.throws(() => api.captureDetailed(), /正在对局/);
  await assert.rejects(api.apply({ parameters: [{ id: 'NoCivUnlocks', value: false }] }), /正在对局/);
  state.ready = true; state.onSettle = () => { state.ready = false; };
  await assert.rejects(api.apply({ parameters: [{ id: 'NoCivUnlocks', value: false }, { id: 'EnableScoreVictory', value: false }] }), /正在对局/);
  assert.equal(state.writes.length, 1);
});
