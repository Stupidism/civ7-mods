import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepeater, nextItem } from '../ui/navigation.js';
const S = { START: 1, UPDATE: 2, FINISH: 3, HOLD: 4 };
test('a press and release navigate once; release-only sources still work', () => {
  const repeat = createRepeater(() => 0);
  assert.equal(repeat('row', 'right', S.START, S), true);
  assert.equal(repeat('row', 'right', S.FINISH, S), false);
  assert.equal(repeat('row', 'right', S.FINISH, S), true);
});
test('held direction has a delay and repeat rate, changing scope resets it', () => {
  let time = 0; const repeat = createRepeater(() => time);
  assert.equal(repeat('row', 'down', S.UPDATE, S), true);
  time = 319; assert.equal(repeat('row', 'down', S.UPDATE, S), false);
  time = 320; assert.equal(repeat('row', 'down', S.UPDATE, S), true);
  time = 449; assert.equal(repeat('row', 'down', S.UPDATE, S), false);
  time = 450; assert.equal(repeat('row', 'down', S.UPDATE, S), true);
  assert.equal(repeat('panel', 'down', S.START, S), true);
  assert.equal(repeat('panel', null, S.FINISH, S), false);
});
test('lists clamp at ends and recover a rebuilt or empty list', () => {
  const items = [{}, {}, {}];
  assert.equal(nextItem(items, items[0], 'left'), items[0]);
  assert.equal(nextItem(items, items[2], 'down'), items[2]);
  assert.equal(nextItem(items, {}, 'down'), items[0]);
  assert.equal(nextItem([], null, 'down'), null);
});
test('grid up/down follows the closest column; horizontal traversal reaches all icons', () => {
  const items = [[0, 0], [50, 0], [100, 0], [0, 50], [50, 50]].map(([left, top]) =>
    ({ getBoundingClientRect: () => ({ left, top, width: 40, height: 40 }) }));
  assert.equal(nextItem(items, items[1], 'down', true), items[4]);
  assert.equal(nextItem(items, items[4], 'up', true), items[1]);
  assert.equal(nextItem(items, items[2], 'right', true), items[3]);
});
