import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Build-time provider list inside the verified bundle; never discover scripts
// from subscriptions, user save data, or game-provided requests.
export async function startProviders(root) {
  const base=await realpath(root);
  const specs=JSON.parse(await readFile(path.join(base,'providers.json'),'utf8'));
  if (!Array.isArray(specs) || !specs.length || specs.length>16) throw Error('Invalid providers');
  const stops=[];
  const stop=async()=>{
    const errors=[];
    for (const close of stops.splice(0).reverse()) { try {await close()} catch(error) {errors.push(error)} }
    if(errors.length) throw new AggregateError(errors,'Provider shutdown failed');
  };
  try {
    for (const spec of specs) {
      if (!spec || typeof spec.entry!=='string' || path.isAbsolute(spec.entry) || spec.entry.split('/').includes('..')) throw Error('Invalid provider entry');
      const entry=await realpath(path.join(base,spec.entry));
      if (!entry.startsWith(base+path.sep)) throw Error('Provider escapes bundle');
      const module=await import(pathToFileURL(entry));
      if (typeof module.startLauncherService!=='function') throw Error('Provider has no startup function');
      const close=await module.startLauncherService();
      if (typeof close!=='function') throw Error('Provider has no shutdown function');
      stops.push(close);
    }
    return stop;
  } catch (error) { await stop(); throw error; }
}
