import fs from 'node:fs/promises';
import {simulate} from '../sim/engine.js';
const args=process.argv.slice(2),get=(k,fallback)=>{const i=args.indexOf(k);return i<0?fallback:args[i+1];};
const input=get('--input','data/latest.json'),output=get('--output','results/custom-run.json'),rounds=Number(get('--rounds',600)),seed=Number(get('--seed',7013)),params=JSON.parse(await fs.readFile(get('--params','data/calibrated.json'),'utf8'));
if(!Number.isInteger(rounds)||rounds<1||rounds>10000||!Number.isInteger(seed))throw Error('Use integer seed and 1..10000 rounds');
const data=JSON.parse(await fs.readFile(input,'utf8'));const t=performance.now(),run=simulate(data,params,seed,rounds,true);
await fs.writeFile(output,JSON.stringify(run));console.log(JSON.stringify({output,elapsedMs:performance.now()-t,metrics:run.metrics,choices:run.choices},null,2));
