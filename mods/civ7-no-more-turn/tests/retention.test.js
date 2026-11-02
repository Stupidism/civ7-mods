import test from 'node:test';
import assert from 'node:assert/strict';
import { oldRestSaves, RestRetention } from '../ui/rest-retention.js';
import fs from 'node:fs';
import vm from 'node:vm';

const scope = { location: 1, category: 4, type: 1, contentType: 0 };
const name = i => `RestGuard_Idle_T${i}_20261022-120000-000_${i}-abcdef`;
const file = (i, extra = {}) => ({ fileName: name(i), location: 1, locationCategories: 4, isAutosave: true,
  type: 1, contentType: 0, saveTime: i, slot: i, additionalInfo: `slot-${i}`, ...extra });
const list = n => Array.from({ length: n }, (_, i) => file(i + 1));

test('retention keeps newest 10 across all rest kinds and campaigns', () => {
  const files = list(15);
  files[1].fileName = files[1].fileName.replace('Idle', 'Turn');
  files[2].fileName = files[2].fileName.replace('Idle', 'Time');
  files[3].fileName = files[3].fileName.replace('Idle', 'Night');
  assert.deepEqual(oldRestSaves(files.reverse(), 10, scope, name(15)).map(f => f.saveTime), [5, 4, 3, 2, 1]);
  assert.equal(oldRestSaves(list(10), 10, scope, name(10)).length, 0);
});

test('default, manual, other-mod, cloud, quick, legacy normal and configuration saves are never selected', () => {
  const unrelated = [file(0, { fileName: 'AutoSave_1' }), file(0, { fileName: 'BeforeEndTurn' }),
    file(0, { fileName: 'BeforeDiplomacy' }), file(0, { fileName: 'RestGuard_my_manual_save' }),
    file(0, { fileName: '../' + name(0) }), file(0, { location: 2 }), file(0, { type: 2 }),
    file(0, { locationCategories: 1 }), file(0, { locationCategories: 2 }), file(0, { contentType: 1 }),
    file(0, { isQuicksave: true }), file(0, { location: undefined })];
  assert.deepEqual(oldRestSaves([...unrelated, ...list(12)], 10, scope, name(12)).map(f => f.saveTime), [2, 1]);
});

test('newly confirmed save is protected against clock rollback; stale lists cannot delete', () => {
  const files = [file(20, { fileName: name(20) + '.Civ7Save', saveTime: 0 }), ...list(19)];
  const old = oldRestSaves(files, 1, scope, name(20));
  assert.equal(old.length, 19);
  assert.ok(!old.some(f => f.fileName.startsWith(name(20))));
  assert.deepEqual(oldRestSaves(list(20), 1, scope, name(21)), []);
  assert.deepEqual(oldRestSaves([...list(10), ...list(10)], 10, scope, name(10)), []);
  for (const keep of [0, -1, undefined, NaN]) assert.deepEqual(oldRestSaves(list(20), keep, scope), []);
});

function harness() {
  const h = { now: 0, busy: false, keep: 10, queries: 0, closed: [], deleted: [], accepted: true, warnings: 0 };
  h.state = { status: 'saved', fileName: name(15) };
  h.retention = new RestRetention({ now: () => h.now, busy: () => h.busy, keep: () => h.keep,
    scope: () => scope, query: () => ++h.queries, close: id => h.closed.push(id),
    remove: f => { h.deleted.push(f); return h.accepted; },
    isPending: r => r?.result === 1, succeeded: r => r?.result === 0, warn: () => h.warnings++ });
  h.start = () => { h.retention.request(h.state); h.retention.poll(); };
  h.files = files => h.retention.onFiles(h.queries, files);
  h.complete = result => h.retention.onRemoved({ result });
  return h;
}

test('pruning waits for successful save request, owns its query ID, and deletes serially', () => {
  const h = harness();
  h.retention.poll(); assert.equal(h.queries, 0);
  h.busy = true; h.start(); assert.equal(h.queries, 0);
  h.busy = false; h.retention.poll();
  h.retention.onFiles(999, list(15)); h.retention.poll(); assert.equal(h.deleted.length, 0);
  h.files(list(15)); assert.deepEqual(h.closed, [1]);
  for (let i = 1; i <= 5; i++) {
    h.retention.poll(); h.retention.poll();
    assert.equal(h.deleted.length, i);
    assert.equal(h.deleted.at(-1).saveTime, i);
    h.complete(1); h.retention.poll(); assert.equal(h.deleted.length, i);
    h.complete(0);
  }
  h.retention.poll();
  assert.equal(h.state.cleanup, 'done');
  assert.equal(h.state.status, 'saved');
});

for (const scenario of ['rejection', 'delete-failure', 'query-timeout', 'delete-timeout', 'missing-new-save', 'load']) {
  test(`${scenario} stops cleanup and never broadens deletion scope`, () => {
    const h = harness(); h.start();
    if (scenario === 'missing-new-save') h.files(list(14));
    else if (scenario !== 'query-timeout') h.files(list(15));
    if (scenario === 'rejection') h.accepted = false;
    if (scenario === 'load') h.retention.cancel();
    h.retention.poll();
    if (scenario === 'delete-failure') h.complete(99);
    if (scenario.endsWith('timeout')) { h.now = 30001; h.retention.poll(); }
    const count = h.deleted.length;
    h.complete(0); h.retention.poll();
    assert.equal(h.deleted.length, count);
    assert.equal(h.state.cleanup, 'failed');
    assert.equal(h.state.status, 'saved');
  });
}

test('increasing retention count before deletion preserves the newly requested number', () => {
  const h = harness(); h.start(); h.files(list(15));
  h.keep = 15; h.retention.poll();
  assert.equal(h.deleted.length, 0);
  assert.equal(h.state.cleanup, 'done');
});

test('native adapter requests only local autosaves and preserves full deletion identity', () => {
  const listeners = new Map(), queries = [], deletions = [], closes = [];
  const sandbox = { Date, console, RestRetention,
    SaveLocations: { LOCAL_STORAGE: 1 }, SaveLocationCategories: { NORMAL: 1, AUTOSAVE: 4 }, SaveFileTypes: { GAME_STATE: 0 },
    SerializerResult: { RESULT_PENDING: 1, RESULT_OK: 0 },
    GameStateStorage: { getGameConfigurationSaveType: () => 1,
      querySaveGameList: params => { queries.push(params); return 42; }, closeFileListQuery: id => closes.push(id) },
    Network: { deleteGame: params => { deletions.push(params); return true; } },
    engine: { on: (name, fn) => listeners.set(name, fn), off: name => listeners.delete(name) } };
  const code = fs.readFileSync(new URL('../ui/rest-retention.js', import.meta.url), 'utf8');
  vm.runInNewContext(code.slice(code.indexOf('export function createRestRetention')).replace('export ', '') + '\nglobalThis.retention = createRestRetention(() => 10, () => false);', sandbox);
  sandbox.retention.request({ status: 'saved', fileName: name(11) }); sandbox.retention.poll();
  assert.equal(queries[0].LocationOptions, 4); assert.equal(queries[0].Location, 1);
  listeners.get('FileListQueryResults')(42, list(11)); sandbox.retention.poll();
  assert.equal(deletions.length, 1);
  assert.equal(deletions[0].LocationCategories, 4);
  assert.equal(deletions[0].FileName, name(1)); assert.equal(deletions[0].Slot, 1);
  assert.equal(deletions[0].AdditionalInfo, 'slot-1'); assert.deepEqual(closes, [42]);
  sandbox.retention.destroy(); assert.equal(listeners.size, 0);
});


test('failed or unconfirmed new saves never trigger retention queries or deletions', () => {
  const h = harness();
  for (const status of ['saving', 'failed', 'unconfirmed', 'unavailable']) {
    h.retention.request({ status, fileName: name(15) }); h.retention.poll();
  }
  assert.equal(h.queries, 0); assert.equal(h.deleted.length, 0);
});
