import fs from 'node:fs/promises';
import {simulate} from '../sim/engine.js';
const root=new URL('../',import.meta.url),p=JSON.parse(await fs.readFile(new URL('data/calibrated.json',root),'utf8')),base=JSON.parse(await fs.readFile(new URL('data/latest.json',root),'utf8')),exploration=JSON.parse(await fs.readFile(new URL('data/exploration.json',root),'utf8'));
const high=structuredClone(base),low=structuredClone(base),unified=structuredClone(base);high.settlements.forEach(c=>c.happiness+=20);low.settlements.forEach(c=>c.happiness-=20);unified.settlements.forEach(c=>c.owner='p0');unified.players=unified.players.filter(p=>p.id==='p0');
const scenarios={latest:base,exploration,highHappiness:high,lowHappiness:low,unified};const seeds=[17011,18013,19001,20011,21001];const results={};
for(const[name,data]of Object.entries(scenarios)){results[name]=seeds.map(seed=>{const started=performance.now(),r=simulate(data,p,seed,600,false);return{seed,ms:performance.now()-started,...r.metrics};});console.log(name,results[name].map(x=>({seed:x.seed,cycles:x.macroCycles,peak:x.peakShare,final:x.finalNations})));}
await fs.writeFile(new URL('results/stress-validation.json',root),JSON.stringify(results,null,2));
