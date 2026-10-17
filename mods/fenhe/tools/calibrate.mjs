import fs from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {simulate,rng,DEFAULTS} from '../sim/engine.js';
import {landRoutes} from '../sim/topology.js';
const root=new URL('../',import.meta.url),data=JSON.parse(await fs.readFile(new URL('data/calibration-input.json',root),'utf8'));
data.warEdges=landRoutes(data);
const smoke=process.argv.includes('--smoke'),rounds=smoke?160:600,size=smoke?10:36,generations=smoke?2:14;
const trainingSeeds=[1049,2203,3907],holdoutSeeds=[7013,8017,9011,10037,11047,12049,13063,14071];
const bounds={smallRecovery:[5.5,8.5],scalePressure:[0.035,0.22],dynasticWear:[0.005,0.035],fractureShock:[2,10],renewal:[20,55],grace:[10,28],shockRecovery:[0.5,2.2],acceptance:[0.35,0.9],defense:[0.8,1.2],mobilization:[0.55,0.95],attrition:[0.025,0.15],reinforce:[0.01,0.07]};
const random=rng(20261017),keys=Object.keys(bounds),cache=new Map();
function make(){return Object.fromEntries(keys.map(k=>{const[a,b]=bounds[k];return[k,k==='grace'?Math.round(a+random()*(b-a)):a+random()*(b-a)];}));}
function fitness(m){return 15*Math.min(3,m.macroCycles)+3*Math.min(2,m.cycles)+7*Math.min(1,m.peakShare/0.45)+6*Math.min(1,m.tailRange/0.25)+Math.min(3,m.conquests/50)-15*Math.max(0,m.meanLargestShare-0.6)-10*Math.max(0,m.meanNations/data.settlements.length-0.4)-Math.max(0,m.revolts/rounds-0.7)*3;}
function score(g){const key=JSON.stringify(g);if(cache.has(key))return cache.get(key);const ms=trainingSeeds.map(s=>simulate(data,g,s,rounds,false).metrics);const scores=ms.map(fitness);const mean=scores.reduce((a,b)=>a+b,0)/scores.length;const value=mean-0.3*(Math.max(...scores)-Math.min(...scores));const r={genes:g,score:value,trainingMetrics:ms};cache.set(key,r);return r;}
function child(a,b){return Object.fromEntries(keys.map(k=>{const[lo,hi]=bounds[k];let v=random()<0.5?a[k]:b[k];if(random()<0.35)v+=(random()+random()+random()-1.5)*(hi-lo)*0.25;v=Math.max(lo,Math.min(hi,v));return[k,k==='grace'?Math.round(v):v];}));}
const started=performance.now();let population=[Object.fromEntries(keys.map(k=>[k,DEFAULTS[k]])),...Array.from({length:size-1},make)],log=[];
for(let gen=0;gen<generations;gen++){
 const ranked=population.map(score).sort((a,b)=>b.score-a.score);const best=ranked[0];log.push({generation:gen,score:best.score,genes:best.genes});console.log(JSON.stringify({generation:gen,score:+best.score.toFixed(3),cycles:best.trainingMetrics.map(x=>x.cycles),range:best.trainingMetrics.map(x=>+x.range.toFixed(3))}));
 const pool=ranked.slice(0,Math.ceil(size/3));population=[...ranked.slice(0,3).map(x=>x.genes),...Array.from({length:size-3},()=>random()<0.12?make():child(pool[Math.floor(random()*pool.length)].genes,pool[Math.floor(random()*pool.length)].genes))];
}
const winner=population.map(score).sort((a,b)=>b.score-a.score)[0];
const baseline=holdoutSeeds.map(seed=>({seed,...simulate(data,{mode:'baseline'},seed,rounds,false).metrics}));
const holdout=holdoutSeeds.map(seed=>({seed,...simulate(data,winner.genes,seed,rounds,false).metrics}));
const report={method:'genetic-algorithm',inputSnapshot:'data/calibration-input.json',inputPhase:data.provenance.capturePhase,parameterSeed:20261017,population:size,generations,rounds,trainingSeeds,holdoutSeeds,bounds,log,winner,baseline,holdout,seconds:(performance.now()-started)/1000,uniqueCandidates:cache.size};
await fs.mkdir(new URL('results/',root),{recursive:true});await fs.writeFile(new URL('results/calibration.json',root),JSON.stringify(report,null,2));await fs.writeFile(new URL('data/calibrated.json',root),JSON.stringify({...DEFAULTS,...winner.genes},null,2));
// Fixed representative seed chosen in advance, never the prettiest simulation.
const latest=JSON.parse(await fs.readFile(new URL('data/latest.json',root),'utf8'));
const run=simulate(latest,winner.genes,7013,rounds,true),base=simulate(latest,{mode:'baseline'},7013,rounds,true);
await fs.writeFile(new URL('results/run.json',root),JSON.stringify(run));await fs.writeFile(new URL('results/baseline.json',root),JSON.stringify(base));
console.log(JSON.stringify({seconds:report.seconds,holdout,baseline}));
