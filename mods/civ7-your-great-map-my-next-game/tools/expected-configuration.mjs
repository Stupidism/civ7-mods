import { createHash } from 'node:crypto';
import { configurationFromInitial } from '../ui/save-configuration.js';

/** Build an oracle from the byte-preserved initial section, not list metadata. */
export function expectedConfiguration(parsed) {
  return {
    ...configurationFromInitial(parsed),
    sourceSha256: createHash('sha256').update(parsed.bytes).digest('hex'),
    configurationSha256: createHash('sha256').update(parsed.bytes.subarray(parsed.initial.start, parsed.initial.end)).digest('hex'),
  };
}
