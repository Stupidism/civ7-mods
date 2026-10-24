import { mementoParameter, validateExtraParameter } from './setup-code.js';

// Only GameSetup parameters are portable. Never replay Configuration.getValues:
// that bag also contains session state, account information and derived values.
export function createParameterCodec({ setup, types = {}, valid = 0, label, mementoAvailability }) {
  const resolve = value => typeof value === 'number' ? setup.resolveString(value) ?? value : value;
  const scalar = param => param?.value?.value ?? param?.value;
  const invalid = value => value != null && value !== valid;
  const equal = (a, b) => Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every(value => b.includes(value)) : a === b;
  function kind(param) {
    const type = param?.domain?.type;
    for (const name of ['Select', 'Boolean', 'Integer', 'UnsignedInteger']) {
      if (type != null && (type === name || (types[name] != null && type === types[name]))) return name;
    }
    // Older UI versions (and some mod parameters) omit the type on selectors.
    return type == null && param?.domain?.possibleValues?.length ? 'Select' : null;
  }
  function value(param) {
    if (param?.array) {
      if (kind(param) !== 'Select' || !Array.isArray(param.values)) throw new Error('无法读取多选项');
      return param.values.map(item => resolve(item.value));
    }
    const raw = scalar(param);
    if (kind(param) === 'Boolean') {
      if (![true, false, 0, 1].includes(raw)) throw new Error('无法读取开关值');
      return Boolean(raw);
    }
    return kind(param) === 'Select' ? resolve(raw) : raw;
  }
  function eligibility(param, id) {
    if (!param) return '当前没有这个选项，请核对时代、地图和已安装内容';
    if (param.hidden) return '当前选项隐藏或不适用';
    if (invalid(param.invalidReason)) return '当前选项不可用';
    if (/^AgeTransitionPlayer/.test(id) || resolve(param.group) === 'LobbyOptions') return '不属于单人开局设置';
    if (!kind(param)) return '暂不支持这种选项类型';
    return null;
  }
  function validate(param, field) {
    const blocked = eligibility(param, field.id);
    if (blocked) return blocked;
    const type = kind(param), desired = field.value;
    if (Boolean(param.array) !== Array.isArray(desired)) return '单选与多选格式不匹配';
    if (type === 'Select') {
      const values = param.array ? desired : [desired];
      for (const requested of values) {
        const entry = param.domain.possibleValues?.find(item => resolve(item.value) === requested);
        if (!entry) return `找不到选项 ${requested}，请核对已安装内容`;
        if (invalid(entry.invalidReason)) return `${label(entry.invalidReason, '选项不可用')}（${requested}）`;
      }
    } else if (type === 'Boolean') {
      if (typeof desired !== 'boolean') return '必须使用开关值';
    } else if (!Number.isInteger(desired) || desired < (type === 'UnsignedInteger' ? 0 : -2147483648) || desired > (type === 'UnsignedInteger' ? 4294967295 : 2147483647)) {
      return '数值超出这个选项的整数范围';
    }
    let actual;
    try { actual = value(param); }
    catch { return '当前选项值尚未准备好'; }
    if (equal(actual, desired)) return null; // A fixed value already matches.
    if (param.readOnly) return '当前选项只读';
    if (mementoParameter(field.id)) {
      const access = mementoAvailability?.();
      if (!access) return '无法核对纪念物解锁状态';
      const slot = access.slots?.find(item => item.mementoTypeId === field.id);
      if (!slot || slot.displayType === access.lockedType) return '这个纪念物槽位尚未解锁';
      if (desired !== 'NONE') {
        const item = access.items?.find(item => String(item.mementoTypeId) === String(desired));
        if (!item || item.displayType === access.lockedType) return `纪念物尚未解锁（${desired}）`;
      }
    }
    return null;
  }
  function capture(param, player) {
    const id = resolve(param.ID);
    const blocked = eligibility(param, id);
    if (blocked) throw new Error(blocked);
    const field = validateExtraParameter({ id, value: value(param), ...(player == null ? {} : { player }) });
    // Select values represented only by process-local string handles cannot be
    // shared with another process. Numeric domains use Integer/UnsignedInteger.
    if (kind(param) === 'Select' && (Array.isArray(field.value) ? field.value : [field.value]).some(v => typeof v !== 'string')) throw new Error('无法取得可分享的选项编号');
    const error = validate(param, field);
    if (error) throw new Error(error);
    return field;
  }
  function display(param, desired) {
    const name = value => {
      const item = param?.domain?.possibleValues?.find(item => resolve(item.value) === value);
      return item ? label(item.name, String(value)) : String(value);
    };
    if (typeof desired === 'boolean') return desired ? '开启' : '关闭';
    if (Array.isArray(desired)) {
      const excluded = resolve(param?.uxHint) === 'InvertSelection';
      return desired.length ? `${excluded ? '关闭' : '已选'}：${desired.map(name).join('、')}` : excluded ? '全部启用' : '未选择';
    }
    return desired === 'NONE' && mementoParameter(resolve(param?.ID) ?? '') ? '空槽' : name(desired);
  }
  return { value, equal, validate, capture, display, resolve, eligibility };
}
