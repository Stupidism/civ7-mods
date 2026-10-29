import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const projects=['civ7-no-more-turn','civ7-auto-save-before','civ7-micromanagement-master-chiang-kai-shek','civ7-garbage-time','civ7-resource-planner','civ7-better-controller-support','civ7-mac-launcher','civ7-play-again'];
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
if(failed)process.exitCode=1;
