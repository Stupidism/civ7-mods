import test from 'node:test';
import assert from 'node:assert/strict';
import { checkContent, requirementsFromSave, requirementsFromConfiguration, renderContentReport, contentName, CONTENT_COLORS } from '../ui/content-requirements.js';

test('required and enabled-only DLC/MOD are classified separately, with ownership and versions', () => {
  const requirements = requirementsFromSave({ enabledMods: [
    { ID: 'dlc', title: '冰岛', version: '1' }, { ID: 'rules', title: '规则', version: '2' },
    { ID: 'ui', title: '界面', version: '1' }, { ID: 'optional-dlc', title: '可选文明', version: '1' },
  ], requiredMods: [{ ID: 'dlc', title: '冰岛', version: '1' }, { ID: 'rules', title: '规则', version: '2' }] });
  const report = checkContent(requirements, { dlc: { kind: 'DLC', owned: false, version: 1 }, rules: { kind: 'MOD', version: 1 },
    ui: { kind: 'MOD', version: 2, affectsSavedGames: false }, 'optional-dlc': { kind: 'DLC', installed: false } });
  assert.deepEqual(report.required.map(row => [row.id, row.status]), [['dlc', 'unowned'], ['rules', 'version']]);
  assert.deepEqual(report.recommended.map(row => [row.id, row.status]), [['ui', 'ui-version'], ['optional-dlc', 'missing']]);
  assert.equal(report.required[0].kind, 'DLC');
});

test('missing required metadata is conservative, duplicates collapse and required wins over UI-only', () => {
  const old = requirementsFromSave({ enabledMods: [{ ID: 'unknown' }, { ID: 'ui' }] });
  const report = checkContent(old, { ui: { affectsSavedGames: false, installed: false } });
  assert.equal(report.required[0].id, 'unknown'); assert.equal(report.recommended[0].id, 'ui');
  const known = requirementsFromSave({ enabledMods: [{ ID: 'ui' }], requiredMods: [{ ID: 'ui', version: '2' }] });
  assert.equal(known.length, 1);
  const configFallback = requirementsFromSave({ contentType: 1, enabledMods: [{ ID: 'unknown' }], requiredMods: [] });
  assert.equal(checkContent(configFallback, {}).required.length, 1);
  assert.equal(checkContent(known, { ui: { affectsSavedGames: false, version: 1 } }).required.length, 1);
  assert.throws(() => requirementsFromConfiguration({ game: { '-1083566479': { type: 2 } } }), /清单/);
});

test('disabled content appears only during failure diagnosis and excluded engine modules are ignored', () => {
  const list = [{ id: 'a', name: 'A', version: '1', required: true }];
  const mods = { a: { version: 1, enabled: false } };
  assert.equal(checkContent(list, mods).required.length, 0);
  assert.equal(checkContent(list, mods, { reportDisabled: true }).required[0].status, 'disabled');
  assert.equal(checkContent(list, {}, { ignored: ['a'] }).checkedCount, 0);
});

test('red/yellow reports use literal text, show every entry through pagination, and explain clean checks', () => {
  const doc = { createElement: () => ({ style: {} }) };
  const root = () => ({ style: {}, children: [], appendChild(row) { this.children.push(row); } });
  const rows = Array.from({ length: 8 }, (_, i) => ({ id: `id${i}`, name: i === 0 ? '<script>not markup</script>' : `name${i}`, kind: 'MOD', status: 'missing', version: '1' }));
  const report = { checked: true, checkedCount: 8, required: rows.slice(0, 3), recommended: rows.slice(3) };
  const first = root(); renderContentReport(first, report, '加载失败', 0, doc);
  assert(first.children.some(row => row.style.cssText.includes(CONTENT_COLORS.required)));
  assert(first.children.some(row => row.style.cssText.includes(CONTENT_COLORS.recommended)));
  assert(first.children.some(row => row.textContent.includes('<script>not markup</script>')));
  const second = root(); renderContentReport(second, report, '加载失败', 1, doc);
  assert(second.children.some(row => row.textContent.includes('id7')));
  const clean = root(); renderContentReport(clean, { checked: true, checkedCount: 3, required: [], recommended: [] }, '加载失败', 0, doc);
  assert(clean.children.some(row => row.textContent.includes('未发现缺失')));
  assert.equal(contentName('{"LOC_MOD":[{"locale":"zh_Hans_CN","text":"中文名字"}]}', 'id'), '中文名字');
});
