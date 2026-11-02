import test from 'node:test';
import assert from 'node:assert/strict';
import { installCommandHooks, installAutoTargetFocus } from '../ui/command-hooks.js';

test('native receiver, arguments and return value survive wrappers', () => {
  const world = { requestMoveOperation(...args) { assert.equal(this, world); return args; }, actionMouseRightButton(...args) { assert.equal(this, world); return this.requestMoveOperation(...args); } };
  const handlers = { switchToActionInterfaceMode(...args) { assert.equal(this, handlers); return args; } };
  const dispose = installCommandHooks({ worldInput: world, handlers, tryJoin: () => false, tryReinforce: () => false });
  const args = [{ id: 3 }, { X: 1, Y: 2 }, 'extra'];
  assert.deepEqual(world.actionMouseRightButton(...args), args);
  assert.deepEqual(handlers.switchToActionInterfaceMode(...args), args);
  dispose();
});

test('throwing native right click resets the scope before later move requests', () => {
  const failure = new Error('native failure');
  let attempts = 0;
  const world = { actionMouseRightButton() { throw failure; }, requestMoveOperation() { return 'move'; } };
  const handlers = { switchToActionInterfaceMode() {} };
  installCommandHooks({ worldInput: world, handlers, tryJoin: () => { attempts++; return true; }, tryReinforce: () => false });
  assert.throws(() => world.actionMouseRightButton(), error => error === failure);
  assert.equal(world.requestMoveOperation({}, {}), 'move');
  assert.equal(attempts, 0);
});

test('disposal preserves later wrappers and deactivates retained inner hooks', () => {
  let attempts = 0;
  const world = { actionMouseRightButton(...args) { return this.requestMoveOperation(...args); }, requestMoveOperation() { return 'move'; } };
  const handlers = { switchToActionInterfaceMode() {} };
  const dispose = installCommandHooks({ worldInput: world, handlers, tryJoin: () => { attempts++; return true; }, tryReinforce: () => false });
  const inner = world.requestMoveOperation;
  const outer = function(...args) { return inner.apply(this, args); };
  world.requestMoveOperation = outer;
  dispose();
  assert.equal(world.requestMoveOperation, outer);
  assert.equal(world.actionMouseRightButton({}, {}), 'move');
  assert.equal(attempts, 0);
});

test('panel focus wrapper preserves native receiver, arguments, return and exceptions',()=>{
  const failure=new Error('native focus failure');
  const prototype={realizeFocus(...args){assert.equal(this,panel);if(args[0]==='throw')throw failure;return args;}};
  const panel=Object.create(prototype);panel.unitId=7;
  const dispose=installAutoTargetFocus({panelPrototype:prototype,preserveWorldFocus:()=>false});
  assert.deepEqual(panel.realizeFocus('native',2),['native',2]);
  assert.throws(()=>panel.realizeFocus('throw'),error=>error===failure);
  dispose();
});

test('disposing the panel hook preserves a later mod wrapper and disables retained guard',()=>{
  const prototype={realizeFocus(){return 'native';}};
  const dispose=installAutoTargetFocus({panelPrototype:prototype,preserveWorldFocus:()=>true});
  const inner=prototype.realizeFocus;
  const outer=function(...args){return inner.apply(this,args);};prototype.realizeFocus=outer;
  assert.equal(prototype.realizeFocus(),undefined);
  dispose();assert.equal(prototype.realizeFocus,outer);assert.equal(prototype.realizeFocus(),'native');
});
