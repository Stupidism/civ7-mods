import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {writeExclusiveConfiguration} from '../tools/atomic-config.mjs';

test('configuration publication produces complete bytes and removes its staging file',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'c7-config-'));
 try {
  const data=Buffer.alloc(1024*1024,0x7f), target=path.join(root,'test.Civ7Cfg');
  await writeExclusiveConfiguration(target,data);
  assert.deepEqual(await readFile(target),data);assert.deepEqual(await readdir(root),['test.Civ7Cfg']);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('a collision preserves the existing configuration and cleans only its own staging file',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'c7-config-'));
 try {
  const target=path.join(root,'test.Civ7Cfg');await writeFile(target,'original');
  await assert.rejects(writeExclusiveConfiguration(target,Buffer.from('replacement')),{code:'EEXIST'});
  assert.equal(await readFile(target,'utf8'),'original');assert.deepEqual(await readdir(root),['test.Civ7Cfg']);
 }finally{await rm(root,{recursive:true,force:true})}
});
