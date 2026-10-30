import {readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import path from 'node:path';
export async function createExtension({sessionDir,nativeAvailable}){
  if(!nativeAvailable)throw Error('unsupported-game-build');
  const requestFile=path.join(sessionDir,'native-request.json'),resultFile=path.join(sessionDir,'native-result.json');let closed=false;
  async function status(){try{const s=JSON.parse(await readFile(path.join(sessionDir,'native-status.json'),'utf8'));return {active:Date.now()/1000-s.time<1};}catch{return {active:false};}}
  return {
    status,
    async request(method,payload){
      if(closed||method!=='submit')throw Error('unsupported-method');
      const command=payload?.command;
      if(typeof command!=='string'||!/^[\x20-\x7e]{1,254}$/.test(command))throw Error('invalid-command');
      if(!(await status()).active)throw Error('open-original-debugpanel');
      const id=randomUUID(),temp=requestFile+'.'+id;
      await writeFile(temp,JSON.stringify({id,command,time:Date.now()/1000}),{flag:'wx',mode:0o600});await rename(temp,requestFile);
      const deadline=Date.now()+2500;
      while(!closed&&Date.now()<deadline){try{const r=JSON.parse(await readFile(resultFile,'utf8'));if(r.id===id){if(r.error)throw Error(r.error);return r;}}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}await delay(25);}
      await unlink(requestFile).catch(e=>{if(e.code!=='ENOENT')throw e;});throw Error('native-submit-timeout');
    },
    async close(){closed=true;await unlink(requestFile).catch(e=>{if(e.code!=='ENOENT')throw e;});},
  };
}
