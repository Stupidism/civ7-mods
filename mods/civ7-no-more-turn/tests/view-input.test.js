import { catalogs, useGameLanguage } from './locale-fixture.js';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { RestView } from '../ui/rest-view.js';
import { RestSession } from '../ui/rest-session.js';
import { normalizeConfig } from '../ui/rest-model.js';

function viewHarness(language = 'zh_Hans_CN') {
  useGameLanguage(language);
  globalThis.document = { createElement() {
    const attrs = new Map();
    const events = new Map();
    return {
      children: [], style: {},
      appendChild(node) {
        if (node.parentElement) node.remove();
        this.children.push(node); node.parentElement = this;
      },
      insertBefore(node, reference) {
        if (node.parentElement) node.remove();
        this.children.splice(this.children.indexOf(reference), 0, node); node.parentElement = this;
      },
      remove() { this.parentElement.children = this.parentElement.children.filter(node => node !== this); },
      contains(node) { return this === node || this.children.some(child => child.contains(node)); },
      querySelectorAll() {
        return this.children.flatMap(child => [...(child.getAttribute('data-c7r-action') ? [child] : []), ...child.querySelectorAll()]);
      },
      setAttribute: (k, v) => attrs.set(k, v), getAttribute: k => attrs.get(k),
      addEventListener: (k, fn) => events.set(k, fn),
      fire(name) { events.get(name)?.(); }, closest() { return this; },
    };
  } };
  const view = Object.create(RestView.prototype);
  Object.assign(view, { actions: new Map(), sequence: 0, root: { contains: () => true } });
  return view;
}

test('rest mounts below an existing native dialog and later dialogs can appear above it', () => {
  viewHarness();
  const body = document.createElement('body');
  const popups = document.createElement('div');
  const options = document.createElement('screen-options');
  const dialog = document.createElement('screen-dialog-box');
  body.appendChild(popups); popups.appendChild(options); popups.appendChild(dialog);
  document.body = body;
  document.querySelector = selector => selector === '.fxs-popups' ? popups :
    selector === 'screen-dialog-box' ? dialog : null;
  const view = new RestView({ resume() {}, quit() {} });
  view.showRest({ reason: 'turn', turn: 5, durationMs: 300000 });
  assert.ok(view.root.parentElement === popups, 'rest must share the native popup layer');
  assert.ok(popups.children[0] === options && popups.children[1] === view.root && popups.children[2] === dialog);
  dialog.remove();
  const laterDialog = document.createElement('screen-dialog-box');
  popups.appendChild(laterDialog);
  view.showRest({ reason: 'turn', turn: 5, durationMs: 300000 });
  assert.ok(popups.children.at(-1) === laterDialog, 'timer refresh must not raise the rest overlay above a dialog');
  delete globalThis.document;
});

test('one native modal click changes a setting once despite component and DOM notifications', () => {
  const view = viewHarness();
  view.modal = { contains: () => true };
  let restMinutes = 5;
  const button = view.button('−', () => { restMinutes -= 0.5; });
  view.activate(button); // ContextManager's guarded engine FINISH event.
  button.fire('action-activate');
  button.fire('click');
  assert.equal(restMinutes, 4.5);
  button.setAttribute('disabled', 'true');
  view.activate(button);
  assert.equal(restMinutes, 4.5);
  delete globalThis.document;
});

test('voluntary rest uses the shared frame, elapsed time and an always enabled continue button', () => {
  const view = viewHarness();
  view.root = document.createElement('div');
  view.launcher = { style: {} };
  view.mountLauncher = () => {};
  let resumes = 0;
  view.callbacks = { resume() { resumes++; } };
  view.showIdleRest();
  const card = view.card;
  view.updateIdleRest(60000, false);
  assert.equal(view.mode, 'idle');
  assert.equal(view.modal.getAttribute('aria-label'), '主动休息计时');
  assert.equal(view.timer.textContent, '01:00');
  assert.equal(view.progress.style.width, '20%');
  assert.equal(view.continueButton.getAttribute('disabled'), 'false');
  assert.equal(view.continueButton.getAttribute('caption'), '继续游戏');
  view.activate(view.continueButton);
  assert.equal(resumes, 1);
  view.showIdleRest();
  assert.equal(view.card, card, 'timer updates do not rebuild the button under the pointer');
  view.updateIdleRest(360000, true);
  assert.equal(view.timer.textContent, '06:00');
  assert.equal(view.progress.style.width, '100%');
  assert.match(view.message.textContent, /已完成一次休息/);
  assert.equal(view.continueButton.getAttribute('disabled'), 'false');
  delete globalThis.document;
});

test('switching to a forced break retains the countdown lock and removes idle actions', () => {
  const view = viewHarness();
  view.root = document.createElement('div');
  view.launcher = { style: {} };
  view.mountLauncher = () => {};
  let resumes = 0;
  view.callbacks = { resume() { resumes++; } };
  view.showIdleRest();
  const oldButton = view.continueButton;
  view.showRest({ reason: 'time', durationMs: 300000 });
  assert.equal(view.mode, 'rest');
  assert.equal(view.timer.textContent, '05:00');
  assert.equal(view.continueButton.getAttribute('disabled'), 'true');
  view.activate(view.continueButton);
  view.activate(oldButton);
  assert.equal(resumes, 0);
  view.updateRest(0, 300000);
  assert.equal(view.timer.textContent, '00:00');
  assert.equal(view.continueButton.getAttribute('caption'), '休息完成，继续');
  view.activate(view.continueButton);
  assert.equal(resumes, 1);
  delete globalThis.document;
});

test('exit button remains available before the rest timer finishes', () => {
  const view = viewHarness();
  view.root = document.createElement('div');
  view.launcher = { style: {} };
  view.mountLauncher = () => {};
  let quits = 0;
  view.callbacks = { resume() {}, quit() { quits++; } };
  view.showRest({ reason: 'turn', turn: 5, durationMs: 300000 });
  assert.equal(view.continueButton.getAttribute('disabled'), 'true');
  assert.equal(view.quitButton.getAttribute('caption'), '退出游戏');
  view.activate(view.quitButton);
  view.quitButton.fire('action-activate');
  assert.equal(quits, 1, 'one engine click opens only one confirmation');
  delete globalThis.document;
});

test('HUD activation opens settings once and ignores the following DOM click', () => {
  const view = viewHarness();
  view.root.contains = () => false; // HUD is docked outside the modal root.
  let opens = 0;
  view.launcher = view.button('休息设置', () => { opens++; view.modal = { contains: () => false }; }, '', 'fxs-activatable');
  view.launcher.fire('action-activate');
  view.launcher.fire('click');
  assert.equal(opens, 1);
  delete globalThis.document;
});


test('HUD shows the session turns remaining and keeps that progress after loading', () => {
  viewHarness();
  document.body = document.createElement('body');
  document.querySelector = () => null;
  const view = new RestView({});
  const session = new RestSession();
  const config = normalizeConfig({ nightEnabled: false });
  const at = turn => ({ turn, context: 'a', token: `a:${turn}` });
  session.tick(at(10), config, 0);
  view.updateLauncher(at(10), config, false, session, 0);
  assert.equal(view.turnMetric.value.textContent, '5');
  for (const turn of [10, 11]) session.requestTurn(at(turn), config, 1);
  session.beginLoading(2); session.finishLoading(3);
  view.updateLauncher(at(5), config, false, session, 3);
  assert.equal(view.turnMetric.value.textContent, '3');
  for (const turn of [5, 6]) session.requestTurn(at(turn), config, 4);
  view.updateLauncher(at(7), config, false, session, 4);
  assert.equal(view.turnMetric.value.textContent, '1');
  assert.match(view.launcher.getAttribute('data-tooltip-content'), /本回合结束时触发/);
  delete globalThis.document;
});


test('save feedback stays separate from the timer and never disables voluntary continue', () => {
  const view = viewHarness();
  view.root = document.createElement('div');
  view.launcher = { style: {} }; view.mountLauncher = () => {};
  view.callbacks = { resume() {}, quit() {} };
  view.showIdleRest();
  for (const status of ['waiting', 'saving', 'saved', 'failed', 'unconfirmed', 'unavailable']) {
    view.updateSaveStatus({ status, fileName: 'RestGuard_Idle_T10_example' });
    view.updateIdleRest(60000, false);
    assert.ok(view.saveStatus.textContent.length > 0);
    assert.equal(view.saveStatus.getAttribute('data-tooltip-content'), 'RestGuard_Idle_T10_example');
    assert.equal(view.continueButton.getAttribute('disabled'), 'false');
    assert.equal(view.timer.textContent, '01:00');
  }
  delete globalThis.document;
});

test('night view disables Continue, displays its configured window, and allows Exit', () => {
  const view = viewHarness();
  view.root = document.createElement('div'); view.launcher = { style: {} }; view.mountLauncher = () => {};
  let resumes = 0, quits = 0;
  view.callbacks = { resume() { resumes++; }, quit() { quits++; } };
  view.showNight({ startedAt: 0, endsAt: 3600000 }, normalizeConfig(), 60000);
  assert.equal(view.mode, 'night'); assert.equal(view.timer.textContent, '00:59:00');
  assert.match(view.message.textContent, /22:00–07:00/);
  view.activate(view.continueButton); view.activate(view.quitButton);
  assert.equal(resumes, 0); assert.equal(quits, 1);
  delete globalThis.document;
});

for (const language of ['en_US', 'zh_Hans_CN', 'fr_FR']) {
  test(`all break modes, controls, save states and HUD follow game language ${language}`, () => {
    const view = viewHarness(language);
    const english = language !== 'zh_Hans_CN';
    document.body = document.createElement('body'); document.querySelector = () => null;
    const full = new RestView({ resume() {}, quit() {} });
    const check = () => {
      const walk = node => {
        const values = [node.textContent, ...['caption', 'title', 'aria-label', 'data-tooltip-content'].map(k => node.getAttribute(k))].filter(Boolean);
        for (const text of values) {
          assert.doesNotMatch(text, /LOC_RG_|\{\d+\}/);
          if (english) assert.doesNotMatch(text.replaceAll('No More Turn（不再来一回合）', ''), /[\u3400-\u9fff]/);
        }
        node.children.forEach(walk);
      };
      walk(full.root);
    };
    full.showIdleRest();
    assert.equal(full.continueButton.getAttribute('caption'), english ? 'Continue game' : '继续游戏');
    assert.equal(full.quitButton.getAttribute('caption'), english ? 'Exit game' : '退出游戏');
    for (const rested of [false, true]) { full.updateIdleRest(300000, rested); check(); }
    for (const reason of ['turn', 'time']) {
      full.close(); full.showRest({ reason, turn: 42, durationMs: 300000 });
      assert.equal(full.card.children[0].getAttribute('title'), english ? 'Required break' : '强制休息');
      check(); full.updateRest(0, 300000); check();
    }
    full.showNight({ startedAt: 0, endsAt: 3600000 }, normalizeConfig(), 0);
    assert.equal(full.continueButton.getAttribute('caption'), english ? 'Night-time break in progress' : '夜间休息中');
    assert.match(full.message.textContent, /22:00/); assert.match(full.message.textContent, /07:00/); check();
    for (const status of ['waiting', 'saving', 'saved', 'failed', 'unavailable', 'unconfirmed', 'unknown']) {
      full.updateSaveStatus({ status, cleanup: 'failed', fileName: 'RestGuard_Night_T42_example' }); check();
    }
    full.close();
    const session = new RestSession(); const current = { turn: 42, token: '42' };
    session.start(0);
    for (const config of [normalizeConfig(), normalizeConfig({ turnEnabled: false, timeEnabled: false }),
      normalizeConfig({ turnEnabled: false, timeEnabled: false, nightEnabled: false })]) {
      for (const now of [0, 60000, 300000]) { full.updateLauncher(current, config, true, session, now); check(); }
    }
    delete globalThis.document; delete globalThis.Locale;
  });
}

test('English and Chinese catalogs cover the same keys and parameters', () => {
  assert.deepEqual(Object.keys(catalogs.en_US).sort(), Object.keys(catalogs.zh_Hans_CN).sort());
  for (const [key, text] of Object.entries(catalogs.en_US)) {
    assert.deepEqual([...new Set(text.match(/\{\d+\}/g) ?? [])].sort(),
      [...new Set(catalogs.zh_Hans_CN[key].match(/\{\d+\}/g) ?? [])].sort(), key);
  }
  const source = readFileSync(new URL('../ui/rest-view.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /[\u3400-\u9fff]|navigator\.language|getCurrentLanguage|process\.env/);
  for (const [, key] of source.matchAll(/\bt\('([^']+)'/g)) assert.ok(catalogs.en_US[`LOC_RG_${key}`], key);
});

test('controller navigates enabled actions, confirms focused action and restores prior focus', () => {
  const view = viewHarness();
  view.root = document.createElement('div'); view.launcher = {style:{}}; view.mountLauncher = () => {};
  const prior = {isConnected:true}; let focus = prior, resumes = 0, quits = 0, dialog = false;
  view.callbacks = {currentFocus:()=>focus, setFocus:node=>{focus=node;}, hasDialog:()=>dialog,
    resume:()=>resumes++, quit:()=>quits++};
  view.showIdleRest();
  assert.equal(focus, view.continueButton);
  view.navigate(1); assert.equal(focus, view.quitButton);
  view.activateFocused(); assert.equal(quits,1); assert.equal(resumes,0);
  view.navigate(-1); view.activateFocused(); assert.equal(resumes,1);
  view.close(); assert.equal(focus,prior);
  view.showRest({reason:'turn',turn:10,durationMs:300000});
  assert.equal(focus,view.quitButton,'locked Continue cannot receive controller focus');
  view.navigate(1); assert.equal(focus,view.quitButton);
  view.updateRest(0,300000); view.navigate(1); assert.equal(focus,view.continueButton);
  view.activateFocused(); assert.equal(resumes,2);
  dialog=true; const nativeDialog={}; focus=nativeDialog;
  view.updateRest(0,300000); assert.equal(focus,nativeDialog,'timer cannot steal native dialog focus');
  delete globalThis.document;
});
