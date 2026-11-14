import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiagnosticRecorder, MAX_BYTES, MAX_EVENTS } from '../ui/diagnostics-recorder.js';

test('long analog storms are bounded, sampled at four per second, and writes are throttled', async () => {
  let time = 1000, writes = 0, saved;
  const recorder = createDiagnosticRecorder({ page: 'game', build: 'test', now: () => time, persist: value => { writes++; saved = value; } });
  for (let i = 0; i < 5000; i++) recorder.record({ stage: 'raw-engine', kind: 'input', action: 'nav-move', status: 'UPDATE', x: .5, y: 1 });
  assert.equal(recorder.snapshot().sessions[0].events.length, 4);
  await recorder.flush(); await recorder.flush(); assert.equal(writes, 1);
  time += 9999; await recorder.flush(); assert.equal(writes, 1);
  recorder.mark('after-storm'); time++; await recorder.flush(); assert.equal(writes, 2);
  assert.ok(saved.sessions.flatMap(x => x.events).length <= MAX_EVENTS);
  assert.ok(JSON.stringify(saved).length <= MAX_BYTES);
});

test('changing-vector jitter and mark storms still obey the four-per-second admission cap', () => {
  let time = 1000;
  const recorder = createDiagnosticRecorder({ now: () => time });
  for (let i = 0; i < 1000; i++) recorder.record({ stage: 'raw-engine', kind: 'input', action: 'nav-move', status: 'UPDATE', x: i / 999, y: i % 2 ? -1 : 1 });
  for (let i = 0; i < 1000; i++) recorder.mark(`mark-${i}`);
  const session = recorder.snapshot().sessions.at(-1);
  assert.equal(session.events.filter(x => x.action === 'nav-move').length, 4);
  assert.equal(session.events.filter(x => x.kind === 'mark').length, 4);
  assert.ok(Object.keys(session.counters).length <= 64);
  time++;
});

test('UTF-8 payloads, imported nested state and counter cardinality are sanitized to hard bounds', () => {
  const huge = '测'.repeat(100000);
  const initial = { schema: 1, sessions: [{ id: 'foreign', startup: { page: huge, build: huge, started: 1 }, events: new Array(1000).fill({ kind: 'mark', label: huge }), counters: Object.fromEntries(new Array(1000).fill(0).map((_, i) => [`k${i}`, i + 1])) }] };
  const recorder = createDiagnosticRecorder({ initial });
  const snapshot = recorder.snapshot(); delete snapshot.status;
  assert.ok(new TextEncoder().encode(JSON.stringify(snapshot)).byteLength <= MAX_BYTES);
  assert.ok(snapshot.sessions[0].events.length <= MAX_EVENTS);
  assert.ok(Object.keys(snapshot.sessions[0].counters).length <= 64);
});

test('reload retains three startup summaries separately while rolling old events', () => {
  let payload = null;
  for (let page = 0; page < 5; page++) {
    const recorder = createDiagnosticRecorder({ page: `p${page}`, build: `b${page}`, now: () => 100 + page, initial: payload });
    for (let i = 0; i < 300; i++) recorder.record({ stage: 'adapter', kind: 'mark', label: `event-${page}-${i}` });
    payload = recorder.snapshot(); delete payload.status;
  }
  assert.deepEqual(payload.sessions.map(x => x.startup.page), ['p2', 'p3', 'p4']);
  assert.ok(payload.sessions.reduce((n, x) => n + x.events.length, 0) <= MAX_EVENTS);
  assert.ok(payload.sessions.every(x => x.startup.started != null));
});

test('initial and latest health summaries survive event rollover and reload', () => {
  let payload = null;
  let time = 1000;
  let recorder = createDiagnosticRecorder({ page: 'game', build: 'initial', now: () => time, initial: payload });
  recorder.record({ stage: 'adapter', kind: 'health', reason: 'initialized', enabled: false, swapSticks: true });
  recorder.record({ stage: 'adapter', kind: 'health', reason: 'changed', enabled: true, swapSticks: false });
  for (let i = 0; i < 600; i++) {
    time += 250;
    recorder.record({ stage: 'map-route', kind: 'input', action: 'nav-move', source: 'nav-move',
      status: 'UPDATE', x: i % 10, y: i % 7, t: i });
  }
  let session = recorder.snapshot().sessions.at(-1);
  assert.equal(session.initialHealth.reason, 'initialized');
  assert.equal(session.initialHealth.enabled, false);
  assert.equal(session.latestHealth.reason, 'changed');
  assert.equal(session.latestHealth.swapSticks, false);
  assert.ok(session.events.length <= MAX_EVENTS);
  assert.ok(!session.events.some(event => event.reason === 'initialized'));

  payload = recorder.snapshot();
  delete payload.status;
  recorder = createDiagnosticRecorder({ page: 'game', build: 'reload', now: () => 5000, initial: payload });
  session = recorder.snapshot().sessions.find(item => item.startup.bcsVersion === 'initial');
  assert.equal(session.initialHealth.reason, 'initialized');
  assert.equal(session.latestHealth.reason, 'changed');
});

test('quota or readback failure pauses persistence but keeps memory and never throws to input', async () => {
  const recorder = createDiagnosticRecorder({ persist: () => { throw new Error('quota'); } });
  assert.doesNotThrow(() => recorder.record({ stage: 'raw-engine', action: 'nav-move', status: 'START' }));
  assert.equal(await recorder.flush(true), false); assert.equal(recorder.snapshot().status.persistencePaused, true);
  recorder.mark('still-alive'); assert.ok(recorder.snapshot().sessions[0].events.some(x => x.label === 'still-alive'));
  assert.equal(await recorder.flush(true), false);
});

