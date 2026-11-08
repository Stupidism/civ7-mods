import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const python=process.env.CIV7_PYTHON || (process.platform==='darwin' ? '/usr/bin/python3' : 'python3');
const tool=fileURLToPath(new URL('../tools/plan-controller-settings-migration.py',import.meta.url));
test('migration selects the exact legacy row, preserves all database bytes and refuses ambiguous shapes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bcs-migration-')),db=join(dir,'backup.sqlite');
 const config={enabled:true,swapSticks:true,invertLeftY:false,invertPanY:false,showDebug:false};
 const seed=raw=>execFileSync(python,['-c',`import sqlite3,sys
with sqlite3.connect(sys.argv[1]) as c:
 c.execute('CREATE TABLE IF NOT EXISTS "Values"(id TEXT,key TEXT,value TEXT, PRIMARY KEY(id,key))')
 c.execute('DELETE FROM "Values"')
 c.executemany('INSERT INTO "Values" VALUES(?,?,?)', [('fs://game','aaa-other','{"doNotUse":true}'),('fs://game','modSettings','{"keep":{"v":9}}'),('fs://game','civ7-controller-bridge-v1',sys.argv[2])])`,db,raw]);
 try{
  seed(JSON.stringify(config));const before=readFileSync(db);
  const plan=JSON.parse(execFileSync(python,[tool,'--database',db],{encoding:'utf8'}));
  assert.deepEqual(plan.config,config);assert.deepEqual(plan.targetValue,{version:1,controller:config});assert.equal(plan.targetKey,'modSettings');assert.equal(plan.applied,false);
  assert.equal(plan.sourceValueSha256,createHash('sha256').update(JSON.stringify(config)).digest('hex'));
  assert.deepEqual(readFileSync(db),before);
  for(const invalid of [{other:true},{enabled:true,invertPanY:'false'},{...config,'civ7-resource-planner':{}},null]){
   seed(JSON.stringify(invalid));assert.notEqual(spawnSync(python,[tool,'--database',db]).status,0);
  }
 }finally{rmSync(dir,{recursive:true});}
});
