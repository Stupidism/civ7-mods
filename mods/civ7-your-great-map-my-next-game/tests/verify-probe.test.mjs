import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures.mjs';
import { parseNativeSave, extractSetup, KEYS } from '../tools/native-save.mjs';
import { expectedConfiguration } from '../tools/expected-configuration.mjs';
import { evaluateProbe } from '../tools/verify-probe.mjs';

test('a matching result cannot prove loading when the baseline already matched', () => {
  const parsed = parseNativeSave(fixture().bytes), setup = extractSetup(parsed), expected = expectedConfiguration(parsed);
  const after = { schemaVersion: 1, inShell: true, isGameStarted: false, game: setup.game, map: setup.map, players: setup.players };
  const report = { status: 'loaded-needs-comparison', request: { ContentType: 1, FileName: 'test.Civ7Save' }, before: after, after };
  assert.equal(evaluateProbe(expected, report).outcome, 'inconclusive-baseline-already-matched');
  report.before = JSON.parse(JSON.stringify(after)); report.before.map[KEYS.randomSeed]++;
  const result = evaluateProbe(expected, report);
  assert.equal(result.verified, true);
  assert.equal(result.launchVerified, false);
  assert.equal(result.sourceSha256, expected.sourceSha256);
  const before = report.before;
  delete report.before;
  assert.equal(evaluateProbe(expected, report).outcome, 'inconclusive-baseline-missing');
  report.before = before;
  assert.equal(evaluateProbe(expected, { ...report, request: undefined }).verified, false);
  report.after.game[KEYS.randomSeed]++;
  assert.equal(evaluateProbe(expected, report).outcome, 'configuration-mismatch');
});

test('failure and timeout reports never earn a verification result', () => {
  const expected = expectedConfiguration(parseNativeSave(fixture().bytes));
  for (const status of ['not-accepted', 'rejected', 'indeterminate-timeout', 'unexpected-context', undefined]) {
    assert.equal(evaluateProbe(expected, { status }).verified, false);
  }
});
