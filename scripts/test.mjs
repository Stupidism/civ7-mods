import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const projects=['civ7-no-more-turn','civ7-auto-save-before','civ7-micromanagement-master-chiang-kai-shek','civ7-garbage-time','civ7-resource-planner','civ7-better-controller-support'];
let failed=false;
for(const name of projects){
  const cwd=fileURLToPath(new URL(`../mods/${name}/`,import.meta.url));
  const files=readdirSync(new URL(`../mods/${name}/tests/`,import.meta.url)).filter(f=>/\.test\.(m?js)$/.test(f)).map(f=>'tests/'+f);
  if(!files.length)throw Error('No tests found for '+name);
  const result=spawnSync(process.execPath,['--test','--test-reporter=tap',...files],{cwd,encoding:'utf8',maxBuffer:10*1024*1024});
  if(result.error)throw result.error;
  console.log(`\n${name}:\n`+result.stdout.split(/\r?\n/).filter(l=>/^# (tests|pass|fail|skipped|duration_ms) /.test(l)).join('\n'));
  if(result.status!==0){failed=true;console.error(result.stdout,result.stderr);}
}
const localization=spawnSync(process.env.PYTHON || 'python3',['-m','unittest','discover','-s','tests','-v'],{
  cwd:fileURLToPath(new URL('../mods/civ7-better-chinese-support/',import.meta.url)),encoding:'utf8',maxBuffer:10*1024*1024
});
if(localization.error)throw localization.error;
console.log('\nciv7-better-chinese-support:\n'+localization.stdout+localization.stderr);
if(localization.status!==0)failed=true;
if(failed)process.exitCode=1;
