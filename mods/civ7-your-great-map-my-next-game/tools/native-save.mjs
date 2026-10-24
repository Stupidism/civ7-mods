// Host wrapper: hashing/encoding are kept outside the game-compatible parser.
import { createHash } from 'node:crypto';
import { extractSetupValues } from '../ui/save-reader.js';
export { KEYS, SaveFormatError, property, objectProperty, parseNativeSave, plainProperties } from '../ui/save-reader.js';

export function extractSetup(parsed, options) {
  const setup = extractSetupValues(parsed, options);
  const native = parsed.bytes.subarray(parsed.initial.start, parsed.initial.end);
  return {
    ...setup,
    sourceSha256: createHash('sha256').update(parsed.bytes).digest('hex'),
    nativeConfiguration: { encoding: 'base64', sha256: createHash('sha256').update(native).digest('hex'), data: Buffer.from(native).toString('base64') },
  };
}
