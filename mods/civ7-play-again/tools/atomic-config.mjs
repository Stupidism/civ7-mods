import { open, link, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

// A forced helper exit must not expose a truncated .Civ7Cfg to the game.
// Link after writing and syncing; unlike rename, link never overwrites a file.
export async function writeExclusiveConfiguration(destination, bytes) {
  const temporary=path.join(path.dirname(destination),`.civ7-conversion-${randomUUID()}.pending`);
  let file;
  try {
    file=await open(temporary,'wx',0o600);
    await file.writeFile(bytes); await file.sync(); await file.close(); file=undefined;
    await link(temporary,destination);
  } finally {
    if(file) await file.close();
    await unlink(temporary).catch(()=>{});
  }
}
