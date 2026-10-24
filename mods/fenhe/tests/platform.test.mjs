import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const source=new URL('../',import.meta.url);
async function sandbox(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fenhe-platform-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const env={...process.env,HOME:root};
 for(const key of ['USERPROFILE','LOCALAPPDATA','FENHE_SAVES','FENHE_MODS','FENHE_PYTHON'])delete env[key];
 return {root,env};
}
const macPlatform=`
 import os from 'node:os';
 import {syncBuiltinESMExports as syncOS} from 'node:module';
 os.homedir=()=>process.env.HOME;
 syncOS();
 Object.defineProperty(process,'platform',{value:'darwin'});
`;
function run(script,env){
 return spawnSync(process.execPath,['--input-type=module','-e',script],{env,encoding:'utf8',timeout:5000});
}

test('Mac bridge starts without Windows environment variables, with game connections blocked',async t=>{
 const {env}=await sandbox(t);
 const result=run(`${macPlatform}
  globalThis.fetch=()=>{console.log('BRIDGE_STARTUP_READY');process.exit(0)};
  await import(${JSON.stringify(new URL('tools/bridge.mjs',source).href)});`,env);
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/BRIDGE_STARTUP_READY/);
});

async function applyFixture(t,{overrides=false,pythonArgument=false}={}){
 const {root,env}=await sandbox(t);
 const project=path.join(root,'project');
 await fs.cp(new URL('tools/',source),path.join(project,'tools'),{recursive:true});
 const game=path.join(root,'Library','Application Support','Civilization VII');
 const saves=overrides?path.join(root,'custom saves'):path.join(game,'Saves');
 const mods=overrides?path.join(root,'custom mods'):path.join(game,'Mods');
 if(overrides){env.FENHE_SAVES=saves;env.FENHE_MODS=mods;env.FENHE_PYTHON='custom-python';}
 await fs.mkdir(path.join(saves,'Single'),{recursive:true});
 const map=path.join(mods,'civ7-fenhe','maps','Fenhe_Intervention.Civ7Map');
 await fs.mkdir(path.dirname(map),{recursive:true});
 await fs.writeFile(map,'previous map');
 await fs.writeFile(path.join(root,'plan.json'),JSON.stringify({round:1,players:[]}));
 // Only the native game boundary is substituted. The CLI, backup lookup,
 // Python invocation, generated-map replacement and receipt use real files.
 await fs.writeFile(path.join(project,'tools','cdp.mjs'),`
  import fs from 'node:fs/promises';
  import path from 'node:path';
  export const sleep=async()=>{};
  export const waitFor=async read=>read();
  export async function evaluate(expression){
   if(expression.includes('Network.saveGame')){
    const name=JSON.parse(expression.match(/FileName:(\"[^\"]+\")/)[1]);
    await fs.writeFile(path.join(${JSON.stringify(saves)},'Single',name+'.Civ7Save'),Buffer.alloc(10001));
   }
   if(expression.includes('normalPool'))return {phase:'COMPLETE',normalPool:1};
   return {ready:true,multiplayer:false};
  }
 `);
 await fs.writeFile(path.join(project,'tools','native-session.mjs'),`
  export const enterWorld=async()=>({players:[],turn:1});
  export const reloadWorld=async()=>({players:[],turn:1});
  export const verifyWorld=()=>[];
 `);
 const cli=path.join(project,'tools','apply-plan.mjs');
 const invocation=path.join(root,'python-invocation.json');
 const script=`${macPlatform}
  import fs from 'node:fs';
  import childProcess from 'node:child_process';
  import {syncBuiltinESMExports} from 'node:module';
  globalThis.fetch=()=>{throw Error('Unexpected real game connection')};
  childProcess.spawnSync=(command,args)=>{
   fs.writeFileSync(${JSON.stringify(invocation)},JSON.stringify({command,args}));
   fs.writeFileSync(args[args.indexOf('--out')+1],'generated map');
   return {status:0,stdout:'{}',stderr:''};
  };
  syncBuiltinESMExports();
  process.argv=${JSON.stringify([process.execPath,cli,'--plan',path.join(root,'plan.json'),'--default',path.join(root,'default.Civ7Map'),'--transition',path.join(root,'transition.Civ7Map'),...(pythonArgument?['--python','explicit-python']:[])])};
  await import(${JSON.stringify(pathToFileURL(cli).href)});`;
 return {result:run(script,env),root,project,saves,map,invocation};
}

for(const options of [{},{overrides:true},{overrides:true,pythonArgument:true}]){
 test(`Mac apply-plan uses correct backup, map and Python paths ${JSON.stringify(options)}`,async t=>{
  const {result,project,saves,map,invocation}=await applyFixture(t,options);
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(await fs.readFile(invocation,'utf8')).command,options.pythonArgument?'explicit-python':options.overrides?'custom-python':'python3');
  assert.equal(await fs.readFile(map,'utf8'),'generated map');
  const output=path.join(project,'results','interventions');
  const [directory]=await fs.readdir(output);
  assert.equal(await fs.readFile(path.join(output,directory,'previous-generated-world.Civ7Map'),'utf8'),'previous map');
  const receipt=JSON.parse(await fs.readFile(path.join(output,directory,'receipt.json'),'utf8'));
  assert.equal(receipt.verified,true);
  assert.ok((await fs.stat(path.join(saves,'Single',receipt.backupSave+'.Civ7Save'))).size>10000);
 });
}

test('platform defaults preserve Windows locations and support Mac',async()=>{
 const {resolveRuntimeConfig}=await import('../tools/platform.mjs');
 assert.deepEqual(resolveRuntimeConfig({platform:'darwin',home:'/Users/player',env:{}}),{
  saves:'/Users/player/Library/Application Support/Civilization VII/Saves',
  mods:'/Users/player/Library/Application Support/Civilization VII/Mods',python:'python3'
 });
 assert.deepEqual(resolveRuntimeConfig({platform:'win32',home:'C:\\Users\\player',env:{}}),{
  saves:"C:\\Users\\player\\Documents\\My Games\\Sid Meier's Civilization VII\\Saves",
  mods:"C:\\Users\\player\\AppData\\Local\\Firaxis Games\\Sid Meier's Civilization VII\\Mods",python:'python'
 });
 const windows=resolveRuntimeConfig({platform:'win32',home:'C:\\Users\\fallback',env:{USERPROFILE:'D:\\Player',LOCALAPPDATA:'E:\\Local'}});
 assert.equal(windows.saves,"D:\\Player\\Documents\\My Games\\Sid Meier's Civilization VII\\Saves");
 assert.equal(windows.mods,"E:\\Local\\Firaxis Games\\Sid Meier's Civilization VII\\Mods");
});

test('explicit directories and Python override platform defaults',async()=>{
 const {resolveRuntimeConfig}=await import('../tools/platform.mjs');
 const env={FENHE_SAVES:'/custom/saves',FENHE_MODS:'/custom/mods',FENHE_PYTHON:'/custom/python'};
 assert.deepEqual(resolveRuntimeConfig({platform:'linux',home:'/home/player',env}),{saves:env.FENHE_SAVES,mods:env.FENHE_MODS,python:env.FENHE_PYTHON});
 assert.throws(()=>resolveRuntimeConfig({platform:'linux',home:'/home/player',env:{}}),/FENHE_SAVES.*FENHE_MODS/);
});
