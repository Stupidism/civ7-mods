import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSingleImport, applyScreenshot } from '../ui/screenshot-settings.js';

const catalog = [
  { id: 'GameRandomSeed', label: '游戏种子', choices: [] }, { id: 'MapRandomSeed', label: '地图种子', choices: [] },
  { id: 'Map', label: '地图类型', choices: [
    { value: '{base-standard}maps/continents-voronoi.js', label: '大陆和岛屿' },
    { value: '{base-standard}maps/pangaea-voronoi.js', label: '盘古大陆和岛屿' },
    { value: '{base-standard}maps/pangaea-plus.js', label: '宽广盘古大陆（经典）' },
  ] },
  { id: 'MapSize', label: '地图尺寸', choices: ['极小', '标准', '巨大'].map(label => ({ label, value: label })) },
];
export const sharedText = `1游戏种子：1467319409 宽广盘古大陆 巨大
1地图种子：1467319429
2游戏种子：673286555 盘古大陆和岛屿 巨大
2地图种子：673286556
3游戏种子：1765076494 盘古大陆和岛屿 巨大
3地图种子：1765076533
4游戏种子：265712302 大陆和岛屿 标准
4地图种子：265712303
5游戏种子：-1935912889 盘古大陆和岛屿 巨大
5地图种子：-1935912888
6游戏种子：-664704841大陆和岛屿 巨大
6地图种子：-664704841
7游戏种子：1486332667 宽广盘古大陆 极小
7地图种子：1486333070`;
const value = (plan, id) => plan.fields.find(f => f.id === id)?.value;

test('the requested numbered text fills both exact seeds, classic pangaea and huge size', async () => {
  const lines = ['1游戏种子：1467319409 宽广盘古大陆 巨大', '1地图种子：1467319429。'];
  for (const separator of ['\n', '\r\n', ' ', '']) {
    const current = structuredClone(catalog), writes = [];
    const plan = parseSingleImport({ text: lines.join(separator) }, current);
    assert.equal(plan.fields.length, 4);
    assert.equal(value(plan, 'GameRandomSeed'), 1467319409);
    assert.equal(value(plan, 'MapRandomSeed'), 1467319429);
    assert.equal(value(plan, 'Map'), '{base-standard}maps/pangaea-plus.js');
    assert.equal(value(plan, 'MapSize'), '巨大');
    const result = await applyScreenshot(plan, {
      getCatalog: () => current, assertReady() {},
      setValue(field) {
        writes.push(field.id);
        if (field.id === 'Map' || field.id === 'MapSize') {
          for (const entry of current.filter(p => p.id.endsWith('RandomSeed'))) entry.current = 0;
        }
        current.find(p => p.id === field.id).current = field.value;
      },
    });
    assert.deepEqual(writes, ['Map', 'MapSize', 'GameRandomSeed', 'MapRandomSeed']);
    assert.equal(result.applied.length, 4);
    assert.deepEqual(result.skipped, []);
  }
});

test('inline short seeds are not consumed as a following row number', () => {
  for (const text of ['游戏种子: 123 地图种子: 456', '1游戏种子: 123 地图种子: 456']) {
    const plan = parseSingleImport({ text }, catalog);
    assert.equal(value(plan, 'GameRandomSeed'), 123);
    assert.equal(value(plan, 'MapRandomSeed'), 456);
  }
});

test('flattened numbered rows still reject mismatched or multiple groups', () => {
  for (const text of ['1游戏种子: 123 大陆和岛屿 巨大 2地图种子: 456', sharedText.replace(/\n/g, ' ')]) {
    assert.throws(() => parseSingleImport({ text }, catalog), /一次只处理一组/);
  }
});

test('multiple numbered groups are rejected instead of selecting or mixing pairs', () => {
  assert.throws(() => parseSingleImport({ text: sharedText }, catalog), /一次只处理一组/);
});
test('one cropped pair needs no Esc summary, username or original numbering', () => {
  for (const text of ['4游戏种子：265712302 大陆和岛屿 标准\n4地图种子：265712303', '游戏种子：265712302 大陆和岛屿 标准\n地图种子：265712303']) {
    const plan = parseSingleImport({ text }, catalog);
    assert.equal(plan.fields.length, 4);
    assert.equal(value(plan, 'MapSize'), '标准');
  }
});
test('different numbered orphan seeds cannot form a fabricated pair', () => {
  assert.throws(() => parseSingleImport({ text: '1游戏种子：123\n2地图种子：456' }, catalog), /一次只处理一组/);
});
test('unlabelled numbers, corrupted digits and broken number fragments stay unfilled', () => {
  for (const text of ['123456 654321', '游戏种子：123 O45 大陆和岛屿', '游戏种子：123 456 标准', '游戏种子：12345678901']) {
    assert.equal(value(parseSingleImport({ text }, catalog), 'GameRandomSeed'), undefined, text);
  }
});
test('multiple unnumbered pairs are rejected, including repeated identical seeds', () => {
  for (const text of [
    '游戏种子: 1 大陆和岛屿 标准\n地图种子: 2\n游戏种子: 3 宽广盘古大陆 巨大\n地图种子: 4',
    '游戏种子: 1\n地图种子: 2\n游戏种子: 1\n地图种子: 2',
  ]) assert.throws(() => parseSingleImport({ text }, catalog), /一次只处理一组/);
});
test('a cropped negative seed pair retains map aliases and the exact signs', () => {
  const plan = parseSingleImport({ text: '游戏种子: −1935912889 盘古大陆和岛屿 巨大\n地图种子: −1935912888' }, catalog);
  assert.equal(value(plan, 'GameRandomSeed'), -1935912889);
  assert.equal(value(plan, 'MapRandomSeed'), -1935912888);
  assert.equal(value(plan, 'Map'), '{base-standard}maps/pangaea-voronoi.js');
  assert.equal(value(plan, 'MapSize'), '巨大');
});
