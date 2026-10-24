import { codeSettings, formatSetupCode, parseSetupCode, mementoParameter } from './setup-code.js';
import { createParameterCodec } from './setup-code-parameters.js';
import { setScreenshotPlayerCount } from './screenshot-settings.js';

// All engine access is injected, so format and engine-dependent rules can be
// exercised offline. Only the single-player new-game editor uses this adapter.
export function createSetupCodeAdapter({ GameSetup: setup, Configuration: configuration, SlotStatus: status, GameContext: context, Locale: locale, GameSetupDomainType: types, GameSetupParameterInvalidReason: reasons, mementoAvailability, assertReady, settle = async () => {} }) {
  const resolve = value => typeof value === 'number' ? setup.resolveString(value) ?? value : value;
  const raw = parameter => parameter?.value?.value ?? parameter?.value;
  const parameter = field => field.playerId == null ? setup.findGameParameter(field.id) : setup.findPlayerParameter(field.playerId, field.id);
  const current = field => {
    if (field.id === 'PlayerCount') return slots().filter(slot => slot.active).length;
    if (field.extra) {
      try { return parameters.value(parameter(field)); }
      catch { return undefined; } // A dependency can remove a previously valid field.
    }
    const value = raw(parameter(field));
    return field.id.endsWith('RandomSeed') ? (Number.isInteger(value) && value >= -2147483648 && value <= 4294967295 ? value | 0 : undefined) : resolve(value);
  };
  const choice = (field, param = parameter(field)) => param?.domain?.possibleValues?.find(item => resolve(item.value) === field.value);
  const label = (value, fallback) => {
    if (value == null) return fallback;
    try { return String(locale.compose(resolve(value))).replace(/\[[^\]]*\]/g, '').trim() || fallback; }
    catch { return fallback; }
  };
  const parameters = createParameterCodec({ setup, types, valid: reasons?.Valid ?? 0, label, mementoAvailability });
  const matches = field => parameters.equal(current(field), field.value);
  const extraField = (field, playerId) => {
    const param = parameter({ id: field.id, playerId });
    const slotName = field.id === 'PlayerMementoMajorSlot' ? '纪念物槽 1' : field.id === 'PlayerMementoMinorSlot1' ? '纪念物槽 2' : field.id;
    const who = field.player == null ? '' : `玩家 ${field.player + 1} · `;
    return { ...field, extra: true, playerId, label: who + (mementoParameter(field.id) ? slotName : label(param?.name, field.id)) };
  };
  function slots() {
    const max = configuration.getMap().maxMajorPlayers;
    if (!Number.isInteger(max) || max < 2 || max > 64) throw new Error('无法确认当前地图的玩家上限');
    return Array.from({ length: max }, (_, id) => {
      const slotStatus = configuration.getPlayer(id).slotStatus;
      return { id, slotStatus, active: slotStatus !== status.SS_CLOSED && slotStatus !== status.SS_OPEN };
    });
  }
  function singlePlayerSlots() {
    const list = slots(), local = context.localPlayerID;
    if (!list.some(slot => slot.id === local && slot.active)) throw new Error('无法确认你在新建游戏中的席位');
    if (list.some(slot => slot.active && slot.id !== local && slot.slotStatus !== status.SS_COMPUTER)) throw new Error('此入口只支持一名人类玩家的单人新建游戏');
    return list;
  }
  const describe = field => {
    const item = field.id === 'PlayerCount' ? null : choice(field);
    return { ...field, display: item ? label(item.name, String(field.value)) : String(field.value) };
  };
  function preview(plan) {
    const fields = codeSettings.filter(def => Object.hasOwn(plan.settings, def.id)).map(def => describe({ id: def.id, label: def.label, value: plan.settings[def.id] }));
    if (plan.players.length && plan.settings.PlayerCount == null) fields.push({ id: 'PlayerCount', label: '玩家数量', value: plan.players.length, display: String(plan.players.length) });
    let ai = 0, human = 0;
    for (const player of plan.players) {
      const who = player.role === 'H' ? `人类玩家 ${++human}` : `AI ${++ai}`;
      // Names in a preview can fall back to IDs. Do not treat availability in
      // the old age/leader domain as proof about the requested new domain.
      for (const [id, value, suffix] of [['PlayerLeader', player.leader, '领袖'], ['PlayerCivilization', player.civilization, '文明']]) {
        fields.push(describe({ id, value, label: `${who} · ${suffix}`, playerId: context.localPlayerID }));
      }
    }
    for (const extra of plan.parameters ?? []) {
      const field = extraField(extra, extra.player == null ? undefined : context.localPlayerID);
      fields.push({ ...field, display: parameters.display(parameter(field), field.value) });
    }
    return { ...plan, fields, missing: [], warnings: [], note: '只恢复上面列出的项目。纪念物和高级选项会逐项核对；未解锁、缺少内容或被游戏改回的设置会明确提示。复制码不包含存档进度或 DLC / MOD 文件。' };
  }
  async function apply(input) {
    const plan = parseSetupCode(formatSetupCode(input));
    assertReady();
    if (plan.players.length && plan.players.filter(player => player.role === 'H').length !== 1) throw new Error('单人新建游戏只接受一个 H（你），其余玩家请使用 A');
    singlePlayerSlots();
    const applied = [], skipped = [];
    const seedFallbacks = codeSettings.filter(def => def.id.endsWith('RandomSeed') && !Object.hasOwn(plan.settings, def.id)).flatMap(def => {
      const value = raw(setup.findGameParameter(def.id));
      return Number.isInteger(value) && value >= -2147483648 && value <= 4294967295 ? [{ id: def.id, value: value | 0, label: `保留${def.label}` }] : [];
    });
    async function write(field) {
      assertReady();
      const param = parameter(field), seed = field.id.endsWith('RandomSeed');
      if (field.extra) {
        const error = parameters.validate(param, field);
        if (error) { skipped.push(`${field.label}：${error}`); return false; }
      }
      const entry = seed ? null : choice(field, param);
      if (!field.extra && (!param || (param.readOnly && !matches(field)) || (!seed && (!entry || entry.invalidReason)))) {
        skipped.push(`${field.label}（${field.value}）：${entry?.invalidReason ? label(entry.invalidReason, '当前不可用') : '当前不可选，请核对时代、领袖和已安装内容'}`);
        return false;
      }
      if (!matches(field)) {
        try {
          if (field.playerId == null) setup.setGameParameterValue(field.id, field.value);
          else setup.setPlayerParameterValue(field.playerId, field.id, field.value);
        } catch (error) { skipped.push(`${field.label}：游戏拒绝填入（${error.message ?? '未知错误'}）`); return false; }
        await settle(); assertReady();
      }
      if (!matches(field)) { skipped.push(`${field.label}：游戏没有采用这个值`); return false; }
      applied.push(field); return true;
    }
    const fromSetting = id => ({ id, label: codeSettings.find(def => def.id === id).label, value: plan.settings[id] });
    let canContinue = true;
    const extras = plan.parameters ?? [];
    const ruleset = extras.find(field => field.player == null && field.id === 'Ruleset');
    if (ruleset) canContinue = await write(extraField(ruleset));
    // Re-read domains after every dependency change; an old age or leader can
    // otherwise make a valid civilization appear unavailable (or vice versa).
    for (const id of ['Age', 'Map', 'MapSize']) {
      if (canContinue && Object.hasOwn(plan.settings, id)) canContinue = await write(fromSetting(id));
    }
    for (const id of ['GameSpeeds', 'Difficulty']) {
      if (canContinue && Object.hasOwn(plan.settings, id)) canContinue = await write(fromSetting(id));
    }
    async function writeExtras(fields) {
      // Some options appear only after another setting is enabled. Defer those
      // until a pass makes progress; never force values outside the new domain.
      let pending = fields.slice();
      while (pending.length) {
        const deferred = [];
        let progress = false;
        for (const field of pending) {
          assertReady();
          if (parameters.validate(parameter(field), field)) { deferred.push(field); continue; }
          await write(field); progress = true;
        }
        pending = deferred;
        if (!progress) break;
      }
      for (const field of pending) await write(field); // Report every omission.
      return pending.length === 0;
    }
    if (canContinue) {
      const fields = extras.filter(field => field.player == null && field.id !== 'Ruleset').map(field => extraField(field));
      const before = skipped.length;
      await writeExtras(fields);
      // Civilization restrictions and other game rules must be restored before
      // assigning a roster. Do not continue under different rules on failure.
      canContinue = skipped.length === before;
    }
    const count = plan.players.length || plan.settings.PlayerCount;
    if (canContinue && count != null) {
      assertReady();
      const list = singlePlayerSlots();
      if (count < 2 || count > list.length) { skipped.push(`玩家数量 ${count} 超过当前可用范围（2–${list.length}），没有截断阵容`); canContinue = false; }
      else {
        setScreenshotPlayerCount(count, { Configuration: configuration, GameSetup: setup, SlotStatus: status, playerId: context.localPlayerID });
        await settle(); assertReady();
        if (singlePlayerSlots().filter(slot => slot.active).length !== count) { skipped.push('玩家数量未能设置成功'); canContinue = false; }
        else applied.push({ id: 'PlayerCount', label: '玩家数量', value: count });
      }
    }
    const playerIds = [];
    if (canContinue && plan.players.length) {
      const aiSlots = singlePlayerSlots().filter(slot => slot.active && slot.id !== context.localPlayerID);
      let nextAI = 0;
      for (const player of plan.players) {
        const playerId = player.role === 'H' ? context.localPlayerID : aiSlots[nextAI++]?.id;
        if (playerId == null) { skipped.push('AI 席位不足，没有截断阵容'); canContinue = false; break; }
        playerIds.push(playerId);
        const who = player.role === 'H' ? '你' : `AI ${nextAI}`;
        if (!await write({ id: 'PlayerLeader', playerId, label: `${who}的领袖`, value: player.leader }) ||
            !await write({ id: 'PlayerCivilization', playerId, label: `${who}的文明`, value: player.civilization })) {
          canContinue = false; break;
        }
      }
    }
    if (canContinue) {
      const fields = extras.filter(field => field.player != null).map(field => extraField(field, playerIds[field.player]));
      await writeExtras(fields.filter(field => !mementoParameter(field.id)));
      // Preflight all mementos before clearing anything. Empty both encoded
      // slots first, so swapping the same two mementos doesn't fail on duplicates.
      const mementos = fields.filter(field => mementoParameter(field.id));
      const errors = mementos.flatMap(field => {
        const error = parameters.validate(parameter(field), field);
        return error ? [`${field.label}：${error}`] : [];
      });
      for (const playerId of new Set(mementos.map(field => field.playerId))) {
        const requested = mementos.filter(field => field.playerId === playerId);
        const otherSlots = (setup.getPlayerParameters?.(playerId) ?? []).filter(param => mementoParameter(resolve(param.ID)) && !requested.some(field => field.id === resolve(param.ID)));
        const selected = [...requested.map(field => field.value), ...otherSlots.map(param => parameters.value(param))].filter(value => value != null && value !== 'NONE');
        if (new Set(selected).size !== selected.length) errors.push('同一玩家不能装备重复的纪念物');
      }
      if (errors.length) skipped.push(...errors, '未填入这组纪念物；时代或领袖变更可能已重置原选择，请手动核对。');
      else {
        const clearing = mementos.filter(field => !matches(field) && current(field) !== 'NONE').map(field => ({ ...field, value: 'NONE', temporary: true }));
        const clearErrors = clearing.flatMap(field => {
          const error = parameters.validate(parameter(field), field);
          return error ? [`${field.label}：无法先清空槽位（${error}）`] : [];
        });
        if (clearErrors.length) skipped.push(...clearErrors);
        else {
          let cleared = true;
          for (const field of clearing) { if (!await write(field)) { cleared = false; break; } }
          if (cleared) for (const field of mementos) await write(field);
        }
      }
    }
    for (const id of ['GameRandomSeed', 'MapRandomSeed']) {
      if (canContinue && Object.hasOwn(plan.settings, id)) canContinue = await write(fromSetting(id));
    }
    // C7L1 does not encode seeds; preserve existing seeds after age/roster
    // changes instead of implying that this code supplied new seed values.
    for (const field of seedFallbacks) {
      assertReady();
      if (current(field) !== field.value) await write(field);
    }
    assertReady();
    const finalFields = applied.filter(field => !field.temporary);
    const verified = finalFields.filter(matches);
    for (const field of finalFields) if (!verified.includes(field)) skipped.push(`${field.label}：之后的设置变更使这个值失效，请手动核对`);
    if (!canContinue) skipped.push('已停止后续填入；前面已采用的设置会保留，请在新建界面核对后继续。');
    return { applied: verified, skipped };
  }
  function captureDetailed() {
    assertReady();
    const list = singlePlayerSlots(), settings = {}, players = [], extras = [], omitted = [];
    const enumerate = (params, player) => {
      if (!params) { omitted.push(`${player == null ? '游戏' : `玩家 ${player + 1}`}：无法枚举高级选项`); return; }
      for (const param of params) {
        const id = resolve(param.ID);
        if (player == null ? codeSettings.some(def => def.id === id) : ['PlayerLeader', 'PlayerCivilization'].includes(id)) continue;
        // Hidden/invalid options describe inapplicable states, not a starting
        // choice. Record them in the coverage report rather than sharing values.
        try { extras.push(parameters.capture(param, player)); }
        catch (error) { omitted.push(`${player == null ? '' : `玩家 ${player + 1} · `}${label(param.name, id ?? '未知选项')}：${error.message}`); }
      }
    };
    for (const definition of codeSettings) {
      if (definition.id === 'PlayerCount') continue; // Roster carries the count.
      const param = setup.findGameParameter(definition.id);
      if (!param) { omitted.push(`${definition.label}：当前不可读取`); continue; }
      const value = raw(param);
      if (value == null) continue;
      settings[definition.id] = definition.id.endsWith('RandomSeed') ? value : resolve(value);
    }
    enumerate(setup.getGameParameters?.());
    for (const slot of list.filter(item => item.active).sort((a, b) => (a.id === context.localPlayerID ? -1 : b.id === context.localPlayerID ? 1 : a.id - b.id))) {
      const leader = resolve(raw(setup.findPlayerParameter(slot.id, 'PlayerLeader')));
      const civilization = resolve(raw(setup.findPlayerParameter(slot.id, 'PlayerCivilization')));
      if (typeof leader !== 'string' || typeof civilization !== 'string') throw new Error('玩家阵容尚未准备好，请完成新建游戏选择后再生成复制码');
      players.push({ role: slot.id === context.localPlayerID ? 'H' : 'A', leader, civilization });
      enumerate(setup.getPlayerParameters?.(slot.id), players.length - 1);
    }
    if (!settings.Age || settings.GameRandomSeed == null || settings.MapRandomSeed == null) throw new Error('时代或种子尚未准备好，请进入新建游戏后再生成复制码');
    return { code: formatSetupCode({ settings, players, parameters: extras }, 'C7S2'), included: Object.keys(settings).length + players.length * 2 + extras.length, omitted };
  }
  return { preview, apply, capture: () => captureDetailed().code, captureDetailed };
}
