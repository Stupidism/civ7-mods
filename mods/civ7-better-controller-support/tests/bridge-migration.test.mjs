import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir,homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const python=process.env.CIV7_PYTHON || (process.platform==='darwin' ? '/usr/bin/python3' : 'python3');
const tool=fileURLToPath(new URL('../tools/plan-controller-settings-migration.py',import.meta.url));
const config={enabled:true,swapSticks:true,invertLeftY:false,invertPanY:false,showDebug:false};
const legacyRaw=JSON.stringify(config);
const sha256=value=>createHash('sha256').update(value).digest('hex');

function seed(db,shared,legacy=legacyRaw){
 execFileSync(python,['-c',`import sqlite3,sys
with sqlite3.connect(sys.argv[1]) as c:
 c.execute('CREATE TABLE IF NOT EXISTS "Values"(id TEXT,key TEXT,value TEXT, PRIMARY KEY(id,key))')
 c.execute('DELETE FROM "Values"')
 c.executemany('INSERT INTO "Values" VALUES(?,?,?)', [('fs://game','aaa-other','{"doNotUse":true}')]
  + ([('fs://game','modSettings',sys.argv[2])] if sys.argv[3]=='1' else [])
  + [('fs://game','civ7-controller-bridge-v1',sys.argv[4])])`,db,shared,shared==null?'0':'1',legacy]);
}
function rows(db){
 return JSON.parse(execFileSync(python,['-c',`import json,sqlite3,sys
with sqlite3.connect(sys.argv[1]) as c:
 print(json.dumps([list(row) for row in c.execute('SELECT id,key,value FROM "Values" ORDER BY id,key')]))`,db],{encoding:'utf8'}));
}
function run(args){
 return spawnSync(python,[tool,'--database',...args],{encoding:'utf8'});
}

test('migration plans select the exact legacy row and stay read-only',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bcs-migration-')),db=join(dir,'backup.sqlite');
 try{
  seed(db,'{"keep":{"v":9}}');const before=readFileSync(db);
  const plan=JSON.parse(execFileSync(python,[tool,'--database',db],{encoding:'utf8'}));
  assert.deepEqual(plan.config,config);assert.deepEqual(plan.targetValue,{version:1,controller:config});
  assert.equal(plan.sourceValueSha256,sha256(legacyRaw));assert.equal(plan.applied,false);
  assert.deepEqual(readFileSync(db),before);
  for(const invalid of [{other:true},{enabled:true,invertPanY:'false'},{...config,'civ7-resource-planner':{}},null]){
   seed(db,'{"keep":{"v":9}}',JSON.stringify(invalid));assert.notEqual(run([db]).status,0);
  }
 }finally{rmSync(dir,{recursive:true});}
});

test('reviewed hash applies one backup transaction and retains every foreign row',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bcs-migration-')),db=join(dir,'backup.sqlite');
 try{
  seed(db,'{"keep":{"v":9},"version":3}');
  const plan=JSON.parse(execFileSync(python,[tool,'--database',db],{encoding:'utf8'}));
  const result=JSON.parse(execFileSync(python,[tool,'--database',db,'--apply-hash',plan.sourceValueSha256],{encoding:'utf8'}));
  assert.equal(result.applied,true);
  const after=new Map(rows(db).map(([origin,key,value])=>[key,value]));
  assert.equal(after.get('aaa-other'),'{"doNotUse":true}');
  assert.equal(after.has('civ7-controller-bridge-v1'),false);
  const shared=JSON.parse(after.get('modSettings'));
  assert.deepEqual(shared.keep,{v:9});assert.equal(shared.version,3);
  assert.deepEqual(shared['civ7-map-tools-gamepad'],{version:1,controller:config});
  assert.equal(result.targetValueSha256,sha256(after.get('modSettings')));
 }finally{rmSync(dir,{recursive:true});}
});

test('malformed shared rows, collisions, and changed hashes roll back without mutation',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bcs-migration-'));
 const cases=[
  ['malformed shared','{broken',legacyRaw,sha256(legacyRaw)],
  ['namespace collision',JSON.stringify({'civ7-map-tools-gamepad':{version:1,controller:config}}),legacyRaw,sha256(legacyRaw)],
  ['changed source hash','{"keep":{"v":9}}',legacyRaw,'0'.repeat(64)]
 ];
 try{
  for(const [name,shared,,hash] of cases){
   const db=join(dir,`${name.replace(/ /g,'-')}.sqlite`);seed(db,shared);
   const before=rows(db);const failure=run([db,'--apply-hash',hash]);
   assert.notEqual(failure.status,0,`${name} should fail`);
   assert.match(failure.stderr,/retain original data|hash changed/);
   assert.deepEqual(rows(db),before,`${name} must not mutate rows`);
  }
 }finally{rmSync(dir,{recursive:true});}
});

test('the helper refuses live paths and automatic unreviewed application',()=>{
 const live=join(homedir(),'Library/Application Support/Civilization VII','refused-backup.sqlite');
 const refused=run([live]);assert.notEqual(refused.status,0);assert.match(refused.stderr,/live game database/);
 const auto=run([join(tmpdir(),'not-used.sqlite'),'--apply']);
 assert.notEqual(auto.status,0);assert.match(auto.stderr,/--apply-hash/);
});
