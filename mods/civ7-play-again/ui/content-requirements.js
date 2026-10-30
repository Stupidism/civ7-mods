// Shared by the local reader and game UI. The save's RequiredMods list is
// authoritative; EnabledMods alone does not make a dependency mandatory.
const MOD_KEYS = { enabled: -1083566479, required: -1259988885, id: -449879690, version: 1300745868, title: -368367976, subscription: -794177489 };

export function contentName(title, fallback) {
  if (typeof title !== 'string' || !title.trim()) return fallback;
  try {
    const translations = Object.values(JSON.parse(title)).flat().filter(row => typeof row?.text === 'string');
    return (translations.find(row => row.locale === 'zh_Hans_CN') ?? translations.find(row => row.locale === 'en_US') ?? translations[0])?.text || fallback;
  } catch { return title.startsWith('LOC_') ? fallback : title; }
}

export function requirementsFromConfiguration(expected) {
  const read = key => {
    const list = expected.game[key];
    if (!list) return undefined;
    if (list.type !== 30) throw new Error('无法识别存档中的 DLC / MOD 清单');
    return list.value.map(item => ({ ID: item.value?.[MOD_KEYS.id]?.value, version: item.value?.[MOD_KEYS.version]?.value, title: item.value?.[MOD_KEYS.title]?.value, subscriptionID: item.value?.[MOD_KEYS.subscription]?.value }));
  };
  return requirementsFromSave({ enabledMods: read(MOD_KEYS.enabled), requiredMods: read(MOD_KEYS.required) });
}

export function requirementsFromSave(save) {
  // Stock config descriptors may expose an empty default RequiredMods array
  // even when the file never recorded that list.
  const requiredKnown = Array.isArray(save.requiredMods) && !(save.contentType === 1 && save.requiredMods.length === 0);
  const requiredIds = new Set((save.requiredMods ?? []).map(mod => mod.ID));
  const rows = new Map();
  for (const mod of [...(save.enabledMods ?? []), ...(save.requiredMods ?? [])]) {
    if (typeof mod.ID !== 'string' || !mod.ID) throw new Error('存档的 DLC / MOD 清单包含无效条目');
    rows.set(mod.ID, { id: mod.ID, name: contentName(mod.title, mod.ID), kind: mod.subscriptionID ? 'MOD' : undefined, version: mod.version == null ? null : String(mod.version),
      required: requiredIds.has(mod.ID) ? true : requiredKnown ? false : null });
  }
  return [...rows.values()];
}

export function checkContent(requirements, installed, { ignored = [], reportDisabled = false } = {}) {
  const report = { checked: true, checkedCount: 0, required: [], recommended: [] };
  for (const item of requirements) {
    if (ignored.includes(item.id)) continue;
    report.checkedCount++;
    const found = Object.hasOwn(installed, item.id) ? installed[item.id] : undefined;
    // If an old file has no RequiredMods list, only a positively identified
    // UI-only mod is safe to classify as optional.
    const mandatory = item.required ?? (found?.affectsSavedGames !== false);
    let status;
    if (!found || found.installed === false) status = 'missing';
    else if (found.owned === false) status = 'unowned';
    else if (found.ambiguous) status = 'ambiguous';
    else if (item.version !== null && found.version != null && String(found.version) !== item.version) status = !mandatory && found.affectsSavedGames === false ? 'ui-version' : 'version';
    else if (reportDisabled && found.enabled === false) status = 'disabled';
    if (!status) continue;
    report[mandatory ? 'required' : 'recommended'].push({ ...item, name: contentName(found?.name, item.name),
      kind: found?.kind ?? item.kind ?? 'DLC / MOD', status, installedVersion: found?.version == null ? null : String(found.version) });
  }
  return report;
}

export function contentIssueText(item) {
  const reason = { missing: '未安装或游戏未识别', unowned: '当前账号未拥有 / 无使用权限', ambiguous: '检测到多个冲突版本',
    version: `版本不符：存档 ${item.version}，本机 ${item.installedVersion}`,
    'ui-version': `界面版本不同：存档 ${item.version}，本机 ${item.installedVersion}；可适配本机版本，无需降级`,
    disabled: '已安装但未启用，请检查附加内容' }[item.status] ?? '需要检查';
  const version = !['version', 'ui-version'].includes(item.status) && item.version !== null ? `（存档版本 ${item.version}）` : '';
  return `${item.kind} · ${item.name}${item.name !== item.id ? ` [${item.id}]` : ''}${version}\n${reason}`;
}

export const CONTENT_COLORS = { required: '#ff7777', recommended: '#f4cc62' };

// textContent deliberately prevents mod titles from becoming markup.
export function renderContentReport(container, report, message, page = 0, doc = document) {
  container.textContent = '';
  container.style.textAlign = 'left';
  const line = (text, color) => {
    const row = doc.createElement('div'); row.textContent = text;
    row.style.cssText = `white-space:pre-wrap;margin:0.4rem 0;${color ? `color:${color};` : ''}`;
    container.appendChild(row);
  };
  line(message);
  if (!report?.checked) { line('未能完成 DLC / MOD 核对，请启动本地工具后重试。'); return; }
  const rows = [...report.required.map(item => ({ item, level: 'required' })), ...report.recommended.map(item => ({ item, level: 'recommended' }))];
  if (!rows.length) line(`已核对 ${report.checkedCount} 项，未发现缺失、权限或版本问题。加载失败也可能来自配置格式或模组兼容问题。`);
  for (const { item, level } of rows.slice(page * 5, (page + 1) * 5)) {
    line(`${level === 'required' ? '必须补齐' : item.status === 'ui-version' ? '版本提醒' : '建议补齐'} · ${contentIssueText(item)}`, CONTENT_COLORS[level]);
  }
  if (report.recommended.length) line('黄色项是原存档启用过的可选内容，不会自动删除。原样读取设置若仍被游戏拒绝，建议补齐后重试。');
  if (report.note) line(report.note);
  if (rows.length > 5) line(`第 ${page + 1} / ${Math.ceil(rows.length / 5)} 页`);
}
