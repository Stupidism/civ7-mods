import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const data=JSON.parse(await fs.readFile(new URL('data/latest.json',root),'utf8'));
const run=JSON.parse(await fs.readFile(new URL('results/run.json',root),'utf8'));
const baseline=JSON.parse(await fs.readFile(new URL('results/baseline.json',root),'utf8'));
const calibration=JSON.parse(await fs.readFile(new URL('results/calibration.json',root),'utf8'));
const template=await fs.readFile(new URL('viewer/template.html',root),'utf8');
const topology=(await fs.readFile(new URL('sim/topology.js',root),'utf8')).replaceAll('export ','');
const engine=(await fs.readFile(new URL('sim/engine.js',root),'utf8')).replace(/^import .*;\r?\n/m,'').replaceAll('export ','');
// Baseline detailed histories are unnecessary for graph comparison and inflate the artifact.
const base=baseline.history.map(({settlements,polities,...s})=>s);
await fs.writeFile(new URL('分合推演.html',root),template.replace('/*__DATA__*/',JSON.stringify({data,run,baseline:base,calibration}).replace(/</g,'\\u003c')).replace('/*__ENGINE__*/',topology+'\n'+engine));
const rows=['round,nations,largestShare,fragmentation,effectiveNations,revolts,conquests,merges,meanHappiness,totalGold',...run.history.map(s=>[s.round,s.nations,s.largestShare,s.fragmentation,s.effectiveNations,s.revolts,s.conquests,s.merges,s.meanHappiness,s.totalGold].join(','))];
await fs.writeFile(new URL('results/trajectory.csv',root),rows.join('\n'));
console.log('Built standalone interactive replay and trajectory CSV.');
