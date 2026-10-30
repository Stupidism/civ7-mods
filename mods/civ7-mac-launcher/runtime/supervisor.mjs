import { writeFile, rename, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startProviders } from './providers.mjs';

import { supervise } from './supervisor-core.mjs';
async function main() {
  const [run, parentText] = process.argv.slice(2), parent = Number(parentText);
  if (!path.isAbsolute(run ?? '') || !Number.isSafeInteger(parent) || parent < 2 || process.ppid !== parent) throw new Error('Invalid launcher session');
  const stop = await supervise({
    start: async () => process.env.CIV7_EXTENSION_MODE === '1' ? (await import('./framework.mjs')).startFramework(run) : startProviders(path.dirname(fileURLToPath(import.meta.url))),
    alive: () => { try { process.kill(parent, 0); return process.ppid === parent; } catch { return false; } },
    ready: async () => {
      const temp=path.join(run,'helpers-ready.tmp');
      await writeFile(temp, JSON.stringify({ pid: process.pid, mode: process.env.CIV7_EXTENSION_MODE === '1' ? 'registry' : 'legacy' }), { flag:'wx',mode:0o600 });
      await rename(temp,path.join(run,'helpers-ready.json'));
    },
    onStop: () => process.exit(0),
  });
  for (const signal of ['SIGTERM','SIGINT']) process.once(signal, () => {
    const deadline=setTimeout(() => process.exit(1),4000); deadline.unref();
    void stop();
  });
}
if (process.argv[1] && await realpath(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode=1; });
