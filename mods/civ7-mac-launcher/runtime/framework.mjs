import path from 'node:path';
import os from 'node:os';
import {openPreferences} from './preferences.mjs';
import {randomBytes} from 'node:crypto';
import {discoverExtensions,modRoots} from './discovery.mjs';
import {createExtensionHost} from './extension-host.mjs';
import {createConnection} from './game-connection.mjs';
export async function startFramework(sessionDir){
  const catalog=await discoverExtensions(await modRoots());
  const host=createExtensionHost({catalog,context:{sessionDir,nativeAvailable:process.env.CIV7_NATIVE_AVAILABLE==='1'}});
  const preferences=await openPreferences(path.join(os.homedir(),'Library/Application Support/BetterModSupport/preferences.json'));
  const connection=createConnection({host,preferences,token:randomBytes(32).toString('hex')});
  const timer=setInterval(()=>void connection.poll(),250);
  console.log(`Enhanced Mod registry ready (${catalog.size} declarations; none run until enabled).`);
  return async()=>{clearInterval(timer);await connection.close();await host.close();};
}
