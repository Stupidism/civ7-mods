import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseNativeSave } from './native-save.mjs';
import { expectedConfiguration } from './expected-configuration.mjs';
import { compareConfiguration } from '../ui/compare-configuration.js';

export function evaluateProbe(expected, report) {
  if (report?.status !== 'loaded-needs-comparison') {
    return { outcome: 'native-load-not-proven', status: report?.status ?? 'missing-report', verified: false };
  }
  if (report.request?.ContentType !== 1 || typeof report.request?.FileName !== 'string' || !report.request.FileName) {
    return { outcome: 'inconclusive-request-missing', verified: false };
  }
  const comparison = compareConfiguration(expected, report.after);
  if (!comparison.matches) return { outcome: 'configuration-mismatch', verified: false, ...comparison };
  if (report.before?.schemaVersion !== 1 || report.before.inShell !== true || report.before.isGameStarted !== false ||
      !report.before.game || !report.before.map || !Array.isArray(report.before.players)) {
    return { outcome: 'inconclusive-baseline-missing', verified: false, ...comparison };
  }
  const baseline = compareConfiguration(expected, report.before);
  if (baseline.matches) {
    return { outcome: 'inconclusive-baseline-already-matched', verified: false, ...comparison };
  }
  return {
    outcome: 'configuration-equivalent', verified: true, ...comparison,
    sourceSha256: expected.sourceSha256, configurationSha256: expected.configurationSha256,
    // Still needs settings UI, intentional edits, direct start and first-turn QA.
    launchVerified: false,
  };
}

export async function verifyProbeFile(savePath, reportPath) {
  const [saveBytes, reportBytes] = await Promise.all([readFile(savePath), readFile(reportPath, 'utf8')]);
  return evaluateProbe(expectedConfiguration(parseNativeSave(saveBytes)), JSON.parse(reportBytes));
}

async function main(args) {
  if (args[0] === '--help' || args.length !== 2) {
    console.log('Usage: node tools/verify-probe.mjs SAVE_COPY NATIVE_PROBE_REPORT.json');
    if (args[0] !== '--help') process.exitCode = 2;
    return;
  }
  const result = await verifyProbeFile(...args);
  console.log(JSON.stringify(result, null, 2));
  if (!result.verified) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
