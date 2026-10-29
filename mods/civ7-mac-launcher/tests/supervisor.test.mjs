import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { supervise } from '../runtime/supervisor-core.mjs';
import { startLauncherService } from '../../civ7-play-again/tools/launcher-service.mjs';

test('helper readiness follows startup; shutdown runs once',async()=>{
  const calls=[];
  const stop=await supervise({start:async()=>{calls.push('start');return async()=>calls.push('stop')},ready:async()=>calls.push('ready'),alive:()=>true});
  assert.deepEqual(calls,['start','ready']);await stop();await stop();assert.deepEqual(calls,['start','ready','stop']);
});
test('failed readiness cleans up; parent loss stops owned provider',async()=>{
  let stops=0;
  await assert.rejects(supervise({start:async()=>async()=>stops++,ready:async()=>{throw Error('disk full')},alive:()=>true}));
  assert.equal(stops,1);
  let alive=true;
  const stop=await supervise({start:async()=>async()=>stops++,ready:async()=>{},alive:()=>alive,interval:5});
  alive=false;await delay(30);await stop();assert.equal(stops,2);
});
test('Play Again adapter uses ephemeral token/port, starts bridge, closes HTTP and bridge',async()=>{
  const calls=[];
  const stop=await startLauncherService({create:async options=>{
    assert.match(options.token,/^[a-f0-9]{64}$/);assert.equal(options.port,0);
    return {server:{close(cb){calls.push('http-close');cb()},closeAllConnections(){calls.push('drain')}}};
  },bridge:(service,token,options)=>{assert.equal(options.connect,true);return()=>calls.push('bridge-stop')}});
  await stop();assert.deepEqual(calls,['bridge-stop','http-close','drain']);
});

test('provider startup failure stops already started providers; bundle escapes rejected',async()=>{
  const {mkdtemp,writeFile,rm,symlink}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');const path=await import('node:path');
  const {startProviders}=await import('../runtime/providers.mjs');
  const root=await mkdtemp(path.join(tmpdir(),'c7-providers-'));
  try {
    await writeFile(path.join(root,'ok.mjs'),`export async function startLauncherService(){globalThis.__c7Stopped=false;return async()=>{globalThis.__c7Stopped=true}}`);
    await writeFile(path.join(root,'bad.mjs'),`export async function startLauncherService(){throw Error('unavailable')}`);
    await writeFile(path.join(root,'providers.json'),JSON.stringify([{entry:'ok.mjs'},{entry:'bad.mjs'}]));
    await assert.rejects(startProviders(root),/unavailable/);assert.equal(globalThis.__c7Stopped,true);delete globalThis.__c7Stopped;
    await writeFile(path.join(root,'providers.json'),JSON.stringify([{entry:'../escape.mjs'}]));
    await assert.rejects(startProviders(root),/Invalid/);
    await symlink('/tmp',path.join(root,'outside'));
    await writeFile(path.join(root,'providers.json'),JSON.stringify([{entry:'outside'}]));
    await assert.rejects(startProviders(root),/escapes/);
  } finally {await rm(root,{recursive:true,force:true})}
});

test('real supervisor process writes readiness and awaits provider shutdown on SIGTERM',async()=>{
  const {mkdtemp,writeFile,readFile,copyFile,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');const path=await import('node:path');const {spawn}=await import('node:child_process');
  const root=await mkdtemp(path.join(tmpdir(),'c7-supervisor-'));
  let child;
  try {
    for(const f of ['supervisor.mjs','supervisor-core.mjs','providers.mjs']) await copyFile(new URL('../runtime/'+f,import.meta.url),path.join(root,f));
    await writeFile(path.join(root,'providers.json'),JSON.stringify([{entry:'fixture.mjs'}]));
    await writeFile(path.join(root,'fixture.mjs'),`import {writeFile} from 'node:fs/promises';export async function startLauncherService(){return async()=>{await writeFile(new URL('./stopped',import.meta.url),'yes')}}`);
    child=spawn(process.execPath,[path.join(root,'supervisor.mjs'),root,String(process.pid)],{stdio:['ignore','pipe','pipe']});
    let stderr='';child.stderr.on('data',b=>stderr+=b);
    const exited=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',(code,signal)=>resolve({code,signal}))});
    let ready;
    for(let i=0;i<100;i++){try{ready=JSON.parse(await readFile(path.join(root,'helpers-ready.json'),'utf8'));break}catch{}await delay(20)}
    assert.equal(ready?.pid,child.pid,stderr);child.kill('SIGTERM');
    const result=await Promise.race([exited,delay(5000).then(()=>{throw Error('Shutdown timeout')})]);
    assert.equal(result.code,0,stderr);assert.equal(await readFile(path.join(root,'stopped'),'utf8'),'yes');
  } finally {if(child?.exitCode===null)child.kill('SIGKILL');await rm(root,{recursive:true,force:true})}
});
