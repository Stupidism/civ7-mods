import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fixture, translations, REINFORCE } from './game-fixture.mjs';

test('every locale has matching keys and interpolation parameters', () => {
  assert.deepEqual(Object.keys(translations.EnglishText).sort(), Object.keys(translations.LocalizedText).sort());
  for (const [key, value] of Object.entries(translations.EnglishText)) {
    assert.deepEqual(value.match(/\{\d+\}/g) ?? [], translations.LocalizedText[key].match(/\{\d+\}/g) ?? [], key);
  }
  assert.equal(translations.LocalizedText.LOC_WC_MOD_NAME, '微操大师常凯申');
});

test('all runtime localization references have both translations', async () => {
  for (const file of ['tactical-controls.js', 'war-controls.js', 'settings-ui.js']) {
    const source = await readFile(new URL('../ui/' + file, import.meta.url), 'utf8');
    for (const [tag] of source.matchAll(/LOC_(?:WC|OPTIONS_GROUP_WAR_CONTROLS)[A-Z_]*/g)) {
      assert.ok(translations.EnglishText[tag], tag);
      assert.ok(translations.LocalizedText[tag], tag);
    }
  }
});

test('tactical panels use the current game locale without a mod language setting', async () => {
  const f = await fixture({mouse:{singleReinforcement:false}});
  f.unpack();
  f.state.language = 'en_US';
  f.state.operations.set(REINFORCE, {Success:true, Plots:[1]});
  f.context.UnitActionHandlers.switchToActionInterfaceMode(REINFORCE, {UnitID:f.id});
  f.flush();
  assert.ok(f.state.notices.includes('Reinforcement target 1/1: Unit 1'));
  assert.ok(f.state.elements.some(e => e.attrs.caption === 'Next'));
  f.state.language = 'zh_Hans_CN';
  f.emitWindow('keydown',{key:'ArrowDown'});
  assert.ok(f.state.elements.some(e => e.attrs.caption === '下一个'));
  assert.equal('language' in f.state.settings.getConfig(), false);
});
